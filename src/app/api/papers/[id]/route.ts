import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError } from "@/lib/api";
import { institutionSchema } from "@/lib/schemas";

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["mcq", "numerical", "assertion_reason"]),
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
  teacher_authored: z.boolean().optional(),
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
    update.questions = body.questions;
    update.question_count = body.questions.length;
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
