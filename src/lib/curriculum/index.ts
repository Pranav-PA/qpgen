import { KSEEB_RETAINED_CHAPTERS, KSEEB_SUBJECTS } from "./kseeb";
import { STRAND_LABELS } from "./types";
import type {
  Board,
  Chapter,
  ClassLevel,
  CurriculumRef,
  CurriculumSubject,
  Strand,
  Theme,
} from "./types";

export { KSEEB_SUBJECTS, KSEEB_RETAINED_CHAPTERS, STRAND_LABELS };
export type { Board, Chapter, ClassLevel, CurriculumRef, CurriculumSubject, Strand, Theme };
export { BLUEPRINT_PRESETS, presetFor, strandMarkTotals } from "./presets";
export type { BlueprintPreset } from "./presets";

export const BOARDS: { value: Board; label: string }[] = [
  { value: "KSEEB", label: "Karnataka State Board (KSEEB / KSEAB)" },
];

export const CLASS_LEVELS: ClassLevel[] = [8, 9, 10];

/** Human label for a class, since 10 is the SSLC board year and 8/9 are not. */
export function classLabel(level: ClassLevel): string {
  return level === 10 ? "Class 10 (SSLC)" : `Class ${level}`;
}

export function subjectsFor(board: Board, level: ClassLevel): CurriculumSubject[] {
  return KSEEB_SUBJECTS.filter(
    (s) => s.board === board && s.class_level === level
  );
}

export function findSubject(ref: CurriculumRef | undefined): CurriculumSubject | null {
  if (!ref) return null;
  return (
    KSEEB_SUBJECTS.find(
      (s) =>
        s.board === ref.board &&
        s.class_level === ref.class_level &&
        s.key === ref.subject_key
    ) ?? null
  );
}

/**
 * Chapters in the examinable syllabus. A chapter can be in the textbook but out
 * of the exam — Karnataka omitted three Class 10 Science chapters from SSLC
 * assessment without removing them from the book — so this is what defaults and
 * blueprint seeding use. `subject.chapters` still holds everything, for a
 * teacher setting a school test that does cover them.
 */
export function examinableChapters(subject: CurriculumSubject): Chapter[] {
  return subject.chapters.filter((c) => !c.excluded);
}

export function excludedChapters(subject: CurriculumSubject): Chapter[] {
  return subject.chapters.filter((c) => c.excluded);
}

export function chapterNames(subject: CurriculumSubject): string[] {
  return examinableChapters(subject).map((c) => c.name);
}

/** Board-published mark total for a theme, keyed by theme id. */
export function themeMarks(subject: CurriculumSubject): Map<string, number> {
  return new Map((subject.themes ?? []).map((t) => [t.id, t.marks]));
}

/** Diagrams a student may be asked to draw, as "Chapter — figure" lines. */
export function drawableFigures(subject: CurriculumSubject): string[] {
  return examinableChapters(subject).flatMap((c) =>
    (c.drawable_figures ?? []).map((f) => `${c.name}: ${f}`)
  );
}

/**
 * Diagram-worthy topics grouped by strand, drawn from the syllabus's own
 * drawable_figures list. Not a restriction — a diagram the student is SHOWN
 * (as opposed to one asked for by name) is unrestricted — this exists purely
 * to give the generator concrete, syllabus-correct examples per branch instead
 * of generic ones that happen to skew towards Physics.
 */
export function diagramTopicsByStrand(
  subject: CurriculumSubject
): Partial<Record<Strand, string[]>> {
  const out: Partial<Record<Strand, string[]>> = {};
  for (const c of examinableChapters(subject)) {
    if (!c.strand || !c.drawable_figures || c.drawable_figures.length === 0) continue;
    (out[c.strand] ??= []).push(...c.drawable_figures);
  }
  return out;
}

/** Chapters of one strand, in printed order. */
export function chaptersInStrand(
  subject: CurriculumSubject,
  strand: Strand
): Chapter[] {
  return subject.chapters.filter((c) => c.strand === strand);
}

/** Strand a chapter belongs to, matched by exact name. */
export function strandOfChapter(
  subject: CurriculumSubject,
  chapterName: string
): Strand | null {
  return subject.chapters.find((c) => c.name === chapterName)?.strand ?? null;
}

/**
 * Chapters the board still teaches but current NCERT has dropped. Empty for
 * classes with no divergence.
 */
export function retainedChapters(level: ClassLevel): string[] {
  return KSEEB_RETAINED_CHAPTERS[level] ?? [];
}
