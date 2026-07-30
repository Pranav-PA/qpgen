import katex from "katex";
import type { Paper, Question } from "@/lib/types";
import { fetchImageAsDataUri, katexCss } from "./assets";

const LETTERS = ["A", "B", "C", "D"];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render text containing inline $...$ LaTeX to HTML. Prose is escaped. */
function mathHtml(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/(\$[^$]+\$)/g)
        .map((part) => {
          if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
            try {
              return katex.renderToString(part.slice(1, -1), {
                throwOnError: false,
                output: "html",
              });
            } catch {
              return escapeHtml(part);
            }
          }
          return escapeHtml(part);
        })
        .join("")
    )
    .join("<br/>");
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 11.5pt;
  line-height: 1.45;
  color: #000;
}
.sheet { padding: 0; }
header.letterhead {
  text-align: center;
  border-bottom: 2px solid #000;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
header.letterhead img.logo {
  max-height: 64px;
  max-width: 180px;
  object-fit: contain;
  margin-bottom: 6px;
}
h1.inst { font-size: 19pt; font-weight: bold; margin: 0; letter-spacing: .3px; }
p.addr { font-size: 9.5pt; color: #333; margin: 2px 0 0; }
p.examtitle { font-size: 13.5pt; font-weight: bold; margin: 8px 0 0; }
p.scope { font-size: 10pt; color: #333; margin: 2px 0 0; }
.meta {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 4px 26px; font-size: 10pt; margin-top: 6px;
}
.instructions {
  border: 1px solid #999; border-radius: 4px;
  padding: 8px 10px; margin-bottom: 14px; font-size: 10pt;
  break-inside: avoid;
}
.instructions .h { font-weight: bold; margin-bottom: 3px; }
.instructions p { margin: 1px 0; }
.q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 11px; }
.q .stem { display: flex; gap: 7px; align-items: baseline; }
.q .num { font-weight: bold; white-space: nowrap; }
.q .marks { color: #555; font-size: 8.5pt; white-space: nowrap; }
.opts { margin-top: 3px; padding-left: 20px; }
.opts.two-col { column-count: 2; column-gap: 26px; }
.opt { margin: 1.5px 0; break-inside: avoid; }
.opt .lbl { font-weight: bold; }
.endnote { text-align: center; font-style: italic; color: #555; font-size: 10pt; margin-top: 22px; }
.keywarn { font-style: italic; color: #b00; font-size: 10pt; margin: 0 0 10px; }
h2.sec { font-size: 13pt; margin: 14px 0 6px; }
.answers {
  border: 1px solid #999; border-radius: 4px; padding: 8px 10px;
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px 8px;
  font-size: 10.5pt; break-inside: avoid;
}
.sol { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
.sol .head { font-weight: bold; }
.sol .body { color: #111; }
.katex { font-size: 1.02em; }
.katex-display { margin: 0.3em 0; }
`;

function letterheadHtml(paper: Paper, logo: string | null, keyLabel: boolean): string {
  const i = paper.institution_details;
  const meta: string[] = [];
  if (i.exam_date) meta.push(`Date: ${escapeHtml(fmtDate(i.exam_date))}`);
  if (i.exam_time) meta.push(`Time: ${escapeHtml(i.exam_time)}`);
  meta.push(`Duration: ${i.duration_minutes} min`);
  meta.push(`Max marks: ${i.max_marks}`);

  return `<header class="letterhead">
    ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ""}
    <h1 class="inst">${escapeHtml(i.name)}</h1>
    ${i.address ? `<p class="addr">${escapeHtml(i.address)}</p>` : ""}
    <p class="examtitle">${escapeHtml(i.exam_title)}${keyLabel ? " — ANSWER KEY" : ""}</p>
    <p class="scope">${escapeHtml(paper.subject)} · ${escapeHtml(paper.chapters.join(", "))}</p>
    <div class="meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
  </header>`;
}

function questionHtml(q: Question, index: number): string {
  const hasOptions =
    (q.type === "mcq" || q.type === "assertion_reason") &&
    Array.isArray(q.options) &&
    q.options.length > 0;

  const compact =
    hasOptions && q.options!.every((o) => o.replace(/\$/g, "").length < 34);

  const opts = hasOptions
    ? `<div class="opts${compact ? " two-col" : ""}">${q
        .options!.map(
          (o, oi) =>
            `<div class="opt"><span class="lbl">(${LETTERS[oi] ?? oi + 1})</span> ${mathHtml(o)}</div>`
        )
        .join("")}</div>`
    : "";

  return `<div class="q">
    <div class="stem">
      <span class="num">Q${index + 1}.</span>
      <span>${mathHtml(q.question_text)} <span class="marks">[${q.marks} mark${q.marks === 1 ? "" : "s"}]</span></span>
    </div>
    ${opts}
  </div>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>${katexCss()}</style>
<style>${BASE_CSS}</style>
</head><body><div class="sheet">${body}</div></body></html>`;
}

export async function questionPaperHtml(paper: Paper): Promise<string> {
  const logo = await fetchImageAsDataUri(paper.institution_details.logo_url);
  const inst = paper.institution_details;

  const instructions = inst.instructions.trim()
    ? `<div class="instructions"><div class="h">General instructions</div>${inst.instructions
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<p>${escapeHtml(l.trim())}</p>`)
        .join("")}</div>`
    : "";

  const body = `
    ${letterheadHtml(paper, logo, false)}
    ${instructions}
    ${paper.questions.map((q, i) => questionHtml(q, i)).join("")}
    <p class="endnote">— End of question paper —</p>`;

  return shell(paper.title, body);
}

export async function answerKeyHtml(paper: Paper): Promise<string> {
  const logo = await fetchImageAsDataUri(paper.institution_details.logo_url);

  const quick = `<div class="answers">${paper.questions
    .map(
      (q, i) => `<div><strong>${i + 1}.</strong> ${mathHtml(q.correct_answer)}</div>`
    )
    .join("")}</div>`;

  const solutions = paper.questions
    .map(
      (q, i) => `<div class="sol">
        <div class="head">Q${i + 1} — Answer: ${mathHtml(q.correct_answer)}</div>
        <div class="body">${mathHtml(q.solution)}</div>
      </div>`
    )
    .join("");

  const body = `
    ${letterheadHtml(paper, logo, true)}
    <p class="keywarn">For teacher use only — do not distribute with the question paper.</p>
    <h2 class="sec">Quick answers</h2>
    ${quick}
    <h2 class="sec">Worked solutions</h2>
    ${solutions}`;

  return shell(`${paper.title} — Answer Key`, body);
}
