"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import MathText from "@/components/MathText";
import QuestionFigure from "@/components/QuestionFigure";
import SupportPrompt from "@/components/support/SupportPrompt";
import { groupBySection, type SectionGroup } from "@/lib/sections";
import {
  QUESTION_TYPE_LABELS,
  hasOptions,
  subGroupAt,
  type BlueprintSection,
  type Paper,
  type Question,
} from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

const questionDomId = (id: string) => `q-${id}`;

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
  const [revealAll, setRevealAll] = useState(false);
  /** Last deleted question, kept so the removal can be taken back. */
  const [undo, setUndo] = useState<{ question: Question; at: number } | null>(null);
  const flagCursor = useRef(0);

  const flagged = useMemo(() => questions.filter((q) => q.needs_review), [questions]);
  const remaining = paper.settings.question_count - questions.length;
  const groups = useMemo(
    () => groupBySection({ ...paper, questions }),
    [paper, questions]
  );

  /**
   * Edits live in component state until "Save changes" is pressed, so closing
   * the tab used to throw away an evening of corrections without a word. The
   * browser's own confirmation is the only thing that can interrupt an unload,
   * so hook it whenever there is something to lose.
   */
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers only honour the deprecated returnValue.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

  /**
   * Deleting is not gated behind a confirmation because it is not yet
   * destructive — the question only leaves the database on the next save, and
   * pruning a paper down to size means doing this many times in a row. An undo
   * that stays put until it is used beats a dialog per question.
   */
  function removeQuestion(id: string) {
    const at = questions.findIndex((q) => q.id === id);
    if (at === -1) return;
    setUndo({ question: questions[at], at });
    mutate(questions.filter((q) => q.id !== id));
  }

  function undoRemove() {
    if (!undo) return;
    const next = [...questions];
    next.splice(Math.min(undo.at, next.length), 0, undo.question);
    mutate(next);
    setUndo(null);
  }

  /**
   * Reordering is deliberately confined to a single part. A question carries
   * its part's marks and question type, so moving one across a boundary would
   * silently print a 5-mark long answer inside the 1-mark MCQ section.
   */
  function moveWithinGroup(groupIndex: number, offset: number, delta: number) {
    const group = groups[groupIndex];
    const target = offset + delta;
    if (!group || target < 0 || target >= group.questions.length) return;

    const reordered = [...group.questions];
    [reordered[offset], reordered[target]] = [reordered[target], reordered[offset]];

    // Rebuilding from the groups also normalises storage order to print order,
    // which is what the export has always used anyway.
    mutate(
      groups.flatMap((g, i) => (i === groupIndex ? reordered : g.questions))
    );
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

  /** Walks the flagged questions in order, wrapping at the end. */
  function jumpToFlagged() {
    if (flagged.length === 0) return;
    const index = flagCursor.current % flagged.length;
    flagCursor.current = index + 1;
    const node = document.getElementById(questionDomId(flagged[index].id));
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.focus({ preventScroll: true });
  }

  function addCustomQuestion(section: BlueprintSection | null) {
    const id = crypto.randomUUID();
    // The new question lands at the end of its part, so it inherits the terms
    // of the run that slot falls in — a part whose runs differ in mark value
    // (Karnataka's SSLC parts do) has no single answer at the part level.
    const offset = section
      ? questions.filter((q) => q.section_id === section.id).length
      : 0;
    const run = section ? subGroupAt(section, offset) : null;
    mutate([
      ...questions,
      {
        id,
        // A blueprint part dictates the type and mark value of everything in
        // it, so a hand-written question joins on the part's terms.
        type: run?.question_type ?? section?.question_type ?? "mcq",
        difficulty: "medium",
        chapter: paper.settings.chapters[0] ?? "",
        question_text: "",
        options: ["", "", "", ""],
        correct_answer: "A",
        solution: "",
        marks:
          run?.marks_per_question ??
          section?.marks_per_question ??
          paper.settings.marks_per_question,
        negative_marks: section ? 0 : paper.settings.negative_marks,
        needs_review: false,
        teacher_authored: true,
        ...(section ? { section_id: section.id } : {}),
      },
    ]);
    // Land on the empty card instead of leaving it below the fold.
    requestAnimationFrame(() => {
      const node = document.getElementById(questionDomId(id));
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
      node?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/*
        The review notice, in full, at the top of the paper where it is read
        once and properly.
      */}
      <div className="rounded-xl border border-warn/30 bg-warn-soft text-warn px-4 py-3 text-sm font-medium flex items-start gap-2">
        <Icon name="alert" className="size-4 mt-0.5" />
        <span>
          Please review all questions <em>and</em> answers before printing or
          distributing to students. AI-generated content can contain mistakes —
          you are the final check.
          {flagged.length > 0 && (
            <>
              {" "}
              <strong>
                {flagged.length} question{flagged.length > 1 ? "s are" : " is"} flagged
                by the automatic verifier
              </strong>{" "}
              — worth a second look. Flags never block exporting; you can
              download whenever you like.
            </>
          )}
        </span>
      </div>

      {/*
        …and a short version of the same warning that never leaves the screen,
        carrying the controls with it.
        The full notice used to be the sticky element. On a phone it held a
        third of the viewport open on every scroll, which is how a warning
        becomes wallpaper — and saving still meant scrolling back to the top of
        a thirty-question paper. This keeps the reminder permanently in view at
        a size that stays readable rather than ignorable.
      */}
      <div className="sticky top-14 z-10 -mx-2 px-2 pt-2 pb-2 bg-background">
        <div className="rounded-xl border border-warn/30 bg-surface px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn">
            <Icon name="alert" className="size-3.5" />
            <span className="hidden xs:inline">Review before distributing</span>
            <span className="xs:hidden">Review first</span>
          </span>

          {flagged.length > 0 && (
            <button
              className="btn-secondary text-xs"
              onClick={jumpToFlagged}
              title="Scroll to the next question the verifier flagged"
            >
              <Icon name="flag" className="size-3.5" />
              {flagged.length} flagged
            </button>
          )}
          <button
            className="btn-secondary text-xs"
            onClick={() => setRevealAll((on) => !on)}
            aria-pressed={revealAll}
          >
            <Icon name="eye" className="size-3.5" />
            {revealAll ? "Hide answers" : "Show answers"}
          </button>

          <span className="flex-1" />

          {/*
            sr-only rather than hidden on small screens: `hidden` drops the
            node from the accessibility tree, which would silence the save
            status for exactly the users who most need it announced.
          */}
          <span
            className="text-xs text-muted sr-only sm:not-sr-only"
            aria-live="polite"
          >
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            className="btn-primary text-xs"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            {dirty ? (
              "Save changes"
            ) : (
              <>
                <Icon name="check" className="size-3.5" />
                Saved
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 mb-2">
        <label htmlFor="paper-title" className="sr-only">
          Paper title
        </label>
        <input
          id="paper-title"
          className="input text-lg font-semibold"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
      </div>
      <p className="text-sm text-muted mb-4">
        {paper.exam_type} · {paper.subject} · {paper.chapters.join(", ")} ·{" "}
        {questions.length} question{questions.length === 1 ? "" : "s"}
      </p>

      {notice && (
        <p role="status" className="text-sm mb-4 text-muted">{notice}</p>
      )}

      {undo && (
        <div
          role="status"
          className="card p-3 mb-4 flex flex-wrap items-center gap-3 border-accent/30"
        >
          <p className="text-sm flex-1 min-w-52">
            Question removed. It leaves the paper for good when you save.
          </p>
          <button className="btn-secondary text-xs" onClick={undoRemove}>
            <Icon name="rotateBack" className="size-3.5" />
            Undo
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={() => setUndo(null)}
            aria-label="Dismiss undo"
          >
            Dismiss
          </button>
        </div>
      )}

      {remaining > 0 && (
        <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-4 border-accent/30">
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
        {groups.map((group, groupIndex) => (
          <SectionBlock
            key={group.heading ?? `g${groupIndex}`}
            group={group}
            paperId={paper.id}
            revealAll={revealAll}
            onChangeQuestion={(next) =>
              mutate(questions.map((x) => (x.id === next.id ? next : x)))
            }
            onResolveFlag={resolveFlag}
            onDelete={removeQuestion}
            onReplaced={(next, originalId) => {
              setQuestions((prev) =>
                prev.map((x) => (x.id === originalId ? next : x))
              );
              setDirty(false);
            }}
            onMove={(offset, delta) => moveWithinGroup(groupIndex, offset, delta)}
            onAdd={() => addCustomQuestion(group.section)}
          />
        ))}
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
              ["paper", "fileText", "Question paper", "(for students)"],
              ["key", "key", "Answer key", "(for you)"],
            ] as const
          ).map(([doc, icon, heading, who]) => (
            <div key={doc} className="border border-line rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Icon name={icon} className="size-4 text-accent" />
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
                  <Icon name="download" className="size-3.5" />
                  {busyExport === doc ? "Preparing…" : "Download PDF"}
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
                  <Icon name="download" className="size-3.5" />
                  Download PDF
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

function SectionBlock({
  group,
  paperId,
  revealAll,
  onChangeQuestion,
  onResolveFlag,
  onDelete,
  onReplaced,
  onMove,
  onAdd,
}: {
  group: SectionGroup;
  paperId: string;
  revealAll: boolean;
  onChangeQuestion: (q: Question) => void;
  onResolveFlag: (id: string) => void;
  onDelete: (id: string) => void;
  onReplaced: (q: Question, originalId: string) => void;
  onMove: (offset: number, delta: number) => void;
  onAdd: () => void;
}) {
  return (
    <section className="space-y-4">
      {group.heading && (
        <div className="rounded-lg bg-accent-soft border border-accent/20 px-4 py-2">
          <h2 className="font-semibold text-accent text-sm">{group.heading}</h2>
          {group.instruction && (
            <p className="text-xs text-accent/80 mt-0.5">{group.instruction}</p>
          )}
        </div>
      )}
      {group.questions.map((q, offset) => (
        <QuestionCard
          key={q.id}
          index={group.startIndex - 1 + offset}
          question={q}
          paperId={paperId}
          revealAll={revealAll}
          canMoveUp={offset > 0}
          canMoveDown={offset < group.questions.length - 1}
          onMove={(delta) => onMove(offset, delta)}
          onChange={onChangeQuestion}
          onResolveFlag={() => onResolveFlag(q.id)}
          onDelete={() => onDelete(q.id)}
          onReplaced={(next) => onReplaced(next, q.id)}
        />
      ))}
      {/*
        The add button belongs to the part, not the page: a hand-written
        question has to inherit the part's marks and question type, and there
        is no sensible answer to "which part?" from a button at the bottom.
      */}
      <div className="flex justify-center">
        <button className="btn-secondary text-xs" onClick={onAdd}>
          <Icon name="plus" className="size-3.5" />
          {group.heading
            ? `Add your own question to ${group.heading}`
            : "Add your own question"}
        </button>
      </div>
    </section>
  );
}

/* ================================================================== */

function QuestionCard({
  index,
  question: q,
  paperId,
  revealAll,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onResolveFlag,
  onDelete,
  onReplaced,
}: {
  index: number;
  question: Question;
  paperId: string;
  revealAll: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
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
  /**
   * "edit" keeps this question and changes only what the note implies; "guided"
   * discards it for a brand new one steered by the note. Two different
   * operations sharing one small panel — see applyAi() for the endpoints.
   */
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"edit" | "guided">("edit");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const isMcqLike = hasOptions(q.type);

  /*
   * Follow the paper-wide "show all answers" switch, while still allowing this
   * one card to be toggled on its own afterwards. Adjusted during render (the
   * same pattern as NumberInput) so the card never paints in the old state
   * first and corrects itself a frame later.
   */
  const [seenRevealAll, setSeenRevealAll] = useState(revealAll);
  if (revealAll !== seenRevealAll) {
    setSeenRevealAll(revealAll);
    setShowSolution(revealAll);
  }

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

  /**
   * "edit" keeps most of the question and applies a targeted fix; "guided"
   * is a full regenerate steered by the same note. Genuinely different
   * operations (see the mode picker's copy below), so they hit different
   * endpoints rather than one call with a flag that changes its meaning.
   */
  async function applyAi() {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch(
        aiMode === "edit"
          ? `/api/papers/${paperId}/edit-question`
          : `/api/papers/${paperId}/regenerate-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            aiMode === "edit"
              ? { question_id: q.id, instruction }
              : { question_id: q.id, mode: "guided", instruction }
          ),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      onReplaced(body.question as Question);
      setAiPanelOpen(false);
      setAiInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setAiBusy(false);
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
      id={questionDomId(q.id)}
      tabIndex={-1}
      className={`card p-5 scroll-mt-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        q.needs_review ? "border-warn/50" : ""
      }`}
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
            <Icon name="alert" className="size-3" />
            Needs review
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-1.5">
          {/*
            Reordering is per-part. The buttons stay mounted but disabled at
            the ends so the row of controls does not reflow as you move a
            question up and down the paper.
          */}
          <button
            className="btn-secondary text-xs px-2 py-1"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label={`Move question ${index + 1} earlier`}
            title="Move earlier"
          >
            <Icon name="chevronUp" className="size-3.5" />
          </button>
          <button
            className="btn-secondary text-xs px-2 py-1"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label={`Move question ${index + 1} later`}
            title="Move later"
          >
            <Icon name="chevronDown" className="size-3.5" />
          </button>
          <button
            className="btn-secondary text-xs px-2.5 py-1"
            onClick={() => setEditing(!editing)}
          >
            <Icon name={editing ? "eye" : "pencil"} className="size-3.5" />
            {editing ? "Preview" : "Edit"}
          </button>
          {!q.teacher_authored && (
            <button
              className="btn-secondary text-xs px-2.5 py-1"
              onClick={regenerate}
              disabled={regenerating}
              title="Replace with a freshly generated question of the same type and difficulty"
            >
              <Icon name="refresh" className="size-3.5" />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          {!q.teacher_authored && (
            <button
              className="btn-secondary text-xs px-2.5 py-1"
              aria-pressed={aiPanelOpen}
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              title="Describe a fix in plain English, or regenerate with your own steering"
            >
              <Icon name="sparkles" className="size-3.5" />
              Ask AI…
            </button>
          )}
          <button
            className="btn-danger text-xs px-2.5 py-1"
            onClick={onDelete}
            aria-label={`Delete question ${index + 1}`}
          >
            <Icon name="trash" className="size-3.5" />
            Delete
          </button>
        </div>
      </div>

      {aiPanelOpen && (
        <div className="border border-line rounded-lg p-3 mb-3 space-y-2 bg-background">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What should AI do">
            <button
              type="button"
              aria-pressed={aiMode === "edit"}
              className={aiMode === "edit" ? "btn-primary text-xs px-2.5 py-1" : "btn-secondary text-xs px-2.5 py-1"}
              onClick={() => setAiMode("edit")}
            >
              Fix this question
            </button>
            <button
              type="button"
              aria-pressed={aiMode === "guided"}
              className={aiMode === "guided" ? "btn-primary text-xs px-2.5 py-1" : "btn-secondary text-xs px-2.5 py-1"}
              onClick={() => setAiMode("guided")}
            >
              Regenerate with instructions
            </button>
          </div>
          <p className="help">
            {aiMode === "edit"
              ? "Keeps this question and applies only the change you describe — everything else stays as it is. Works on the diagram too."
              : "Writes a brand new question in the same slot, steered by what you type below — discards the current one, unlike a fix."}
          </p>
          <textarea
            rows={2}
            className="input font-mono text-xs"
            placeholder={
              aiMode === "edit"
                ? 'e.g. "the circuit is wrong, remove the resistance values from the image"'
                : 'e.g. "make this about Ohm\'s law instead, with a short numerical"'
            }
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs px-2.5 py-1"
              onClick={applyAi}
              disabled={aiBusy || !aiInstruction.trim()}
            >
              {aiBusy ? "Working…" : "Apply"}
            </button>
            <button
              className="btn-secondary text-xs px-2.5 py-1"
              onClick={() => {
                setAiPanelOpen(false);
                setError("");
              }}
              disabled={aiBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          {q.figure && (
            <div className="flex items-center gap-3">
              <QuestionFigure figure={q.figure} />
              <button
                type="button"
                className="btn-secondary text-xs px-2.5 py-1 shrink-0"
                onClick={() => onChange({ ...q, figure: undefined })}
              >
                <Icon name="trash" className="size-3.5" />
                Remove diagram
              </button>
            </div>
          )}
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
          <QuestionFigure figure={q.figure} />
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
              className="link"
              onClick={() => setShowSolution(!showSolution)}
              aria-expanded={showSolution}
            >
              {showSolution ? "Hide answer & solution" : "Show answer & solution"}
            </button>
            <button
              className="text-muted hover:text-danger hover:underline text-xs rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
