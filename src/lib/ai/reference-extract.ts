import {
  MAX_FIGURE_CROP_AREA,
  MAX_REFERENCE_ITEMS_PER_PAGE,
  MIN_FIGURE_CROP_AREA,
  REFERENCE_EXTRACTION_CONCURRENCY,
} from "@/lib/constants";
import type {
  Difficulty,
  PaperSettings,
  QuestionType,
  ReferenceBank,
  ReferenceItem,
  ReferencePage,
} from "@/lib/types";
import { REFERENCE_EXTRACTION_PROMPT } from "./prompts";
import { isMockAi, parseAiJson, stripOptionLabels } from "./generate";
import { runAi, type ProviderName, type Usage } from "./providers";

/**
 * Reads a teacher's reference PDF into a durable bank of questions.
 *
 * This is what makes "generate only from this PDF" mean anything. The older
 * analyzeReference path distils the same pages into a ≤300-word style profile
 * and throws the images away, which is fine for "write in this style" and
 * useless for "ask these questions".
 */

const pageSchema = {
  name: "reference_page_questions",
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
          required: [
            "ref_label",
            "topic",
            "archetype",
            "type",
            "difficulty",
            "question_text",
            "options",
            "correct_answer",
            "has_figure",
            "figure_bbox",
            "figure_description",
          ],
          properties: {
            ref_label: { type: "string" },
            topic: { type: "string" },
            archetype: { type: "string" },
            type: {
              type: "string",
              enum: [
                "mcq",
                "numerical",
                "assertion_reason",
                "one_word",
                "short_answer",
                "long_answer",
              ],
            },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            question_text: { type: "string" },
            options: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            correct_answer: { type: "string" },
            has_figure: { type: "boolean" },
            /** [ymin, xmin, ymax, xmax] on a 0–1000 scale — Gemini's own box convention. */
            figure_bbox: { type: "array", items: { type: "integer" } },
            figure_description: { type: "string" },
          },
        },
      },
    },
  },
};

interface RawItem {
  ref_label: string;
  topic: string;
  archetype: string;
  type: QuestionType;
  difficulty: Difficulty;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  has_figure: boolean;
  figure_bbox: number[];
  figure_description: string;
}

/**
 * Turns the model's [ymin, xmin, ymax, xmax] 0–1000 box into a normalised
 * crop rectangle, or null if it is not worth cropping.
 *
 * Rejecting here rather than downstream matters: a rejected box falls back to
 * redrawing the figure with the image model, which costs real money per image
 * and can draw a circuit wrong. A box that is inverted, degenerate, a stray
 * glyph, or most of the page is a failed localisation, and cropping it would
 * print a fragment of question text where a diagram should be.
 */
