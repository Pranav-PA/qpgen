"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";
import SupportPrompt from "@/components/support/SupportPrompt";
import { groupBySection } from "@/lib/sections";
import {
  QUESTION_TYPE_LABELS,
  hasOptions,
  type Paper,
  type Question,
} from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

export default function PaperReview({ initialPaper }: { initialPaper: Paper }) {
  const router = useRouter();
  const [paper] = useState(initialPaper);
  const [title, setTitle] = useState(initialPaper.title);
  const [questions, setQuestions] = useState<Question[]>(initialPaper.questions ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [busyExport, setBusyExport] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const flaggedCount = questions.filter((q) => q.needs_review).length;
  const remaining = paper.settings.question_count - questions.length;
  const groups = useMemo(
    () => groupBySection({ ...paper, questions }),
    [paper, questions]
  );

  function mutate(next: Question[]) {
    setQuestions(next);
    setDirty(true);
  }

  async function save(
    override?: { questions?: Question[]; quiet?: boolean }
  ): Promise<boolean> {
    const payloadQuestions = override?.questions ?? questions;
    setSaving(true);
    if (!override?.quiet) setNotice("");
    try {
      const res = await fetch(`/api/papers/${paper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, questions: payloadQuestions }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed.");
      }
      setDirty(false);
      if (!override?.quiet) setNotice("Saved.");
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Clearing a verifier flag persists immediately. Left as a local-only edit it
   * looked dismissed but reappeared on the next load, so the paper seemed
   * permanently stuck with questions "to review".
   */
  function resolveFlag(id: string) {
    const next = questions.map((x) =>
      x.id === id ? { ...x, needs_review: false, review_reason: undefined } : x
    );
    setQuestions(next);
    void save({ questions: next, quiet: true });
  }

  const pdfUrl = (doc: "paper" | "key") =>
    `/api/papers/${paper.id}/export-pdf?doc=${doc}`;

  /**
   * Downloading is never gated on review flags — flags are advice to the
   * teacher, not a lock. Unsaved edits are flushed first so the PDF matches
   * what is on screen, but a failed save still lets the download proceed with
   * the last saved version rather than blocking it.
   */
  async function saveThenDownload(doc: "paper" | "key") {
    setBusyExport(doc);
    try {
      const saved = await save({ quiet: true });
      setNotice(
        saved
          ? "Preparing your PDF — the download starts in a few seconds."
          : "Couldn't save your latest edits, so the PDF uses the last saved version."
      );
      // Top-level navigation to an attachment downloads without navigating away.
      window.location.href = pdfUrl(doc);
      setExported(true);
    } finally {
      setBusyExport(null);
    }
  }

  async function continueGeneration() {
    setContinuing(true);
    setNotice("");
    try {
      let done = false;
      let guard = 0;
      while (!done && guard < 15) {
        guard++;
        const res = await fetch(`/api/papers/${paper.id}/generate-batch`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Generation failed.");
        done = body.done;
      }
      router.refresh();
      location.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setContinuing(false);
    }
  }

  function addCustomQuestion() {
    mutate([
      ...questions,
      {
        id: crypto.randomUUID(),
        type: "mcq",
        difficulty: "medium",
        chapter: paper.settings.chapters[0] ?? "",
        question_text: "",
        options: ["", "", "", ""],
        correct_answer: "A",
        solution: "",
        marks: paper.settings.marks_per_question,
        negative_marks: paper.settings.negative_marks,
        needs_review: false,
        teacher_authored: true,
      },
    ]);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* The non-negotiable review notice — always visible. */}
      <div className="sticky top-14 z-10 -mx-2 px-2 pt-2 pb-2 bg-background">
        <div className="rounded-xl border border-warn/30 bg-warn-soft text-warn px-4 py-3 text-sm font-medium flex items-start gap-2">
          <span aria-hidden>⚠️</span>
          <span>
            Please review all questions <em>and</em> answers before printing or
            distributing to students. AI-generated content can contain mistakes —
            you are the final check.
            {flaggedCount > 0 && (
              <>
                {" "}
                <strong>
                  {flaggedCount} question{flaggedCount > 1 ? "s are" : " is"} flagged
                  by the automatic verifier
                </strong>{" "}
                — worth a second look. Flags never block exporting; you can
                download whenever you like.
              </>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-2">
        <input
          aria-label="Paper title"
          className="input text-lg font-semibold flex-1 min-w-60"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
        <button className="btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved ✓"}
        </button>
      </div>
      <p className="text-sm text-muted mb-4">
        {paper.exam_type} · {paper.subject} · {paper.chapters.join(", ")} ·{" "}
        {questions.length} question{questions.length === 1 ? "" : "s"}
      </p>

      {notice && (
        <p role="status" className="text-sm mb-4 text-muted">{notice}</p>
      )}

      {remaining > 0 && (
        <div className="card p-4 mb-4 flex items-center justify-between gap-4 border-accent/30">
          <p className="text-sm">
            This paper has {questions.length} of {paper.settings.question_count}{" "}
            planned questions — generation stopped early.
          </p>
          <button className="btn-primary shrink-0" onClick={continueGeneration} disabled={continuing}>
            {continuing ? "Generating…" : `Generate remaining ${remaining}`}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g, gi) => (
          <section key={g.heading ?? `g${gi}`} className="space-y-4">
            {g.heading && (
              <div className="rounded-lg bg-accent-soft border border-accent/20 px-4 py-2">
                <h2 className="font-semibold text-accent text-sm">{g.heading}</h2>
                {g.instruction && (
                  <p className="text-xs text-accent/80 mt-0.5">{g.instruction}</p>
                )}
              </div>
            )}
            {g.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={g.startIndex - 1 + i}
                question={q}
                paperId={paper.id}
                onChange={(next) =>
                  mutate(questions.map((x) => (x.id === q.id ? next : x)))
                }
                onResolveFlag={() => resolveFlag(q.id)}
                onDelete={() => mutate(questions.filter((x) => x.id !== q.id))}
                onReplaced={(next) => {
                  setQuestions((prev) => prev.map((x) => (x.id === q.id ? next : x)));
                  setDirty(false);
                }}
              />
            ))}
          </section>
        ))}
      </div>

      <div className="flex justify-center mt-6">
        <button className="btn-secondary" onClick={addCustomQuestion}>
          + Add your own question
        </button>
      </div>

      {/* Export */}
      <div className="card p-6 mt-8">
        <h2 className="font-semibold mb-1">Export</h2>
        <p className="text-sm text-muted mb-4">
          The question paper and the answer key are always separate documents.
          Unsaved edits are saved automatically before export.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              ["paper", "📄 Question paper", "(for students)"],
              ["key", "🔑 Answer key", "(for you)"],
            ] as const
          ).map(([doc, heading, who]) => (
            <div key={doc} className="border border-line rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">
                {heading} <span className="text-muted font-normal">{who}</span>
              </h3>
              {/*
                A real anchor whenever possible: a scripted download after an
                await loses its user-gesture context and browsers silently
                block it. With unsaved edits we must save first, so fall back
                to a top-level navigation, which downloads an attachment
                without that restriction.
              */}
              {dirty ? (
                <button
                  className="btn-primary text-xs"
                  disabled={busyExport !== null}
                  onClick={() => saveThenDownload(doc)}
                >
                  {busyExport === doc ? "Preparing…" : "⬇ Download PDF"}
                </button>
              ) : (
                <a
                  className="btn-primary text-xs"
                  href={pdfUrl(doc)}
                  onClick={() => {
                    setNotice("Preparing your PDF — the download starts in a few seconds.");
                    setExported(true);
                  }}
                >
                  ⬇ Download PDF
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="help mt-3">
          PDFs are rendered on the server with full equation formatting. The
          first download after a quiet spell takes a few seconds while the
          renderer warms up.
        </p>
        <SupportPrompt show={exported} />
      </div>
    </div>
  );
}

/* ================================================================== */

function QuestionCard({
  index,
  question: q,
  paperId,
  onChange,
  onResolveFlag,
  onDelete,
  onReplaced,
}: {
  index: number;
  question: Question;
  paperId: string;
  onChange: (q: Question) => void;
  onResolveFlag: () => void;
  onDelete: () => void;
  onReplaced: (q: Question) => void;
}) {
  const [editing, setEditing] = useState(q.teacher_authored && !q.question_text);
  const [showSolution, setShowSolution] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportState, setReportState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const isMcqLike = hasOptions(q.type);

  async function regenerate() {
    setRegenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/papers/${paperId}/regenerate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Regeneration failed.");
      onReplaced(body.question as Question);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  }

  async function submitReport() {
    setReportState("busy");
    try {
      const res = await fetch("/api/report-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_id: paperId, question_index: index, reason: reportReason }),
      });
      if (!res.ok) throw new Error();
      setReportState("done");
    } catch {
      setReportState("error");
    }
  }

  return (
    <article
      className={`card p-5 ${q.needs_review ? "border-warn/50" : ""}`}
      aria-label={`Question ${index + 1}`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="font-semibold">Q{index + 1}</span>
        <span className="badge bg-background border border-line text-muted capitalize">
          {q.difficulty}
        </span>
        <span className="badge bg-background border border-line text-muted">
          {QUESTION_TYPE_LABELS[q.type] ?? q.type}
        </span>
        <span className="badge bg-background border border-line text-muted">
          {q.negative_marks > 0 ? `+${q.marks}/−${q.negative_marks}` : `${q.marks} mark${q.marks === 1 ? "" : "s"}`}
        </span>
        {q.teacher_authored && (
          <span className="badge bg-accent-soft text-accent">Your question</span>
        )}
        {q.needs_review && (
          <span className="badge bg-warn-soft text-warn border border-warn/30">
            ⚠ Needs review
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-1.5">
          <button className="btn-secondary text-xs px-2.5 py-1" onClick={() => setEditing(!editing)}>
            {editing ? "Preview" : "Edit"}
          </button>
          {!q.teacher_authored && (
            <button
              className="btn-secondary text-xs px-2.5 py-1"
              onClick={regenerate}
              disabled={regenerating}
              title="Replace with a freshly generated question of the same type and difficulty"
            >
              {regenerating ? "Regenerating…" : "↻ Regenerate"}
            </button>
          )}
          <button className="btn-danger text-xs px-2.5 py-1" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {q.needs_review && q.review_reason && (
        <p className="text-xs text-warn bg-warn-soft border border-warn/30 rounded-lg px-3 py-2 mb-3">
          <strong>Verifier note:</strong> {q.review_reason}{" "}
          <button className="underline font-medium" onClick={onResolveFlag}>
            Mark as checked
          </button>
        </p>
      )}

      {error && <p role="alert" className="text-xs text-danger mb-2">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="label text-xs" htmlFor={`qt-${q.id}`}>Question text (use $...$ for math)</label>
            <textarea
              id={`qt-${q.id}`}
              rows={3}
              className="input font-mono text-xs"
              value={q.question_text}
              onChange={(e) => onChange({ ...q, question_text: e.target.value })}
            />
          </div>
          {isMcqLike &&
            (q.options ?? []).map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <span className="text-xs font-semibold w-5">{LETTERS[oi]}.</span>
                <input
                  aria-label={`Option ${LETTERS[oi]}`}
                  className="input font-mono text-xs"
                  value={opt}
                  onChange={(e) => {
                    const options = [...(q.options ?? [])];
                    options[oi] = e.target.value;
                    onChange({ ...q, options });
                  }}
                />
              </div>
            ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs" htmlFor={`ca-${q.id}`}>
                {isMcqLike ? "Correct option" : "Expected answer"}
              </label>
              {isMcqLike ? (
                <select
                  id={`ca-${q.id}`}
                  className="input"
                  value={q.correct_answer}
                  onChange={(e) => onChange({ ...q, correct_answer: e.target.value })}
                >
                  {LETTERS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`ca-${q.id}`}
                  className="input"
                  value={q.correct_answer}
                  onChange={(e) => onChange({ ...q, correct_answer: e.target.value })}
                />
              )}
            </div>
            <div>
              <label className="label text-xs" htmlFor={`mk-${q.id}`}>Marks</label>
              <input
                id={`mk-${q.id}`}
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={q.marks}
                onChange={(e) => onChange({ ...q, marks: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div>
            <label className="label text-xs" htmlFor={`sol-${q.id}`}>
              {isMcqLike ? "Solution / explanation" : "Model answer / marking scheme"}
            </label>
            <textarea
              id={`sol-${q.id}`}
              rows={4}
              className="input font-mono text-xs"
              value={q.solution}
              onChange={(e) => onChange({ ...q, solution: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="leading-relaxed">
            <MathText text={q.question_text} />
          </p>
          {isMcqLike && q.options && (
            <ol className="mt-3 space-y-1.5">
              {q.options.map((opt, oi) => (
                <li
                  key={oi}
                  className={`text-sm flex gap-2 rounded-lg px-3 py-1.5 ${
                    showSolution && LETTERS[oi] === q.correct_answer
                      ? "bg-ok-soft text-ok font-medium"
                      : ""
                  }`}
                >
                  <span className="font-semibold">{LETTERS[oi]}.</span>
                  <MathText text={opt} />
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button
              className="text-accent font-medium hover:underline"
              onClick={() => setShowSolution(!showSolution)}
            >
              {showSolution ? "Hide answer & solution" : "Show answer & solution"}
            </button>
            <button
              className="text-muted hover:text-danger hover:underline text-xs"
              onClick={() => setReporting(!reporting)}
            >
              Report this question
            </button>
          </div>
          {showSolution && (
            <div className="mt-2 border-t border-line pt-3 text-sm">
              <p className="font-medium mb-1">
                Answer: <MathText text={q.type === "numerical" ? q.correct_answer : `${q.correct_answer}`} />
              </p>
              <p className="text-muted leading-relaxed">
                <MathText text={q.solution} />
              </p>
            </div>
          )}
          {reporting && (
            <div className="mt-3 border border-line rounded-lg p-3">
              {reportState === "done" ? (
                <p className="text-sm text-ok">
                  Report submitted — thank you. Consider also editing or
                  regenerating this question before export.
                </p>
              ) : (
                <>
                  <label className="label text-xs" htmlFor={`rep-${q.id}`}>
                    What&apos;s wrong with this question?
                  </label>
                  <textarea
                    id={`rep-${q.id}`}
                    rows={2}
                    className="input text-xs"
                    placeholder="e.g. The stated answer is wrong — option C is also correct."
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                  />
                  {reportState === "error" && (
                    <p className="text-xs text-danger mt-1">Could not submit. Try again.</p>
                  )}
                  <button
                    className="btn-secondary text-xs mt-2"
                    onClick={submitReport}
                    disabled={reportState === "busy" || reportReason.trim().length < 3}
                  >
                    {reportState === "busy" ? "Submitting…" : "Submit report"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
