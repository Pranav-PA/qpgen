"use client";

import { useMemo } from "react";
import katex from "katex";

/**
 * Renders text containing inline LaTeX delimited by $...$.
 * Non-math text is rendered as plain React text (safe); only KaTeX output
 * is injected as HTML. Newlines become line breaks.
 */
export default function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lines = text.split("\n");
    lines.forEach((line, li) => {
      if (li > 0) out.push(<br key={`br-${li}`} />);
      const parts = line.split(/(\$[^$]+\$)/g);
      parts.forEach((part, pi) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          let html = "";
          try {
            html = katex.renderToString(part.slice(1, -1), {
              throwOnError: false,
              output: "html",
            });
          } catch {
            html = "";
          }
          if (html) {
            out.push(
              <span key={`${li}-${pi}`} dangerouslySetInnerHTML={{ __html: html }} />
            );
          } else {
            out.push(<span key={`${li}-${pi}`}>{part}</span>);
          }
        } else if (part) {
          out.push(<span key={`${li}-${pi}`}>{part}</span>);
        }
      });
    });
    return out;
  }, [text]);

  return <span className={className}>{nodes}</span>;
}
