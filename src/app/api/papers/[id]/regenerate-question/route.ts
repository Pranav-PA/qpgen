import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getApiUser, jsonError, logUsage } from "@/lib/api";
import { toAvoidList } from "@/lib/ai/plan";
import {
  generateQuestions,
  hasUnresolvedAnswer,
  shuffleMcqOptions,
  stripSectionPrefix,
  verifyQuestions,
} from "@/lib/ai/generate";
import type { Paper, Question } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({ question_id: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single<Paper>();
  if (!paper) return jsonError("Paper not found.", 404);

  const idx = (paper.questions ?? []).findIndex((q) => q.id === body.question_id);
  if (idx < 0) return jsonError("Question not found in this paper.", 404);
  const old = paper.questions[idx];

  try {
    const gen = await generateQuestions({
      settings: paper.settings,
      slots: [
        {
          type: old.type,
          difficulty: old.difficulty,
          // Keep a regenerated question in its original part and chapter.
          chapter: paper.settings.mode === "blueprint" ? old.chapter : undefined,
          section_id: old.section_id,
          section_name: old.section_name,
          marks: old.marks,
        },
      ],
      // The old question goes on the avoid-list so we get something new.
      avoid: toAvoidList(paper.questions, 60),
      styleNotes: paper.settings.style_notes ?? null,
    });
    const raw = shuffleMcqOptions(gen.questions[0]);

    const verification = await verifyQuestions({
      settings: paper.settings,
      questions: [{ ...raw, options: raw.options ?? undefined }],
    });
    const verdict = verification.verdicts[0];

    const unresolved = hasUnresolvedAnswer(raw);
    const reasons = [
      verdict && !verdict.ok ? verdict.reason : null,
      unresolved
        ? "The correct option could not be determined automatically — please select the right answer yourself."
        : null,
    ].filter(Boolean);

    const replacement: Question = {
      id: randomUUID(),
      type: old.type,
      difficulty: raw.difficulty,
      chapter: paper.settings.mode === "blueprint" ? old.chapter : raw.chapter,
      section_id: old.section_id,
      section_name: old.section_name,
      question_text: stripSectionPrefix(raw.question_text, old.section_name),
      options: raw.options ?? undefined,
      correct_answer: raw.correct_answer,
      solution: raw.solution,
      marks: old.marks,
      negative_marks: old.negative_marks,
      needs_review: !verdict || !verdict.ok || unresolved,
      review_reason: reasons.length > 0 ? reasons.join(" ") : undefined,
    };

    const questions = [...paper.questions];
    questions[idx] = replacement;
    const { error } = await supabase
      .from("papers")
      .update({ questions, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("Could not save the regenerated question.");

    await logUsage({ user_id: user.id, action: "regenerate_question", usage: gen.usage });
    await logUsage({ user_id: user.id, action: "verify_batch", usage: verification.usage });

    return NextResponse.json({ question: replacement });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed.";
    await logUsage({
      user_id: user.id,
      action: "regenerate_question",
      success: false,
      error_message: message,
    });
    return jsonError("Regenerating that question failed. Please try again.", 502);
  }
}
