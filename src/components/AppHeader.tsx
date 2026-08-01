"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeControls";
import type { Profile } from "@/lib/types";

function Wordmark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-semibold text-foreground shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      QP<span className="text-accent">Gen</span>
    </Link>
  );
}

/**
 * Rendered while the profile is still in flight. Matches the real header's
 * height exactly so the swap does not shift the page.
 */
export function AppHeaderSkeleton() {
  return (
    <header className="no-print bg-surface border-b border-line sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Wordmark />
        <div className="flex-1" />
        <div className="h-4 w-28 rounded bg-line animate-pulse" aria-hidden />
      </div>
    </header>
  );
}

/**
 * `match` lists the route prefixes that should light this link up. Reviewing a
 * paper lives at /papers/[id], which is conceptually still "My papers" — with
 * only an exact-href check the nav went blank on the screen teachers spend the
 * most time on.
 */
const NAV_LINKS: { href: string; label: string; match: string[] }[] = [
  { href: "/dashboard", label: "My papers", match: ["/dashboard", "/papers"] },
  { href: "/new", label: "New paper", match: ["/new"] },
  { href: "/settings", label: "Settings", match: ["/settings"] },
];

function isActive(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const links = [
    ...NAV_LINKS,
    ...(profile.role === "admin"
      ? [{ href: "/admin", label: "Admin", match: ["/admin"] }]
      : []),
  ];

  /*
   * A drawer that survives navigation sits open over the page you just asked
   * for, so close it whenever the route changes. Adjusted during render rather
   * than in an effect: an effect would paint the new page with the menu still
   * covering it and only then close it.
   */
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setMenuOpen(false);
  }

  // Escape closes the drawer and hands focus back to the control that opened
  // it, rather than stranding keyboard users at the top of the document.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const displayName = profile.display_name || profile.email;

  return (
    <header className="no-print bg-surface border-b border-line sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
        <Wordmark />

        <nav className="hidden sm:flex items-center gap-1 text-sm flex-1" aria-label="Main">
          {links.map((link) => {
            const active = isActive(pathname, link.match);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {/* Deliberately de-emphasised: a side note, not a fifth feature. */}
          <Link
            href="/support"
            className={`px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isActive(pathname, ["/support"])
                ? "bg-accent-soft text-accent font-medium"
                : "text-muted/70 hover:bg-background hover:text-foreground"
            }`}
            aria-current={isActive(pathname, ["/support"]) ? "page" : undefined}
          >
            <Icon name="heart" className="size-3.5" />
            Support
          </Link>
        </nav>

        <div className="flex-1 sm:hidden" />

        <span
          className="text-sm text-muted hidden sm:inline max-w-40 truncate"
          title={profile.email}
        >
          {displayName}
        </span>

        <ThemeToggle />

        <form action="/auth/signout" method="post" className="hidden sm:block">
          <button type="submit" className="btn-secondary text-xs px-3 py-1.5">
            Sign out
          </button>
        </form>

        <button
          ref={toggleRef}
          type="button"
          className="sm:hidden p-2 rounded-lg hover:bg-background text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? "close" : "menu"} className="size-5" />
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          className="sm:hidden border-t border-line bg-surface px-4 py-2 flex flex-col"
          aria-label="Main"
        >
          <span className="text-xs text-muted px-1 py-1.5 truncate" title={profile.email}>
            {displayName}
          </span>
          {links.map((link) => {
            const active = isActive(pathname, link.match);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2.5 rounded-lg text-sm ${
                  active
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/support"
            className="px-3 py-2.5 rounded-lg text-sm text-muted/70 hover:bg-background hover:text-foreground inline-flex items-center gap-2"
          >
            <Icon name="heart" className="size-4" />
            Support
          </Link>
          {/*
            Sign out lives in the drawer on mobile. In the bar it sat next to
            the menu button, so the two most-tapped-by-accident targets were
            adjacent and one of them signs you out.
          */}
          <form
            action="/auth/signout"
            method="post"
            className="border-t border-line mt-2 pt-2"
          >
            <button type="submit" className="btn-secondary w-full text-sm">
              Sign out
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
