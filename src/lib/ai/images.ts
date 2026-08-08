import { createAdminClient } from "@/lib/supabase/admin";
import type { RasterMode } from "@/lib/api";
import { IMAGE_MODEL_FOR_TIER, IMAGE_COST_USD } from "@/lib/constants";
import { isMockAi } from "./generate";
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

/**
 * The same style, minus the monochrome rule, for figures whose meaning IS the
 * colour.
 *
 * A resistor colour-code question redrawn under STYLE_SUFFIX came back as four
 * identical black bands: the diagram's entire content destroyed, and worse than
 * the crop it replaced. "No color" is right for a circuit and wrong for the one
 * topic where colour carries the physics.
 */
const STYLE_SUFFIX_COLOUR = [
  "Clean, minimal, textbook/exam-paper style line diagram on a pure flat white",
  "background: no shading, no photographic texture, no paper or page",
  "background, no scenery. Reproduce every colour of the original EXACTLY —",
  "the colours are what the question is about, so a band or region drawn in the",
  "wrong colour makes the question wrong. Use the standard symbol conventions",
  "for the subject. Draw only what is in the original — no extra arrows, no",
  "extra labels, no decoration.",
].join(" ");

/**
 * True when a figure's colours carry meaning and must survive a redraw.
 *
 * Deliberately blunt: any mention of colour at all in the question or in the
 * extractor's description of the figure. A false positive costs nothing — the
 * redraw simply keeps the original's colours, which is what a faithful copy
 * does anyway — while a false negative silently destroys the diagram.
 */
export function figureColourMatters(...text: (string | undefined)[]): boolean {
  return /colou?r/i.test(text.filter(Boolean).join(" "));
}

interface GeminiImagePart {
  inlineData?: { mimeType?: string; data?: string };
}

type GeminiRequestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * The actual Gemini call, shared by text-to-image (generateQuestionImage) and
 * image-editing (editQuestionImage) — everything about the request is
 * identical except which parts go in; only the caller knows whether that's a
 * text prompt alone or an existing image plus an edit instruction.
 */
async function callGeminiImageModel(
  model: string,
  key: string,
  parts: GeminiRequestPart[]
): Promise<{ bytes: Buffer; mimeType: string; usage: Usage }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
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
  // MOCK_AI mode mocks question TEXT (generateQuestions short-circuits before
  // ever calling here) but this is a separate code path with its own real API
  // call — without this check, a mock-mode run that asks for diagrams would
  // silently spend real Gemini image credits on every one of them.
  if (isMockAi()) return mockQuestionImage();
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const model = IMAGE_MODEL_FOR_TIER[opts.raster];
  const prompt = `${opts.spec}\n\n${STYLE_SUFFIX}`;
  return callGeminiImageModel(model, key, [{ text: prompt }]);
}

/**
 * Edits an EXISTING diagram in place from a teacher's own words — "remove the
 * value labels from this circuit" — rather than redrawing from a freshly
 * written description. Gemini's image models accept an input image alongside
 * a text instruction in the same request shape as text-to-image, just with an
 * extra inlineData part; this is what makes a targeted fix preserve the parts
 * of the diagram that were already right, which a fresh re-render from a
 * rewritten spec would not reliably do.
 *
 * Returns null when raster is off or no key is configured, matching
 * generateQuestionImage; throws on a real request or fetch failure so the
 * caller can flag the question rather than silently keep the old image.
 */
