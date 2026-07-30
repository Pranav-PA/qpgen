import { getApiUser, jsonError, logUsage } from "@/lib/api";
import { answerKeyHtml, questionPaperHtml } from "@/lib/pdf/html";
import { htmlToPdf } from "@/lib/pdf/render";
import type { Paper } from "@/lib/types";

export const maxDuration = 120;
// Chromium needs the real Node runtime, and the KaTeX assets on disk.
export const runtime = "nodejs";

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 80) || "paper";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const doc = new URL(request.url).searchParams.get("doc");
  if (doc !== "paper" && doc !== "key") {
    return jsonError("Unknown export type.", 400);
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single<Paper>();
  if (!paper) return jsonError("Paper not found.", 404);
  if (!paper.questions || paper.questions.length === 0) {
    return jsonError("This paper has no questions to export yet.", 400);
  }

  try {
    const html =
      doc === "paper"
        ? await questionPaperHtml(paper)
        : await answerKeyHtml(paper);
    const pdf = await htmlToPdf(html);
    await logUsage({ user_id: user.id, action: "export" });

    const suffix = doc === "paper" ? "Question Paper" : "ANSWER KEY";
    const filename = `${safeFilename(paper.title)} - ${suffix}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF rendering failed.";
    await logUsage({
      user_id: user.id,
      action: "export",
      success: false,
      error_message: message,
    });
    return jsonError(
      `Building the PDF failed (${message}). You can still use the Print view or the Word export.`,
      500
    );
  }
}
