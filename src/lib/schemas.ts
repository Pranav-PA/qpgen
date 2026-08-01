import { z } from "zod";
import {
  MAX_BLUEPRINT_SECTIONS,
  MAX_QUESTIONS_BLUEPRINT,
  MAX_QUESTIONS_PER_PAPER,
  MIN_QUESTIONS_PER_PAPER,
  MAX_REFERENCE_PDF_PAGES,
  MAX_FIGURE_QUESTIONS,
} from "./constants";

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
        subgroups: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(20),
              label: z.string().trim().min(1).max(80),
              question_type: questionTypeSchema,
              count: z.number().int().min(1).max(MAX_QUESTIONS_BLUEPRINT),
            })
          )
          .max(4)
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
    chapters: z
      .array(z.string().trim().min(2).max(200))
      .min(1, "Add at least one chapter or topic.")
      .max(40),
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

export const createPaperSchema = z.object({
  title: z.string().trim().min(2).max(200),
  settings: paperSettingsSchema,
  institution: institutionSchema,
  reference_pages: referencePagesSchema.optional(),
});

export type CreatePaperInput = z.infer<typeof createPaperSchema>;
