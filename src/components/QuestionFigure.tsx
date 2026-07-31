import type { QuestionFigure as Figure } from "@/lib/types";

/**
 * Renders a question's diagram.
 *
 * dangerouslySetInnerHTML is safe here specifically because the markup was put
 * through the allowlist in lib/svg-sanitize before it was ever stored — see
 * normalizeFigure in lib/ai/generate. Nothing reaches this component that has
 * not already been cleaned, so do not route unsanitised SVG through it.
 */
export default function QuestionFigure({ figure }: { figure?: Figure }) {
  if (!figure?.svg) return null;

  return (
    <figure className="my-3">
      <div
        className="qp-figure max-w-sm [&>svg]:w-full [&>svg]:h-auto"
        role="img"
        aria-label={figure.caption || "Diagram for this question"}
        dangerouslySetInnerHTML={{ __html: figure.svg }}
      />
      {figure.caption && (
        <figcaption className="text-xs text-muted mt-1">
          {figure.caption}
        </figcaption>
      )}
    </figure>
  );
}
