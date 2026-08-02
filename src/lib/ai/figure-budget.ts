import { logUsage } from "@/lib/api";
import type { RasterMode } from "@/lib/api";
import { MAX_FIGURE_QUESTIONS } from "@/lib/constants";
import type { Strand } from "@/lib/curriculum";
import type { BlueprintSection, Question } from "@/lib/types";
import { generateQuestionImage, uploadQuestionImage } from "./images";
import type { FigureContext } from "./generate";

/**
 * Shared between every call site that can add a diagram to a paper
 * (generate-batch, regenerate-question, the AI question editor) so the
 * per-paper ceiling and the render/upload/log sequence are defined once.
 *
 * Each image is a real per-image bill and "auto" figure mode lets the model
 * choose how many questions want one without seeing the rest of the paper, so
 * the ceiling has to be enforced here rather than trusted from the prompt.
 */

/** How many more images this paper can render before hitting the cap. */
export function remainingFigureBudget(questions: Question[]): number {
  const used = questions.filter((q) => q.figure?.image_url).length;
  return Math.max(0, MAX_FIGURE_QUESTIONS - used);
}

/**
 * The paper's running figure state, for handing to the model in auto mode so
 * a batch generated later (typically the last strand in a combined subject's
 * part order) can see what earlier batches already used instead of guessing
 * blind. See FigureContext in ./generate for why this exists.
 */
export function figureContextFor(
  questions: Question[],
  sections: BlueprintSection[]
): FigureContext {
  const strandBySection = new Map(sections.map((s) => [s.id, s.strand]));
  const byStrand: Partial<Record<Strand, number>> = {};
  let used = 0;
  for (const q of questions) {
    if (!q.figure?.image_url) continue;
    used += 1;
    const strand = q.section_id ? strandBySection.get(q.section_id) : undefined;
    if (strand) byStrand[strand] = (byStrand[strand] ?? 0) + 1;
  }
  return {
    used,
    budget: MAX_FIGURE_QUESTIONS,
    byStrand: Object.keys(byStrand).length > 0 ? byStrand : undefined,
  };
}

/**
 * Renders and uploads one figure, logging usage either way. Never throws —
 * an image failure must not fail the question it belongs to; the caller
 * decides how to reflect `imageFailed` (typically a needs_review note), and
 * the question keeps its text either way.
 */
export async function renderFigureImage(opts: {
  userId: string;
  paperId: string;
  questionId: string;
  spec: string;
  raster: RasterMode;
}): Promise<{ imageUrl?: string; imageFailed: boolean }> {
  try {
    const rendered = await generateQuestionImage({
      spec: opts.spec,
      raster: opts.raster,
    });
    if (!rendered) return { imageFailed: true };

    const imageUrl =
      (await uploadQuestionImage({
        userId: opts.userId,
        paperId: opts.paperId,
        questionId: opts.questionId,
        bytes: rendered.bytes,
        mimeType: rendered.mimeType,
      })) ?? undefined;
    await logUsage({
      user_id: opts.userId,
      action: "generate_image",
      usage: rendered.usage,
      success: !!imageUrl,
    });
    return imageUrl ? { imageUrl, imageFailed: false } : { imageFailed: true };
  } catch (err) {
    await logUsage({
      user_id: opts.userId,
      action: "generate_image",
      success: false,
      error_message: err instanceof Error ? err.message : "unknown",
    });
    return { imageFailed: true };
  }
}

/**
 * The needs_review sentences a figure outcome adds, in the order every call
 * site already used before this was extracted — kept as one place so the
 * wording can't drift between generate-batch, regenerate and the AI editor.
 */
export function figureReviewNotes(outcome: {
  hasImage: boolean;
  imageFailed: boolean;
  capped: boolean;
}): string[] {
  return [
    outcome.hasImage
      ? "This question has an AI-generated diagram. Check it is accurate and readable before distributing."
      : null,
    outcome.imageFailed
      ? "A diagram was requested for this question but could not be generated — it was kept as text-only."
      : null,
    outcome.capped
      ? `This question suited a diagram, but the paper had already used its limit of ${MAX_FIGURE_QUESTIONS} generated images, so it was kept as text-only. Check it still reads clearly without one.`
      : null,
  ].filter((n): n is string => n !== null);
}
