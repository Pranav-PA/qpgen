import { createAdminClient } from "@/lib/supabase/admin";
import type { RasterMode } from "@/lib/api";
import { IMAGE_MODEL_FOR_TIER, IMAGE_COST_USD } from "@/lib/constants";
import type { Usage } from "./providers";

/**
 * Question diagram rendering — Gemini image models only, regardless of which
 * provider (Google or OpenAI) is doing the text generation. Deliberate: the
 * question and its figure spec are authored together by the text model, and
 * keeping the render on the same vendor avoids a second integration surface
 * for what is already a narrow, well-tested path.
 *
 * responseSchema (strict JSON, used for question generation) and
 * responseModalities: ["TEXT","IMAGE"] are mutually exclusive in a single
 * Gemini call, so this is always a second request — never folded into the
 * question-generation call itself.
 */

const STYLE_SUFFIX = [
  "Black and white line diagram only: no shading, no color, no photographic",
  "texture, no paper or page background, no scenery — pure flat white",
  "background. Clean, minimal, textbook/exam-paper style. Use the standard",
  "symbol conventions for the subject (e.g. a zigzag for a resistor, long and",
  "short parallel lines for a battery cell). Draw only what is explicitly",
  "described below — no extra arrows, no extra labels, no decoration.",
].join(" ");

interface GeminiImagePart {
  inlineData?: { mimeType?: string; data?: string };
}

/**
 * Renders one figure from a spec written by the text-generation pass.
 * Returns null (never throws) when raster is switched off or no key is
 * configured, so a caller can always fall back to "no image" cleanly. Real
 * request failures do throw, so the caller can flag the question for review
 * rather than silently ship it without its diagram.
 */
export async function generateQuestionImage(opts: {
  spec: string;
  raster: RasterMode;
}): Promise<{ bytes: Buffer; mimeType: string; usage: Usage } | null> {
  if (opts.raster === "off") return null;
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const model = IMAGE_MODEL_FOR_TIER[opts.raster];
  const prompt = `${opts.spec}\n\n${STYLE_SUFFIX}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  );

  const json = (await res.json()) as {
    error?: { message?: string; status?: string };
    candidates?: { content?: { parts?: GeminiImagePart[] }; finishReason?: string }[];
  };
  if (json.error) {
    throw new Error(
      `Gemini image ${json.error.status ?? res.status}: ${json.error.message ?? "request failed"}`
    );
  }

  const candidate = json.candidates?.[0];
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error(
      `Gemini returned no image${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`
    );
  }

  return {
    bytes: Buffer.from(part.inlineData.data, "base64"),
    mimeType: part.inlineData.mimeType || "image/png",
    usage: {
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: IMAGE_COST_USD[model] ?? 0,
    },
  };
}

/**
 * Uploads to the public question-images bucket and returns the full public
 * URL (not a bare path). A URL is ~100 bytes in the papers.questions JSONB;
 * the whole point of storing it rather than the image bytes is to keep that
 * column cheap to read, so there is no size reason to prefer a bare path, and
 * a full URL means renderers never need a second call to resolve one.
 */
export async function uploadQuestionImage(opts: {
  userId: string;
  paperId: string;
  questionId: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const ext = opts.mimeType.includes("png") ? "png" : "jpg";
  const path = `${opts.userId}/${opts.paperId}/${opts.questionId}.${ext}`;

  const { error } = await admin.storage
    .from("question-images")
    .upload(path, opts.bytes, { contentType: opts.mimeType, upsert: true });
  if (error) return null;

  const { data } = admin.storage.from("question-images").getPublicUrl(path);
  return data.publicUrl;
}
