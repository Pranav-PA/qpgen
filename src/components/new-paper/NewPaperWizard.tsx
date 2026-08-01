"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { renderPdfToImages } from "@/lib/pdf";
import NumberInput from "@/components/NumberInput";
import {
  DEFAULT_INSTRUCTIONS,
  IMAGE_COST_USD,
  IMAGE_MODEL_FOR_TIER,
  MAX_FIGURE_QUESTIONS,
  MAX_LOGO_MB,
  MAX_QUESTIONS_PER_PAPER,
  MAX_REFERENCE_PDF_MB,
  MAX_REFERENCE_PDF_PAGES,
} from "@/lib/constants";
import BlueprintEditor from "./BlueprintEditor";
import {
  blueprintQuestionCount,
  blueprintTotalMarks,
  sectionGridTotal,
  subGroupTotal,
  type Blueprint,
  type InstitutionDetails,
  type PaperSettings,
  type ReferencePage,
} from "@/lib/types";

/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: PaperSettings = {
  exam_type: "NEET",
  subject: "Physics",
  chapters: [],
  question_count: 15,
  question_type: "mcq",
  difficulty: { easy_pct: 30, medium_pct: 50, hard_pct: 20 },
  marks_per_question: 4,
  negative_marks: 1,
  layout_columns: 1,
};

const DEFAULT_INSTITUTION: InstitutionDetails = {
  name: "",
  address: "",
  logo_url: null,
  exam_title: "Weekly Test",
  exam_date: "",
  exam_time: "",
  duration_minutes: 60,
  max_marks: 60,
  instructions: DEFAULT_INSTRUCTIONS,
};

type GenPhase =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "reference" }
  | { phase: "generating"; done: number; total: number }
  | { phase: "error"; message: string; paperId?: string };

