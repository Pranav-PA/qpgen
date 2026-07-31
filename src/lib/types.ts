// Shared domain types. The `questions` JSONB column in `papers` stores Question[].
// All question/solution text may contain inline LaTeX delimited by $...$.

export type ExamType = "JEE" | "NEET" | "Board" | "Custom";

/**
 * Objective types carry options; descriptive types (board pattern) are answered
 * in prose and carry a model answer instead.
 */
export type QuestionType =
  | "mcq"
  | "numerical"
  | "assertion_reason"
  | "one_word"
  | "short_answer"
  | "long_answer";

export const OPTION_TYPES: readonly QuestionType[] = ["mcq", "assertion_reason"];

export function hasOptions(type: QuestionType): boolean {
  return OPTION_TYPES.includes(type);
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "MCQ",
  numerical: "Numerical",
  assertion_reason: "Assertion–Reason",
  one_word: "One word / fill in the blank",
  short_answer: "Short answer",
  long_answer: "Long answer",
};

/** Karnataka PUC convention: mark value implies the expected answer length. */
export function defaultTypeForMarks(marks: number): QuestionType {
  if (marks <= 1) return "mcq";
  if (marks <= 3) return "short_answer";
  return "long_answer";
}
export type Difficulty = "easy" | "medium" | "hard";
export type PaperStatus = "draft" | "finalized";
export type UserRole = "teacher" | "admin";

/**
 * A diagram drawn by the AI as SVG markup — circuits, ray diagrams, graphs.
 * The markup is sanitised on arrival (see lib/svg-sanitize), so anything stored
 * here has already been through the allowlist and is safe to inject.
 */
export interface QuestionFigure {
  svg: string;
  caption?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  chapter: string;
  question_text: string;
  /** Exactly 4 options for mcq/assertion_reason; absent for numerical. */
  options?: string[];
  /** Option letter ("A"-"D") for mcq/assertion_reason; numeric string for numerical. */
  correct_answer: string;
  solution: string;
  marks: number;
  negative_marks: number;
  needs_review: boolean;
  /** Set by the verifier when needs_review is true. */
  review_reason?: string;
  /**
   * Diagram accompanying the question. No verifier can check whether a drawn
   * circuit or diagram is actually correct, so a generated figure always sets
   * needs_review — a teacher has to look at it.
   */
  figure?: QuestionFigure;
  /** True if the teacher wrote/edited this question by hand. */
  teacher_authored?: boolean;
  /** Blueprint papers only: which part of the paper this question belongs to. */
  section_id?: string;
  section_name?: string;
}

/**
 * A run of questions inside a part that share a style, e.g. Karnataka's
 * PART-A splits into "I. Pick the correct option" then "II. Fill in the blanks".
 */
export interface BlueprintSubGroup {
  id: string;
  label: string;
  question_type: QuestionType;
  count: number;
}

/** One part of a blueprint paper, e.g. "PART-B, 2 marks, answer any 5 of 8". */
export interface BlueprintSection {
  id: string;
  name: string;
  marks_per_question: number;
  questions_to_set: number;
  questions_to_answer: number;
  question_type: QuestionType;
  /** Shown under the section heading; auto-worded when left blank. */
  instruction?: string;
  /** When present, splits the part into labelled runs of different types. */
  subgroups?: BlueprintSubGroup[];
}

/** Question types for each printed slot of a part, honouring any sub-groups. */
export function sectionSlotTypes(s: BlueprintSection): QuestionType[] {
  const groups = s.subgroups ?? [];
  if (groups.length === 0) {
    return Array<QuestionType>(s.questions_to_set).fill(s.question_type);
  }
  const out: QuestionType[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) out.push(g.question_type);
  }
  // Pad or trim if the sub-group counts drift from the part's total.
  while (out.length < s.questions_to_set) out.push(s.question_type);
  return out.slice(0, s.questions_to_set);
}

/** Sub-group label for the nth (0-based) question of a part, if it starts one. */
export function subGroupStartingAt(
  s: BlueprintSection,
  offset: number
): BlueprintSubGroup | null {
  const groups = s.subgroups ?? [];
  let at = 0;
  for (const g of groups) {
    if (at === offset) return g;
    at += g.count;
  }
  return null;
}

