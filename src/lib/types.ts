// Shared domain types. The `questions` JSONB column in `papers` stores Question[].
// All question/solution text may contain inline LaTeX delimited by $...$.

export type ExamType = "JEE" | "NEET" | "Board" | "Custom";
export type QuestionType = "mcq" | "numerical" | "assertion_reason";
export type Difficulty = "easy" | "medium" | "hard";
export type PaperStatus = "draft" | "finalized";
export type UserRole = "teacher" | "admin";

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
  /** True if the teacher wrote/edited this question by hand. */
  teacher_authored?: boolean;
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
