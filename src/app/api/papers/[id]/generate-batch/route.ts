import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAiProvider, getApiUser, getImageConfig, jsonError, logUsage } from "@/lib/api";
import { nextBatchSlots, toAvoidList } from "@/lib/ai/plan";
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

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single<Paper>();
  if (!paper) return jsonError("Paper not found.", 404);

  const existing = paper.questions ?? [];
  const slots = nextBatchSlots(paper.settings, existing.length);
  if (slots.length === 0) {
    return NextResponse.json({ questions_total: existing.length, done: true });
  }

  // Duplicate avoidance: this paper's questions plus the teacher's recent
  // papers that overlap in chapters.
  const avoid = toAvoidList(existing);
  const { data: pastPapers } = await supabase
    .from("papers")
    .select("chapters, questions")
    .eq("user_id", user.id)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(5);
  for (const past of pastPapers ?? []) {
    const overlaps = (past.chapters as string[]).some((c) =>
      paper.settings.chapters.some(
        (mine) => mine.toLowerCase() === c.toLowerCase()
      )
    );
    if (overlaps && Array.isArray(past.questions)) {
      avoid.push(...toAvoidList(past.questions as Question[], 20));
    }
  }

  try {
    const provider = await getAiProvider();
    const images = await getImageConfig();
    const gen = await generateQuestions({
      settings: paper.settings,
      slots,
      avoid: avoid.slice(0, 80),
      styleNotes: paper.settings.style_notes ?? null,
      provider,
      figures: images.raster !== "off",
      // Lets a batch generated later — typically the last strand in a
      // combined subject's part order — see what earlier batches already
      // used instead of guessing blind every time.
      figureContext: figureContextFor(existing, paper.settings.blueprint?.sections ?? []),
    });
    await logUsage({ user_id: user.id, action: "generate_batch", usage: gen.usage });

    const shuffled = gen.questions.map(shuffleMcqOptions);

    const verification = await verifyQuestions({
      settings: paper.settings,
      questions: shuffled.map((q) => ({
        ...q,
        options: q.options ?? undefined,
        has_figure: !!q.figure_spec,
      })),
      provider,
    });
    await logUsage({ user_id: user.id, action: "verify_batch", usage: verification.usage });

    /*
     * Image budget for this batch.
     *
     * In "auto" mode the model chooses which questions carry a diagram, and it
     * only ever sees one batch at a time — it cannot budget across the paper.
     * Each image is a real per-image bill, so the ceiling is enforced here
     * instead: count what the paper already has and only honour that many more
     * figure_specs, in order. "fixed" mode is already bounded by the slot plan,
     * but the same cap applies harmlessly.
     */
    let figureBudget = remainingFigureBudget(existing);
    /** Spec to render for each question, or null to keep it text-only. */
    const figureToRender = shuffled.map((raw) => {
      if (!raw.figure_spec || images.raster === "off") return null;
      if (figureBudget <= 0) return null;
      figureBudget -= 1;
      return raw.figure_spec;
    });
    /** Wanted a diagram but lost it to the ceiling, not to a render failure. */
    const figureCapped = shuffled.map(
      (raw, i) => !!raw.figure_spec && images.raster !== "off" && !figureToRender[i]
    );

    const newQuestions: Question[] = await Promise.all(
      shuffled.map(async (raw, i) => {
        const verdict = verification.verdicts.find((v) => v.index === i);
        const unresolved = hasUnresolvedAnswer(raw);
        const slot = slots[i];
        const questionId = randomUUID();

        /*
         * Rendering happens per-question and is caught locally: an image
         * failure must not fail the whole batch, since a batch has up to 6
         * questions and typically only one wants a diagram. The question
         * keeps its text either way; only whether it carries an image
         * differs, and needs_review explains which happened.
         */
        const figureSpec = figureToRender[i];
        const { imageUrl, imageFailed } = figureSpec
          ? await renderFigureImage({
              userId: user.id,
              paperId: id,
              questionId,
              spec: figureSpec,
              raster: images.raster,
            })
          : { imageUrl: undefined, imageFailed: false };

        /*
         * The verifier reads text only — it cannot tell whether a rendered
         * circuit is wired correctly or a labelled figure is labelled right.
         * A question that got its diagram therefore always goes to review,
         * regardless of the text verdict.
         */
        const reasons = [
          verdict && !verdict.ok ? verdict.reason : null,
          unresolved
            ? "The correct option could not be determined automatically — please select the right answer yourself."
            : null,
          ...figureReviewNotes({
            hasImage: !!imageUrl,
            imageFailed,
            capped: figureCapped[i],
          }),
        ].filter(Boolean);

        return {
          id: questionId,
          type: slot?.type ?? raw.type,
          difficulty: raw.difficulty,
          // In blueprint mode the chapter is dictated by the grid, not the model.
          chapter: slot?.chapter ?? raw.chapter,
          question_text: stripSectionPrefix(raw.question_text, slot?.section_name),
          options: raw.options ?? undefined,
          correct_answer: raw.correct_answer,
          solution: raw.solution,
          marks: slot?.marks ?? paper.settings.marks_per_question,
          negative_marks: paper.settings.negative_marks,
          section_id: slot?.section_id,
          section_name: slot?.section_name,
          // No caption: figure_spec is the drawing instructions handed to the
          // image model ("A circuit with a 6V battery..."), not something a
          // student should read under the printed diagram. Karnataka's own
          // model papers don't caption inline figures beyond what the
          // question text already says.
          figure: imageUrl ? { image_url: imageUrl } : undefined,
          needs_review:
            !verdict || !verdict.ok || unresolved || !!imageUrl || imageFailed || figureCapped[i],
          review_reason: reasons.length > 0 ? reasons.join(" ") : undefined,
        };
      })
    );

    const all = [...existing, ...newQuestions];
    const { error: updateError } = await supabase
      .from("papers")
      .update({ questions: all, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) throw new Error("Could not save generated questions.");

    return NextResponse.json({
      questions_total: all.length,
      done: all.length >= paper.settings.question_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    await logUsage({
      user_id: user.id,
      action: "generate_batch",
      success: false,
      error_message: message,
    });
    return jsonError(
      `Generating this batch failed (${message}). Your progress so far is saved — you can retry from the paper page.`,
      502
    );
  }
}
