import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError, logUsage } from "@/lib/api";
import { referencePagesSchema } from "@/lib/schemas";
import { analyzeReference } from "@/lib/ai/generate";
import type { Paper } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({ pages: referencePagesSchema.min(1) });

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
    return jsonError("Invalid reference pages.", 400);
  }

  // RLS scopes this to the owner's papers.
  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single<Paper>();
  if (!paper) return jsonError("Paper not found.", 404);

  try {
    const { styleNotes, usage } = await analyzeReference({
      settings: paper.settings,
      pages: body.pages,
    });
    await supabase
      .from("papers")
      .update({
        settings: { ...paper.settings, style_notes: styleNotes },
        reference_pdf_used: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await logUsage({ user_id: user.id, action: "analyze_reference", usage });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logUsage({
      user_id: user.id,
      action: "analyze_reference",
      success: false,
      error_message: err instanceof Error ? err.message : "unknown",
    });
    return jsonError(
      "Reading the reference PDF failed. You can retry, or remove it and generate without a reference.",
      502
    );
  }
}
