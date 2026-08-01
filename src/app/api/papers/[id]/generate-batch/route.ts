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
import { generateQuestionImage, uploadQuestionImage } from "@/lib/ai/images";
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
        let imageUrl: string | undefined;
        let imageFailed = false;
        if (raw.figure_spec && images.raster !== "off") {
          try {
            const rendered = await generateQuestionImage({
              spec: raw.figure_spec,
              raster: images.raster,
            });
            if (rendered) {
              imageUrl =
                (await uploadQuestionImage({
                  userId: user.id,
                  paperId: id,
                  questionId,
                  bytes: rendered.bytes,
                  mimeType: rendered.mimeType,
                })) ?? undefined;
              await logUsage({
                user_id: user.id,
                action: "generate_image",
                usage: rendered.usage,
                success: !!imageUrl,
              });
              if (!imageUrl) imageFailed = true;
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
          imageUrl
            ? "This question has an AI-generated diagram. Check it is accurate and readable before distributing."
            : null,
          imageFailed
            ? "A diagram was requested for this question but could not be generated — it was kept as text-only."
            : null,
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
          figure: imageUrl
            ? { image_url: imageUrl, caption: raw.figure_spec?.slice(0, 150) }
            : undefined,
          needs_review: !verdict || !verdict.ok || unresolved || !!imageUrl || imageFailed,
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
