import { describe, expect, it } from "vitest";
import { fullPlan, nextBatchSlots } from "./plan";
import { orderByVariety, selectReferenceItems } from "./reference-plan";
import { archetypeKey } from "./reference-extract";
import type { PaperSettings, Question, ReferenceBank, ReferenceItem } from "@/lib/types";

/**
 * A bank shaped like the real thing: a chapterwise question bank prints the
 * same question shape several times in a row, which is the whole reason the
 * selector exists.
 */
function bankOf(
  spec: { topic: string; archetype: string; figure?: "crop" | "redraw" }[]
): ReferenceBank {
  const items: ReferenceItem[] = spec.map((s, i) => ({
    id: `item-${i}`,
    ref_label: String(i + 1),
    page: Math.floor(i / 8) + 1,
    topic: s.topic,
    archetype: s.archetype,
    type: "mcq",
    difficulty: "medium",
    question_text: `Source question ${i + 1}, long enough to be kept.`,
    options: ["a", "b", "c", "d"],
    figure:
      s.figure === "crop"
        ? { image_url: `https://example.test/${i}.jpg` }
        : s.figure === "redraw"
          ? { spec: "a described figure" }
          : undefined,
  }));
  const topics: string[] = [];
  for (const i of items) if (!topics.includes(i.topic)) topics.push(i.topic);
  return { items, topics, pages_read: 3, extracted_at: "2026-08-08T00:00:00.000Z" };
}

const STRETCH = "resistance of a wire stretched to n times its length";
const BULBS = "power drawn by identical bulbs rewired series to parallel";

const REAL_SHAPE = bankOf([
  { topic: "Electric Current", archetype: "current from electrons per second" },
  { topic: "Ohm's Law", archetype: STRETCH },
  { topic: "Ohm's Law", archetype: STRETCH },
  { topic: "Ohm's Law", archetype: STRETCH },
  { topic: "Ohm's Law", archetype: "resistivity from length, area and voltage" },
  { topic: "Drift of Electrons", archetype: "mobility from drift velocity" },
  { topic: "Energy and Power", archetype: BULBS },
  { topic: "Energy and Power", archetype: BULBS },
  { topic: "Energy and Power", archetype: "heat when charge varies with time" },
  { topic: "Combination of Resistors", archetype: "equivalent resistance of a ring", figure: "crop" },
  { topic: "Combination of Resistors", archetype: "ammeter reading with a shunt", figure: "redraw" },
  { topic: "Cells and EMF", archetype: "internal resistance from two load currents" },
]);

const settingsFor = (count: number): PaperSettings =>
  ({
    exam_type: "NEET",
    subject: "Physics",
    chapters: REAL_SHAPE.topics,
    question_count: count,
    question_type: "mcq",
    difficulty: { easy_pct: 30, medium_pct: 50, hard_pct: 20 },
    marks_per_question: 4,
    negative_marks: 1,
    source_mode: "reference",
    reference_fidelity: "variant",
  }) as PaperSettings;

describe("selectReferenceItems — variety", () => {
  it("uses every distinct archetype before repeating any", () => {
    const distinct = new Set(REAL_SHAPE.items.map((i) => archetypeKey(i.archetype))).size;
    const chosen = selectReferenceItems(REAL_SHAPE, distinct);
    const keys = chosen.map((i) => archetypeKey(i.archetype));
    expect(chosen).toHaveLength(distinct);
    expect(new Set(keys).size).toBe(distinct);
  });

  it("never takes two of the same archetype while another is unused", () => {
    // The bank opens with three consecutive "stretched wire" questions; taking
    // them in printed order is exactly the complaint this guards against.
    const chosen = selectReferenceItems(REAL_SHAPE, 6);
    const stretch = chosen.filter((i) => archetypeKey(i.archetype) === archetypeKey(STRETCH));
    expect(stretch).toHaveLength(1);
  });

  it("spreads across topics rather than draining one", () => {
    const chosen = selectReferenceItems(REAL_SHAPE, 5);
    expect(new Set(chosen.map((i) => i.topic)).size).toBeGreaterThanOrEqual(4);
  });

  it("returns everything it can when asked for more than the bank holds", () => {
    const chosen = selectReferenceItems(REAL_SHAPE, 999);
    expect(chosen).toHaveLength(REAL_SHAPE.items.length);
  });

  it("is a pure function of the bank, so batches resume on the same plan", () => {
    const a = selectReferenceItems(REAL_SHAPE, 8).map((i) => i.id);
    const b = selectReferenceItems(REAL_SHAPE, 8).map((i) => i.id);
    expect(a).toEqual(b);
    expect(orderByVariety(REAL_SHAPE.items).map((i) => i.id)).toEqual(
      orderByVariety(REAL_SHAPE.items).map((i) => i.id)
    );
  });
});

