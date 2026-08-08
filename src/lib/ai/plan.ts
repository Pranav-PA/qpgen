import { GENERATION_BATCH_SIZE } from "@/lib/constants";
import { sectionSlotMarks, sectionSlotTypes, subGroupAt } from "@/lib/types";
import type {
  BlueprintSection,
  Difficulty,
  DifficultySettings,
  PaperSettings,
  Question,
  QuestionType,
  ReferenceBank,
} from "@/lib/types";
import { referencePlan } from "./reference-plan";
import type { BatchSlot } from "./generate";

function subGroupLabelAt(s: BlueprintSection, offset: number): string | undefined {
  return subGroupAt(s, offset)?.label;
}

/**
 * Deterministic slot plan for the whole paper, derived from settings alone.
 * Batch N resumes exactly where batch N-1 stopped, so partial generations
 * can always be continued.
 */
/**
 * Blueprint plan: walk the grid part by part, chapter by chapter, so the paper
 * comes out in printed order (all of PART-A, then PART-B, …). Difficulty is
 * spread across each part using the paper's easy/medium/hard mix.
 */
function blueprintPlan(settings: PaperSettings): BatchSlot[] {
  const bp = settings.blueprint!;
  const slots: BatchSlot[] = [];

  for (const section of bp.sections) {
    // Sub-groups fix the type and mark value of each printed slot in order
    // (e.g. SSLC PART-A runs 2 MCQs, 2 one-markers, then 2-, 3- and 4-markers).
    const slotTypes = sectionSlotTypes(section);
    const slotMarks = sectionSlotMarks(section);
    const sectionSlots: BatchSlot[] = [];
    for (const row of bp.rows) {
      const count = row.counts[section.id] ?? 0;
      for (let i = 0; i < count; i++) {
        const at = sectionSlots.length;
        sectionSlots.push({
          type: slotTypes[at] ?? section.question_type,
          difficulty: "medium",
          chapter: row.chapter,
          section_id: section.id,
          section_name: section.name,
          marks: slotMarks[at] ?? section.marks_per_question,
          strand: section.strand,
          subgroup_label: subGroupLabelAt(section, at),
        });
      }
    }
    // Apply the difficulty mix within the part, easiest first.
    const order = difficultySequence(sectionSlots.length, settings.difficulty);
    sectionSlots.forEach((s, i) => {
      s.difficulty = order[i];
    });
    slots.push(...sectionSlots);
  }

  return slots;
}

