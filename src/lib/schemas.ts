import { z } from "zod";
import {
  MAX_QUESTIONS_PER_PAPER,
  MIN_QUESTIONS_PER_PAPER,
  MAX_REFERENCE_PDF_PAGES,
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

export const paperSettingsSchema = z.object({
  exam_type: z.enum(["JEE", "NEET", "Board", "Custom"]),
  exam_type_custom: z.string().trim().max(100).optional(),
  subject: z.string().trim().min(2).max(100),
  chapters: z
    .array(z.string().trim().min(2).max(200))
    .min(1, "Add at least one chapter or topic.")
    .max(10),
  question_count: z
    .number()
    .int()
    .min(MIN_QUESTIONS_PER_PAPER)
    .max(
      MAX_QUESTIONS_PER_PAPER,
      `At most ${MAX_QUESTIONS_PER_PAPER} questions per paper.`
    ),
  question_type: z.enum(["mcq", "numerical", "assertion_reason", "mixed"]),
  difficulty: difficultySchema,
  marks_per_question: z.number().min(0.5).max(20),
  negative_marks: z.number().min(0).max(10),
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
