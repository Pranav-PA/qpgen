import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getApiUser, jsonError, logUsage } from "@/lib/api";
import { extractBlueprint } from "@/lib/ai/generate";
import { MAX_BLUEPRINT_PAGES, MAX_BLUEPRINT_SECTIONS } from "@/lib/constants";
import { defaultTypeForMarks, type Blueprint } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        data_url: z
          .string()
          .startsWith("data:image/", "Blueprint pages must be images.")
          .max(3_000_000),
      })
    )
    .min(1)
    .max(MAX_BLUEPRINT_PAGES),
});

function slug(s: string, i: number): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return base || `part_${i + 1}`;
}

/**
 * Blueprints print the mark value inside the column header ("PART-B 2 MARKS"),
 * but the paper shows marks in the instruction line underneath — keeping it in
 * the name would print it twice.
 */
function cleanSectionName(name: string, i: number): string {
  const trimmed = (name || "").trim();
  const stripped = trimmed
    .replace(/[\s,–—-]*\(?\s*\d+(\.\d+)?\s*marks?\s*(questions?)?\s*\)?\s*$/i, "")
    .replace(/[\s,–—-]*\d+\s*marks?\s*(each)?\s*$/i, "")
    .trim();
  return (stripped || trimmed || `Part ${i + 1}`).slice(0, 40);
}

export async function POST(request: Request) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { user } = ctx;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid input." : "Invalid input.";
    return jsonError(msg, 400);
  }

  try {
    const { blueprint: raw, usage } = await extractBlueprint(body.pages);
    await logUsage({ user_id: user.id, action: "analyze_reference", usage });

    // Normalize into the app's shape: stable ids, sane bounds, derived types.
    const sections = raw.sections.slice(0, MAX_BLUEPRINT_SECTIONS).map((s, i) => {
      const set = Math.max(1, Math.round(s.questions_to_set || 1));
      const answer = Math.min(
        set,
        Math.max(1, Math.round(s.questions_to_answer || set))
      );
      const marks = Math.max(0.5, Number(s.marks_per_question) || 1);
      return {
        id: slug(s.id || s.name || "", i),
        name: cleanSectionName(s.name, i),
        marks_per_question: marks,
        questions_to_set: set,
        questions_to_answer: answer,
        question_type: defaultTypeForMarks(marks),
      };
    });

    // Map the model's section ids onto ours by position-independent lookup.
    const idByRaw = new Map<string, string>();
    raw.sections.slice(0, MAX_BLUEPRINT_SECTIONS).forEach((s, i) => {
      if (sections[i]) idByRaw.set(s.id, sections[i].id);
    });

    const rows = raw.rows
      .filter((r) => r.chapter?.trim())
      .map((r) => {
        const counts: Record<string, number> = {};
        for (const s of sections) counts[s.id] = 0;
        for (const c of r.counts ?? []) {
          const id = idByRaw.get(c.section_id) ?? c.section_id;
          if (id in counts) counts[id] = Math.max(0, Math.round(c.count || 0));
        }
        return { chapter: r.chapter.trim().slice(0, 200), counts };
      });

    const blueprint: Blueprint = { sections, rows };
    return NextResponse.json({ blueprint, extraction_id: randomUUID() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    await logUsage({
      user_id: user.id,
      action: "analyze_reference",
      success: false,
      error_message: message,
    });
    return jsonError(
      `We couldn't read that blueprint (${message}). You can still set the parts and chapter grid up by hand.`,
      502
    );
  }
}
