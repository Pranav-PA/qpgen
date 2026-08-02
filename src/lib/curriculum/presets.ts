// Ready-made blueprints for Karnataka board papers.
//
// A preset saves a teacher from hand-building three parts and sixteen runs, but
// it is only ever a starting point — everything it produces is editable in the
// blueprint editor, and a teacher with the current year's blueprint PDF should
// still use the upload path, which reads their actual document.

import type { Blueprint, BlueprintSection } from "@/lib/types";
import { KSEEB_SUBJECTS } from "./kseeb";
import { STRAND_LABELS } from "./types";
import type { CurriculumRef, CurriculumSubject, Strand } from "./types";

export interface BlueprintPreset {
  subject_key: string;
  label: string;
  /** Where the structure came from, shown to the teacher in the editor. */
  source: string;
  /** True when the structure is transcribed from an official board document. */
  official: boolean;
  total_marks: number;
  duration_minutes: number;
  build: () => Blueprint;
}

/* ------------------------------------------------------------------ */
/* Class 10 Science (subject code 83-E)                                */

/**
 * Transcribed group by group from KSEAB's three official 2025-26 SSLC Science
 * model question papers (83-E). All three print an identical structure — three
 * parts by branch, sixteen runs, 38 questions, 80 marks — which is what makes
 * it safe to ship as a preset.
 *
 * Note the runs inside one part carry different mark values (PART-A runs 1, 1,
 * 2, 3, 4), which is why BlueprintSubGroup carries its own marks_per_question.
 *
 * Every question is compulsory. The real paper offers choice as a per-question
 * "OR" alternative rather than "answer any N of M", and QPGen has no
 * representation for that yet, so questions_to_answer always equals
 * questions_to_set here.
 */
const MCQ_INSTRUCTION =
  "Four alternatives are given for each of the following questions / incomplete statements. Choose the correct alternative and write the complete answer along with its letter of alphabet.";
const ANSWER_INSTRUCTION = "Answer the following questions.";

interface RunSpec {
  label: string;
  count: number;
  marks: number;
  type: BlueprintSection["question_type"];
  mcq?: boolean;
}

/** Roman numerals label the runs continuously across all three parts (I–XVI). */
const ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII",
  "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI",
];

const PHYSICS_RUNS: RunSpec[] = [
  { label: "Multiple choice", count: 2, marks: 1, type: "mcq", mcq: true },
  { label: "Very short answer", count: 2, marks: 1, type: "one_word" },
  { label: "Short answer", count: 3, marks: 2, type: "short_answer" },
  { label: "Short essay", count: 3, marks: 3, type: "short_answer" },
  { label: "Long answer", count: 2, marks: 4, type: "long_answer" },
];

const CHEMISTRY_RUNS: RunSpec[] = [
  { label: "Multiple choice", count: 3, marks: 1, type: "mcq", mcq: true },
  { label: "Very short answer", count: 3, marks: 1, type: "one_word" },
  { label: "Short answer", count: 3, marks: 2, type: "short_answer" },
  { label: "Short essay", count: 3, marks: 3, type: "short_answer" },
  { label: "Long answer", count: 1, marks: 4, type: "long_answer" },
];

const BIOLOGY_RUNS: RunSpec[] = [
  { label: "Multiple choice", count: 3, marks: 1, type: "mcq", mcq: true },
  { label: "Very short answer", count: 3, marks: 1, type: "one_word" },
  { label: "Short answer", count: 2, marks: 2, type: "short_answer" },
  { label: "Short essay", count: 3, marks: 3, type: "short_answer" },
  { label: "Long answer", count: 1, marks: 4, type: "long_answer" },
  { label: "Essay", count: 1, marks: 5, type: "long_answer" },
];

const SCIENCE_PARTS: { id: string; name: string; strand: Strand; runs: RunSpec[] }[] = [
  { id: "part_a", name: "PART-A (PHYSICS)", strand: "physics", runs: PHYSICS_RUNS },
  { id: "part_b", name: "PART-B (CHEMISTRY)", strand: "chemistry", runs: CHEMISTRY_RUNS },
  { id: "part_c", name: "PART-C (BIOLOGY)", strand: "biology", runs: BIOLOGY_RUNS },
];

function buildSslcScience(): Blueprint {
  let roman = 0;
  const sections: BlueprintSection[] = SCIENCE_PARTS.map((part) => {
    const count = part.runs.reduce((t, r) => t + r.count, 0);
    return {
      id: part.id,
      name: part.name,
      // Fallback only — every run below sets its own value.
      marks_per_question: 1,
      questions_to_set: count,
      questions_to_answer: count,
      question_type: "short_answer" as const,
      strand: part.strand,
      subgroups: part.runs.map((r) => ({
        id: `${part.id}_${roman}`,
        label: `${ROMAN[roman++]}. ${r.mcq ? MCQ_INSTRUCTION : ANSWER_INSTRUCTION}`,
        question_type: r.type,
        count: r.count,
        marks_per_question: r.marks,
      })),
    };
  });

  return { sections, rows: seedRows("10-science", sections) };
}

