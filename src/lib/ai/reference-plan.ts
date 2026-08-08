import { MAX_FIGURE_QUESTIONS } from "@/lib/constants";
import { sectionSlotMarks, sectionSlotTypes, subGroupAt } from "@/lib/types";
import type { PaperSettings, ReferenceBank, ReferenceItem } from "@/lib/types";
import { archetypeKey } from "./reference-extract";
import type { BatchSlot } from "./generate";

/**
 * Choosing WHICH of the reference's questions the paper asks.
 *
 * The complaint this exists to answer: "if there are 3 same type of questions
 * in the uploaded reference PDF then it should not generate all 3". A
 * chapterwise bank prints the same question shape over and over — the NEET
 * Current Electricity chapter opens with three consecutive "wire stretched to
 * n times its length" problems — so taking questions in printed order produces
 * a paper that asks the same thing three times in the first five questions.
 *
 * This is deliberately decided in code, not asked for in the prompt. A model
 * given a hundred source questions and told "pick 45 with good variety" has no
 * way to be checked and no way to be reproduced; and the plan must be a pure
 * function of the stored bank, because generation runs in batches and batch 4
 * has to land on exactly the slots batches 1–3 did not fill.
 */

/** Whether printing this item's figure would cost a generated image. */
function needsRedraw(item: ReferenceItem): boolean {
  return !!item.figure && !item.figure.image_url;
}

/**
 * Orders the bank so that every distinct archetype is used once before any
 * archetype is used twice, with topics interleaved.
 *
 * Two passes of round-robin, not one: archetypes are cycled so no shape
 * repeats, and the archetypes themselves are emitted by cycling topics so a
 * 45-question paper does not exhaust Ohm's Law before it reaches Cells and EMF.
 */