export function normaliseBbox(
  raw: number[] | undefined
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  if (raw.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;

  const [ymin, xmin, ymax, xmax] = raw;
  // Tolerate a model that returns the corners the other way round.
  const y0 = Math.min(ymin, ymax) / 1000;
  const y1 = Math.max(ymin, ymax) / 1000;
  const x0 = Math.min(xmin, xmax) / 1000;
  const x1 = Math.max(xmin, xmax) / 1000;
  if ([x0, y0, x1, y1].some((v) => v < 0 || v > 1)) return null;

  const area = (x1 - x0) * (y1 - y0);
  if (area < MIN_FIGURE_CROP_AREA || area > MAX_FIGURE_CROP_AREA) return null;
  return { x0, y0, x1, y1 };
}

/** Collapses an archetype to a comparison key — see referencePlan for why. */
export function archetypeKey(archetype: string): string {
  return archetype
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function normaliseItem(raw: RawItem, page: number, index: number): ReferenceItem | null {
  const question_text = cleanText(raw.question_text ?? "", 4000);
  // A stem this short is OCR debris — a stray number, a running header — not a
  // question, and it would poison both the variety grouping and generation.
  if (question_text.length < 15) return null;

  const topic = cleanText(raw.topic ?? "", 200) || "Reference paper";
  const archetype = cleanText(raw.archetype ?? "", 200) || question_text.slice(0, 60);
  const options = stripOptionLabels(
    raw.options && raw.options.length > 0
      ? raw.options.map((o) => cleanText(o, 1000)).filter(Boolean)
      : null
  );

  const bbox = raw.has_figure ? normaliseBbox(raw.figure_bbox) : null;
  const spec = raw.has_figure ? cleanText(raw.figure_description ?? "", 2000) : "";
  // A question that says "the circuit shown" with neither a box to crop nor a
  // description to redraw from is unanswerable on the new paper. Keep it out of
  // the bank entirely rather than let the selector print it figure-less.
  if (raw.has_figure && !bbox && !spec) return null;

  return {
    id: `p${page}-${index}`,
    ref_label: cleanText(raw.ref_label ?? "", 20) || undefined,
    page,
    topic,
    archetype,
    type: raw.type,
    difficulty: raw.difficulty,
    question_text,
    options: options && options.length > 0 ? options : undefined,
    correct_answer: cleanText(raw.correct_answer ?? "", 200) || undefined,
    figure: raw.has_figure
      ? { ...(bbox ? { bbox } : {}), ...(spec ? { spec } : {}) }
      : undefined,
  };
}

async function extractPage(opts: {
  page: ReferencePage;
  index: number;
  settings: PaperSettings;
  provider: ProviderName;
}): Promise<{ items: ReferenceItem[]; usage: Usage }> {
  const { page, index, settings, provider } = opts;
  const res = await runAi(provider, {
    purpose: "generate",
    system: REFERENCE_EXTRACTION_PROMPT,
    user: [
      `Subject: ${settings.subject}.`,
      `This is page ${index} of the teacher's reference document.`,
      "Transcribe every question printed on it.",
    ].join("\n"),
    images: [page.data_url],
    schema: { name: pageSchema.name, schema: pageSchema.schema },
  });

  const parsed = parseAiJson<{ questions: RawItem[] }>(res.text);
  const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const items = raw
    .slice(0, MAX_REFERENCE_ITEMS_PER_PAGE)
    .map((r, i) => normaliseItem(r, index, i))
    .filter((x): x is ReferenceItem => x !== null);
  return { items, usage: res.usage };
}

/** Runs `worker` over the list with at most `limit` in flight at once. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Extracts every page of a reference PDF into one bank.
 *
 * A page that fails is skipped rather than failing the whole extraction: ten
 * pages is ten chances for one transient provider error, and nine pages of
 * questions is a usable paper while zero is not. The caller reports how many
 * questions were found so the teacher can judge for themselves.
 */
export async function extractReferenceBank(opts: {
  settings: PaperSettings;
  pages: ReferencePage[];
  provider: ProviderName;
}): Promise<{ bank: ReferenceBank; usage: Usage; failedPages: number[] }> {
  if (isMockAi()) return mockBank(opts.pages);

  const failedPages: number[] = [];
  const results = await mapLimit(
    opts.pages,
    REFERENCE_EXTRACTION_CONCURRENCY,
    async (page, i) => {
      try {
        return await extractPage({
          page,
          index: i + 1,
          settings: opts.settings,
          provider: opts.provider,
        });
      } catch {
        failedPages.push(i + 1);
        return null;
      }
    }
  );

  const items: ReferenceItem[] = [];
  const usage: Usage = {
    model: `reference-extract:${opts.provider}`,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  };
  for (const r of results) {
    if (!r) continue;
    items.push(...r.items);
    usage.input_tokens += r.usage.input_tokens;
    usage.output_tokens += r.usage.output_tokens;
    usage.cost_usd += r.usage.cost_usd;
    // Every page uses the same model; keep its real name for the usage log.
    usage.model = r.usage.model;
  }

  if (items.length === 0) {
    throw new Error(
      "No questions could be read from that PDF. It may be a scan of poor quality, or contain no questions."
    );
  }

  const merged = canonicaliseTopics(items);
  return {
    bank: {
      items: merged,
      topics: distinctTopics(merged),
      pages_read: opts.pages.length - failedPages.length,
      extracted_at: new Date().toISOString(),
    },
    usage,
    failedPages,
  };
}

/**
 * Settles on one name per sub-topic across the whole document.
 *
 * Pages are read independently, and a sub-topic heading in a question bank is
 * printed once and then governs the questions that follow — often onto later
 * pages, where the model has to infer the topic from the questions themselves.
 * It infers well, but not identically: the same real sub-topic comes back as
 * "Combination of Resistors — Series and Parallel" on one page and
 * "Combination of Resistors" on the next.
 *
 * Left alone that splits one topic into two, which fragments the topic
 * round-robin the variety rule depends on and prints two near-identical
 * chapter names on the paper. Merging on containment is deliberately
 * conservative: it only collapses names where one is literally a longer form
 * of the other, never two topics that merely look related.
 */
export function canonicaliseTopics(items: ReferenceItem[]): ReferenceItem[] {
  const normalise = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  /** First-seen spelling for each normalised key, in printed order. */
  const canonical = new Map<string, string>();

  for (const item of items) {
    const key = normalise(item.topic);
    if (!key || canonical.has(key)) continue;
    const absorbing = [...canonical.keys()].find(
      (seen) => seen.startsWith(key) || key.startsWith(seen)
    );
    // Map the longer spelling onto the one already in use rather than the
    // other way round: the first spelling seen is the one printed earliest.
    canonical.set(key, absorbing ? canonical.get(absorbing)! : item.topic);
  }

  return items.map((item) => {
    const name = canonical.get(normalise(item.topic));
    return name && name !== item.topic ? { ...item, topic: name } : item;
  });
}

/**
 * Topics in printed order, capped at what paperSettingsSchema allows for
 * chapters — the bank's topics are mirrored into settings.chapters so the
 * verifier, dashboard and review screen keep working unchanged.
 */
export function distinctTopics(items: ReferenceItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item.topic);
    if (out.length >= 40) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */

/**
 * Mock bank for MOCK_AI runs. Deliberately prints the same archetype three
 * times over — that is exactly what a real chapterwise question bank does, and
 * it is the case the variety rule exists to handle, so a local run should
 * exercise it rather than the easy path.
 */
function mockBank(pages: ReferencePage[]): {
  bank: ReferenceBank;
  usage: Usage;
  failedPages: number[];
} {
  const specs: { topic: string; archetype: string; figure: boolean }[] = [
    { topic: "Ohm's Law", archetype: "resistance of a wire stretched to n times its length", figure: false },
    { topic: "Ohm's Law", archetype: "resistance of a wire stretched to n times its length", figure: false },
    { topic: "Ohm's Law", archetype: "resistance of a wire stretched to n times its length", figure: false },
    { topic: "Electrical Energy, Power", archetype: "power drawn by identical bulbs rewired series to parallel", figure: false },
    { topic: "Electrical Energy, Power", archetype: "power drawn by identical bulbs rewired series to parallel", figure: false },
    { topic: "Combination of Resistors", archetype: "equivalent resistance between two points of a network", figure: true },
    { topic: "Combination of Resistors", archetype: "current through one branch of a two-loop circuit", figure: true },
    { topic: "Cells, EMF, Internal Resistance", archetype: "internal resistance from two load currents", figure: false },
  ];

  const items: ReferenceItem[] = [];
  for (let p = 1; p <= Math.max(1, pages.length); p++) {
    specs.forEach((s, i) => {
      items.push({
        id: `p${p}-${i}`,
        ref_label: String((p - 1) * specs.length + i + 1),
        page: p,
        topic: s.topic,
        archetype: s.archetype,
        type: "mcq",
        difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard",
        question_text: `[MOCK REFERENCE p${p} #${i + 1}] A source question about ${s.archetype}. Which expression is correct?`,
        options: ["$\\frac{1}{2}mv^2$", "$mv^2$", "$\\frac{1}{2}mv$", "$2mv^2$"],
        correct_answer: "A",
        figure: s.figure
          ? {
              // Half get a croppable box, half fall through to the redraw path,
              // so both figure routes are exercised without an API key.
              ...(i % 2 === 0 ? { bbox: { x0: 0.1, y0: 0.2, x1: 0.45, y1: 0.35 } } : {}),
              spec: `[MOCK] A simple labelled circuit for ${s.archetype}.`,
            }
          : undefined,
      });
    });
  }

  return {
    bank: {
      items,
      topics: distinctTopics(items),
      pages_read: Math.max(1, pages.length),
      extracted_at: new Date().toISOString(),
    },
    usage: { model: "mock", input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    failedPages: [],
  };
}
