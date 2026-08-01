"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/Icon";

const STORAGE_KEY = "qpgen.support.prompt.dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // No localStorage during SSR, and none in private mode with storage off.
    return false;
  }
}

/**
 * Shown once, after a teacher has actually downloaded a paper — the point at
 * which they have got something out of QPGen. Dismissal is remembered, and the
 * card never blocks or interrupts the export itself.
 */
export default function SupportPrompt({ show }: { show: boolean }) {
  /*
   * Read lazily rather than in an effect. `show` is false on the server and on
   * the first client render — it only flips once the teacher clicks download,
   * which is always after hydration — so both renders agree on null and there
   * is no mismatch to guard against.
   */
  const [dismissed, setDismissed] = useState(wasDismissed);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode with storage disabled: the card reappears next time,
      // which is a smaller problem than crashing the review screen.
    }
  }

  if (!show || dismissed) return null;

  return (
    <div className="card p-4 mt-4 bg-accent-soft border-accent/20">
      <div className="flex items-start gap-3">
        <Icon name="heart" className="size-5 text-accent mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Got what you needed?</p>
          <p className="text-sm text-muted mt-0.5">
            QPGen is free and stays free. If it saved you time, you can chip in
            towards the domain and the AI bill.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Link href="/support" className="btn-primary text-xs">
              Support QPGen
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted hover:text-foreground"
            >
              No thanks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
