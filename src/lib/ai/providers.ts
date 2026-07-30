import OpenAI from "openai";
import {
  GEMINI_GENERATION_MODEL,
  GEMINI_VERIFIER_MODEL,
  GENERATION_MODEL,
  VERIFIER_MODEL,
  estimateCostUsd,
} from "@/lib/constants";

export type ProviderName = "google" | "openai";
export type Purpose = "generate" | "verify";

export interface Usage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface AiRequest {
  system: string;
  user: string;
  /** data: URLs; enables the vision path. */
  images?: string[];
  /** OpenAI-flavoured JSON Schema; converted for Gemini automatically. */
  schema?: { name: string; schema: Record<string, unknown> };
  purpose: Purpose;
}

export interface AiResult {
  text: string;
  usage: Usage;
}

export function modelFor(provider: ProviderName, purpose: Purpose): string {
  if (provider === "google") {
    return purpose === "generate" ? GEMINI_GENERATION_MODEL : GEMINI_VERIFIER_MODEL;
  }
  return purpose === "generate" ? GENERATION_MODEL : VERIFIER_MODEL;
}

function usage(model: string, input: number, output: number): Usage {
  return {
    model,
    input_tokens: input,
    output_tokens: output,
    cost_usd: estimateCostUsd(model, input, output),
  };
}

/* ------------------------------------------------------------------ */
/* OpenAI                                                              */

let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function runOpenAi(req: AiRequest): Promise<AiResult> {
  const model = modelFor("openai", req.purpose);
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: req.user },
    ...(req.images ?? []).map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const res = await openaiClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.images?.length ? content : req.user },
    ],
    ...(req.schema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema },
          },
        }
      : {}),
  });

  const text = res.choices[0]?.message?.content ?? "";
  return {
    text,
    usage: usage(model, res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Google Gemini (REST — avoids pinning another SDK version)           */

const TYPE_MAP: Record<string, string> = {
  object: "OBJECT",
  array: "ARRAY",
  string: "STRING",
  integer: "INTEGER",
  number: "NUMBER",
  boolean: "BOOLEAN",
};

/**
 * Gemini's responseSchema is a restricted OpenAPI dialect: uppercase type
 * names, no additionalProperties/strict, and nullability expressed with a
 * `nullable` flag rather than an anyOf-with-null union.
 */
export function toGeminiSchema(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== "object") return {};
  const s = node as Record<string, unknown>;

  // anyOf: [X, {type: "null"}]  ->  X with nullable: true
  if (Array.isArray(s.anyOf)) {
    const variants = s.anyOf as Record<string, unknown>[];
    const nonNull = variants.filter((v) => v?.type !== "null");
    const nullable = nonNull.length !== variants.length;
    const base = toGeminiSchema(nonNull[0] ?? {});
    return nullable ? { ...base, nullable: true } : base;
  }

  const out: Record<string, unknown> = {};
  const rawType = typeof s.type === "string" ? s.type : undefined;
  if (rawType) out.type = TYPE_MAP[rawType] ?? rawType.toUpperCase();
  if (typeof s.description === "string") out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;

  if (s.properties && typeof s.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      props[k] = toGeminiSchema(v);
    }
    out.properties = props;
    // Ordering keeps generated fields in a stable, readable order.
    out.propertyOrdering = Object.keys(props);
  }
  if (Array.isArray(s.required)) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);

  return out;
}

function dataUrlToInline(url: string): { mimeType: string; data: string } | null {
  const m = url.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

async function runGemini(req: AiRequest): Promise<AiResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not configured.");
  const model = modelFor("google", req.purpose);

  const parts: Record<string, unknown>[] = [{ text: req.user }];
  for (const url of req.images ?? []) {
    const inline = dataUrlToInline(url);
    if (inline) parts.push({ inlineData: inline });
  }

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: req.schema
      ? {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(req.schema.schema),
        }
      : {},
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    }
  );

  const json = (await res.json()) as {
    error?: { message?: string; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (json.error) {
    throw new Error(`Gemini ${json.error.status ?? res.status}: ${json.error.message ?? "request failed"}`);
  }
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error(
      `Gemini returned no content${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`
    );
  }

  return {
    text,
    usage: usage(
      model,
      json.usageMetadata?.promptTokenCount ?? 0,
      json.usageMetadata?.candidatesTokenCount ?? 0
    ),
  };
}

/* ------------------------------------------------------------------ */

export async function runAi(provider: ProviderName, req: AiRequest): Promise<AiResult> {
  return provider === "google" ? runGemini(req) : runOpenAi(req);
}