export async function editQuestionImage(opts: {
  imageUrl: string;
  instruction: string;
  raster: RasterMode;
}): Promise<{ bytes: Buffer; mimeType: string; usage: Usage } | null> {
  if (opts.raster === "off") return null;
  if (isMockAi()) return mockQuestionImage();
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const sourceRes = await fetch(opts.imageUrl);
  if (!sourceRes.ok) {
    throw new Error(`Could not fetch the existing diagram to edit it (HTTP ${sourceRes.status}).`);
  }
  const sourceBytes = Buffer.from(await sourceRes.arrayBuffer());
  const sourceMime = sourceRes.headers.get("content-type") || "image/png";

  const model = IMAGE_MODEL_FOR_TIER[opts.raster];
  const prompt = [
    "Edit this diagram according to the following instruction from the",
    "question's author. Make ONLY the change requested — leave everything else",
    "in the diagram exactly as it is: same layout, same labels, same style.",
    "",
    opts.instruction,
    "",
    STYLE_SUFFIX,
  ].join("\n");

  return callGeminiImageModel(model, key, [
    { inlineData: { mimeType: sourceMime, data: sourceBytes.toString("base64") } },
    { text: prompt },
  ]);
}

/**
 * Redraws a figure cropped out of the teacher's reference PDF as a clean exam
 * diagram, using the crop itself as the thing to copy.
 *
 * This is the safe form of "let the AI draw it". generateQuestionImage works
 * from a written description, so whether the circuit comes out wired correctly
 * depends entirely on the prose — and nothing downstream can read a diagram to
 * check. Here the model is shown the real figure and asked to reproduce it, so
 * the components, values and topology are copied rather than inferred. It also
 * fixes what a crop cannot: scan noise, a clipped edge, and any stray line of
 * surrounding text the bounding box caught.
 *
 * Still bills per image, and still forces needs_review — a copy can be a bad
 * copy, and only the teacher can see that.
 */
export async function redrawFigureFromSource(opts: {
  imageUrl: string;
  raster: RasterMode;
  /** Keep the original's colours — see figureColourMatters. */
  preserveColour?: boolean;
}): Promise<{ bytes: Buffer; mimeType: string; usage: Usage } | null> {
  if (opts.raster === "off") return null;
  if (isMockAi()) return mockQuestionImage();
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const sourceRes = await fetch(opts.imageUrl);
  if (!sourceRes.ok) {
    throw new Error(
      `Could not fetch the cropped reference figure to redraw it (HTTP ${sourceRes.status}).`
    );
  }
  const sourceBytes = Buffer.from(await sourceRes.arrayBuffer());
  const sourceMime = sourceRes.headers.get("content-type") || "image/jpeg";

  const model = IMAGE_MODEL_FOR_TIER[opts.raster];
  const prompt = [
    "This image was cut out of a printed exam paper. Redraw the DIAGRAM it",
    "contains as a clean figure for a new question paper.",
    "",
    "Copy it exactly. Every component, every value, every label and every",
    "connection must match the original — same circuit topology, same",
    "quantities, same letters marking the same points. You are reproducing this",
    "diagram, not designing one: do not add a component, do not remove one, do",
    "not relabel anything, and do not 'correct' anything that looks unusual.",
    "",
    "Leave out everything that is not the diagram: any sentence of question",
    "text, any (a)/(b)/(c)/(d) answer options, any question number, page",
    "header or year tag that the crop happened to include. Keep captions that",
    "belong to the drawing itself, such as 'Circuit 1'.",
    "",
    opts.preserveColour ? STYLE_SUFFIX_COLOUR : STYLE_SUFFIX,
  ].join("\n");

  return callGeminiImageModel(model, key, [
    { inlineData: { mimeType: sourceMime, data: sourceBytes.toString("base64") } },
    { text: prompt },
  ]);
}

/**
 * A valid 1x1 transparent PNG — the whole point is that it is real, decodable
 * image bytes so the upload/render/export pipeline runs unchanged in mock
 * mode, not a special case. Content doesn't matter here: MOCK_AI is about
 * exercising the plumbing (budget cap, captions, edit/regenerate) for free,
 * not about producing a diagram anyone would look at. A real Gemini image is
 * still needed for an actual visual check.
 */
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function mockQuestionImage(): { bytes: Buffer; mimeType: string; usage: Usage } {
  return {
    bytes: Buffer.from(MOCK_PNG_BASE64, "base64"),
    mimeType: "image/png",
    usage: { model: "mock", input_tokens: 0, output_tokens: 0, cost_usd: 0 },
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
