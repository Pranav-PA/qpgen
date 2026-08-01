import { GENERATION_BATCH_SIZE } from "@/lib/constants";
import { sectionSlotTypes } from "@/lib/types";
import type {
  Difficulty,
  DifficultySettings,
  PaperSettings,
  Question,
  QuestionType,
} from "@/lib/types";
import type { BatchSlot } from "./generate";

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
    // Sub-groups fix the type of each printed slot in order (e.g. PART-A's
    // first 15 are MCQs, the next 5 fill-in-the-blanks).
    const slotTypes = sectionSlotTypes(section);
    const sectionSlots: BatchSlot[] = [];
    for (const row of bp.rows) {
      const count = row.counts[section.id] ?? 0;
      for (let i = 0; i < count; i++) {
        sectionSlots.push({
          type: slotTypes[sectionSlots.length] ?? section.question_type,
          difficulty: "medium",
          chapter: row.chapter,
          section_id: section.id,
          section_name: section.name,
          marks: section.marks_per_question,
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

export function fullPlan(settings: PaperSettings): BatchSlot[] {
  if (settings.mode === "blueprint" && settings.blueprint) {
    return distributeFigureSlots(blueprintPlan(settings), settings.figure_questions ?? 0);
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

  return distributeFigureSlots(
    difficulties.map((difficulty, i) => ({ difficulty, type: types[i] })),
    settings.figure_questions ?? 0
  );
}

/** Slots for the next batch given how many questions already exist. */
export function nextBatchSlots(settings: PaperSettings, existing: number): BatchSlot[] {
  const plan = fullPlan(settings);
  return plan.slice(existing, Math.min(existing + GENERATION_BATCH_SIZE, plan.length));
}

/** Compact avoid-list entries from existing questions. */
export function toAvoidList(questions: Pick<Question, "question_text">[], limit = 60): string[] {
  return questions
    .slice(-limit)
    .map((q) => q.question_text.replace(/\s+/g, " ").slice(0, 160));
}
