import { z } from "zod";
import {
  MAX_BLUEPRINT_SECTIONS,
  MAX_QUESTIONS_BLUEPRINT,
  MAX_QUESTIONS_PER_PAPER,
  MIN_QUESTIONS_PER_PAPER,
  MAX_REFERENCE_PDF_PAGES,
  MAX_FIGURE_QUESTIONS,
  MAX_REFERENCE_ITEMS_PER_PAGE,
} from "./constants";

/** Upper bound on one bank: every page may print a full column of questions. */
const MAX_REFERENCE_ITEMS = MAX_REFERENCE_PDF_PAGES * MAX_REFERENCE_ITEMS_PER_PAGE;

export const difficultySchema = z
  .object({
    easy_pct: z.number().int().min(0).max(100),
    medium_pct: z.number().int().min(0).max(100),
    hard_pct: z.number().int().min(0).max(100),
  })
  .refine((d) => d.easy_pct + d.medium_pct + d.hard_pct === 100, {
    message: "Difficulty percentages must add up to 100.",
  });

export const questionTypeSchema = z.enum([
  "mcq",
  "numerical",
  "assertion_reason",
  "one_word",
  "short_answer",
  "long_answer",
]);

export const strandSchema = z.enum([
  "physics",
  "chemistry",
  "biology",
  "history",
  "political_science",
  "sociology",
  "geography",
  "economics",
  "business_studies",
]);

/**
 * Reference to the built-in curriculum data. Validated loosely on purpose —
 * an unknown subject_key resolves to null at lookup and the paper falls back to
 * free-text behaviour, rather than rejecting a paper whose key we later rename.
 */
export const curriculumSchema = z.object({
  board: z.literal("KSEEB"),
  class_level: z.union([z.literal(8), z.literal(9), z.literal(10)]),
  subject_key: z.string().trim().min(1).max(60),
});

export const blueprintSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(40),
        marks_per_question: z.number().min(0.5).max(50),
        questions_to_set: z.number().int().min(1).max(MAX_QUESTIONS_BLUEPRINT),
        questions_to_answer: z.number().int().min(1).max(MAX_QUESTIONS_BLUEPRINT),
        question_type: questionTypeSchema,
        instruction: z.string().max(300).optional(),
        strand: strandSchema.optional(),
        subgroups: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(20),
              // A run's heading IS its instruction on a Karnataka paper — "Four
              // alternatives are given for each of the following questions…"
              // runs to ~160 characters. Bounded like a section instruction,
              // not like a short label.
              label: z.string().trim().min(1).max(300),
              question_type: questionTypeSchema,
              count: z.number().int().min(1).max(MAX_QUESTIONS_BLUEPRINT),
              marks_per_question: z.number().min(0.5).max(50).optional(),
            })
          )
          // KSEEB's SSLC Science PART-C prints six runs (groups XI–XVI).
          .max(8)
          .optional(),
      })
    )
    .min(1, "Add at least one part.")
    .max(MAX_BLUEPRINT_SECTIONS),
  rows: z
    .array(
      z.object({
        chapter: z.string().trim().min(2).max(200),
        counts: z.record(z.string(), z.number().int().min(0).max(50)),
      })
    )
    .min(1, "Add at least one chapter row.")
    .max(40),
});

export const paperSettingsSchema = z
  .object({
    exam_type: z.enum(["JEE", "NEET", "Board", "Custom"]),
    exam_type_custom: z.string().trim().max(100).optional(),
    subject: z.string().trim().min(2).max(100),
    /**
     * Empty is legal only for a reference-mode paper, which has no chapter
     * list until extraction fills it with the bank's topics — enforced by the
     * refinement below so ordinary papers keep their original message.
     */
    chapters: z.array(z.string().trim().min(2).max(200)).max(40),
    question_count: z
      .number()
      .int()
      .min(MIN_QUESTIONS_PER_PAPER)
      .max(
        MAX_QUESTIONS_BLUEPRINT,
        `At most ${MAX_QUESTIONS_BLUEPRINT} questions per paper.`
      ),
    question_type: z.union([questionTypeSchema, z.literal("mixed")]),
    difficulty: difficultySchema,
    marks_per_question: z.number().min(0.5).max(50),
    negative_marks: z.number().min(0).max(10),
    mode: z.enum(["simple", "blueprint"]).optional(),
    blueprint: blueprintSchema.optional(),
    style_notes: z.string().max(4000).optional(),
    extra_instructions: z.string().trim().max(1000).optional(),
    /** Count of questions that must carry an AI-generated diagram. Opt-in; 0/undefined means none. */
    figure_questions: z.number().int().min(0).max(MAX_FIGURE_QUESTIONS).optional(),
    figure_mode: z.enum(["fixed", "auto"]).optional(),
    curriculum: curriculumSchema.optional(),
    layout_columns: z.union([z.literal(1), z.literal(2)]).optional(),
    source_mode: z.enum(["syllabus", "reference"]).optional(),
    reference_fidelity: z.enum(["reuse", "variant"]).optional(),
  })
  .refine((s) => s.source_mode === "reference" || s.chapters.length > 0, {
    message: "Add at least one chapter or topic.",
    path: ["chapters"],
  })
  .refine((s) => s.mode !== "blueprint" || !!s.blueprint, {
    message: "Blueprint mode needs a blueprint.",
  })
  .refine(
    (s) => s.mode === "blueprint" || s.question_count <= MAX_QUESTIONS_PER_PAPER,
    { message: `At most ${MAX_QUESTIONS_PER_PAPER} questions per paper.` }
  )
  .refine((s) => !s.figure_questions || s.figure_questions <= s.question_count, {
    message: "Diagram questions can't outnumber the total questions.",
  });

export const institutionSchema = z.object({
  name: z.string().trim().min(2, "Institution name is required.").max(200),
  address: z.string().trim().max(300).default(""),
  logo_url: z.string().url().nullable().default(null),
  exam_title: z.string().trim().min(2).max(200),
  exam_date: z.string().max(40).default(""),
  exam_time: z.string().max(40).default(""),
  duration_minutes: z.number().int().min(5).max(600),
  max_marks: z.number().min(1).max(2000),
  instructions: z.string().max(3000).default(""),
});

export const referencePagesSchema = z
  .array(
    z.object({
      page: z.number().int().min(1),
      data_url: z
        .string()
        .startsWith("data:image/", "Reference pages must be images.")
        .max(2_000_000, "A reference page image is too large."),
    })
  )
  .max(MAX_REFERENCE_PDF_PAGES);

/**
 * Figure crops taken client-side out of the reference PDF and posted back for
 * upload. Sized like a reference page rather than a logo: these are small
 * regions of a page, but a dense circuit at print resolution is still tens of
 * kilobytes, and a bank can carry a dozen of them.
 */
export const referenceCropsSchema = z
  .array(
    z.object({
      item_id: z.string().trim().min(1).max(60),
      data_url: z
        .string()
        .startsWith("data:image/", "Figure crops must be images.")
        .max(1_000_000, "A cropped figure is too large."),
    })
  )
  .max(MAX_REFERENCE_ITEMS);

export const createPaperSchema = z.object({
  title: z.string().trim().min(2).max(200),
  settings: paperSettingsSchema,
  institution: institutionSchema,
  reference_pages: referencePagesSchema.optional(),
});

export type CreatePaperInput = z.infer<typeof createPaperSchema>;
