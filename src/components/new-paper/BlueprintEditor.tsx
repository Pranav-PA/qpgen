"use client";

import { useRef, useState } from "react";
import NumberInput from "@/components/NumberInput";
import { renderPdfToImages } from "@/lib/pdf";
import { MAX_BLUEPRINT_PAGES, MAX_BLUEPRINT_SECTIONS } from "@/lib/constants";
import {
  QUESTION_TYPE_LABELS,
  blueprintQuestionCount,
  blueprintTotalMarks,
  defaultSectionInstruction,
  defaultTypeForMarks,
  sectionGridTotal,
  subGroupTotal,
  type Blueprint,
  type QuestionType,
} from "@/lib/types";

const TYPE_OPTIONS = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

function emptyBlueprint(): Blueprint {
  return {
    sections: [
      {
        id: "part_a",
        name: "PART-A",
        marks_per_question: 1,
        questions_to_set: 10,
        questions_to_answer: 10,
        question_type: "mcq",
      },
    ],
    rows: [{ chapter: "", counts: { part_a: 0 } }],
  };
}

export default function BlueprintEditor({
  blueprint,
  setBlueprint,
}: {
  blueprint: Blueprint | null;
  setBlueprint: (b: Blueprint) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bp = blueprint;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setInfo("");
    setBusy(true);
    try {
      let pages: { page: number; data_url: string }[];

      if (file.type === "application/pdf") {
        const rendered = await renderPdfToImages(file);
        pages = rendered.pages.slice(0, MAX_BLUEPRINT_PAGES);
      } else if (file.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("read failed"));
          r.readAsDataURL(file);
        });
        pages = [{ page: 1, data_url: dataUrl }];
      } else {
        setInfo("Please choose an image or a PDF of the blueprint.");
        return;
      }

      const res = await fetch("/api/blueprint/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not read the blueprint.");

      setBlueprint(body.blueprint as Blueprint);
      setInfo(
        `Read ${body.blueprint.sections.length} parts and ${body.blueprint.rows.length} chapters. Check every number below before generating — the reading is not guaranteed to be perfect.`
      );
    } catch (err) {
      setInfo(err instanceof Error ? err.message : "Could not read the blueprint.");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------- section mutations */
  function updateSection(id: string, patch: Partial<Blueprint["sections"][number]>) {
    if (!bp) return;
    setBlueprint({
      ...bp,
      sections: bp.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function addSection() {
    if (!bp || bp.sections.length >= MAX_BLUEPRINT_SECTIONS) return;
    const n = bp.sections.length;
    const id = `part_${String.fromCharCode(97 + n)}`;
    const marks = 1;
    setBlueprint({
      sections: [
        ...bp.sections,
        {
          id,
          name: `PART-${String.fromCharCode(65 + n)}`,
          marks_per_question: marks,
          questions_to_set: 5,
          questions_to_answer: 5,
          question_type: defaultTypeForMarks(marks),
        },
      ],
      rows: bp.rows.map((r) => ({ ...r, counts: { ...r.counts, [id]: 0 } })),
    });
  }

  function removeSection(id: string) {
    if (!bp || bp.sections.length <= 1) return;
    setBlueprint({
      sections: bp.sections.filter((s) => s.id !== id),
      rows: bp.rows.map((r) => {
        const counts = { ...r.counts };
        delete counts[id];
        return { ...r, counts };
      }),
    });
  }

  /* ---------------------------------------------------- row mutations */
  function updateRow(index: number, chapter: string) {
    if (!bp) return;
    setBlueprint({
      ...bp,
      rows: bp.rows.map((r, i) => (i === index ? { ...r, chapter } : r)),
    });
  }

  function updateCount(index: number, sectionId: string, value: number) {
    if (!bp) return;
    setBlueprint({
      ...bp,
      rows: bp.rows.map((r, i) =>
        i === index ? { ...r, counts: { ...r.counts, [sectionId]: value } } : r
      ),
    });
  }

  function addRow() {
    if (!bp) return;
    const counts: Record<string, number> = {};
    for (const s of bp.sections) counts[s.id] = 0;
    setBlueprint({ ...bp, rows: [...bp.rows, { chapter: "", counts }] });
  }

  function removeRow(index: number) {
    if (!bp || bp.rows.length <= 1) return;
    setBlueprint({ ...bp, rows: bp.rows.filter((_, i) => i !== index) });
  }

  /* ------------------------------------------------------------ render */
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold mb-1">Blueprint</h2>
        <p className="text-sm text-muted mb-3">
          Upload your board&apos;s blueprint and we&apos;ll read the parts and the
          chapter-wise question grid for you. You can correct anything
          afterwards, or build it by hand.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            {busy ? "Reading blueprint…" : "📄 Upload blueprint"}
          </button>
          {!bp && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setBlueprint(emptyBlueprint())}
            >
              Build it by hand
            </button>
          )}
        </div>
        {info && <p className="help mt-2">{info}</p>}
      </div>

      {bp && (
        <>
          <SectionsTable
            bp={bp}
            onUpdate={updateSection}
            onAdd={addSection}
            onRemove={removeSection}
          />
          <ChapterGrid
            bp={bp}
            onChapter={updateRow}
            onCount={updateCount}
            onAddRow={addRow}
            onRemoveRow={removeRow}
          />
          <Totals bp={bp} />
        </>
      )}
    </div>
  );
}

