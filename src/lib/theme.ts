/**
 * Theme preference, shared by the no-flash boot script and the UI controls.
 *
 * `data-theme` on <html> is always a *resolved* value ("light" or "dark"),
 * never "system" — the boot script resolves the OS preference before first
 * paint. That keeps globals.css down to a single dark-palette selector instead
 * of duplicating it across a [data-theme] rule and a media query.
 */

export const THEME_STORAGE_KEY = "qpgen-theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Runs in <head> before the first paint, so the correct palette is already on
 * <html> when the page renders. Kept as a hand-written string because it must
 * be inlined and must not wait for hydration.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export const THEME_EVENT = "qpgen:themechange";

/**
 * Persists the choice. Painting is not done here — the components subscribe to
 * this store and write `data-theme` from an effect, so there is exactly one
 * place that touches the DOM.
 */
export function storePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Private mode or blocked storage: the theme still applies for this tab. */
  }
  // localStorage fires no event in the tab that wrote it, so tell the other
  // theme controls on this page (header toggle, settings radio) to re-read.
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
}

/**
 * Both the stored preference and the OS setting can change, and both are read
 * by every theme control on the page. One subscription covers them.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

/* Server snapshots. There is no storage or OS hint during SSR, so the markup
 * is rendered for the light default and corrected on hydration — the same
 * default the boot script falls back to when storage is unavailable. */
export const serverPreference = (): ThemePreference => "system";
export const serverSystemTheme = (): ResolvedTheme => "light";
