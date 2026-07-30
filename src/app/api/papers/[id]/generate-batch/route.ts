import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAiProvider, getApiUser, jsonError, logUsage } from "@/lib/api";
import { nextBatchSlots, toAvoidList } from "@/lib/ai/plan";
import {
  generateQuestions,
  hasUnresolvedAnswer,
  shuffleMcqOptions,
  stripSectionPrefix,
  verifyQuestions,
} from "@/lib/ai/generate";
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
    const gen = await generateQuestions({
      settings: paper.settings,
      slots,
      avoid: avoid.slice(0, 80),
      styleNotes: paper.settings.style_notes ?? null,
      provider,
    });
    await logUsage({ user_id: user.id, action: "generate_batch", usage: gen.usage });

    const shuffled = gen.questions.map(shuffleMcqOptions);

    const verification = await verifyQuestions({
      settings: paper.settings,
      questions: shuffled.map((q) => ({ ...q, options: q.options ?? undefined })),
      provider,
    });
    await logUsage({ user_id: user.id, action: "verify_batch", usage: verification.usage });

    const newQuestions: Question[] = shuffled.map((raw, i) => {
      const verdict = verification.verdicts.find((v) => v.index === i);
      const unresolved = hasUnresolvedAnswer(raw);
      const slot = slots[i];
      const reasons = [
        verdict && !verdict.ok ? verdict.reason : null,
        unresolved
          ? "The correct option could not be determined automatically — please select the right answer yourself."
          : null,
      ].filter(Boolean);

      return {
        id: randomUUID(),
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
        needs_review: !verdict || !verdict.ok || unresolved,
        review_reason: reasons.length > 0 ? reasons.join(" ") : undefined,
      };
    });

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
