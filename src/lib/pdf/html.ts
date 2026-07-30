import katex from "katex";
import { groupBySection, subHeadingFor } from "@/lib/sections";
import { hasOptions, isBlueprint, type Paper, type Question } from "@/lib/types";
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
header.letterhead.board { border-bottom: none; padding-bottom: 2px; }
header.letterhead.board .examtitle { font-size: 14pt; margin-top: 6px; }
header.letterhead.board .subjline {
  font-size: 12pt; font-weight: bold; letter-spacing: .6px; margin: 3px 0 0;
}
.timebar {
  display: flex; justify-content: space-between;
  border-top: 1.4px solid #000; border-bottom: 1.4px solid #000;
  margin-top: 8px; padding: 3px 2px; font-size: 11pt; font-weight: bold;
}
.instructions {
  border: 1px solid #999; border-radius: 4px;
  padding: 8px 10px; margin-bottom: 14px; font-size: 10pt;
  break-inside: avoid;
}
.instructions .h { font-weight: bold; margin-bottom: 3px; }
.instructions p { margin: 1px 0; }
.instrlist { margin: 0; padding-left: 20px; }
.instrlist li { margin: 1.5px 0; }
.subhead {
  font-weight: bold; font-size: 10.5pt; margin: 10px 0 5px;
  break-after: avoid; page-break-after: avoid;
}
.q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 11px; }
.q .stem { display: flex; gap: 7px; align-items: baseline; }
.q .num { font-weight: bold; white-space: nowrap; }
.q .marks { color: #555; font-size: 8.5pt; white-space: nowrap; }
.opts { margin-top: 3px; padding-left: 20px; }
.opts.two-col { column-count: 2; column-gap: 26px; }
.opt { margin: 1.5px 0; break-inside: avoid; }
.opt .lbl { font-weight: bold; }
.sechead {
  margin: 14px 0 8px; padding: 4px 0 3px;
  border-top: 1.2px solid #000; border-bottom: 1.2px solid #000;
  text-align: center; break-after: avoid; page-break-after: avoid;
}
.sechead .secname { font-weight: bold; font-size: 12pt; letter-spacing: .5px; }
.sechead .secinstr { font-size: 9.5pt; font-style: italic; color: #333; margin-top: 1px; }
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
.sol .marksk { font-weight: normal; color: #555; font-size: 8.5pt; }
.help-note { font-size: 10pt; color: #444; font-style: italic; }
.katex { font-size: 1.02em; }
.katex-display { margin: 0.3em 0; }
`;

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hour${h > 1 ? "s" : ""} ${m} minutes`;
  if (h) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${m} minutes`;
}

/**
 * Board papers use the official layout: the exam identity centred, then a
 * Time/Max-Marks rule spanning the page. Non-board papers keep the compact
 * letterhead with the date/time metadata inline.
 */
function letterheadHtml(
  paper: Paper,
  logo: string | null,
  keyLabel: boolean,
  boardStyle: boolean
): string {
  const i = paper.institution_details;

  if (boardStyle) {
    return `<header class="letterhead board">
      ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ""}
      <h1 class="inst">${escapeHtml(i.name)}</h1>
      ${i.address ? `<p class="addr">${escapeHtml(i.address)}</p>` : ""}
      <p class="examtitle">${escapeHtml(i.exam_title)}${keyLabel ? " — ANSWER KEY" : ""}</p>
      <p class="subjline">SUBJECT: ${escapeHtml(paper.subject.toUpperCase())}</p>
      ${i.exam_date ? `<p class="scope">Date: ${escapeHtml(fmtDate(i.exam_date))}${i.exam_time ? ` &nbsp;·&nbsp; ${escapeHtml(i.exam_time)}` : ""}</p>` : ""}
      <div class="timebar">
        <span>Time: ${escapeHtml(fmtDuration(i.duration_minutes))}</span>
        <span>Max. Marks: ${i.max_marks}</span>
      </div>
    </header>`;
  }

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
  const showOptions =
    hasOptions(q.type) && Array.isArray(q.options) && q.options.length > 0;

  const compact =
    showOptions && q.options!.every((o) => o.replace(/\$/g, "").length < 34);

  const opts = showOptions
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
  const boardStyle = isBlueprint(paper.settings);

  const lines = inst.instructions
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const instructions = lines.length
    ? `<div class="instructions"><div class="h">General Instructions:</div><ol class="instrlist">${lines
        // The teacher's text is often already numbered; don't double-number it.
        .map((l) => `<li>${escapeHtml(l.replace(/^\d+[.)]\s*/, ""))}</li>`)
        .join("")}</ol></div>`
    : "";

  const groups = groupBySection(paper)
    .map((g) => {
      const head = g.heading
        ? `<div class="sechead"><div class="secname">${escapeHtml(g.heading)}</div>${
            g.instruction ? `<div class="secinstr">${escapeHtml(g.instruction)}</div>` : ""
          }</div>`
        : "";
      const qs = g.questions
        .map((q, i) => {
          const sub = subHeadingFor(g, i);
          const subHead = sub
            ? `<div class="subhead">${escapeHtml(sub)}</div>`
            : "";
          return subHead + questionHtml(q, g.startIndex - 1 + i);
        })
        .join("");
      return head + qs;
    })
    .join("");

  const body = `
    ${letterheadHtml(paper, logo, false, boardStyle)}
    ${instructions}
    ${groups}
    <p class="endnote">— End of question paper —</p>`;

  return shell(paper.title, body);
}

export async function answerKeyHtml(paper: Paper): Promise<string> {
  const logo = await fetchImageAsDataUri(paper.institution_details.logo_url);

  const groups = groupBySection(paper);

  // Only objective answers belong in the at-a-glance grid; descriptive answers
  // are paragraphs and would make it unreadable.
  const quickItems = groups.flatMap((g) =>
    g.questions
      .map((q, i) => ({ q, n: g.startIndex + i }))
      .filter(({ q }) => hasOptions(q.type) || q.type === "numerical")
  );
  const quick =
    quickItems.length > 0
      ? `<div class="answers">${quickItems
          .map(
            ({ q, n }) => `<div><strong>${n}.</strong> ${mathHtml(q.correct_answer)}</div>`
          )
          .join("")}</div>`
      : `<p class="help-note">This paper is entirely descriptive — see the worked solutions below.</p>`;

  const solutions = groups
    .map((g) => {
      const head = g.heading
        ? `<div class="sechead"><div class="secname">${escapeHtml(g.heading)}</div></div>`
        : "";
      const items = g.questions
        .map(
          (q, i) => `<div class="sol">
            <div class="head">Q${g.startIndex + i} — Answer: ${mathHtml(q.correct_answer)}<span class="marksk"> [${q.marks} mark${q.marks === 1 ? "" : "s"}]</span></div>
            <div class="body">${mathHtml(q.solution)}</div>
          </div>`
        )
        .join("");
      return head + items;
    })
    .join("");

  const body = `
    ${letterheadHtml(paper, logo, true, isBlueprint(paper.settings))}
    <p class="keywarn">For teacher use only — do not distribute with the question paper.</p>
    <h2 class="sec">Quick answers</h2>
    ${quick}
    <h2 class="sec">Worked solutions</h2>
    ${solutions}`;

  return shell(`${paper.title} — Answer Key`, body);
}