export function subGroupTotal(s: BlueprintSection): number {
  return (s.subgroups ?? []).reduce((t, g) => t + g.count, 0);
}

/** A chapter row of the blueprint grid: how many questions it owes each part. */
export interface BlueprintRow {
  chapter: string;
  /** section id -> number of questions from this chapter */
  counts: Record<string, number>;
}

export interface Blueprint {
  sections: BlueprintSection[];
  rows: BlueprintRow[];
}

/** Marks a student can actually score (choice-aware). */
export function blueprintTotalMarks(bp: Blueprint): number {
  return bp.sections.reduce(
    (sum, s) => sum + s.questions_to_answer * s.marks_per_question,
    0
  );
}

/** Questions actually printed on the paper. */
export function blueprintQuestionCount(bp: Blueprint): number {
  return bp.sections.reduce((sum, s) => sum + s.questions_to_set, 0);
}

/** How many questions a chapter grid assigns to one section. */
export function sectionGridTotal(bp: Blueprint, sectionId: string): number {
  return bp.rows.reduce((sum, r) => sum + (r.counts[sectionId] ?? 0), 0);
}

const WORDS = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN",
];
const spell = (n: number) => WORDS[n] ?? String(n);

export function defaultSectionInstruction(s: BlueprintSection): string {
  const set = s.questions_to_set;
  const answer = Math.min(s.questions_to_answer, set);
  const total = answer * s.marks_per_question;
  const sum = `${answer} × ${s.marks_per_question} = ${total}`;

  if (answer >= set) {
    return set === 1
      ? `Answer the following question. (${sum})`
      : `Answer all ${spell(set)} questions. (${sum})`;
  }
  return `Answer any ${spell(answer)} of the following ${spell(set)} questions. (${sum})`;
}

export interface DifficultySettings {
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
}

export interface InstitutionDetails {
  name: string;
  address: string;
  logo_url: string | null;
  exam_title: string;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  max_marks: number;
  instructions: string;
}

export interface PaperSettings {
  exam_type: ExamType;
  exam_type_custom?: string;
  subject: string;
  chapters: string[];
  question_count: number;
  question_type: QuestionType | "mixed";
  difficulty: DifficultySettings;
  marks_per_question: number;
  negative_marks: number;
  /** Style profile distilled from the teacher's reference PDF, if uploaded. */
  style_notes?: string;
  /**
   * Free-text steering written by the teacher — "only take questions from
   * Section B", "skip diagram questions". Applies with or without a reference
   * PDF. Untrusted content: it narrows what gets generated, it does not
   * override the system prompt.
   */
  extra_instructions?: string;
  /** Absent on papers created before blueprint mode existed — treat as "simple". */
  mode?: "simple" | "blueprint";
  blueprint?: Blueprint;
}

export function isBlueprint(s: PaperSettings): boolean {
  return s.mode === "blueprint" && !!s.blueprint;
}

export interface Paper {
  id: string;
  user_id: string;
  title: string;
  exam_type: string;
  subject: string;
  chapters: string[];
  question_count: number;
  difficulty_settings: DifficultySettings;
  institution_details: InstitutionDetails;
  questions: Question[];
  settings: PaperSettings;
  reference_pdf_used: boolean;
  status: PaperStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  is_disabled: boolean;
  daily_generation_cap: number | null;
  generations_today: number;
  last_generation_date: string | null;
  institution_defaults: Partial<InstitutionDetails> | null;
  created_at: string;
}

export interface ReportedQuestion {
  id: string;
  paper_id: string;
  question_index: number;
  question_snapshot: Question | null;
  reported_by: string;
  reason: string;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  action:
    | "generate_batch"
    | "regenerate_question"
    | "verify_batch"
    | "analyze_reference"
    | "export";
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

/** A reference PDF page rendered client-side to a JPEG data URL. */
export interface ReferencePage {
  page: number;
  data_url: string;
}
