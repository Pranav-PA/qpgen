import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getAiProvider, getApiUser, getImageConfig, jsonError, logUsage } from "@/lib/api";
import {
  hasUnresolvedAnswer,
  reviseQuestion,
  shuffleMcqOptions,
  stripSectionPrefix,
  verifyQuestions,
} from "@/lib/ai/generate";
import {
  figureReviewNotes,
  remainingFigureBudget,
  renderFigureImage,
} from "@/lib/ai/figure-budget";
import { editQuestionImage, uploadQuestionImage } from "@/lib/ai/images";
import type { Paper, Question } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({
  question_id: z.string().min(1),
  // Matches settings.extra_instructions' cap — same kind of free-text
  // steering, just scoped to one question instead of the whole paper.
  instruction: z.string().trim().min(1).max(1000),
});

/**
 * AI-assisted edit: a teacher describes what's wrong with ONE question in
 * plain English — "the circuit is wrong, remove the value labels" — and gets
 * a revision back that changes only what the note implies, unlike
 * regenerate-question which discards the question entirely for a fresh one.
 *
 * Mirrors regenerate-question's auth/logging pattern exactly: no
 * consume_generation call (that only runs once, at paper creation), just
 * getApiUser() and usage logging.
 */
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
    return jsonError("Please describe what to change (up to 1000 characters).", 400);
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

    const { revision, usage } = await reviseQuestion({
      settings: paper.settings,
      current: {
        type: old.type,
        question_text: old.question_text,
        options: old.options,
        correct_answer: old.correct_answer,
        solution: old.solution,
        has_figure: !!old.figure,
      },
      instruction: body.instruction,
      provider,
    });
    await logUsage({ user_id: user.id, action: "edit_question", usage });

    // Reuse the app's existing MCQ shuffle on a RawQuestion-shaped view of the
    // revision — type/chapter/difficulty are pinned from the original, the
    // same way regenerate-question pins them; the model doesn't choose them.
    const shuffled = shuffleMcqOptions({
      type: old.type,
      difficulty: old.difficulty,
      chapter: old.chapter,
      question_text: revision.question_text,
      options: revision.options,
      correct_answer: revision.correct_answer,
      solution: revision.solution,
    });

    // Excludes the question's own current image so an in-place "change"
    // (same slot, not a new one) never gets blocked by its own old picture.
    const others = paper.questions.filter((q) => q.id !== old.id);
    let imageUrl = old.figure?.image_url;
    let imageFailed = false;
    let capped = false;
    // A fresh id even for an edit of the same question: reusing the old
    // image's storage path would keep the same public URL, and a CDN or the
    // browser could keep serving the stale cached image after a "change".
    const imageId = randomUUID();

    if (revision.figure_action === "remove") {
      imageUrl = undefined;
    } else if (revision.figure_action === "add" && revision.figure_spec && images.raster !== "off") {
      if (remainingFigureBudget(others) <= 0) {
        capped = true;
      } else {
        const rendered = await renderFigureImage({
          userId: user.id,
          paperId: id,
          questionId: imageId,
          spec: revision.figure_spec,
          raster: images.raster,
        });
        imageUrl = rendered.imageUrl;
        imageFailed = rendered.imageFailed;
      }
    } else if (
      revision.figure_action === "change" &&
      old.figure?.image_url &&
      images.raster !== "off"
    ) {
      // Edits the existing image directly from the teacher's own words rather
      // than redrawing from a freshly written description — see
      // lib/ai/images.ts editQuestionImage for why. Does not touch the
      // budget: this replaces one image in place, it doesn't add a new one.
      try {
        const edited = await editQuestionImage({
          imageUrl: old.figure.image_url,
          instruction: body.instruction,
          raster: images.raster,
        });
        if (edited) {
          const uploaded = await uploadQuestionImage({
            userId: user.id,
            paperId: id,
            questionId: imageId,
            bytes: edited.bytes,
            mimeType: edited.mimeType,
          });
          await logUsage({
            user_id: user.id,
            action: "generate_image",
            usage: edited.usage,
            success: !!uploaded,
          });
          if (uploaded) imageUrl = uploaded;
          else imageFailed = true;
        } else {
          imageFailed = true;
        }
      } catch (imgErr) {
        imageFailed = true;
        await logUsage({
          user_id: user.id,
          action: "generate_image",
          success: false,
          error_message: imgErr instanceof Error ? imgErr.message : "unknown",
        });
      }
    }
    // "keep" (or raster switched off mid-edit): imageUrl stays old.figure?.image_url.

    const verification = await verifyQuestions({
      settings: paper.settings,
      questions: [
        {
          type: shuffled.type,
          difficulty: shuffled.difficulty,
          chapter: shuffled.chapter,
          question_text: shuffled.question_text,
          options: shuffled.options ?? undefined,
          correct_answer: shuffled.correct_answer,
          solution: shuffled.solution,
          has_figure: !!imageUrl,
        },
      ],
      provider,
    });
    const verdict = verification.verdicts[0];
    await logUsage({ user_id: user.id, action: "verify_batch", usage: verification.usage });

    const unresolved = hasUnresolvedAnswer(shuffled);
    // The verifier reads text only and cannot judge a diagram — a newly
    // added or edited image always goes to review, same as generate-batch.
    // A plain removal does NOT get this: nothing unverifiable was introduced
    // (quite the opposite), and self-containment after a removal is already
    // covered by the verifier call above (has_figure: false, same rule 5 it
    // applies to any other text-only question) — a bare needs_review with no
    // review_reason to show for it would just be a confusing flag.
    const newOrChangedImage = !!imageUrl && imageUrl !== old.figure?.image_url;
    const reasons = [
      verdict && !verdict.ok ? verdict.reason : null,
      unresolved
        ? "The correct option could not be determined automatically — please select the right answer yourself."
        : null,
      ...figureReviewNotes({ hasImage: newOrChangedImage, imageFailed, capped }),
    ].filter(Boolean);

    const replacement: Question = {
      ...old,
      question_text: stripSectionPrefix(shuffled.question_text, old.section_name),
      options: shuffled.options ?? undefined,
      correct_answer: shuffled.correct_answer,
      solution: shuffled.solution,
      figure: imageUrl ? { image_url: imageUrl } : undefined,
      needs_review:
        !verdict || !verdict.ok || unresolved || newOrChangedImage || imageFailed || capped,
      review_reason: reasons.length > 0 ? reasons.join(" ") : undefined,
    };

    const questions = [...paper.questions];
    questions[idx] = replacement;
    const { error } = await supabase
      .from("papers")
      .update({ questions, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("Could not save the edited question.");

    return NextResponse.json({ question: replacement });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed.";
    await logUsage({
      user_id: user.id,
      action: "edit_question",
      success: false,
      error_message: message,
    });
    return jsonError("Editing that question failed. Please try again.", 502);
  }
}
