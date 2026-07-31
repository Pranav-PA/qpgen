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
export const MAX_LOGO_MB = 2;

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

// ---------------- Support / voluntary contributions ----------------
// QPGen is free and ungated; contributions go towards the domain and the AI
// bill. Env-overridable so changing the receiving account needs no code change.

export const UPI_VPA = process.env.NEXT_PUBLIC_UPI_VPA || "8147238214@upi";

export const DEFAULT_INSTRUCTIONS = `1. All questions are compulsory unless stated otherwise.
2. Use of calculators and electronic devices is not permitted.
3. Rough work must be done in the space provided in the answer booklet.
4. Marks for each question are indicated against it.
5. Read every question carefully before answering.`;
