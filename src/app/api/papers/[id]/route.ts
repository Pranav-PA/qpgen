import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError } from "@/lib/api";
import { institutionSchema, questionTypeSchema } from "@/lib/schemas";
import type { Question } from "@/lib/types";

/**
 * z.object() strips any key not listed here by default — it does not error,
 * it silently drops it. figure was missing from this schema entirely, so
 * every save (including the automatic one PaperReview fires before every PDF
 * download) parsed the incoming questions, quietly discarded each one's
 * figure, and wrote the now-figure-less array back over the database. Not a
 * rendering bug and not intermittent: the first save after generation loses
 * every diagram on the paper, permanently.
 */
const questionFigureSchema = z.object({
  svg: z.string().max(20_000).optional(),
  image_url: z.string().url().max(600).optional(),
  caption: z.string().max(300).optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  type: questionTypeSchema,
  difficulty: z.enum(["easy", "medium", "hard"]),
  chapter: z.string().max(300),
  question_text: z.string().trim().min(3).max(6000),
  options: z.array(z.string().max(2000)).max(6).optional(),
  correct_answer: z.string().max(200),
  solution: z.string().max(10000),
  marks: z.number().min(0).max(100),
  negative_marks: z.number().min(0).max(100),
  needs_review: z.boolean(),
  review_reason: z.string().max(2000).optional(),
  figure: questionFigureSchema.optional(),
  teacher_authored: z.boolean().optional(),
  section_id: z.string().max(40).optional(),
  section_name: z.string().max(40).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  questions: z.array(questionSchema).max(60).optional(),
  institution_details: institutionSchema.optional(),
  status: z.enum(["draft", "finalized"]).optional(),
});

/** Save review-screen edits (questions, title, letterhead, finalize). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  const { id } = await params;

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid input." : "Invalid input.";
    return jsonError(msg, 400);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title;
  if (body.questions !== undefined) {
    /*
     * Defence in depth, on top of the schema fix above. There is no UI
     * control that removes a diagram while keeping the same question — the
     * review screen can only delete a question outright or replace it
     * entirely via regenerate, both of which legitimately change the id or
     * drop the row. So if an incoming question shares an id with a
     * currently-stored one that has a figure, and the incoming one does not,
     * that is never an intentional edit — it is a bug in whatever produced
     * this payload, known or not yet found. Refuse to let it through rather
     * than trust every future caller to get this right.
     */
    const { data: current } = await supabase
      .from("papers")
      .select("questions")
      .eq("id", id)
      .maybeSingle<{ questions: Question[] }>();
    const currentFigures = new Map(
      (current?.questions ?? [])
        .filter((q) => q.figure)
        .map((q) => [q.id, q.figure])
    );

    let recovered = 0;
    const questions = body.questions.map((q) => {
      if (!q.figure && currentFigures.has(q.id)) {
        recovered++;
        return { ...q, figure: currentFigures.get(q.id) };
      }
      return q;
    });
    if (recovered > 0) {
      console.error(
        `[papers/PATCH] refused to drop figure on save: paper=${id} questions=${recovered}`
      );
    }

    update.questions = questions;
    update.question_count = questions.length;
  }
  if (body.institution_details !== undefined) update.institution_details = body.institution_details;
  if (body.status !== undefined) update.status = body.status;

  // RLS restricts this to the owner's papers.
  const { data, error } = await supabase
    .from("papers")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return jsonError("Could not save your changes. Please retry.", 500);
  if (!data) return jsonError("Paper not found.", 404);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  const { id } = await params;

  const { data, error } = await supabase
    .from("papers")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return jsonError("Could not delete the paper.", 500);
  if (!data) return jsonError("Paper not found.", 404);
  return NextResponse.json({ ok: true });
}