export function orderByVariety(items: ReferenceItem[]): ReferenceItem[] {
  const groups = new Map<string, ReferenceItem[]>();
  for (const item of items) {
    const key = archetypeKey(item.archetype);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  // Archetype keys grouped under their topic, both in printed order.
  const byTopic = new Map<string, string[]>();
  for (const [key, group] of groups) {
    const topic = group[0].topic.toLowerCase();
    const list = byTopic.get(topic);
    if (list) list.push(key);
    else byTopic.set(topic, [key]);
  }

  const archetypeOrder: string[] = [];
  const topicLists = [...byTopic.values()];
  const deepest = Math.max(0, ...topicLists.map((l) => l.length));
  for (let rank = 0; rank < deepest; rank++) {
    for (const list of topicLists) {
      if (rank < list.length) archetypeOrder.push(list[rank]);
    }
  }

  const ordered: ReferenceItem[] = [];
  const deepestGroup = Math.max(0, ...[...groups.values()].map((g) => g.length));
  for (let pass = 0; pass < deepestGroup; pass++) {
    for (const key of archetypeOrder) {
      const item = groups.get(key)?.[pass];
      if (item) ordered.push(item);
    }
  }
  return ordered;
}

/**
 * Picks `count` items in variety order, holding the number of items that need
 * a *generated* figure to the paper's image budget.
 *
 * Figures cropped out of the source PDF are free and exact, so they are never
 * rationed. Only the fallback path — a figure the crop could not localise, so
 * the image model has to redraw it from a description — bills per image, and
 * MAX_FIGURE_QUESTIONS is what bounds that. Deferring rather than dropping
 * matters: a bank whose figures all failed to crop should still fill the
 * paper, just with the surplus figures reported as capped downstream.
 */
export function selectReferenceItems(
  bank: ReferenceBank,
  count: number
): ReferenceItem[] {
  const ordered = orderByVariety(bank.items);
  const chosen: ReferenceItem[] = [];
  const deferred: ReferenceItem[] = [];
  let redrawUsed = 0;

  for (const item of ordered) {
    if (chosen.length >= count) break;
    if (needsRedraw(item)) {
      if (redrawUsed >= MAX_FIGURE_QUESTIONS) {
        deferred.push(item);
        continue;
      }
      redrawUsed++;
    }
    chosen.push(item);
  }
  for (const item of deferred) {
    if (chosen.length >= count) break;
    chosen.push(item);
  }
  return chosen;
}

/**
 * A source question for a REPLACEMENT, when the teacher regenerates one
 * question of a finished paper.
 *
 * Regeneration exists to get something different, so a source the paper
 * already used is the one thing it must not return. Archetypes already on the
 * paper are avoided first — a fresh question built from the third "stretched
 * wire" source is not a different question — and only if the bank has nothing
 * else left does it fall back to an unused source of a used archetype.
 */
export function pickReplacementItem(
  bank: ReferenceBank,
  used: { itemIds: Set<string>; archetypeKeys: Set<string> },
  preferredType?: string
): ReferenceItem | null {
  const ordered = orderByVariety(bank.items).filter((i) => !used.itemIds.has(i.id));
  for (const freshArchetype of [true, false]) {
    for (const matchType of [true, false]) {
      for (const item of ordered) {
        if (freshArchetype && used.archetypeKeys.has(archetypeKey(item.archetype))) continue;
        if (matchType && preferredType && item.type !== preferredType) continue;
        return item;
      }
    }
  }
  return null;
}

/**
 * The full slot plan for a reference-led paper.
 *
 * Type and difficulty come from each source question rather than from the
 * paper's settings — the whole point of reference mode is that the easy/medium
 * /hard mix and the question-type dropdown describe a paper the teacher is no
 * longer asking for. A blueprint is the exception: its parts dictate the type
 * and mark value of every printed slot, so there the blueprint wins and the
 * source question is recast into the slot's type.
 */
export function referencePlan(
  settings: PaperSettings,
  bank: ReferenceBank
): BatchSlot[] {
  if (settings.mode === "blueprint" && settings.blueprint) {
    return blueprintReferencePlan(settings, bank);
  }

  return orderForPrinting(
    selectReferenceItems(bank, settings.question_count),
    bank
  ).map((item) => ({
    type: item.type,
    difficulty: item.difficulty,
    chapter: item.topic,
    reference: item,
  }));
}

/**
 * Reorders the chosen questions into the order they should be PRINTED in.
 *
 * Selection and printing want opposite things. Choosing questions demands
 * round-robin across topics, or the paper is three variations on Ohm's Law;
 * printing them in that order gives a paper that lurches Ohm's Law → drift
 * velocity → colour codes → power → back to Ohm's Law, which reads as
 * disorganised and gives a student no run at a topic.
 *
 * So variety decides *which* questions and this decides *where they sit*:
 * group them under their topic, topics in the order the reference printed
 * them. The sort is stable, so within a topic the variety order survives —
 * distinct archetypes still come before any repeat.
 */
export function orderForPrinting(
  items: ReferenceItem[],
  bank: ReferenceBank
): ReferenceItem[] {
  const rank = new Map(bank.topics.map((t, i) => [t.toLowerCase(), i]));
  const unknown = bank.topics.length;
  return [...items].sort(
    (a, b) =>
      (rank.get(a.topic.toLowerCase()) ?? unknown) -
      (rank.get(b.topic.toLowerCase()) ?? unknown)
  );
}

/**
 * Blueprint parts pin the type and mark value of each printed slot, so items
 * are matched to slots by type where the bank can supply one — a 1-mark MCQ
 * slot filled from a 5-mark long-answer source produces a question that fits
 * neither. Where no matching source is left, the closest remaining one is used
 * and the generator recasts it; the alternative is an empty slot on a printed
 * paper.
 */
function blueprintReferencePlan(
  settings: PaperSettings,
  bank: ReferenceBank
): BatchSlot[] {
  const bp = settings.blueprint!;
  const pool = orderByVariety(bank.items);
  const taken = new Set<string>();
  let redrawUsed = 0;

  function claim(preferredType: string): ReferenceItem | null {
    // Two passes: honour the figure budget first, then accept a redraw item
    // rather than leave a printed slot with no source at all.
    for (const budgeted of [true, false]) {
      for (const wantType of [true, false]) {
        for (const item of pool) {
          if (taken.has(item.id)) continue;
          if (wantType && item.type !== preferredType) continue;
          if (budgeted && needsRedraw(item) && redrawUsed >= MAX_FIGURE_QUESTIONS) continue;
          taken.add(item.id);
          if (needsRedraw(item)) redrawUsed++;
          return item;
        }
      }
    }
    return null;
  }

  const slots: BatchSlot[] = [];
  for (const section of bp.sections) {
    const slotTypes = sectionSlotTypes(section);
    const slotMarks = sectionSlotMarks(section);
    for (let i = 0; i < section.questions_to_set; i++) {
      const type = slotTypes[i] ?? section.question_type;
      const item = claim(type);
      slots.push({
        type,
        difficulty: item?.difficulty ?? "medium",
        chapter: item?.topic ?? settings.chapters[0] ?? "Reference paper",
        section_id: section.id,
        section_name: section.name,
        marks: slotMarks[i] ?? section.marks_per_question,
        strand: section.strand,
        subgroup_label: subGroupAt(section, i)?.label,
        reference: item ?? undefined,
      });
    }
  }
  return slots;
}
