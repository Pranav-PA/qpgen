"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface PaperRow {
  id: string;
  title: string;
  exam_type: string;
  subject: string;
  chapters: string[];
  status: string;
  created_at: string;
  question_count: number;
  flagged: number;
}

export default function PaperList({ papers }: { papers: PaperRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(id: string) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Could not delete that paper. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {papers.map((p) => (
        <div key={p.id} className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52">
            <Link href={`/papers/${p.id}`} className="font-semibold hover:text-accent">
              {p.title}
            </Link>
            <p className="text-xs text-muted mt-0.5">
              {p.exam_type} · {p.subject} · {p.chapters.join(", ")} ·{" "}
              {p.question_count} questions ·{" "}
              {new Date(p.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          {p.flagged > 0 && (
            <span className="badge bg-warn-soft text-warn border border-warn/30">
              ⚠ {p.flagged} to review
            </span>
          )}
          <span
            className={`badge ${
              p.status === "finalized"
                ? "bg-ok-soft text-ok"
                : "bg-background border border-line text-muted"
            }`}
          >
            {p.status === "finalized" ? "Finalized" : "Draft"}
          </span>
          <div className="flex gap-2">
            <Link href={`/papers/${p.id}`} className="btn-secondary text-xs">
              Open
            </Link>
            {confirming === p.id ? (
              <>
                <button
                  className="btn-danger text-xs"
                  onClick={() => remove(p.id)}
                  disabled={busy === p.id}
                >
                  {busy === p.id ? "Deleting…" : "Confirm delete"}
                </button>
                <button className="btn-secondary text-xs" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn-secondary text-xs"
                onClick={() => setConfirming(p.id)}
                aria-label={`Delete ${p.title}`}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
