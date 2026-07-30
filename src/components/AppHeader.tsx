import Link from "next/link";
import type { Profile } from "@/lib/types";

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
