// Central limits and model configuration. Model IDs are env-overridable because
// OpenAI renames/retires models; defaults reflect the GPT-5.6 lineup (July 2026).

export const MAX_QUESTIONS_PER_PAPER = 50;
/** Blueprint papers print every question including choice extras (45+ is normal). */
export const MAX_QUESTIONS_BLUEPRINT = 80;
export const MIN_QUESTIONS_PER_PAPER = 1;
export const MAX_BLUEPRINT_SECTIONS = 8;
export const MAX_BLUEPRINT_PAGES = 4;
export const GENERATION_BATCH_SIZE = 6;
export const MAX_REFERENCE_PDF_PAGES = 10;
export const MAX_REFERENCE_PDF_MB = 20;

/**
 * Reference-led generation (settings.source_mode === "reference").
 *
 * Extraction runs one vision call per page rather than one call over all of
 * them: a single request returning a hundred-plus questions is both a very
 * large output and markedly less reliable, and per-page calls parallelise.
 * Concurrency is bounded so a 10-page bank cannot fire ten simultaneous
 * requests at the provider's rate limit.
 */
export const REFERENCE_EXTRACTION_CONCURRENCY = 4;
/** Per page. A dense two-column question bank prints ~18; beyond that it is OCR noise. */
export const MAX_REFERENCE_ITEMS_PER_PAGE = 25;
/**
 * Crops taken out of the source PDF are free and exact, so they are preferred
 * over redrawing a figure — but a crop still has to be worth printing. A box
 * smaller than this fraction of the page is a stray glyph, not a diagram.
 */
export const MIN_FIGURE_CROP_AREA = 0.004;
/** A crop covering most of the page is a failed localisation, not a figure. */
export const MAX_FIGURE_CROP_AREA = 0.6;
/** Fraction of non-white pixels below which a crop is treated as blank. */
export const MIN_FIGURE_CROP_INK = 0.005;
export const MAX_LOGO_MB = 2;
/** Each image is a real per-image bill (see lib/ai/images.ts), not a token cost — bounded so a paper's image spend has a hard ceiling. */
export const MAX_FIGURE_QUESTIONS = 10;

export const DEFAULT_DAILY_GENERATION_CAP = 10;
export const GLOBAL_DAILY_GENERATION_CAP = 500;

export const GENERATION_MODEL =
  process.env.OPENAI_GENERATION_MODEL || "gpt-5.6-terra";
export const VERIFIER_MODEL =
  process.env.OPENAI_VERIFIER_MODEL || "gpt-5.6-luna";

export const GEMINI_GENERATION_MODEL =
  process.env.GEMINI_GENERATION_MODEL || "gemini-3.6-flash";
export const GEMINI_VERIFIER_MODEL =
  process.env.GEMINI_VERIFIER_MODEL || "gemini-3.5-flash-lite";

/** Provider used when the admin panel has not set one. */
export const DEFAULT_AI_PROVIDER =
  process.env.AI_PROVIDER === "openai" ? "openai" : "google";

// USD per 1M tokens, for cost logging. Override via env if pricing changes.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash": { input: 1.0, output: 5.0 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro-preview": { input: 2.0, output: 12 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/**
 * Question-diagram image models, one per admin quality tier. Chosen on
 * 2026-08-01 by generating the same circuit on all three Gemini image models
 * and comparing output: gemini-3-pro-image rendered onto what looked like a
 * scanned textbook page and drew both the resistor and battery as plain
 * rectangles, so despite costing 2x more and carrying the "Pro" name it is not
 * used at all. gemini-3.1-flash-image drew a correct, clean circuit and is
 * "high"; gemini-2.5-flash-image is usable but added unrequested
 * current-direction arrows, and is the cheap "low" tier.
 *
 * These bill per output image, not per token, so they are separate from
 * MODEL_PRICING/estimateCostUsd above. Source: ai.google.dev/gemini-api/docs
 * /pricing, standard (non-batch) tier — re-verify before trusting the admin
 * cost display or the wizard's per-paper estimate if it looks stale.
 */
export const IMAGE_MODEL_FOR_TIER: Record<"high" | "low", string> = {
  high: "gemini-3.1-flash-image",
  low: "gemini-2.5-flash-image",
};
export const IMAGE_COST_USD: Record<string, number> = {
  "gemini-3.1-flash-image": 0.067,
  "gemini-2.5-flash-image": 0.039,
};

// ---------------- Support / voluntary contributions ----------------
// QPGen is free and ungated; contributions go towards the domain and the AI
// bill. Env-overridable so changing the receiving account needs no code change.

export const UPI_VPA = process.env.NEXT_PUBLIC_UPI_VPA || "8147238214@upi";

export const DEFAULT_INSTRUCTIONS = `1. All questions are compulsory unless stated otherwise.
2. Use of calculators and electronic devices is not permitted.
3. Rough work must be done in the space provided in the answer booklet.
4. Marks for each question are indicated against it.
5. Read every question carefully before answering.`;
