import { describe, expect, it } from "vitest";
import { hasUnresolvedAnswer, resolveCorrectIndex, stripSectionPrefix } from "./generate";
import { archetypeKey, canonicaliseTopics, distinctTopics, normaliseBbox } from "./reference-extract";
import type { ReferenceItem } from "@/lib/types";

/**
 * The answer-mapping and clean-up helpers every generated question passes
 * through. A mistake in resolveCorrectIndex prints the wrong key.
 */

describe("resolveCorrectIndex", () => {
  const options = ["$\\frac{1}{2}mv^2$", "$mv^2$", "12 V", "none of these"];

  it("reads a bare letter in any of the shapes models emit", () => {
    for (const answer of ["B", "b", "(B)", "B)", "B.", " b "]) {
      expect(resolveCorrectIndex(answer, options), answer).toBe(1);
    }
  });

  it("falls back to matching the option's text", () => {
    expect(resolveCorrectIndex("12 V", options)).toBe(2);
    expect(resolveCorrectIndex("  12   V ", options)).toBe(2);
  });

  it("handles a letter prefixed onto the option text", () => {
    expect(resolveCorrectIndex("C) 12 V", options)).toBe(2);
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(resolveCorrectIndex("possibly the second one", options)).toBeNull();
  });
});

describe("hasUnresolvedAnswer", () => {
  it("flags an option question whose answer is not a clean letter", () => {
    expect(hasUnresolvedAnswer({ type: "mcq", options: ["a", "b"], correct_answer: "12 V" })).toBe(true);
    expect(hasUnresolvedAnswer({ type: "mcq", options: ["a", "b"], correct_answer: "B" })).toBe(false);
  });

  it("leaves free-text answers alone", () => {
    expect(hasUnresolvedAnswer({ type: "numerical", correct_answer: "9.8" })).toBe(false);
    expect(hasUnresolvedAnswer({ type: "short_answer", correct_answer: "Because…" })).toBe(false);
  });
});

describe("stripSectionPrefix", () => {
  it("removes a part, number or marks label the model restated", () => {
    expect(stripSectionPrefix("PART-A (1 mark): What is X?")).toBe("What is X?");
    expect(stripSectionPrefix("Q3. What is X?")).toBe("What is X?");
    expect(stripSectionPrefix("(2 marks) - What is X?")).toBe("What is X?");
  });

  it("strips a part label and a marks label together", () => {
    expect(stripSectionPrefix("PART-B: 3 marks: What is X?")).toBe("What is X?");
  });

  it("leaves an ordinary question untouched", () => {
    const q = "A wire of resistance R is stretched. What is its new resistance?";
    expect(stripSectionPrefix(q)).toBe(q);
  });

  it("never returns an empty stem", () => {
    expect(stripSectionPrefix("Q1.")).toBeTruthy();
  });
});

describe("archetypeKey", () => {
  it("collapses punctuation and spacing so wording variants group together", () => {
    expect(archetypeKey("Resistance of a wire, stretched to n times!")).toBe(
      archetypeKey("resistance of a wire stretched to n times")
    );
  });
});

describe("normaliseBbox", () => {
  it("converts the model's [ymin, xmin, ymax, xmax] 0–1000 box", () => {
    expect(normaliseBbox([300, 500, 500, 900])).toEqual({ x0: 0.5, y0: 0.3, x1: 0.9, y1: 0.5 });
  });

  it("tolerates corners given the other way round", () => {
    expect(normaliseBbox([500, 900, 300, 500])).toEqual({ x0: 0.5, y0: 0.3, x1: 0.9, y1: 0.5 });
  });

  it("rejects a box too small to be a figure, or most of the page", () => {
    expect(normaliseBbox([300, 500, 301, 501])).toBeNull();
    expect(normaliseBbox([0, 0, 1000, 1000])).toBeNull();
  });

  it("rejects malformed input rather than cropping nonsense", () => {
    expect(normaliseBbox(undefined)).toBeNull();
    expect(normaliseBbox([1, 2, 3])).toBeNull();
    expect(normaliseBbox([0, 0, 2000, 2000])).toBeNull();
  });
});

describe("canonicaliseTopics", () => {
  const items = (topics: string[]) =>
    topics.map((topic, i) => ({
      id: `i${i}`, page: 1, topic, archetype: `a${i}`,
      type: "mcq", difficulty: "medium",
      question_text: "A question long enough to survive the filter",
    })) as ReferenceItem[];

  it("merges a longer spelling of a topic onto the one already in use", () => {
    const out = canonicaliseTopics(items([
      "Combination of Resistors — Series and Parallel",
      "Combination of Resistors",
    ]));
    expect(distinctTopics(out)).toEqual(["Combination of Resistors — Series and Parallel"]);
  });

  it("keeps genuinely different topics apart", () => {
    const out = canonicaliseTopics(items(["Electrical Energy, Power", "Electric Power and Energy"]));
    expect(distinctTopics(out)).toHaveLength(2);
  });
});
