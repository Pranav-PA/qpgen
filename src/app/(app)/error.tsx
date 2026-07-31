"use client";

/**
 * Without this, a server component that throws leaves the route's loading
 * skeleton on screen forever — the admin panel sat on "Loading…" indefinitely
 * with no indication anything had gone wrong.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card p-8 max-w-xl mx-auto text-center">
      <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-muted mb-4">
        This page failed to load. Retrying often works; if it keeps happening,
        the details below help pin down why.
      </p>
      <p className="text-xs font-mono text-muted bg-background border border-line rounded-lg p-3 mb-5 text-left break-words">
        {error.message || "Unknown error"}
        {error.digest ? ` (digest: ${error.digest})` : ""}
      </p>
      <button type="button" onClick={reset} className="btn-primary text-sm">
        Try again
      </button>
    </div>
  );
}
