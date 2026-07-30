"use client";

import MathText from "@/components/MathText";
import type { Paper } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

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

export default function PrintView({
  paper,
  mode,
}: {
  paper: Paper;
  mode: "paper" | "key";
}) {
  const inst = paper.institution_details;
  const flagged = paper.questions.filter((q) => q.needs_review).length;

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 bg-surface border-b border-line px-6 py-3 flex items-center gap-4">
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
        <a href={`/papers/${paper.id}`} className="btn-secondary">
          ← Back to review
        </a>
        <p className="text-xs text-muted flex-1">
          In the print dialog choose &ldquo;Save as PDF&rdquo; to download a file.
          {mode === "key" && " This is the ANSWER KEY — do not hand this document to students."}
        </p>
      </div>

      {flagged > 0 && (
        <div className="no-print max-w-3xl mx-auto mt-4 px-6">
          <p className="rounded-xl border border-warn/40 bg-warn-soft text-warn px-4 py-3 text-sm font-medium">
            ⚠ {flagged} question{flagged > 1 ? "s are" : " is"} still flagged
            &ldquo;needs review&rdquo;. Please resolve the flags before
            printing for students.
          </p>
        </div>
      )}

      <main className="print-page max-w-3xl mx-auto px-10 py-10 text-[15px] leading-relaxed">
        {/* Letterhead */}
        <header className="text-center border-b-2 border-black pb-3 mb-4">
          {inst.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inst.logo_url}
              alt=""
              className="h-16 mx-auto mb-2 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold tracking-wide">{inst.name}</h1>
          {inst.address && <p className="text-sm text-neutral-600">{inst.address}</p>}
          <p className="text-lg font-semibold mt-2">
            {inst.exam_title}
            {mode === "key" && " — ANSWER KEY"}
          </p>
          <p className="text-sm text-neutral-600">
            {paper.subject} · {paper.chapters.join(", ")}
          </p>
          <p className="text-sm mt-1 flex flex-wrap justify-center gap-x-6">
            {inst.exam_date && <span>Date: {fmtDate(inst.exam_date)}</span>}
            {inst.exam_time && <span>Time: {inst.exam_time}</span>}
            <span>Duration: {inst.duration_minutes} min</span>
            <span>Max marks: {inst.max_marks}</span>
          </p>
        </header>

        {mode === "paper" ? <PaperBody paper={paper} /> : <KeyBody paper={paper} />}
      </main>
    </div>
  );
}

function PaperBody({ paper }: { paper: Paper }) {
  const inst = paper.institution_details;
  return (
    <>
      {inst.instructions.trim() && (
        <section className="text-sm border border-neutral-300 rounded p-3 mb-5 avoid-break">
          <p className="font-semibold mb-1">General instructions</p>
          {inst.instructions
            .split("\n")
            .filter((l) => l.trim())
            .map((line, i) => (
              <p key={i}>{line.trim()}</p>
            ))}
        </section>
      )}

      <ol className="space-y-4">
        {paper.questions.map((q, i) => (
          <li key={q.id} className="avoid-break">
            <div className="flex gap-2">
              <span className="font-bold shrink-0">Q{i + 1}.</span>
              <div className="flex-1">
                <p>
                  <MathText text={q.question_text} />
                  <span className="text-neutral-500 text-xs whitespace-nowrap">
                    {"  "}[{q.marks} mark{q.marks === 1 ? "" : "s"}]
                  </span>
                </p>
                {(q.type === "mcq" || q.type === "assertion_reason") && q.options && (
                  <div
                    className={`mt-1.5 gap-x-8 gap-y-1 ${
                      q.options.every((o) => o.length < 40)
                        ? "grid grid-cols-2"
                        : "space-y-1"
                    }`}
                  >
                    {q.options.map((opt, oi) => (
                      <p key={oi}>
                        <span className="font-semibold">({LETTERS[oi]})</span>{" "}
                        <MathText text={opt} />
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-center italic text-neutral-500 text-sm mt-8">
        — End of question paper —
      </p>
    </>
  );
}

function KeyBody({ paper }: { paper: Paper }) {
  return (
    <>
      <p className="text-sm italic text-red-700 mb-4">
        For teacher use only — do not distribute with the question paper.
      </p>

      <section className="avoid-break mb-6">
        <h2 className="font-bold text-lg mb-2">Quick answers</h2>
        <div className="grid grid-cols-5 gap-1 border border-neutral-300 rounded p-3 text-sm">
          {paper.questions.map((q, i) => (
            <p key={q.id}>
              <span className="font-semibold">{i + 1}.</span>{" "}
              <MathText text={q.correct_answer} />
            </p>
          ))}
        </div>
      </section>

      <h2 className="font-bold text-lg mb-2">Worked solutions</h2>
      <ol className="space-y-4">
        {paper.questions.map((q, i) => (
          <li key={q.id} className="avoid-break">
            <p className="font-semibold">
              Q{i + 1} — Answer: <MathText text={q.correct_answer} />
            </p>
            <p className="text-neutral-800">
              <MathText text={q.solution} />
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
