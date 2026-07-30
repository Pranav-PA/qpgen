import { ImportedXmlComponent, TextRun } from "docx";
import temml from "temml";
import { mml2omml } from "mathml2omml";

type Run = TextRun | ImportedXmlComponent;

/**
 * `ImportedXmlComponent.fromXmlString` parses the string into an xml-js
 * *document* node, which has no element name, and wraps the real content in a
 * component named `undefined`. That serialises to a literal `<undefined>` tag,
 * which is invalid WordprocessingML — Word discards the run, so any option or
 * stem that is pure math renders blank. Unwrap to the real `m:oMath` element.
 */
function unwrapImported(
  wrapper: ImportedXmlComponent
): ImportedXmlComponent | null {
  const children = (wrapper as unknown as { root?: unknown[] }).root;
  const first = Array.isArray(children) ? children[0] : undefined;
  return first && typeof first === "object"
    ? (first as ImportedXmlComponent)
    : null;
}

/** Convert one LaTeX expression to a native Word (OMML) equation run. */
function latexToOmml(latex: string): ImportedXmlComponent | null {
  try {
    const mathml = temml.renderToString(latex);
    if (!mathml.startsWith("<math")) return null;
    const omml = mml2omml(mathml);
    if (!omml) return null;
    return unwrapImported(ImportedXmlComponent.fromXmlString(String(omml)));
  } catch {
    return null;
  }
}

/**
 * Split text containing inline $...$ LaTeX into docx runs: plain TextRuns for
 * prose and native OMML equation components for math. Falls back to the raw
 * LaTeX source (still readable/fixable in Word) if conversion fails.
 */
export function textWithMathRuns(text: string, opts?: { bold?: boolean }): Run[] {
  const runs: Run[] = [];
  const lines = text.split("\n");
  lines.forEach((line, li) => {
    const parts = line.split(/(\$[^$]+\$)/g);
    parts.forEach((part, pi) => {
      const isFirstOfLine = pi === 0 || parts.slice(0, pi).every((p) => !p);
      const breakOpt = li > 0 && isFirstOfLine ? { break: 1 as const } : {};
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        const omml = latexToOmml(part.slice(1, -1));
        if (omml) {
          if (li > 0 && isFirstOfLine) runs.push(new TextRun({ text: "", break: 1 }));
          runs.push(omml);
          return;
        }
        runs.push(new TextRun({ text: part, bold: opts?.bold, ...breakOpt }));
      } else if (part) {
        runs.push(new TextRun({ text: part, bold: opts?.bold, ...breakOpt }));
      }
    });
    if (parts.every((p) => !p) && li > 0) {
      runs.push(new TextRun({ text: "", break: 1 }));
    }
  });
  return runs;
}
