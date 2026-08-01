"use client";

import { useEffect, useSyncExternalStore } from "react";
import Icon from "@/components/Icon";
import {
  readPreference,
  serverPreference,
  serverSystemTheme,
  storePreference,
  subscribeToTheme,
  systemTheme,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/theme";

/**
 * Shared theme state.
 *
 * The source of truth is localStorage and the OS setting, not React — the boot
 * script in the root layout has already read both and stamped `data-theme` on
 * <html> before hydration. useSyncExternalStore subscribes to those two rather
 * than mirroring them into state, so the header toggle and the settings radio
 * group can never drift apart.
 */
function useTheme() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    readPreference,
    serverPreference
  );
  const system = useSyncExternalStore(
    subscribeToTheme,
    systemTheme,
    serverSystemTheme
  );
  const resolved = preference === "system" ? system : preference;

  // The one place that paints. Also covers the OS flipping to dark while the
  // teacher is on "System" and has touched nothing.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  return { preference, resolved, choose: storePreference };
}

/** Compact light/dark switch for the header. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, choose } = useTheme();
  const goingDark = resolved === "light";

  return (
    <button
      type="button"
      onClick={() => choose(goingDark ? "dark" : "light")}
      className={`p-2 rounded-lg text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      aria-label={goingDark ? "Switch to dark theme" : "Switch to light theme"}
      title={goingDark ? "Dark theme" : "Light theme"}
    >
      <Icon name={goingDark ? "moon" : "sun"} className="size-5" />
    </button>
  );
}

/** Three-way choice for Settings, where "follow my system" stays reachable. */
export function ThemeChoice() {
  const { preference, choose } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-line bg-surface p-1 gap-1"
    >
      {THEME_OPTIONS.map((option: { value: ThemePreference; label: string }) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active
                ? "bg-accent text-accent-contrast"
                : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
