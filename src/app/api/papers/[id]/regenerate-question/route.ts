import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getAiProvider, getApiUser, getImageConfig, jsonError, logUsage } from "@/lib/api";
import { toAvoidList } from "@/lib/ai/plan";
import {
  generateQuestions,
  hasUnresolvedAnswer,
  shuffleMcqOptions,
  stripSectionPrefix,
  verifyQuestions,
} from "@/lib/ai/generate";
import {
  figureContextFor,
  figureReviewNotes,
  remainingFigureBudget,
  renderFigureImage,
} from "@/lib/ai/figure-budget";
import type { Paper, Question } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({
  question_id: z.string().min(1),
  // "guided" steers the fresh replacement with a teacher note; "random" (the
  // default, and the entire request shape every existing caller already
  // sends) is byte-for-byte today's behaviour — this must never change.
  mode: z.enum(["random", "guided"]).optional(),
  // Matches settings.extra_instructions' cap. Required when mode is "guided",
  // ignored otherwise — enforced below rather than with a schema refinement so
  // the error message can be specific.
  instruction: z.string().trim().max(1000).optional(),
});

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
  if (body.mode === "guided" && !body.instruction) {
    return jsonError("Describe what you want this question to be about.", 400);
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
    const provider = await getAiProvider();
    const images = await getImageConfig();
    // Excludes the old question's own image so a like-for-like replacement
    // isn't blocked by the slot it is about to vacate.
    const others = paper.questions.filter((q) => q.id !== old.id);
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
          // Without this a regenerated question can drift out of the branch its
          // part is headed with — a Chemistry question under PART-A (PHYSICS).
          strand: paper.settings.blueprint?.sections.find(
            (s) => s.id === old.section_id
          )?.strand,
          // In "fixed" figure mode this is the only signal left, after the
          // fact, of whether this slot was designated for a diagram — reuse
          // it so a regenerated question doesn't silently lose (or gain) one.
          // "auto" mode ignores it and re-decides fresh either way.
          wants_figure: !!old.figure,
          instruction: body.mode === "guided" ? body.instruction : undefined,
        },
      ],
      // The old question goes on the avoid-list so we get something new.
      avoid: toAvoidList(paper.questions, 60),
      styleNotes: paper.settings.style_notes ?? null,
      provider,
      figures: images.raster !== "off",
      figureContext: figureContextFor(others, paper.settings.blueprint?.sections ?? []),
    });
    const raw = shuffleMcqOptions(gen.questions[0]);

    const verification = await verifyQuestions({
      settings: paper.settings,
      questions: [
        { ...raw, options: raw.options ?? undefined, has_figure: !!raw.figure_spec },
      ],
      provider,
    });
    const verdict = verification.verdicts[0];

    // Same per-paper ceiling generate-batch enforces.
    const budget = remainingFigureBudget(others);
    const capped = !!raw.figure_spec && images.raster !== "off" && budget <= 0;
    const questionId = randomUUID();
    const { imageUrl, imageFailed } =
      raw.figure_spec && images.raster !== "off" && !capped
        ? await renderFigureImage({
            userId: user.id,
            paperId: id,
            questionId,
            spec: raw.figure_spec,
            raster: images.raster,
          })
        : { imageUrl: undefined, imageFailed: false };

    const unresolved = hasUnresolvedAnswer(raw);
    const reasons = [
      verdict && !verdict.ok ? verdict.reason : null,
      unresolved
        ? "The correct option could not be determined automatically — please select the right answer yourself."
        : null,
      ...figureReviewNotes({ hasImage: !!imageUrl, imageFailed, capped }),
    ].filter(Boolean);

    const replacement: Question = {
      id: questionId,
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
      figure: imageUrl ? { image_url: imageUrl } : undefined,
      needs_review: !verdict || !verdict.ok || unresolved || !!imageUrl || imageFailed || capped,
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