export default function NewPaperWizard({
  institutionDefaults,
  lastSettings,
  lastInstitution,
  userId,
  images,
}: {
  institutionDefaults: Partial<InstitutionDetails> | null;
  lastSettings: PaperSettings | null;
  lastInstitution: InstitutionDetails | null;
  userId: string;
  images: { raster: "high" | "low" | "off" };
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<PaperSettings>(DEFAULT_SETTINGS);
  const [inst, setInst] = useState<InstitutionDetails>({
    ...DEFAULT_INSTITUTION,
    ...(institutionDefaults ?? {}),
  });
  const [maxMarksTouched, setMaxMarksTouched] = useState(false);
  const [refPages, setRefPages] = useState<ReferencePage[]>([]);
  const [refInfo, setRefInfo] = useState("");
  const [refBusy, setRefBusy] = useState(false);
  const [gen, setGen] = useState<GenPhase>({ phase: "idle" });
  const [stepError, setStepError] = useState("");

  const blueprintMode = settings.mode === "blueprint";
  const bp = settings.blueprint ?? null;

  const autoMaxMarks =
    blueprintMode && bp
      ? blueprintTotalMarks(bp)
      : settings.question_count * settings.marks_per_question;
  const effectiveMaxMarks = maxMarksTouched ? inst.max_marks : autoMaxMarks;

  function setBlueprint(next: Blueprint) {
    setSettings({
      ...settings,
      blueprint: next,
      question_count: blueprintQuestionCount(next),
      chapters: next.rows.map((r) => r.chapter.trim()).filter(Boolean),
    });
  }

  function setMode(mode: "simple" | "blueprint") {
    setStepError("");
    setSettings({ ...settings, mode });
  }

  const title = useMemo(() => {
    const examLabel =
      settings.exam_type === "Custom" && settings.exam_type_custom
        ? settings.exam_type_custom
        : settings.exam_type;
    const chapterPart =
      settings.chapters.length === 0
        ? ""
        : settings.chapters.length === 1
          ? ` — ${settings.chapters[0]}`
          : ` — ${settings.chapters[0]} +${settings.chapters.length - 1}`;
    return `${examLabel} ${settings.subject}${chapterPart}`;
  }, [settings]);

  const wantsFigures = (settings.figure_questions ?? 0) > 0;

  function applyLastPaper() {
    if (lastSettings) setSettings(lastSettings);
    if (lastInstitution) {
      setInst(lastInstitution);
      setMaxMarksTouched(true);
    }
  }

  /* ----------------------------- step validation */
  function validateStep1(): string {
    if (!settings.subject.trim()) return "Please enter a subject.";
    if (settings.exam_type === "Custom" && !settings.exam_type_custom?.trim())
      return "Describe your custom exam type (e.g. \"Class 11 unit test\").";
    const d = settings.difficulty;
    if (d.easy_pct + d.medium_pct + d.hard_pct !== 100)
      return "Difficulty percentages must add up to 100.";

    if (blueprintMode) {
      if (!bp) return "Upload a blueprint, or choose to build one by hand.";
      if (bp.rows.some((r) => !r.chapter.trim()))
        return "Every chapter row needs a name (or remove the empty rows).";
      if (bp.rows.length === 0) return "Add at least one chapter row.";
      const bad = bp.sections.filter(
        (s) => sectionGridTotal(bp, s.id) !== s.questions_to_set
      );
      if (bad.length > 0)
        return `${bad
          .map((s) => s.name)
          .join(", ")}: the chapter grid doesn't add up to the number of questions set.`;
      if (blueprintQuestionCount(bp) < 1) return "The blueprint has no questions.";
      const badSubs = bp.sections.filter(
        (s) => (s.subgroups?.length ?? 0) > 0 && subGroupTotal(s) !== s.questions_to_set
      );
      if (badSubs.length > 0)
        return `${badSubs
          .map((s) => s.name)
          .join(", ")}: the sub-group question counts don't add up to the part's total.`;
      return "";
    }

    if (settings.chapters.length === 0)
      return "Add at least one chapter or topic — questions are generated only from these.";
    return "";
  }
  function validateStep2(): string {
    if (!inst.name.trim()) return "Please enter your institution's name.";
    if (!inst.exam_title.trim()) return "Please enter an exam title.";
    return "";
  }

  function goNext() {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : "";
    if (err) {
      setStepError(err);
      return;
    }
    setStepError("");
    setStep(step + 1);
  }

  /* ----------------------------- reference PDF */
  async function handleReferenceFile(file: File | undefined) {
    setRefInfo("");
    setRefPages([]);
    if (!file) return;
    if (file.size > MAX_REFERENCE_PDF_MB * 1024 * 1024) {
      setRefInfo(
        `That PDF is over ${MAX_REFERENCE_PDF_MB} MB. Try exporting a smaller file with just the pages you want the AI to imitate.`
      );
      return;
    }
    setRefBusy(true);
    try {
      const result = await renderPdfToImages(file);
      setRefPages(result.pages);
      setRefInfo(
        result.truncated
          ? `This PDF has ${result.totalPages} pages. To keep generation fast and affordable, only the first ${MAX_REFERENCE_PDF_PAGES} pages will be used as the style reference.`
          : `${result.pages.length} page${result.pages.length === 1 ? "" : "s"} ready to use as style reference.`
      );
    } catch {
      setRefInfo(
        "We couldn't read that PDF. It may be corrupted or password-protected — try re-exporting it without a password."
      );
    } finally {
      setRefBusy(false);
    }
  }

  /* ----------------------------- logo upload */
  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStepError("The logo must be an image file (PNG or JPG).");
      return;
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setStepError(`Logo images must be under ${MAX_LOGO_MB} MB.`);
      return;
    }
    setStepError("");
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, {
      upsert: true,
    });
    if (error) {
      setStepError("Logo upload failed. You can continue without a logo and add it later.");
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setInst({ ...inst, logo_url: data.publicUrl });
  }

  /* ----------------------------- generation driver */
  async function generate() {
    if (wantsFigures) {
      const n = settings.figure_questions;
      if (!n || n < 1) {
        setStepError("Enter how many questions should have a diagram, or turn the option off.");
        return;
      }
      if (n > settings.question_count) {
        setStepError("Diagram questions can't outnumber the total questions.");
        return;
      }
    }
    setStepError("");
    setGen({ phase: "creating" });
    try {
      const createRes = await fetch("/api/papers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          settings,
          institution: { ...inst, max_marks: effectiveMaxMarks },
          has_reference: refPages.length > 0,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "Could not create the paper.");
      const paperId: string = created.paper_id;

      if (refPages.length > 0) {
        setGen({ phase: "reference" });
        const refRes = await fetch(`/api/papers/${paperId}/reference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: refPages }),
        });
        if (!refRes.ok) {
          const body = await refRes.json().catch(() => ({}));
          throw new Error(
            body.error ||
              "Reading the reference PDF failed. You can retry, or generate without it."
          );
        }
      }

      // Batched generation: each call generates + verifies one batch and
      // reports overall progress until the paper is complete.
      let done = 0;
      const total = settings.question_count;
      setGen({ phase: "generating", done, total });
      let guard = 0;
      while (done < total && guard < 25) {
        guard++;
        const res = await fetch(`/api/papers/${paperId}/generate-batch`, {
          method: "POST",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw Object.assign(
            new Error(body.error || "Generation failed part-way."),
            { paperId }
          );
        }
        done = body.questions_total as number;
        setGen({ phase: "generating", done, total });
        if (body.done) break;
      }

      router.push(`/papers/${paperId}`);
    } catch (err) {
      const e = err as Error & { paperId?: string };
      setGen({ phase: "error", message: e.message, paperId: e.paperId });
    }
  }

  /* ----------------------------- render */
  if (gen.phase !== "idle" && gen.phase !== "error") {
    const pct =
      gen.phase === "generating" && gen.total > 0
        ? Math.round((gen.done / gen.total) * 100)
        : gen.phase === "reference"
          ? 8
          : 3;
    return (
      <div className="max-w-lg mx-auto card p-8 text-center" aria-live="polite">
        <h1 className="text-lg font-semibold mb-2">Generating your paper</h1>
        <p className="text-sm text-muted mb-6">
          {gen.phase === "creating" && "Setting things up…"}
          {gen.phase === "reference" &&
            "Reading your reference PDF to learn its style and difficulty…"}
          {gen.phase === "generating" &&
            `Generated and verified ${gen.done} of ${gen.total} questions…`}
        </p>
        <div className="h-2 rounded-full bg-background overflow-hidden border border-line">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
        <p className="help mt-4">
          Each batch is generated, then independently re-solved by a second AI
          pass to check correctness and chapter scope. This takes a minute or
          two — please keep this tab open.
        </p>
      </div>
    );
  }

  if (gen.phase === "error") {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center">
        <h1 className="text-lg font-semibold mb-2 text-danger">Generation problem</h1>
        <p className="text-sm text-muted mb-6">{gen.message}</p>
        <div className="flex justify-center gap-3">
          {gen.paperId ? (
            <a href={`/papers/${gen.paperId}`} className="btn-primary">
              Review questions generated so far
            </a>
          ) : (
            <button className="btn-primary" onClick={() => setGen({ phase: "idle" })}>
              Back to setup
            </button>
          )}
          <button className="btn-secondary" onClick={() => setGen({ phase: "idle" })}>
            Adjust settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">New question paper</h1>
        {(lastSettings || lastInstitution) && step === 1 && (
          <button className="btn-secondary text-xs" onClick={applyLastPaper}>
            ↺ Reuse last paper&apos;s setup
          </button>
        )}
      </div>

      <ol className="flex items-center gap-2 text-xs mb-6" aria-label="Progress">
        {["Exam & questions", "Institution & letterhead", "Reference & generate"].map(
          (label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`badge ${
                  step === i + 1
                    ? "bg-accent text-white"
                    : step > i + 1
                      ? "bg-ok-soft text-ok"
                      : "bg-background text-muted border border-line"
                }`}
              >
                {step > i + 1 ? "✓" : i + 1} {label}
              </span>
              {i < 2 && <span className="text-line">—</span>}
            </li>
          )
        )}
      </ol>

      <div className="card p-6 sm:p-8">
        {step === 1 && (
          <StepExam
            settings={settings}
            setSettings={setSettings}
            blueprintMode={blueprintMode}
            setMode={setMode}
            setBlueprint={setBlueprint}
          />
        )}
        {step === 2 && (
          <StepInstitution
            inst={inst}
            setInst={setInst}
            autoMaxMarks={autoMaxMarks}
            maxMarksTouched={maxMarksTouched}
            setMaxMarksTouched={setMaxMarksTouched}
            onLogoFile={handleLogoFile}
          />
        )}
        {step === 3 && (
          <StepReference
            refPages={refPages}
            refInfo={refInfo}
            refBusy={refBusy}
            onFile={handleReferenceFile}
            onClear={() => {
              setRefPages([]);
              setRefInfo("");
            }}
            extraInstructions={settings.extra_instructions ?? ""}
            onExtraInstructions={(v) =>
              setSettings((s) => ({ ...s, extra_instructions: v }))
            }
            setSettings={setSettings}
            images={images}
            title={title}
            settings={settings}
            maxMarks={effectiveMaxMarks}
          />
        )}

        {stepError && (
          <p role="alert" className="mt-4 text-sm text-danger bg-danger-soft border border-danger/20 rounded-lg px-3 py-2">
            {stepError}
          </p>
        )}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button className="btn-secondary" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button className="btn-primary" onClick={goNext}>
              Continue →
            </button>
          ) : (
            <button className="btn-primary" onClick={generate} disabled={refBusy}>
              Generate paper ✨
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 1 — exam & question settings                                   */

function StepExam({
  settings,
  setSettings,
  blueprintMode,
  setMode,
  setBlueprint,
}: {
  settings: PaperSettings;
  setSettings: (s: PaperSettings) => void;
  blueprintMode: boolean;
  setMode: (m: "simple" | "blueprint") => void;
  setBlueprint: (b: Blueprint) => void;
}) {
  const [chapterInput, setChapterInput] = useState("");
  const supportsBlueprint =
    settings.exam_type === "Board" || settings.exam_type === "Custom";

  function addChapter() {
    const parts = chapterInput
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = [...settings.chapters];
    for (const p of parts) if (!merged.includes(p)) merged.push(p);
    setSettings({ ...settings, chapters: merged.slice(0, 10) });
    setChapterInput("");
  }

  const diffSum =
    settings.difficulty.easy_pct +
    settings.difficulty.medium_pct +
    settings.difficulty.hard_pct;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="examType" className="label">Exam type</label>
          <select
            id="examType"
            className="input"
            value={settings.exam_type}
            onChange={(e) =>
              setSettings({
                ...settings,
                exam_type: e.target.value as PaperSettings["exam_type"],
              })
            }
          >
            <option value="JEE">JEE</option>
            <option value="NEET">NEET</option>
            <option value="Board">Board</option>
            <option value="Custom">Custom…</option>
          </select>
          {settings.exam_type === "Custom" && (
            <input
              aria-label="Custom exam type"
              className="input mt-2"
              placeholder='e.g. "Class 11 unit test"'
              value={settings.exam_type_custom ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, exam_type_custom: e.target.value })
              }
            />
          )}
        </div>
        <div>
          <label htmlFor="subject" className="label">Subject</label>
          <input
            id="subject"
            className="input"
            list="subject-options"
            value={settings.subject}
            onChange={(e) => setSettings({ ...settings, subject: e.target.value })}
          />
          <datalist id="subject-options">
            <option value="Physics" />
            <option value="Chemistry" />
            <option value="Biology" />
            <option value="Mathematics" />
          </datalist>
        </div>
      </div>

      {supportsBlueprint && (
        <fieldset className="border border-line rounded-lg p-3">
          <legend className="text-xs text-muted px-1">Paper structure</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={blueprintMode ? "btn-secondary text-xs" : "btn-primary text-xs"}
              onClick={() => setMode("simple")}
            >
              Simple — one question type
            </button>
            <button
              type="button"
              className={blueprintMode ? "btn-primary text-xs" : "btn-secondary text-xs"}
              onClick={() => setMode("blueprint")}
            >
              Follow a blueprint (Parts A, B, C…)
            </button>
          </div>
          <p className="help mt-2">
            {blueprintMode
              ? "Questions follow your board's blueprint: each part gets its own marks, question type and chapter-wise quota."
              : "All questions share one type and mark value — good for JEE/NEET-style practice papers."}
          </p>
        </fieldset>
      )}

      {blueprintMode ? (
        <BlueprintEditor blueprint={settings.blueprint ?? null} setBlueprint={setBlueprint} />
      ) : (
      <>
      <div>
        <label htmlFor="chapters" className="label">Chapters / topics</label>
        <div className="flex gap-2">
          <input
            id="chapters"
            className="input"
            placeholder='e.g. "Laws of Motion" — press Enter to add'
            value={chapterInput}
            onChange={(e) => setChapterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChapter();
              }
            }}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={addChapter}>
            Add
          </button>
        </div>
        <p className="help">
          Questions are generated <strong>only</strong> from these chapters. Be
          specific — &ldquo;Genetics: Mendelian inheritance&rdquo; beats &ldquo;Biology&rdquo;.
        </p>
        {settings.chapters.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-2">
            {settings.chapters.map((c) => (
              <li key={c} className="badge bg-accent-soft text-accent">
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  className="hover:text-danger"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      chapters: settings.chapters.filter((x) => x !== c),
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="qcount" className="label">Number of questions</label>
          <NumberInput
            id="qcount"
            min={1}
            max={MAX_QUESTIONS_PER_PAPER}
            fallback={1}
            value={settings.question_count}
            onChange={(n) => setSettings({ ...settings, question_count: n })}
          />
          <p className="help">Up to {MAX_QUESTIONS_PER_PAPER} per paper.</p>
        </div>
        <div>
          <label htmlFor="qtype" className="label">Question type</label>
          <select
            id="qtype"
            className="input"
            value={settings.question_type}
            onChange={(e) =>
              setSettings({
                ...settings,
                question_type: e.target.value as PaperSettings["question_type"],
              })
            }
          >
            <option value="mcq">MCQ (single correct)</option>
            <option value="numerical">Numerical answer</option>
            <option value="assertion_reason">Assertion–Reason</option>
            <option value="one_word">One word / fill in the blank</option>
            <option value="short_answer">Short answer</option>
            <option value="long_answer">Long answer</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      </div>
      </>
      )}

      <fieldset>
        <legend className="label">Difficulty mix (%)</legend>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["easy_pct", "Easy"],
              ["medium_pct", "Medium"],
              ["hard_pct", "Hard"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={key} className="text-xs text-muted">{label}</label>
              <NumberInput
                id={key}
                min={0}
                max={100}
                step={5}
                fallback={0}
                value={settings.difficulty[key]}
                onChange={(n) =>
                  setSettings({
                    ...settings,
                    difficulty: { ...settings.difficulty, [key]: n },
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className={`help ${diffSum !== 100 ? "text-danger" : ""}`}>
          Total: {diffSum}% {diffSum !== 100 && "— must add up to 100"}
        </p>
      </fieldset>

      {!blueprintMode && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="marks" className="label">Marks per question</label>
            <NumberInput
              id="marks"
              min={0.5}
              max={20}
              step={0.5}
              fallback={1}
              value={settings.marks_per_question}
              onChange={(n) => setSettings({ ...settings, marks_per_question: n })}
            />
          </div>
          <div>
            <label htmlFor="negmarks" className="label">Negative marks</label>
            <NumberInput
              id="negmarks"
              min={0}
              max={10}
              step={0.25}
              fallback={0}
              value={settings.negative_marks}
              onChange={(n) => setSettings({ ...settings, negative_marks: n })}
            />
            <p className="help">E.g. JEE/NEET pattern is +4 / −1.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Step 2 — institution / letterhead                                   */

function StepInstitution({
  inst,
  setInst,
  autoMaxMarks,
  maxMarksTouched,
  setMaxMarksTouched,
  onLogoFile,
}: {
  inst: InstitutionDetails;
  setInst: (i: InstitutionDetails) => void;
  autoMaxMarks: number;
  maxMarksTouched: boolean;
  setMaxMarksTouched: (b: boolean) => void;
  onLogoFile: (f: File | undefined) => void;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted -mt-1">
        These details appear on the paper&apos;s letterhead and are saved as your
        defaults for next time.
      </p>
      <div>
        <label htmlFor="instName" className="label">College / institute name</label>
        <input
          id="instName"
          className="input"
          value={inst.name}
          onChange={(e) => setInst({ ...inst, name: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="instAddr" className="label">Address <span className="text-muted font-normal">(optional)</span></label>
        <input
          id="instAddr"
          className="input"
          value={inst.address}
          onChange={(e) => setInst({ ...inst, address: e.target.value })}
        />
      </div>
      <div>
        <span className="label">Logo <span className="text-muted font-normal">(optional)</span></span>
        <div className="flex items-center gap-3">
          {inst.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inst.logo_url} alt="Institution logo" className="h-12 w-12 object-contain border border-line rounded-lg bg-white" />
          )}
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onLogoFile(e.target.files?.[0])}
          />
          <button type="button" className="btn-secondary text-sm" onClick={() => logoInput.current?.click()}>
            {inst.logo_url ? "Replace logo" : "Upload logo"}
          </button>
          {inst.logo_url && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setInst({ ...inst, logo_url: null })}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="examTitle" className="label">Exam title</label>
          <input
            id="examTitle"
            className="input"
            placeholder='e.g. "Weekly Test 5 — Genetics"'
            value={inst.exam_title}
            onChange={(e) => setInst({ ...inst, exam_title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="examDate" className="label">Exam date</label>
          <input
            id="examDate"
            type="date"
            className="input"
            value={inst.exam_date}
            onChange={(e) => setInst({ ...inst, exam_date: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="examTime" className="label">Start time</label>
          <input
            id="examTime"
            type="time"
            className="input"
            value={inst.exam_time}
            onChange={(e) => setInst({ ...inst, exam_time: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="duration" className="label">Duration (minutes)</label>
          <NumberInput
            id="duration"
            min={5}
            max={600}
            fallback={60}
            value={inst.duration_minutes}
            onChange={(n) => setInst({ ...inst, duration_minutes: n })}
          />
        </div>
      </div>

      <div>
        <label htmlFor="maxMarks" className="label">Maximum marks</label>
        <NumberInput
          id="maxMarks"
          min={1}
          max={2000}
          fallback={autoMaxMarks}
          value={maxMarksTouched ? inst.max_marks : autoMaxMarks}
          onChange={(n) => {
            setMaxMarksTouched(true);
            setInst({ ...inst, max_marks: n });
          }}
        />
        <p className="help">
          Auto-calculated as questions × marks ({autoMaxMarks}); edit if your
          paper has sections with different weights.
        </p>
      </div>

      <div>
        <label htmlFor="instructions" className="label">General instructions</label>
        <textarea
          id="instructions"
          rows={5}
          className="input font-mono text-xs leading-relaxed"
          value={inst.instructions}
          onChange={(e) => setInst({ ...inst, instructions: e.target.value })}
        />
        <p className="help">Shown at the top of the question paper. Edit freely.</p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 3 — optional reference + summary                               */

function StepReference({
  refPages,
  refInfo,
  refBusy,
  onFile,
  onClear,
  extraInstructions,
  onExtraInstructions,
  setSettings,
  images,
  title,
  settings,
  maxMarks,
}: {
  refPages: ReferencePage[];
  refInfo: string;
  refBusy: boolean;
  onFile: (f: File | undefined) => void;
  onClear: () => void;
  extraInstructions: string;
  onExtraInstructions: (v: string) => void;
  setSettings: Dispatch<SetStateAction<PaperSettings>>;
  images: { raster: "high" | "low" | "off" };
  title: string;
  settings: PaperSettings;
  maxMarks: number;
}) {
  const wantsFigures = (settings.figure_questions ?? 0) > 0;
  const figureModel = images.raster !== "off" ? IMAGE_MODEL_FOR_TIER[images.raster] : null;
  const figureCostEach = figureModel ? IMAGE_COST_USD[figureModel] ?? 0 : 0;
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold mb-1">Reference PDF <span className="text-muted font-normal text-sm">(optional)</span></h2>
        <p className="text-sm text-muted mb-3">
          Upload a past paper or textbook excerpt and the AI will mirror its
          style and difficulty. Pages are read visually — equations and
          diagrams included — and are <strong>not stored</strong> after
          generation. First {MAX_REFERENCE_PDF_PAGES} pages only.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInput.current?.click()}
            disabled={refBusy}
          >
            {refBusy ? "Reading PDF…" : refPages.length > 0 ? "Replace PDF" : "Choose PDF"}
          </button>
          {refPages.length > 0 && (
            <button type="button" className="btn-secondary" onClick={onClear}>
              Remove
            </button>
          )}
        </div>
        {refInfo && <p className="help mt-2">{refInfo}</p>}
        {refPages.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {refPages.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.page}
                src={p.data_url}
                alt={`Reference page ${p.page}`}
                className="h-24 border border-line rounded shadow-sm"
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line pt-5">
        <label htmlFor="extra-instructions" className="font-semibold block mb-1">
          Anything specific?{" "}
          <span className="text-muted font-normal text-sm">(optional)</span>
        </label>
        <p className="text-sm text-muted mb-3">
          {refPages.length > 0
            ? "Tell the AI how to use your reference — which part to draw from, or what to leave out."
            : "Tell the AI anything extra about the questions you want."}
        </p>
        <textarea
          id="extra-instructions"
          className="input min-h-20"
          rows={3}
          maxLength={1000}
          value={extraInstructions}
          onChange={(e) => onExtraInstructions(e.target.value)}
          placeholder={
            refPages.length > 0
              ? "e.g. Only use questions from Section B. Keep the numerical style but change all the values."
              : "e.g. Focus on application questions rather than definitions. No questions needing diagrams."
          }
        />
        <p className="help mt-1">
          This narrows what gets generated — it cannot change the chapters,
          question count or marks you set earlier.
        </p>
      </div>

      <div className="border-t border-line pt-5">
        <h2 className="font-semibold mb-1">Diagram questions</h2>
        {images.raster === "off" ? (
          <p className="text-sm text-muted">
            Diagram questions are currently switched off by the administrator.
            Every question will be text-only; you can still attach your own
            image while reviewing a question afterwards.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted mb-3">
              Some questions can carry an AI-generated diagram — a circuit, a
              labelled figure, a graph. Unlike the rest of generation, each one
              is billed per image, so you choose exactly how many.
              {images.raster === "low" && (
                <> Running on the low-cost model at the moment, so image
                quality may be rougher than usual.</>
              )}
            </p>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={wantsFigures}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSettings((s) => ({
                    ...s,
                    figure_questions: checked
                      ? Math.min(2, s.question_count, MAX_FIGURE_QUESTIONS)
                      : undefined,
                  }));
                }}
              />
              <span>Include diagram questions</span>
            </label>
            {wantsFigures && (
              <div className="flex items-center gap-3">
                <label htmlFor="figure-count" className="label text-xs">
                  How many of the {settings.question_count} questions?
                </label>
                <NumberInput
                  id="figure-count"
                  className="input w-24"
                  value={settings.figure_questions ?? 1}
                  min={1}
                  max={Math.min(settings.question_count, MAX_FIGURE_QUESTIONS)}
                  fallback={1}
                  onChange={(n) =>
                    setSettings((s) => ({ ...s, figure_questions: n }))
                  }
                />
                {figureModel && (
                  <span className="help">
                    ≈ ${(figureCostEach * (settings.figure_questions ?? 0)).toFixed(2)}{" "}
                    for this paper&apos;s images
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-line pt-5">
        <h2 className="font-semibold mb-1">Page layout</h2>
        <p className="text-sm text-muted mb-3">
          How questions are arranged on the printed page. Two columns fit more
          per page — good for short MCQs. One column reads better for long or
          diagram-heavy questions.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={(settings.layout_columns ?? 1) === 1 ? "btn-primary text-xs" : "btn-secondary text-xs"}
            onClick={() => setSettings((s) => ({ ...s, layout_columns: 1 }))}
          >
            1 column
          </button>
          <button
            type="button"
            className={settings.layout_columns === 2 ? "btn-primary text-xs" : "btn-secondary text-xs"}
            onClick={() => setSettings((s) => ({ ...s, layout_columns: 2 }))}
          >
            2 columns
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h2 className="font-semibold mb-3">Ready to generate</h2>
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Paper</dt>
          <dd className="font-medium">{title}</dd>
          <dt className="text-muted">Chapters</dt>
          <dd>{settings.chapters.join(", ") || "—"}</dd>
          <dt className="text-muted">Questions</dt>
          <dd>
            {settings.mode === "blueprint" && settings.blueprint ? (
              <>
                {settings.question_count} printed across{" "}
                {settings.blueprint.sections.length} parts (
                {settings.blueprint.sections
                  .map(
                    (s) =>
                      `${s.name}: ${s.questions_to_answer}/${s.questions_to_set} × ${s.marks_per_question}m`
                  )
                  .join(", ")}
                ), {maxMarks} marks total
              </>
            ) : (
              <>
                {settings.question_count} ×{" "}
                {settings.question_type === "mixed"
                  ? "mixed types"
                  : settings.question_type.replace("_", " ")}
                , +{settings.marks_per_question}/−{settings.negative_marks},{" "}
                {maxMarks} marks total
              </>
            )}
          </dd>
          <dt className="text-muted">Difficulty</dt>
          <dd>
            {settings.difficulty.easy_pct}% easy · {settings.difficulty.medium_pct}% medium ·{" "}
            {settings.difficulty.hard_pct}% hard
          </dd>
          <dt className="text-muted">Page layout</dt>
          <dd>{settings.layout_columns === 2 ? "2 columns" : "1 column"}</dd>
        </dl>
        <p className="help mt-3">
          Generation takes a minute or two. Every question is double-checked by
          a second AI pass, and you review everything before export.
        </p>
      </div>
    </div>
  );
}