describe("fullPlan — printing order", () => {
  it("groups the chosen questions under their topic", () => {
    const chapters = fullPlan(settingsFor(12), REAL_SHAPE).map((s) => s.chapter);
    // Every topic occupies one contiguous run.
    const runs = chapters.filter((c, i) => c !== chapters[i - 1]);
    expect(runs.length).toBe(new Set(chapters).size);
  });

  it("takes type and difficulty from the source, not from the settings", () => {
    const slots = fullPlan(settingsFor(4), REAL_SHAPE);
    for (const slot of slots) {
      expect(slot.type).toBe(slot.reference?.type);
      expect(slot.difficulty).toBe(slot.reference?.difficulty);
    }
  });
});

/** Every question of a finished paper, recording the source it came from. */
function generated(settings: PaperSettings, bank: ReferenceBank): Question[] {
  return fullPlan(settings, bank).map((s, i) => ({
    id: `q${i}`,
    type: "mcq",
    difficulty: "medium",
    chapter: s.chapter ?? "",
    question_text: `Q${i + 1}`,
    options: ["a", "b", "c", "d"],
    correct_answer: "A",
    solution: "",
    marks: 4,
    negative_marks: 1,
    needs_review: false,
    reference_item_id: s.reference?.id,
  }));
}

describe("nextBatchSlots — resuming a reference paper", () => {
  const settings = settingsFor(10);

  it("asks for nothing once the paper is complete", () => {
    const done = generated(settings, REAL_SHAPE);
    expect(nextBatchSlots(settings, done, REAL_SHAPE)).toHaveLength(0);
  });

  it("resumes a half-generated paper where it stopped", () => {
    const done = generated(settings, REAL_SHAPE);
    const next = nextBatchSlots(settings, done.slice(0, 4), REAL_SHAPE);
    expect(next[0].reference?.id).toBe(done[4].reference_item_id);
  });

  it("refills the slot a deleted question vacated, not the end of the plan", () => {
    // The bug: counting resumed at the end and handed back a source already on
    // the paper, so "generate remaining" produced a duplicate.
    const done = generated(settings, REAL_SHAPE);
    const removed = done[2];
    const after = done.filter((_, i) => i !== 2);

    const next = nextBatchSlots(settings, after, REAL_SHAPE);
    expect(next).toHaveLength(1);
    expect(next[0].reference?.id).toBe(removed.reference_item_id);

    const stillUsed = new Set(after.map((q) => q.reference_item_id));
    expect(next.some((s) => s.reference && stillUsed.has(s.reference.id))).toBe(false);
  });

  it("refills several scattered deletions", () => {
    const done = generated(settings, REAL_SHAPE);
    const gone = [1, 5, 8];
    const after = done.filter((_, i) => !gone.includes(i));
    const next = nextBatchSlots(settings, after, REAL_SHAPE);
    expect(next.map((s) => s.reference?.id).sort()).toEqual(
      gone.map((i) => done[i].reference_item_id).sort()
    );
  });

  it("does not count a teacher's own question as filling a source slot", () => {
    const done = generated(settings, REAL_SHAPE);
    const withHandwritten = [
      ...done.slice(0, 3),
      { ...done[0], id: "mine", reference_item_id: undefined, teacher_authored: true },
    ];
    const next = nextBatchSlots(settings, withHandwritten, REAL_SHAPE);
    expect(next[0].reference?.id).toBe(done[3].reference_item_id);
  });
});
