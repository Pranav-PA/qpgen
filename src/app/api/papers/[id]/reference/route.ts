import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAiProvider,
  getApiUser,
  jsonError,
  logUsage,
  type SupabaseServerClient,
} from "@/lib/api";
import { referencePagesSchema } from "@/lib/schemas";
import { analyzeReference } from "@/lib/ai/generate";
import { extractReferenceBank } from "@/lib/ai/reference-extract";
import { isReferenceLed, type Paper, type ReferencePage } from "@/lib/types";

/**
 * Extraction is one vision call per page, four in flight at a time, so a full
 * ten-page bank is three waves of image-reading requests.
 */
export const maxDuration = 300;

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

  return isReferenceLed(paper.settings)
    ? buildBank({ supabase, userId: user.id, paper, pages: body.pages })
    : buildStyleProfile({ supabase, userId: user.id, paper, pages: body.pages });
}

/**
 * Reference-led papers: the PDF becomes the paper's question bank.
 *
 * The bank's topics are written into settings.chapters because everything
 * downstream — the verifier's scope check, the dashboard, the review screen's
 * subtitle — is built around a chapter list, and a reference paper's sub-topic
 * headings are exactly that. The requested question count is lowered to what
 * the bank can actually supply, so a paper is never left permanently short
 * with a "generate the remaining 12" banner that can never be satisfied.
 */
async function buildBank(opts: {
  supabase: SupabaseServerClient;
  userId: string;
  paper: Paper;
  pages: ReferencePage[];
}) {
  const { supabase, userId, paper, pages } = opts;
  try {
    const { bank, usage, failedPages } = await extractReferenceBank({
      settings: paper.settings,
      pages,
      provider: await getAiProvider(),
    });

    const available = bank.items.length;
    const questionCount = Math.min(paper.settings.question_count, available);
    const settings = {
      ...paper.settings,
      chapters: bank.topics,
      question_count: questionCount,
    };

    const { error } = await supabase
      .from("papers")
      .update({
        settings,
        chapters: bank.topics,
        reference_bank: bank,
        reference_pdf_used: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paper.id);
    if (error) throw new Error("Could not save the questions read from your PDF.");

    await logUsage({ user_id: userId, action: "analyze_reference", usage });

    /*
     * Crops are cut client-side: pdfjs runs in the browser, the page images
     * the server was sent are downscaled for reading, and re-rendering the
     * page at print resolution is something only the tab holding the file can
     * do. The server hands back the boxes and takes the crops on the next call.
     */
    const crops = bank.items
      .filter((item) => item.figure?.bbox)
      .map((item) => ({ item_id: item.id, page: item.page, bbox: item.figure!.bbox! }));

    return NextResponse.json({
      ok: true,
      available,
      question_count: questionCount,
      topics: bank.topics,
      failed_pages: failedPages,
      crops,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await logUsage({
      user_id: userId,
      action: "analyze_reference",
      success: false,
      error_message: message,
    });
    return jsonError(
      `Reading the questions out of your reference PDF failed (${message}). You can retry from the paper page.`,
      502
    );
  }
}

/**
 * Syllabus papers with a reference attached: unchanged from before reference
 * mode existed — the PDF contributes a style profile and nothing else.
 */
async function buildStyleProfile(opts: {
  supabase: SupabaseServerClient;
  userId: string;
  paper: Paper;
  pages: ReferencePage[];
}) {
  const { supabase, userId, paper, pages } = opts;
  try {
    const { styleNotes, usage } = await analyzeReference({
      settings: paper.settings,
      pages,
      provider: await getAiProvider(),
    });
    await supabase
      .from("papers")
      .update({
        settings: { ...paper.settings, style_notes: styleNotes },
        reference_pdf_used: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paper.id);
    await logUsage({ user_id: userId, action: "analyze_reference", usage });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logUsage({
      user_id: userId,
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
