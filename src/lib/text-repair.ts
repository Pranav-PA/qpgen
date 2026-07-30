/**
 * Repairs a specific, well-understood corruption in AI-generated JSON
 * containing LaTeX.
 *
 * "Structured output" / JSON-schema modes guarantee the response is
 * syntactically valid JSON, but not that the model always doubles a literal
 * backslash it means to keep. A single backslash before b, f, n, r, t, or u is
 * still syntactically legal JSON (those are real escape letters), so an
 * occasional lapse - writing "\frac{F}{2}" instead of the correctly escaped
 * "\\frac{F}{2}" - parses without error but silently decodes to a control
 * character (form feed) followed by "rac{F}{2}", which then renders as a
 * stray glyph instead of a fraction.
 *
 * b/f/r/t have no legitimate use as real control characters in exam content,
 * so restoring the backslash the model meant to send is always safe. `n` is
 * deliberately left alone: real newlines are used on purpose (e.g. between
 * Assertion and Reason lines), and collapsing \nu/\nabla would risk breaking
 * far more common, intentional line breaks than it would fix.
 *
 * Any other stray control character (which has no such 1:1 escape mapping,
 * e.g. a mis-encoded \u escape) is simply dropped rather than left to render
 * as a broken placeholder glyph.
 *
 * Implemented via numeric code-point comparison rather than regex literals
 * containing raw control bytes, which are unreadable and fragile (editors,
 * git, and CRLF normalization can all mangle a literal control byte sitting
 * in source).
 */

const BACKSPACE = 8; // 0x08 -> was meant as \b (\beta, \binom, \bar, ...)
const TAB = 9; // 0x09 -> was meant as \t (\tau, \theta, \times, \text, ...)
const LINE_FEED = 10; // 0x0A -> a real, intentional newline; never touched
const FORM_FEED = 12; // 0x0C -> was meant as \f (\frac, \forall, ...)
const CARRIAGE_RETURN = 13; // 0x0D -> was meant as \r (\rho, \right, \rangle, ...)
const DELETE = 127; // 0x7F

const RESTORE: Record<number, string> = {
  [BACKSPACE]: "\\b",
  [FORM_FEED]: "\\f",
  [CARRIAGE_RETURN]: "\\r",
  [TAB]: "\\t",
};

function fixString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    const restore = RESTORE[code];
    if (restore !== undefined) {
      out += restore;
    } else if (code === LINE_FEED || code >= 0x20) {
      if (code !== DELETE) out += ch;
    }
    // else: some other stray control character (0x00-0x07, 0x0B, 0x0E-0x1F)
    // with no safe 1:1 reconstruction - drop it rather than let a broken
    // placeholder glyph reach the page.
  }
  return out;
}

export function repairMisescapedLatex<T>(value: T): T {
  if (typeof value === "string") {
    return fixString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => repairMisescapedLatex(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = repairMisescapedLatex(v);
    }
    return out as T;
  }
  return value;
}