/* ------------------------------------------------------------------ */

/**
 * Seeds the chapter grid, weighting each chapter by the marks its theme carries
 * (shared equally between the theme's chapters) or by its own published
 * weightage where the board allocates per chapter.
 *
 * Karnataka deliberately does NOT publish per-chapter marks for SSLC Science —
 * the theme totals are the real constraint, and how they split across a theme's
 * chapters is the paper-setter's call. So this produces a grid that adds up to
 * the right per-part totals and leaves the chapter split as an editable first
 * guess. The editor shows running totals so any drift is visible.
 *
 * Chapters excluded from assessment are listed but never seeded.
 */
function seedRows(
  subjectKey: string,
  sections: BlueprintSection[]
): Blueprint["rows"] {
  const subject = KSEEB_SUBJECTS.find((s) => s.key === subjectKey);
  if (!subject) return [];

  const emptyCounts = () =>
    Object.fromEntries(sections.map((s) => [s.id, 0])) as Record<string, number>;

  // Only examinable chapters become grid rows. A zero row would still land in
  // settings.chapters and be handed to the model as an allowed chapter, which
  // is exactly what excluding it is meant to prevent.
  const chapters = subject.chapters.filter((c) => !c.excluded);
  const rows = chapters.map((c) => ({ chapter: c.name, counts: emptyCounts() }));

  const themeTotals = new Map((subject.themes ?? []).map((t) => [t.id, t.marks]));
  const chaptersInTheme = new Map<string, number>();
  for (const c of chapters) {
    if (!c.theme) continue;
    chaptersInTheme.set(c.theme, (chaptersInTheme.get(c.theme) ?? 0) + 1);
  }
  const weightOf = (c: (typeof chapters)[number]): number => {
    if (c.marks_weightage !== undefined) return c.marks_weightage;
    if (c.theme && themeTotals.has(c.theme)) {
      return themeTotals.get(c.theme)! / (chaptersInTheme.get(c.theme) || 1);
    }
    return 1;
  };

  for (const section of sections) {
    // Chapters eligible for this part, heaviest first so the biggest chapters
    // are the ones that certainly get a question when slots are scarce.
    const eligible = chapters
      .map((c, i) => ({ i, weight: weightOf(c), strand: c.strand }))
      .filter((c) => !section.strand || c.strand === section.strand)
      .sort((a, b) => b.weight - a.weight);
    if (eligible.length === 0) continue;

    // Hand out this part's questions largest-remainder style by weight, then
    // top up round-robin so the column always adds up to questions_to_set.
    const total = eligible.reduce((t, c) => t + c.weight, 0);
    const slots = section.questions_to_set;
    let assigned = 0;
    const shares = eligible.map((c) => {
      const exact = (slots * c.weight) / total;
      const whole = Math.floor(exact);
      assigned += whole;
      return { i: c.i, whole, rem: exact - whole };
    });
    for (const s of shares) rows[s.i].counts[section.id] = s.whole;

    const byRemainder = [...shares].sort((a, b) => b.rem - a.rem);
    for (let k = 0; assigned < slots; k++, assigned++) {
      rows[byRemainder[k % byRemainder.length].i].counts[section.id] += 1;
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Classes 8 and 9 — a starting point, not a board pattern             */

/**
 * Karnataka publishes no exam blueprint for classes 8 and 9: the state's move
 * to board exams for classes 5, 8 and 9 was stayed by the Supreme Court, so
 * these are school-set papers. What follows is therefore explicitly UNOFFICIAL
 * — an 80-mark paper shaped like the SSLC one so it feels familiar, offered as
 * something to edit rather than something to trust. It must never be presented
 * as a board pattern.
 */
const SCHOOL_RUNS: RunSpec[] = [
  { label: "Multiple choice", count: 8, marks: 1, type: "mcq", mcq: true },
  { label: "Very short answer", count: 6, marks: 1, type: "one_word" },
  { label: "Short answer", count: 8, marks: 2, type: "short_answer" },
  { label: "Short essay", count: 8, marks: 3, type: "short_answer" },
  { label: "Long answer", count: 4, marks: 4, type: "long_answer" },
  { label: "Essay", count: 2, marks: 5, type: "long_answer" },
];

/**
 * Splits the runs above across the subject's branches in proportion to how many
 * chapters each branch has, so a combined paper covers all of them. Subjects
 * with a single branch (Mathematics) come out as one part.
 */
function buildSchoolDefault(subjectKey: string): () => Blueprint {
  return () => {
    const subject = KSEEB_SUBJECTS.find((s) => s.key === subjectKey);
    const strands = (subject?.strand_order ?? []).filter((st) =>
      subject?.chapters.some((c) => c.strand === st)
    );
    // More than three parts makes the chapter grid unusable, and Social
    // Science's six branches are a syllabus grouping rather than printed parts.
    const useStrands = strands.length > 1 && strands.length <= 3;

    if (!useStrands) {
      const count = SCHOOL_RUNS.reduce((t, r) => t + r.count, 0);
      const sections: BlueprintSection[] = [
        {
          id: "part_a",
          name: "PART-A",
          marks_per_question: 1,
          questions_to_set: count,
          questions_to_answer: count,
          question_type: "short_answer",
          subgroups: SCHOOL_RUNS.map((r, i) => ({
            id: `part_a_${i}`,
            label: `${ROMAN[i]}. ${r.mcq ? MCQ_INSTRUCTION : ANSWER_INSTRUCTION}`,
            question_type: r.type,
            count: r.count,
            marks_per_question: r.marks,
          })),
        },
      ];
      return { sections, rows: seedRows(subjectKey, sections) };
    }

    // Weight each branch by its share of the subject's chapters, then hand out
    // each run's questions largest-remainder style so the totals stay exact.
    const weights = strands.map(
      (st) => subject!.chapters.filter((c) => c.strand === st).length
    );
    const totalWeight = weights.reduce((t, w) => t + w, 0);
    const perStrandRuns: RunSpec[][] = strands.map(() => []);
    for (const run of SCHOOL_RUNS) {
      let given = 0;
      const shares = weights.map((w) => {
        const exact = (run.count * w) / totalWeight;
        given += Math.floor(exact);
        return { whole: Math.floor(exact), rem: exact - Math.floor(exact) };
      });
      const order = shares
        .map((s, i) => ({ i, rem: s.rem }))
        .sort((a, b) => b.rem - a.rem);
      for (let k = 0; given < run.count; k++, given++) shares[order[k % order.length].i].whole += 1;
      shares.forEach((s, i) => {
        if (s.whole > 0) perStrandRuns[i].push({ ...run, count: s.whole });
      });
    }

    let roman = 0;
    const sections: BlueprintSection[] = strands.map((strand, i) => {
      const runs = perStrandRuns[i];
      const count = runs.reduce((t, r) => t + r.count, 0);
      const id = `part_${String.fromCharCode(97 + i)}`;
      return {
        id,
        name: `PART-${String.fromCharCode(65 + i)} (${STRAND_LABELS[strand].toUpperCase()})`,
        marks_per_question: 1,
        questions_to_set: count,
        questions_to_answer: count,
        question_type: "short_answer" as const,
        strand,
        subgroups: runs.map((r, k) => ({
          id: `${id}_${k}`,
          label: `${ROMAN[roman++]}. ${r.mcq ? MCQ_INSTRUCTION : ANSWER_INSTRUCTION}`,
          question_type: r.type,
          count: r.count,
          marks_per_question: r.marks,
        })),
      };
    });

    return { sections, rows: seedRows(subjectKey, sections) };
  };
}

const SCHOOL_SUBJECT_KEYS = [
  "8-science", "8-maths", "8-social-science",
  "9-science", "9-maths", "9-social-science",
];

/* ------------------------------------------------------------------ */

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    subject_key: "10-science",
    label: "KSEAB SSLC Science pattern (83-E)",
    source: "KSEAB SSLC Model Question Papers 1–3, 2025-26",
    official: true,
    total_marks: 80,
    duration_minutes: 195,
    build: buildSslcScience,
  },
  ...SCHOOL_SUBJECT_KEYS.map((key) => ({
    subject_key: key,
    label: "80-mark school exam pattern",
    source:
      "Not a board pattern — Karnataka publishes no blueprint for classes 8 and 9. Shaped like the SSLC paper as a starting point; edit it to match your school's.",
    official: false,
    total_marks: 80,
    duration_minutes: 180,
    build: buildSchoolDefault(key),
  })),
];

export function presetFor(ref: CurriculumRef | undefined): BlueprintPreset | null {
  if (!ref) return null;
  return BLUEPRINT_PRESETS.find((p) => p.subject_key === ref.subject_key) ?? null;
}

/** Per-strand mark totals of a built blueprint, for the editor's balance readout. */
export function strandMarkTotals(
  bp: Blueprint,
  subject: CurriculumSubject
): { strand: Strand; marks: number }[] {
  if (!subject.strand_order) return [];
  return subject.strand_order.map((strand) => {
    const marks = bp.sections
      .filter((s) => s.strand === strand)
      .reduce(
        (sum, s) =>
          sum +
          (s.subgroups ?? []).reduce(
            (t, g) => t + g.count * (g.marks_per_question ?? s.marks_per_question),
            0
          ),
        0
      );
    return { strand, marks };
  });
}
