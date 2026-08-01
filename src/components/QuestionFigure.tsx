import type { QuestionFigure as Figure } from "@/lib/types";

/**
 * Renders a question's diagram — a raster image for current generations, or
 * legacy inline SVG for papers made before the switch to Gemini image models.
 *
 * dangerouslySetInnerHTML is safe here specifically because the SVG markup was
 * put through the allowlist in lib/svg-sanitize before it was ever stored.
 * Nothing reaches this component that has not already been cleaned, so do not
 * route unsanitised SVG through it.
 */
export default function QuestionFigure({ figure }: { figure?: Figure }) {
  if (!figure?.image_url && !figure?.svg) return null;

  return (
    <figure className="my-3">
      {figure.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={figure.image_url}
          alt={figure.caption || "Diagram for this question"}
          className="qp-figure max-w-sm h-auto"
        />
      ) : (
        <div
          className="qp-figure max-w-sm [&>svg]:w-full [&>svg]:h-auto"
          role="img"
          aria-label={figure.caption || "Diagram for this question"}
          dangerouslySetInnerHTML={{ __html: figure.svg! }}
        />
      )}
      {figure.caption && (
        <figcaption className="text-xs text-muted mt-1">
          {figure.caption}
        </figcaption>
      )}
    </figure>
  );
}
