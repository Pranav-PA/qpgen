import { Packer } from "docx";
import { getApiUser, jsonError, logUsage } from "@/lib/api";
import { buildAnswerKeyDocx, buildQuestionPaperDocx } from "@/lib/docx/build";
import type { Paper } from "@/lib/types";

export const maxDuration = 60;

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
    const document =
      doc === "paper"
        ? await buildQuestionPaperDocx(paper)
        : await buildAnswerKeyDocx(paper);
    const buffer = await Packer.toBuffer(document);
    await logUsage({ user_id: user.id, action: "export" });

    const suffix = doc === "paper" ? "Question Paper" : "ANSWER KEY";
    const filename = `${safeFilename(paper.title)} - ${suffix}.docx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return jsonError("Building the Word file failed. Please retry.", 500);
  }
}
