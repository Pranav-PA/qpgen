import {
  defaultSectionInstruction,
  defaultSubGroupInstruction,
  subGroupStartingAt,
  type BlueprintSection,
  type Paper,
  type Question,
} from "./types";

export interface SectionGroup {
  /** Null for papers that have no blueprint — a single unnamed group. */
  section: BlueprintSection | null;
  heading: string | null;
  instruction: string | null;
  questions: Question[];
  /** Paper-wide 1-based number of the first question in this group. */
  startIndex: number;
}

/** Heading printed before the question at this offset, when a run starts there. */
export interface SubHeading {
  label: string;
  /** Right-margin total, e.g. "3 × 2 = 6". Empty when the run sets no marks. */
  marks: string;
}

export function subHeadingFor(
  group: SectionGroup,
  offsetInGroup: number
): SubHeading | null {
  const section = group.section;
  if (!section) return null;
  const sub = subGroupStartingAt(section, offsetInGroup);
  if (!sub || (section.subgroups?.length ?? 0) < 1) return null;
  return {
    label: sub.label,
    // A run with its own mark value prints its own "N × M = T" the way
    // Karnataka does, rather than one instruction for the whole part.
    marks:
      sub.marks_per_question !== undefined
        ? defaultSubGroupInstruction(section, sub)
        : "",
  };
}

/**
 * Group a paper's questions into printable parts. Questions whose section no
 * longer exists (or papers created before blueprint mode) fall into a trailing
 * unnamed group so nothing is ever silently dropped from an export.
 */
export function groupBySection(paper: Paper): SectionGroup[] {
  const questions = paper.questions ?? [];
  const sections = paper.settings?.blueprint?.sections ?? [];

  if (sections.length === 0) {
    return [
      {
        section: null,
        heading: null,
        instruction: null,
        questions,
        startIndex: 1,
      },
    ];
  }

  const groups: SectionGroup[] = [];
  const claimed = new Set<string>();
  let running = 1;

  for (const section of sections) {
    const inSection = questions.filter((q) => q.section_id === section.id);
    inSection.forEach((q) => claimed.add(q.id));
    if (inSection.length === 0) continue;
    groups.push({
      section,
      heading: section.name,
      instruction:
        section.instruction?.trim() || defaultSectionInstruction(section) || null,
      questions: inSection,
      startIndex: running,
    });
    running += inSection.length;
  }

  const orphans = questions.filter((q) => !claimed.has(q.id));
  if (orphans.length > 0) {
    groups.push({
      section: null,
      heading: groups.length > 0 ? "Other questions" : null,
      instruction: null,
      questions: orphans,
      startIndex: running,
    });
  }

  return groups;
}
