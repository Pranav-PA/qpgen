"use client";

import { useEffect, useState } from "react";

/**
 * Numeric field that stays editable while you type.
 *
 * Clamping on every keystroke breaks normal typing: with "15" already in the
 * box, typing "45" briefly produces "1545", which a min/max clamp collapses to
 * the maximum — so the field appears to jump to 50 and refuses further edits.
 * Here the raw text is kept while focused and only normalized on blur.
 */
export default function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  fallback,
  className = "input",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value to use when the box is left empty or unparseable. */
  fallback?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Track external changes (e.g. "reuse last paper's setup") while not typing.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  function commit(raw: string) {
    const parsed = Number(raw);
    if (raw.trim() === "" || Number.isNaN(parsed)) return;
    onChange(parsed);
  }

  function normalize() {
    const parsed = Number(text);
    let next =
      text.trim() === "" || Number.isNaN(parsed) ? (fallback ?? min ?? 0) : parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setText(String(next));
    onChange(next);
  }

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      className={className}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => {
        setFocused(false);
        normalize();
      }}
    />
  );
}