/* ================================================================== */

function SectionsTable({
  bp,
  onUpdate,
  onAdd,
  onRemove,
}: {
  bp: Blueprint;
  onUpdate: (id: string, patch: Partial<Blueprint["sections"][number]>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Parts of the paper</h3>
      <div className="space-y-3">
        {bp.sections.map((s) => (
          <div key={s.id} className="border border-line rounded-lg p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <div>
                <label className="text-xs text-muted">Name</label>
                <input
                  className="input"
                  aria-label={`Name of ${s.name}`}
                  value={s.name}
                  onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted">Marks each</label>
                <NumberInput
                  className="input w-24"
                  aria-label={`Marks per question in ${s.name}`}
                  min={0.5}
                  max={50}
                  step={0.5}
                  fallback={1}
                  value={s.marks_per_question}
                  onChange={(n) =>
                    onUpdate(s.id, {
                      marks_per_question: n,
                      question_type: defaultTypeForMarks(n),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted">Qs set</label>
                <NumberInput
                  className="input w-20"
                  aria-label={`Questions set in ${s.name}`}
                  min={1}
                  max={80}
                  fallback={1}
                  value={s.questions_to_set}
                  onChange={(n) =>
                    onUpdate(s.id, {
                      questions_to_set: n,
                      questions_to_answer: Math.min(s.questions_to_answer, n),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted">Qs answered</label>
                <NumberInput
                  className="input w-20"
                  aria-label={`Questions answered in ${s.name}`}
                  min={1}
                  max={s.questions_to_set}
                  fallback={1}
                  value={s.questions_to_answer}
                  onChange={(n) => onUpdate(s.id, { questions_to_answer: n })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] mt-3">
              <div>
                <label className="text-xs text-muted">Question type</label>
                <select
                  className="input"
                  aria-label={`Question type for ${s.name}`}
                  value={s.question_type}
                  onChange={(e) =>
                    onUpdate(s.id, { question_type: e.target.value as QuestionType })
                  }
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={() => onRemove(s.id)}
                  disabled={bp.sections.length <= 1}
                >
                  Remove part
                </button>
              </div>
            </div>

            <SubGroups section={s} onUpdate={onUpdate} />

            <p className="help mt-2">
              Prints as: <em>{s.instruction?.trim() || defaultSectionInstruction(s)}</em>
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary text-xs mt-3"
        onClick={onAdd}
        disabled={bp.sections.length >= MAX_BLUEPRINT_SECTIONS}
      >
        + Add part
      </button>
    </div>
  );
}

/* ================================================================== */

/**
 * Optional split of a part into labelled runs — Karnataka's PART-A prints
 * "I. Pick the correct option" for questions 1–15 then "II. Fill in the
 * blanks" for 16–20. The chapter grid still allocates at part level.
 */
function SubGroups({
  section: s,
  onUpdate,
}: {
  section: Blueprint["sections"][number];
  onUpdate: (id: string, patch: Partial<Blueprint["sections"][number]>) => void;
}) {
  const groups = s.subgroups ?? [];
  const total = subGroupTotal(s);
  const balanced = total === s.questions_to_set;

  function enable() {
    onUpdate(s.id, {
      subgroups: [
        { id: "g1", label: "I. Pick the correct option", question_type: s.question_type, count: s.questions_to_set },
      ],
    });
  }

  function patch(idx: number, next: Partial<Blueprint["sections"][number]["subgroups"] extends (infer U)[] | undefined ? U : never>) {
    onUpdate(s.id, {
      subgroups: groups.map((g, i) => (i === idx ? { ...g, ...next } : g)),
    });
  }

  if (groups.length === 0) {
    return (
      <button type="button" className="btn-secondary text-xs mt-3" onClick={enable}>
        + Split this part into sub-groups
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs font-medium mb-2">Sub-groups within {s.name}</p>
      <div className="space-y-2">
        {groups.map((g, i) => (
          <div key={g.id} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] items-end">
            <div>
              <label className="text-xs text-muted">Heading</label>
              <input
                className="input text-sm"
                aria-label={`Sub-group ${i + 1} heading`}
                value={g.label}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Type</label>
              <select
                className="input text-sm"
                aria-label={`Sub-group ${i + 1} question type`}
                value={g.question_type}
                onChange={(e) => patch(i, { question_type: e.target.value as QuestionType })}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Qs</label>
              <NumberInput
                className="input text-sm w-20"
                aria-label={`Sub-group ${i + 1} question count`}
                min={1}
                max={s.questions_to_set}
                fallback={1}
                value={g.count}
                onChange={(n) => patch(i, { count: n })}
              />
            </div>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() =>
                onUpdate(s.id, {
                  subgroups: groups.length <= 1 ? undefined : groups.filter((_, x) => x !== i),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() =>
            onUpdate(s.id, {
              subgroups: [
                ...groups,
                {
                  id: `g${groups.length + 1}`,
                  label: `${["I", "II", "III", "IV"][groups.length] ?? groups.length + 1}. `,
                  question_type: s.question_type,
                  count: Math.max(1, s.questions_to_set - total),
                },
              ],
            })
          }
        >
          + Add sub-group
        </button>
        <span className={`text-xs ${balanced ? "text-ok" : "text-danger"}`}>
          {total} / {s.questions_to_set} questions {balanced ? "✓" : "— must match"}
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */

function ChapterGrid({
  bp,
  onChapter,
  onCount,
  onAddRow,
  onRemoveRow,
}: {
  bp: Blueprint;
  onChapter: (i: number, v: string) => void;
  onCount: (i: number, sectionId: string, v: number) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">Chapter-wise question grid</h3>
      <p className="help mb-2">
        How many questions each chapter contributes to each part. A column that
        doesn&apos;t match its target is highlighted.
      </p>
      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-background text-xs text-muted">
              <th className="text-left font-medium p-2">Chapter</th>
              {bp.sections.map((s) => (
                <th key={s.id} className="font-medium p-2 w-20 text-center">
                  {s.name}
                  <div className="font-normal">({s.marks_per_question}m)</div>
                </th>
              ))}
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bp.rows.map((row, i) => (
              <tr key={i}>
                <td className="p-1.5">
                  <input
                    className="input text-sm"
                    aria-label={`Chapter name, row ${i + 1}`}
                    placeholder="Chapter name"
                    value={row.chapter}
                    onChange={(e) => onChapter(i, e.target.value)}
                  />
                </td>
                {bp.sections.map((s) => (
                  <td key={s.id} className="p-1.5 text-center">
                    <NumberInput
                      className="input text-sm text-center px-1"
                      aria-label={`${row.chapter || `Row ${i + 1}`} questions in ${s.name}`}
                      min={0}
                      max={50}
                      fallback={0}
                      value={row.counts[s.id] ?? 0}
                      onChange={(n) => onCount(i, s.id, n)}
                    />
                  </td>
                ))}
                <td className="p-1.5 text-center">
                  <button
                    type="button"
                    className="text-muted hover:text-danger text-lg leading-none"
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() => onRemoveRow(i)}
                    disabled={bp.rows.length <= 1}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-background text-xs">
              <td className="p-2 font-medium">Total / target</td>
              {bp.sections.map((s) => {
                const total = sectionGridTotal(bp, s.id);
                const ok = total === s.questions_to_set;
                return (
                  <td
                    key={s.id}
                    className={`p-2 text-center font-medium ${
                      ok ? "text-ok" : "text-danger"
                    }`}
                  >
                    {total} / {s.questions_to_set}
                    {!ok && <div className="font-normal">✗</div>}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" className="btn-secondary text-xs mt-3" onClick={onAddRow}>
        + Add chapter
      </button>
    </div>
  );
}

/* ================================================================== */

function Totals({ bp }: { bp: Blueprint }) {
  const mismatches = bp.sections.filter(
    (s) => sectionGridTotal(bp, s.id) !== s.questions_to_set
  );
  return (
    <div className="border-t border-line pt-4">
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">Questions printed</dt>
        <dd className="font-medium">{blueprintQuestionCount(bp)}</dd>
        <dt className="text-muted">Maximum marks</dt>
        <dd className="font-medium">{blueprintTotalMarks(bp)}</dd>
      </dl>
      {mismatches.length > 0 && (
        <p
          role="alert"
          className="mt-3 text-sm text-danger bg-danger-soft border border-danger/20 rounded-lg px-3 py-2"
        >
          {mismatches.map((s) => s.name).join(", ")}:
          the chapter grid doesn&apos;t add up to the number of questions set.
          Fix the counts before generating, or the paper won&apos;t match your
          blueprint.
        </p>
      )}
    </div>
  );
}
