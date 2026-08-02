// Curriculum reference data: which chapters a board/class/subject actually
// contains. Everything here is static reference material, not user data — it
// exists so a teacher never has to type 16 chapter names exactly right, and so
// the generator can be told which syllabus it is writing for.

export type Board = "KSEEB";

export type ClassLevel = 8 | 9 | 10;

/**
 * The branch a chapter belongs to inside a combined subject.
 *
 * Karnataka's Class 10 Science paper is one subject printed as three parts
 * (Physics / Chemistry / Biology), and Social Science as six. Tagging chapters
 * lets the blueprint hold each part's mark share instead of letting the chapter
 * grid drift.
 */
export type Strand =
  | "physics"
  | "chemistry"
  | "biology"
  | "history"
  | "political_science"
  | "sociology"
  | "geography"
  | "economics"
  | "business_studies";

export const STRAND_LABELS: Record<Strand, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  history: "History",
  political_science: "Political Science",
  sociology: "Sociology",
  geography: "Geography",
  economics: "Economics",
  business_studies: "Business Studies",
};

export interface Chapter {
  /** Exactly as printed in the KTBS textbook contents page. */
  name: string;
  strand?: Strand;
  /**
   * Marks this chapter is expected to carry in the board paper. Advisory only:
   * it seeds the blueprint's chapter grid, and the teacher edits from there.
   * Absent where the board allocates marks by theme instead (see Theme).
   */
  marks_weightage?: number;
  /** Theme id this chapter sits under, when the board groups them. */
  theme?: string;
  /**
   * Why this chapter is out of the examinable syllabus, when it is. The chapter
   * is still in the textbook, so it stays listed and a teacher can add it back
   * for a school test — it is just excluded from board-paper defaults.
   */
  excluded?: string;
  /**
   * Diagrams from this chapter a student may be asked to DRAW. The board
   * publishes a closed list; anything outside it is not fair game.
   */
  drawable_figures?: string[];
}

/**
 * A group of chapters the board allocates marks to as a unit.
 *
 * Karnataka moved SSLC Science to theme-wise allocation in 2019-20 precisely so
 * that marks are NOT published per chapter — the stated aim is that every
 * chapter gets taught rather than teachers drilling the high-scoring ones.
 */
export interface Theme {
  id: string;
  name: string;
  marks: number;
}

export interface CurriculumSubject {
  /** Stable id stored in PaperSettings.curriculum — never rename in place. */
  key: string;
  label: string;
  board: Board;
  class_level: ClassLevel;
  /** Subject-level note surfaced to the model, e.g. "one paper, three parts". */
  description?: string;
  /**
   * Order in which strand parts are printed, for subjects whose paper is split
   * by strand. Absent for single-strand subjects like Mathematics.
   */
  strand_order?: Strand[];
  /** Board-published mark allocation, when it is by theme rather than chapter. */
  themes?: Theme[];
  /** Mark split the board publishes for this paper, if any. */
  difficulty?: { easy_pct: number; medium_pct: number; hard_pct: number };
  chapters: Chapter[];
}

/** What a paper stores to remember which syllabus it was built against. */
export interface CurriculumRef {
  board: Board;
  class_level: ClassLevel;
  subject_key: string;
}
