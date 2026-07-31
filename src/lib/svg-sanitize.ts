/**
 * Allowlist sanitiser for model-generated SVG figures.
 *
 * The SVG arrives from an AI and is injected into HTML in two places that both
 * matter: the teacher's browser, and the headless Chromium that renders the
 * PDF. Chromium runs with the paper's own markup, so an <image href="http://…">
 * or an onload handler would fetch or execute during export, off a server with
 * the service-role key in its environment.
 *
 * Sanitising happens once, when the figure is first received, and only the
 * cleaned string is stored. Rendering never has to re-check.
 *
 * Anything not on the allowlist is dropped rather than escaped or rewritten —
 * a figure that loses a stray attribute still draws, and one that cannot be
 * cleaned is not worth rendering.
 */

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse",
  "text",
  "tspan",
  "marker",
]);
/*
 * Gradients are deliberately absent. They are referenced as fill="url(#id)",
 * and allowing url( in attribute values to support them would also allow
 * url(http://…) — a network fetch during PDF rendering. Papers print in black
 * and white, so nothing is lost by refusing them outright.
 */

/**
 * No href/xlink:href (external fetches and javascript: URLs), no style (url()
 * smuggles requests), no on* handlers, no class or id (they would collide with
 * the page's own CSS).
 */
const ALLOWED_ATTRS = new Set([
  "viewbox",
  "xmlns",
  "width",
  "height",
  "x",
  "y",
  "dx",
  "dy",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "marker-end",
  "marker-start",
  "orient",
  "refx",
  "refy",
  "markerwidth",
  "markerheight",
]);

/** Keeps a bad figure from bloating the papers JSONB the dashboard reads. */
const MAX_SVG_BYTES = 20_000;

/** Values that could reach the network or a script engine, whatever the attribute. */
const DANGEROUS_VALUE = /javascript:|data:text\/html|<script|url\s*\(|&#/i;

export function sanitizeSvg(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw.startsWith("<svg") || raw.length > MAX_SVG_BYTES) return null;

  // Comments and CDATA can hide markup from the tag scanner below.
  let out = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Reject outright rather than strip: their presence means the output is not
  // the plain diagram it was asked for, and the rest is not worth trusting.
  if (/<\s*(script|foreignObject|iframe|image|use|a|style|animate|set)\b/i.test(out)) {
    return null;
  }

  let ok = true;
  out = out.replace(/<\s*(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash: string, name: string, attrs: string) => {
    if (!ALLOWED_ELEMENTS.has(name)) {
      ok = false;
      return "";
    }
    if (slash) return `</${name}>`;

    const kept: string[] = [];
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrs)) !== null) {
      const attr = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? "";
      if (attr.startsWith("on") || !ALLOWED_ATTRS.has(attr)) continue;
      if (DANGEROUS_VALUE.test(value)) continue;
      // viewBox is case-sensitive in SVG; the allowlist compares lowercased.
      const outName = attr === "viewbox" ? "viewBox" : attr;
      kept.push(`${outName}="${value.replace(/"/g, "&quot;")}"`);
    }
    const selfClose = /\/\s*$/.test(attrs) ? "/" : "";
    return `<${name}${kept.length ? " " + kept.join(" ") : ""}${selfClose}>`;
  });

  if (!ok) return null;
  if (!out.includes("<svg")) return null;
  // A figure with no drawable content is a blank box on the page.
  if (!/<(path|line|polyline|polygon|rect|circle|ellipse|text)\b/i.test(out)) return null;

  return out;
}
