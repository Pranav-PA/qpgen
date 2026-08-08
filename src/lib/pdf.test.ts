import { describe, expect, it } from "vitest";
import { isQuestionProse, padBox, toTextLines, trimBoxToFigure, type TextLine } from "./pdf";

/**
 * Crop trimming, which is what keeps a source paper's own answer options from
 * printing inside the figure on the new one. Measured against the real bank
 * before it was written; these lock in the behaviour.
 */

describe("isQuestionProse", () => {
  it("treats sentences and option rows as prose", () => {
    expect(isQuestionProse("of a 60 W bulb for use in India is R, the res")).toBe(true);
    expect(isQuestionProse("(a) V > V and i > i (b) V > V and i = i")).toBe(true);
    expect(isQuestionProse("(c) 9 : 4 (d) 1 : 2")).toBe(true);
    expect(isQuestionProse("29. Fuse wire is a wire of")).toBe(true);
  });

  it("keeps the short value-shaped labels a figure is made of", () => {
    for (const label of ["10 V", "10 W", "4 Ω", "A", "V 2", "l 1", "Circuit 1", "X", "1 2"]) {
      expect(isQuestionProse(label), label).toBe(false);
    }
  });
});

describe("toTextLines", () => {
  const page = { w: 1000, h: 1000 };
  /** pdfjs hands back y measured up from the bottom. */
  const item = (str: string, x: number, yFromTop: number) => ({
    str,
    transform: [1, 0, 0, 1, x, page.h - yFromTop],
  });

  it("splits one height into separate lines per column", () => {
    // A two-column page carries unrelated text at the same height. Merging
    // them let the left column's prose trim a figure in the right column.
    const lines = toTextLines(
      [item("some prose in the left column", 100, 400), item("10 V", 700, 400)],
      page.w,
      page.h
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.text)).toContain("10 V");
  });

  it("joins glyph runs that belong to the same line", () => {
    const lines = toTextLines(
      [item("Circuit", 700, 400), item("1", 740, 400)],
      page.w,
      page.h
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Circuit 1");
  });
});

describe("trimBoxToFigure", () => {
  const box = { x0: 0.5, y0: 0.30, x1: 0.9, y1: 0.50 };
  const line = (text: string, y: number, x0 = 0.5, x1 = 0.9): TextLine => ({ text, y, x0, x1 });

  it("closes the box in above prose that sits over the figure", () => {
    const out = trimBoxToFigure(box, [line("the readings of the voltmeters will be", 0.32)]);
    expect(out.y0).toBeGreaterThan(0.32);
    expect(out.y1).toBe(box.y1);
  });

  it("closes the box in below an option row", () => {
    const out = trimBoxToFigure(box, [line("(a) V > V and i > i (b) V = V", 0.48)]);
    expect(out.y1).toBeLessThan(0.48);
    expect(out.y0).toBe(box.y0);
  });

  it("leaves the figure's own labels alone", () => {
    const labels = [line("10 V", 0.35), line("Circuit 1", 0.47), line("A", 0.40)];
    expect(trimBoxToFigure(box, labels)).toEqual(box);
  });

  it("ignores prose in a neighbouring column", () => {
    expect(trimBoxToFigure(box, [line("a full sentence of question text", 0.35, 0.05, 0.45)])).toEqual(box);
  });

  it("gives back the original rather than trimming the box away", () => {
    // Prose tight either side of the middle would leave nothing worth cutting,
    // which means the box was wrong about where the figure is; the ink check
    // and the teacher decide from there.
    const out = trimBoxToFigure(box, [
      line("a full sentence just above the middle", 0.398),
      line("another full sentence just below it", 0.402),
    ]);
    expect(out).toEqual(box);
  });

  it("has no text layer to work with on a scan, and passes the box through", () => {
    expect(trimBoxToFigure(box, [])).toEqual(box);
  });
});

describe("padBox", () => {
  it("grows the box without leaving the page", () => {
    const out = padBox({ x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(out).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it("is applied before trimming, so padding cannot restore a trimmed option row", () => {
    const raw = { x0: 0.5, y0: 0.3, x1: 0.9, y1: 0.5 };
    // Just outside the raw box, but inside it once padded — the case that made
    // pad-then-trim the required order.
    const options: TextLine = { text: "(a) 2 : 1 (b) 4 : 9", y: 0.502, x0: 0.5, x1: 0.9 };
    const padded = padBox(raw);
    expect(padded.y1).toBeGreaterThan(options.y); // padding reached the options
    expect(trimBoxToFigure(padded, [options]).y1).toBeLessThan(options.y); // trim removed them
  });
});
