import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError } from "@/lib/api";
import type { Paper } from "@/lib/types";

const bodySchema = z.object({
  paper_id: z.string().uuid(),
  question_index: z.number().int().min(0),
  reason: z.string().trim().min(3, "Please describe what's wrong.").max(2000),
});

export async function POST(request: Request) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid input." : "Invalid input.";
    return jsonError(msg, 400);
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("id, questions")
    .eq("id", body.paper_id)
    .single<Pick<Paper, "id" | "questions">>();
  if (!paper) return jsonError("Paper not found.", 404);

  const snapshot = paper.questions?.[body.question_index] ?? null;
  if (!snapshot) return jsonError("That question no longer exists in the paper.", 404);

  const { error } = await supabase.from("reported_questions").insert({
    paper_id: body.paper_id,
    question_index: body.question_index,
    question_snapshot: snapshot,
    reported_by: user.id,
    reason: body.reason,
  });
  if (error) return jsonError("Could not submit the report. Please retry.", 500);

  return NextResponse.json({ ok: true });
}
