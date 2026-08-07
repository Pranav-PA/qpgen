import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError } from "@/lib/api";
import { referenceCropsSchema } from "@/lib/schemas";
import { uploadQuestionImage } from "@/lib/ai/images";
import type { Paper, ReferenceBank } from "@/lib/types";

export const maxDuration = 120;

const bodySchema = z.object({ crops: referenceCropsSchema });

/**
 * Stores the figures cut out of the teacher's reference PDF.
 *
 * The crop itself happens in the browser (see cropReferenceFigures in
 * lib/pdf.ts) — pdfjs is client-only and the page images the extractor was
 * sent are downscaled for reading, so the tab holding the file is the only
 * place a print-resolution crop can be taken. This route is the other half:
 * it uploads the bytes and records the URL against the bank item, after which
 * the figure is just another image_url like a generated one.
 *
 * Nothing here is required for a paper to generate. An item whose crop never
 * arrives keeps its written description and falls back to the image model,
 * which is why a partial failure returns ok with a count rather than an error.
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
    return jsonError("Invalid figure crops.", 400);
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("id, reference_bank")
    .eq("id", id)
    .single<Pick<Paper, "id" | "reference_bank">>();
  if (!paper) return jsonError("Paper not found.", 404);

  const bank = paper.reference_bank;
  if (!bank) return jsonError("This paper has no reference document.", 400);

  const wanted = new Set(
    bank.items.filter((item) => item.figure?.bbox).map((item) => item.id)
  );

  const urls = new Map<string, string>();
  for (const crop of body.crops) {
    // Only items the extractor actually asked to crop — a client sending an
    // arbitrary id would otherwise write an image into the bank.
    if (!wanted.has(crop.item_id)) continue;
    const decoded = decodeDataUrl(crop.data_url);
    if (!decoded) continue;

    const url = await uploadQuestionImage({
      userId: user.id,
      paperId: id,
      // Keyed by bank item, not by question: the crop is a property of the
      // source question and is claimed later by whichever slot draws from it.
      questionId: `ref-${crop.item_id}`,
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
    });
    if (url) urls.set(crop.item_id, url);
  }

  const next: ReferenceBank = {
    ...bank,
    items: bank.items.map((item) => {
      if (!item.figure) return item;
      // The box has done its job either way: it is dropped so nothing
      // downstream believes a crop is still coming. Where none came back, the
      // written description is left to carry the figure via a redraw.
      const figure = { ...item.figure };
      delete figure.bbox;
      const url = urls.get(item.id);
      if (url) figure.image_url = url;
      return { ...item, figure };
    }),
  };

  const { error } = await supabase
    .from("papers")
    .update({ reference_bank: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return jsonError("Could not save the figures from your PDF.", 500);

  return NextResponse.json({ ok: true, stored: urls.size, requested: wanted.size });
}

function decodeDataUrl(url: string): { bytes: Buffer; mimeType: string } | null {
  const m = url.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!m) return null;
  try {
    return { bytes: Buffer.from(m[2], "base64"), mimeType: m[1] };
  } catch {
    return null;
  }
}
