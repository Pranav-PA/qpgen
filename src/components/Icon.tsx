/**
 * The app's icon set.
 *
 * These replace the emoji that used to stand in for controls (⬇ ↻ ⚠ ×). Emoji
 * are rendered by the OS font, so the same button looked flat on Windows,
 * glossy on Android and differently sized on iOS, and they never picked up the
 * button's text colour. These are inline strokes on `currentColor`, so they
 * inherit colour, dark mode and disabled states for free.
 *
 * Emoji are still fine for decoration (the 📝 on an empty state); this is for
 * anything the teacher is meant to click or read as status.
 */

const PATHS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  check: "M4.5 12.5l5 5 10-11",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  download: "M12 3v12M7 11l5 5 5-5M5 20h14",
  refresh: "M20.5 12a8.5 8.5 0 1 1-2.8-6.3M20.5 4v5h-5",
  rotateBack: "M3.5 12a8.5 8.5 0 1 0 2.8-6.3M3.5 4v5h5",
  trash: "M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6",
  pencil: "M4 20h4L19.5 8.5l-4-4L4 16v4zM14.5 5.5l4 4",
  eye: "M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  alert: "M10.3 4.4a2 2 0 0 1 3.4 0l7.4 12.9a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3zM12 9.5v4M12 17h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.7h.01",
  flag: "M5.5 21V4M5.5 4.5h11l-2 3.5 2 3.5h-11",
  fileText: "M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8zM14 3v5h5M9 13h6M9 17h4",
  key: "M7.5 13.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 14.5L20.5 4M16.5 8l3 3",
  sun: "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5",
  moon: "M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3z",
  sparkles:
    "M11 3.5l1.7 4.3 4.3 1.7-4.3 1.7L11 15.5l-1.7-4.3L5 9.5l4.3-1.7zM18 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z",
  heart: "M12 20.2S4.5 15.6 4.5 10.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 2.4c0 5.2-7.5 9.8-7.5 9.8z",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  settings:
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5l1.4 2.4 2.7-.4.6 2.7 2.4 1.4-1.3 2.4 1.3 2.4-2.4 1.4-.6 2.7-2.7-.4L12 21.5l-1.4-2.4-2.7.4-.6-2.7L4.9 15.4l1.3-2.4-1.3-2.4 2.4-1.4.6-2.7 2.7.4z",
  upload: "M12 20V8M7 12l5-5 5 5M5 4h14",
  image:
    "M4.5 4.5h15v15h-15zM4.5 16l4.5-4.5 3.5 3.5 3-3 4 4M9 9.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  className = "size-4",
  strokeWidth = 1.75,
  title,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  /**
   * Only pass this when the icon is the *only* thing conveying the meaning.
   * Next to a text label it should stay decorative, or screen readers announce
   * the same thing twice.
   */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...(title ? { role: "img" } : { "aria-hidden": true })}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
