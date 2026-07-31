import Link from "next/link";
import type { Profile } from "@/lib/types";

/**
 * Rendered while the profile is still in flight. Matches the real header's
 * height exactly so the swap does not shift the page.
 */
export function AppHeaderSkeleton() {
  return (
    <header className="no-print bg-surface border-b border-line sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <span className="font-semibold text-foreground">
          QP<span className="text-accent">Gen</span>
        </span>
        <div className="flex-1" />
        <div
          className="h-4 w-28 rounded bg-line animate-pulse"
          aria-hidden
        />
      </div>
    </header>
  );
}

export default function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="no-print bg-surface border-b border-line sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold text-foreground">
          QP<span className="text-accent">Gen</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm flex-1" aria-label="Main">
          <Link href="/dashboard" className="px-3 py-1.5 rounded-lg hover:bg-background text-muted hover:text-foreground">
            My Papers
          </Link>
          <Link href="/new" className="px-3 py-1.5 rounded-lg hover:bg-background text-muted hover:text-foreground">
            New Paper
          </Link>
          <Link href="/settings" className="px-3 py-1.5 rounded-lg hover:bg-background text-muted hover:text-foreground">
            Settings
          </Link>
          {profile.role === "admin" && (
            <Link href="/admin" className="px-3 py-1.5 rounded-lg hover:bg-background text-muted hover:text-foreground">
              Admin
            </Link>
          )}
          {/* Deliberately de-emphasised: a side note, not a fifth feature. */}
          <Link
            href="/support"
            className="px-3 py-1.5 rounded-lg hover:bg-background text-muted/70 hover:text-foreground text-xs"
          >
            ♥ Support
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted hidden sm:inline" title={profile.email}>
            {profile.display_name || profile.email}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-secondary text-xs px-3 py-1.5">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
