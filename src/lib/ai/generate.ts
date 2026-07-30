import OpenAI from "openai";
import { GENERATION_MODEL, VERIFIER_MODEL, estimateCostUsd } from "@/lib/constants";
import type { Difficulty, PaperSettings, Question, QuestionType, ReferencePage } from "@/lib/types";
import {
  generationSystemPrompt,
  referenceAnalysisPrompt,
  verifierSystemPrompt,
} from "./prompts";

export interface Usage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface BatchSlot {
  type: QuestionType;
  difficulty: Difficulty;
}

interface RawQuestion {
  type: QuestionType;
  difficulty: Difficulty;
  chapter: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  solution: string;
}

export interface Verdict {
  index: number;
  ok: boolean;
  reason: string;
}

export const isMockAi = () => process.env.MOCK_AI === "true" || !process.env.OPENAI_API_KEY;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function usageFrom(model: string, u: { prompt_tokens?: number; completion_tokens?: number } | null | undefined): Usage {
  const input = u?.prompt_tokens ?? 0;
  const output = u?.completion_tokens ?? 0;
  return { model, input_tokens: input, output_tokens: output, cost_usd: estimateCostUsd(model, input, output) };
}

/* ------------------------------------------------------------------ */
/* JSON schemas for structured outputs                                 */

const questionsSchema = {
  name: "generated_questions",
  strict: true as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "difficulty", "chapter", "question_text", "options", "correct_answer", "solution"],
          properties: {
            type: { type: "string", enum: ["mcq", "numerical", "assertion_reason"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            chapter: { type: "string" },
            question_text: { type: "string" },
            options: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
            correct_answer: { type: "string" },
            solution: { type: "string" },
          },
        },
      },
    },
  },
};

const verdictsSchema = {
  name: "verification_verdicts",
  strict: true as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdicts"],
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "ok", "reason"],
          properties: {
            index: { type: "integer" },
            ok: { type: "boolean" },
            reason: { type: "string" },
          },
        },
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Generation                                                          */

export async function generateQuestions(opts: {
  settings: PaperSettings;
  slots: BatchSlot[];
  avoid: string[];
  styleNotes: string | null;
}): Promise<{ questions: RawQuestion[]; usage: Usage }> {
  if (isMockAi()) return mockGenerate(opts.settings, opts.slots);

  const { settings, slots, avoid, styleNotes } = opts;
  const composition = slots
    .map((s, i) => `${i + 1}. ${s.difficulty} ${s.type.replace("_", "-")}`)
    .join("\n");

  const userParts: string[] = [
    `Generate exactly ${slots.length} question(s) for this paper:`,
    `- Exam: ${settings.exam_type === "Custom" ? settings.exam_type_custom : settings.exam_type}`,
    `- Subject: ${settings.subject}`,
    `- Allowed chapters/topics (STRICT — use the exact chapter name in each question's "chapter" field): ${settings.chapters.join("; ")}`,
    `\nRequired composition (produce them in this order):\n${composition}`,
  ];
  if (styleNotes) {
    userParts.push(`\nStyle profile from the teacher's reference paper — imitate this style and difficulty, but never copy questions:\n${styleNotes}`);
  }
  if (avoid.length > 0) {
    userParts.push(
      `\nAvoid-list — do NOT duplicate or trivially rephrase any of these existing questions:\n${avoid
        .map((a, i) => `${i + 1}. ${a}`)
        .join("\n")}`
    );
  }

  const res = await client().chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: generationSystemPrompt(settings) },
      { role: "user", content: userParts.join("\n") },
    ],
    response_format: { type: "json_schema", json_schema: questionsSchema },
  });

  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("The AI returned an empty response.");
  const parsed = JSON.parse(content) as { questions: RawQuestion[] };
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("The AI returned no questions.");
  }
  return { questions: parsed.questions, usage: usageFrom(GENERATION_MODEL, res.usage) };
}

/* ------------------------------------------------------------------ */
/* Verification (second pass)                                          */

