"use client";

import { useState } from "react";
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

const navLinks = [
  { href: "/dashboard", label: "My Papers" },
  { href: "/new", label: "New Paper" },
  { href: "/settings", label: "Settings" },
];

export default function AppHeader({ profile }: { profile: Profile }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="no-print bg-surface border-b border-line sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
        <Link href="/dashboard" className="font-semibold text-foreground shrink-0">
          QP<span className="text-accent">Gen</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1 text-sm flex-1" aria-label="Main">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-lg hover:bg-background text-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
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

        <div className="flex-1 sm:hidden" />

        <button
          type="button"
          className="sm:hidden -ml-1 p-2 rounded-lg hover:bg-background text-muted hover:text-foreground"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          )}
        </button>

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

      {menuOpen && (
        <nav
          className="sm:hidden border-t border-line bg-surface px-4 py-2 flex flex-col"
          aria-label="Main"
        >
          <span className="text-xs text-muted px-1 py-1.5" title={profile.email}>
            {profile.display_name || profile.email}
          </span>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-1 py-2 rounded-lg hover:bg-background text-sm text-muted hover:text-foreground"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          {profile.role === "admin" && (
            <Link
              href="/admin"
              className="px-1 py-2 rounded-lg hover:bg-background text-sm text-muted hover:text-foreground"
              onClick={() => setMenuOpen(false)}
            >
              Admin
            </Link>
          )}
          <Link
            href="/support"
            className="px-1 py-2 rounded-lg hover:bg-background text-sm text-muted/70 hover:text-foreground"
            onClick={() => setMenuOpen(false)}
          >
            ♥ Support
          </Link>
        </nav>
      )}
    </header>
  );
}
