import {
  defaultSectionInstruction,
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
      instruction: section.instruction?.trim() || defaultSectionInstruction(section),
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
