"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

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

type StatusFilter = "all" | "draft" | "finalized" | "flagged";
type SortKey = "newest" | "oldest" | "title";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "finalized", label: "Finalized" },
  { value: "flagged", label: "Needs review" },
];

/**
 * Below this many papers the whole toolbar is noise — you can see every paper
 * on one screen. It appears once a teacher has enough history to need it.
 */
const TOOLBAR_THRESHOLD = 5;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PaperList({ papers }: { papers: PaperRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const subjects = useMemo(
    () => [...new Set(papers.map((p) => p.subject).filter(Boolean))].sort(),
    [papers]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = papers.filter((p) => {
      if (subject !== "all" && p.subject !== subject) return false;
      if (status === "draft" && p.status === "finalized") return false;
      if (status === "finalized" && p.status !== "finalized") return false;
      if (status === "flagged" && p.flagged === 0) return false;
      if (!needle) return true;
      // Chapters are searched too: teachers remember "the Optics one", not the
      // title they auto-accepted three months ago.
      return [p.title, p.subject, p.exam_type, ...p.chapters]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return matched.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const delta =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "oldest" ? delta : -delta;
    });
  }, [papers, query, status, subject, sort]);

  const filtering = query.trim() !== "" || status !== "all" || subject !== "all";
  const showToolbar = papers.length >= TOOLBAR_THRESHOLD;

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setSubject("all");
  }

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
    <div className="space-y-4">
      {showToolbar && (
        <div className="card p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-52">
            <label htmlFor="paper-search" className="sr-only">
              Search your papers
            </label>
            <div className="relative">
              <Icon
                name="search"
                className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                id="paper-search"
                type="search"
                className="input pl-9"
                placeholder="Search by title, subject or chapter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {subjects.length > 1 && (
            <div>
              <label htmlFor="paper-subject" className="sr-only">
                Filter by subject
              </label>
              <select
                id="paper-subject"
                className="input w-auto"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="all">All subjects</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="paper-sort" className="sr-only">
              Sort papers
            </label>
            <select
              id="paper-sort"
              className="input w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>

          <div
            className="flex flex-wrap items-center gap-1 w-full"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(option.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? "bg-accent text-accent-contrast"
                      : "bg-background border border-line text-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            {filtering && (
              <button
                type="button"
                onClick={clearFilters}
                className="link text-xs ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {showToolbar && (
        <p className="text-xs text-muted" role="status">
          Showing {visible.length} of {papers.length} papers
        </p>
      )}

      {visible.length === 0 ? (
        <div className="card p-10 text-center">
          <h2 className="font-semibold mb-1">No papers match those filters</h2>
          <p className="text-sm text-muted mb-4">
            Try a different search term, or clear the filters to see everything.
          </p>
          <button className="btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-52">
                  <Link
                    href={`/papers/${p.id}`}
                    className="font-semibold hover:text-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted mt-1">
                    {p.exam_type} · {p.subject} · {p.question_count} question
                    {p.question_count === 1 ? "" : "s"} ·{" "}
                    <time dateTime={p.created_at}>{formatDate(p.created_at)}</time>
                  </p>
                  {p.chapters.length > 0 && (
                    <p className="text-xs text-muted/80 mt-1 line-clamp-2">
                      {p.chapters.join(" · ")}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {p.flagged > 0 && (
                    <span className="badge bg-warn-soft text-warn border border-warn/30">
                      <Icon name="alert" className="size-3" />
                      {p.flagged} to review
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
                  <Link href={`/papers/${p.id}`} className="btn-secondary text-xs">
                    Open
                  </Link>
                  {confirming !== p.id && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => setConfirming(p.id)}
                      aria-label={`Delete ${p.title}`}
                    >
                      <Icon name="trash" className="size-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/*
                The confirmation is a strip under the row rather than a swap of
                the buttons in place: it can name the paper and say that the
                answer key goes with it, which a bare "Confirm delete" cannot.
              */}
              {confirming === p.id && (
                <div
                  role="alertdialog"
                  aria-label={`Confirm deleting ${p.title}`}
                  className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-3 flex flex-wrap items-center gap-3"
                >
                  <p className="text-sm text-danger flex-1 min-w-52">
                    Delete <strong>{p.title}</strong> and its answer key? This
                    cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="btn-danger text-xs"
                      onClick={() => remove(p.id)}
                      disabled={busy === p.id}
                    >
                      {busy === p.id ? "Deleting…" : "Delete permanently"}
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => setConfirming(null)}
                      disabled={busy === p.id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