/** Difficulty labels for n questions, honouring the percentage mix exactly. */
function difficultySequence(n: number, d: DifficultySettings): Difficulty[] {
  if (n <= 0) return [];
  const exact = [
    ["easy", (n * d.easy_pct) / 100],
    ["medium", (n * d.medium_pct) / 100],
    ["hard", (n * d.hard_pct) / 100],
  ] as const;
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  let assigned = 0;
  for (const [k, v] of exact) {
    counts[k] = Math.floor(v);
    assigned += Math.floor(v);
  }
  const remainders = [...exact]
    .map(([k, v]) => ({ k, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  for (let i = 0; assigned < n; i++, assigned++) counts[remainders[i % 3].k] += 1;

  return [
    ...Array<Difficulty>(counts.easy).fill("easy"),
    ...Array<Difficulty>(counts.medium).fill("medium"),
    ...Array<Difficulty>(counts.hard).fill("hard"),
  ];
}

/**
 * Marks `count` slots, spread evenly across the whole paper, as needing a
 * diagram. Spread rather than front-loaded so a single generation batch never
 * has to make more than one or two image calls — each is a real network round
 * trip on top of the question-generation call.
 */
function distributeFigureSlots(slots: BatchSlot[], count: number): BatchSlot[] {
  if (count <= 0 || slots.length === 0) return slots;
  const n = Math.min(count, slots.length);
  const marked = new Set<number>();
  for (let i = 0; i < n; i++) {
    marked.add(Math.floor(((i + 0.5) * slots.length) / n));
  }
  return slots.map((s, i) => (marked.has(i) ? { ...s, wants_figure: true } : s));
}

/**
 * In "auto" mode no slot is pre-marked: the model is asked to write a
 * figure_spec wherever a question genuinely needs a diagram, and the per-paper
 * ceiling is enforced server-side instead. Marking slots up front is the wrong
 * shape for a combined-subject paper — it would spread images evenly across
 * Physics, Chemistry and Biology regardless of which questions need one.
 */
function applyFigurePolicy(slots: BatchSlot[], settings: PaperSettings): BatchSlot[] {
  if (settings.figure_mode === "auto") return slots;
  return distributeFigureSlots(slots, settings.figure_questions ?? 0);
}

export function fullPlan(
  settings: PaperSettings,
  bank?: ReferenceBank | null
): BatchSlot[] {
  /*
   * A reference-led paper takes its questions, types and difficulties from the
   * bank, so it bypasses everything below — including the figure policy, since
   * which questions carry a diagram is decided by which source questions had
   * one printed with them, not by a count the teacher chose.
   */
  if (settings.source_mode === "reference" && bank) {
    return referencePlan(settings, bank);
  }

  if (settings.mode === "blueprint" && settings.blueprint) {
    return applyFigurePolicy(blueprintPlan(settings), settings);
  }

  const n = settings.question_count;

  // Difficulty counts via largest remainder so they sum exactly to n.
  const d = settings.difficulty;
  const exact = [
    ["easy", (n * d.easy_pct) / 100],
    ["medium", (n * d.medium_pct) / 100],
    ["hard", (n * d.hard_pct) / 100],
  ] as const;
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  let assigned = 0;
  for (const [k, v] of exact) {
    counts[k] = Math.floor(v);
    assigned += Math.floor(v);
  }
  const remainders = [...exact]
    .map(([k, v]) => ({ k, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  for (let i = 0; assigned < n; i++, assigned++) {
    counts[remainders[i % 3].k] += 1;
  }

  // Papers conventionally run easy → hard.
  const difficulties: Difficulty[] = [
    ...Array<Difficulty>(counts.easy).fill("easy"),
    ...Array<Difficulty>(counts.medium).fill("medium"),
    ...Array<Difficulty>(counts.hard).fill("hard"),
  ];

  const types: QuestionType[] =
    settings.question_type === "mixed"
      ? difficulties.map((_, i) => (["mcq", "mcq", "numerical", "assertion_reason"] as QuestionType[])[i % 4])
      : difficulties.map(() => settings.question_type as QuestionType);

  return applyFigurePolicy(
    difficulties.map((difficulty, i) => ({ difficulty, type: types[i] })),
    settings
  );
}

/**
 * Which plan slots the paper's existing questions have NOT filled.
 *
 * This used to be `plan.slice(existing.length)` — the plan indexed purely by
 * how many questions had been generated. That is right while a paper is being
 * generated straight through, and wrong the moment a teacher deletes a
 * question on the review screen and presses "Generate remaining": the count
 * drops, so the next batch is taken from the END of the plan rather than from
 * the slot that was vacated. On a blueprint paper the replacement then arrives
 * carrying a different part's section, marks and chapter, leaving one part
 * short and another over.
 *
 * Matching by position within each part instead is identical to the old
 * behaviour when nothing has been deleted — the plan walks parts in order and
 * questions are generated in that same order — and correct when something has.
 */
function unfilledSlots(plan: BatchSlot[], existing: Question[]): BatchSlot[] {
  /*
   * A reference-led slot is not interchangeable with any other: it stands for
   * one specific question of the teacher's PDF. Counting would resume at the
   * end of the plan, handing back a source the paper has already used — so
   * deleting question 3 of 45 and pressing "Generate remaining" produced a
   * duplicate of question 45 and left question 3's source unused. Match on the
   * source id each question records instead.
   */
  if (plan.some((s) => s.reference)) {
    const used = new Set(
      existing.map((q) => q.reference_item_id).filter((x): x is string => !!x)
    );
    // Questions carrying no source id are hand-written, or were generated for
    // a slot the bank could not supply; they fill the sourceless slots in
    // order, which is all the information there is about them.
    let sourceless = existing.filter((q) => !q.reference_item_id).length;
    return plan.filter((slot) => {
      if (slot.reference) return !used.has(slot.reference.id);
      if (sourceless > 0) {
        sourceless--;
        return false;
      }
      return true;
    });
  }

  // A simple (non-blueprint) paper has one flat run of interchangeable slots,
  // so position within the paper is the only thing to match on.
  if (!plan.some((s) => s.section_id)) return plan.slice(existing.length);

  const filledPerSection = new Map<string, number>();
  for (const q of existing) {
    const key = q.section_id ?? "";
    filledPerSection.set(key, (filledPerSection.get(key) ?? 0) + 1);
  }

  const out: BatchSlot[] = [];
  for (const slot of plan) {
    const key = slot.section_id ?? "";
    const filled = filledPerSection.get(key) ?? 0;
    if (filled > 0) {
      filledPerSection.set(key, filled - 1);
      continue;
    }
    out.push(slot);
  }
  return out;
}

/** Slots for the next batch, given the questions the paper already has. */
export function nextBatchSlots(
  settings: PaperSettings,
  existing: Question[],
  bank?: ReferenceBank | null
): BatchSlot[] {
  return unfilledSlots(fullPlan(settings, bank), existing).slice(
    0,
    GENERATION_BATCH_SIZE
  );
}

/** Compact avoid-list entries from existing questions. */
export function toAvoidList(questions: Pick<Question, "question_text">[], limit = 60): string[] {
  return questions
    .slice(-limit)
    .map((q) => q.question_text.replace(/\s+/g, " ").slice(0, 160));
}