export async function verifyQuestions(opts: {
  settings: PaperSettings;
  questions: Pick<Question, "type" | "difficulty" | "chapter" | "question_text" | "options" | "correct_answer" | "solution">[];
}): Promise<{ verdicts: Verdict[]; usage: Usage }> {
  if (isMockAi()) {
    return {
      verdicts: opts.questions.map((_, i) => ({
        index: i,
        // In mock mode, flag one question so the review-flag UI is visible.
        ok: i !== 1,
        reason: i === 1 ? "Mock mode: sample flag to demonstrate the review workflow." : "",
      })),
      usage: { model: "mock", input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    };
  }

  const { settings, questions } = opts;
  const payload = questions.map((q, index) => {
    const idx =
      q.options && q.options.length > 0
        ? resolveCorrectIndex(q.correct_answer, q.options)
        : null;
    return {
      index,
      type: q.type,
      difficulty: q.difficulty,
      claimed_chapter: q.chapter,
      question_text: q.question_text,
      // Options are labelled so the verifier cannot mis-map the answer letter.
      options:
        q.options?.map((o, i) => `${LETTERS[i] ?? i + 1}) ${o}`) ?? null,
      stated_correct_answer: q.correct_answer,
      // Spelled out explicitly to remove any letter/text ambiguity.
      stated_correct_answer_text:
        idx !== null && idx >= 0 && q.options ? q.options[idx] : null,
      stated_solution: q.solution,
    };
  });

  const res = await client().chat.completions.create({
    model: VERIFIER_MODEL,
    messages: [
      { role: "system", content: verifierSystemPrompt(settings) },
      {
        role: "user",
        content: `Allowed chapters: ${settings.chapters.join("; ")}\n\nQuestions to review:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: verdictsSchema },
  });

  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Verifier returned an empty response.");
  const parsed = JSON.parse(content) as { verdicts: Verdict[] };
  return { verdicts: parsed.verdicts ?? [], usage: usageFrom(VERIFIER_MODEL, res.usage) };
}

/* ------------------------------------------------------------------ */
/* Reference PDF analysis (one vision call per paper)                  */

export async function analyzeReference(opts: {
  settings: PaperSettings;
  pages: ReferencePage[];
}): Promise<{ styleNotes: string; usage: Usage }> {
  if (isMockAi()) {
    return {
      styleNotes:
        "Mock style profile: concise single-line MCQ stems, moderate numerical complexity, NCERT-aligned phrasing.",
      usage: { model: "mock", input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    };
  }

  const res = await client().chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: referenceAnalysisPrompt(opts.settings) },
      {
        role: "user",
        content: [
          { type: "text" as const, text: `Reference pages (${opts.pages.length}):` },
          ...opts.pages.map((p) => ({
            type: "image_url" as const,
            image_url: { url: p.data_url, detail: "high" as const },
          })),
        ],
      },
    ],
  });

  const styleNotes = res.choices[0]?.message?.content?.trim();
  if (!styleNotes) throw new Error("Could not read the reference PDF pages.");
  return { styleNotes, usage: usageFrom(GENERATION_MODEL, res.usage) };
}

/* ------------------------------------------------------------------ */
/* MCQ option shuffling — models have a strong position bias, so we    */
/* re-shuffle server-side and remap the correct letter.                */

const LETTERS = ["A", "B", "C", "D"];

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Models sometimes return the option's full text (or "(B)", "B.") instead of a
 * bare letter. Resolve any of those to an index; null means we could not tell,
 * and the caller must flag the question for review rather than guess.
 */
export function resolveCorrectIndex(
  answer: string,
  options: string[]
): number | null {
  const trimmed = answer.trim();

  const letterMatch = trimmed.match(/^\(?([A-Da-d])[).:]?$/);
  if (letterMatch) return LETTERS.indexOf(letterMatch[1].toUpperCase());

  const exact = options.findIndex((o) => squash(o) === squash(trimmed));
  if (exact >= 0) return exact;

  // Last resort: the model prefixed the text with its letter, e.g. "B) $12$".
  const prefixed = trimmed.match(/^\(?([A-Da-d])[).:]\s+([\s\S]*)$/);
  if (prefixed) {
    const byText = options.findIndex((o) => squash(o) === squash(prefixed[2]));
    if (byText >= 0) return byText;
    return LETTERS.indexOf(prefixed[1].toUpperCase());
  }

  return null;
}

/**
 * True when an option-based question's answer is still not a clean A–D letter
 * after normalization — the teacher must pick the right option themselves.
 */
export function hasUnresolvedAnswer(q: {
  type: QuestionType;
  options?: string[] | null;
  correct_answer: string;
}): boolean {
  if (q.type === "numerical") return false;
  if (!q.options || q.options.length === 0) return true;
  return !LETTERS.includes(q.correct_answer.trim().toUpperCase());
}

export function shuffleMcqOptions(raw: RawQuestion): RawQuestion {
  if (raw.type === "numerical" || !raw.options || raw.options.length !== 4) return raw;
  const correctIdx = resolveCorrectIndex(raw.correct_answer, raw.options);
  if (correctIdx === null || correctIdx < 0) return raw;

  // Assertion–Reason options are a fixed, ordered set — never reorder them.
  if (raw.type === "assertion_reason") {
    return { ...raw, correct_answer: LETTERS[correctIdx] };
  }

  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...raw,
    options: order.map((o) => raw.options![o]),
    correct_answer: LETTERS[order.indexOf(correctIdx)],
  };
}

/* ------------------------------------------------------------------ */
/* Mock generation for local dev without an API key                    */

function mockGenerate(
  settings: PaperSettings,
  slots: BatchSlot[]
): { questions: RawQuestion[]; usage: Usage } {
  const chapter = settings.chapters[0] ?? "Sample Chapter";
  const questions: RawQuestion[] = slots.map((slot, i) => {
    if (slot.type === "numerical") {
      return {
        type: "numerical",
        difficulty: slot.difficulty,
        chapter,
        question_text: `[MOCK ${slot.difficulty}] A body starts from rest and accelerates uniformly at $a = 2\\,\\text{m/s}^2$ for $t = ${3 + i}\\,\\text{s}$. Find the final velocity in m/s. (Topic: ${chapter})`,
        options: null,
        correct_answer: String(2 * (3 + i)),
        solution: `Using $v = u + at$ with $u = 0$: $v = 2 \\times ${3 + i} = ${2 * (3 + i)}\\,\\text{m/s}$.`,
      };
    }
    if (slot.type === "assertion_reason") {
      return {
        type: "assertion_reason",
        difficulty: slot.difficulty,
        chapter,
        question_text: `[MOCK ${slot.difficulty}] Assertion (A): For uniform circular motion, the speed is constant but velocity is not.\nReason (R): Velocity is a vector; its direction changes continuously along the circular path. (Topic: ${chapter})`,
        options: [
          "Both A and R are true and R is the correct explanation of A",
          "Both A and R are true but R is NOT the correct explanation of A",
          "A is true but R is false",
          "A is false but R is true",
        ],
        correct_answer: "A",
        solution: "Speed (magnitude) stays constant while the direction of motion changes at every point, so velocity changes. R correctly explains A.",
      };
    }
    return {
      type: "mcq",
      difficulty: slot.difficulty,
      chapter,
      question_text: `[MOCK ${slot.difficulty} #${i + 1}] The kinetic energy of a body of mass $m$ moving with speed $v$ is given by which expression? (Topic: ${chapter})`,
      options: ["$\\frac{1}{2}mv^2$", "$mv^2$", "$\\frac{1}{2}mv$", "$2mv^2$"],
      correct_answer: "A",
      solution: `Kinetic energy is defined as $KE = \\frac{1}{2}mv^2$. The other options have incorrect powers or coefficients.`,
    };
  });
  return { questions, usage: { model: "mock", input_tokens: 0, output_tokens: 0, cost_usd: 0 } };
}
