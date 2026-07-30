// Central limits and model configuration. Model IDs are env-overridable because
// OpenAI renames/retires models; defaults reflect the GPT-5.6 lineup (July 2026).

export const MAX_QUESTIONS_PER_PAPER = 50;
export const MIN_QUESTIONS_PER_PAPER = 1;
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

// USD per 1M tokens, for cost logging. Override via env if pricing changes.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
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

export const DEFAULT_INSTRUCTIONS = `1. All questions are compulsory unless stated otherwise.
2. Use of calculators and electronic devices is not permitted.
3. Rough work must be done in the space provided in the answer booklet.
4. Marks for each question are indicated against it.
5. Read every question carefully before answering.`;
