import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * KaTeX ships CSS that references font files by relative URL. A PDF is rendered
 * from an in-memory HTML string with no base URL, so those fonts would never
 * load. We inline them as data URIs once per cold start.
 *
 * The font/CSS files are pulled into the serverless bundle by
 * `outputFileTracingIncludes` in next.config.ts.
 */
let cachedCss: string | null = null;

function katexDir(): string {
  return path.join(process.cwd(), "node_modules", "katex", "dist");
}

export function katexCss(): string {
  if (cachedCss !== null) return cachedCss;
  try {
    const dir = katexDir();
    const css = readFileSync(path.join(dir, "katex.min.css"), "utf8");

    // url(fonts/KaTeX_Main-Regular.woff2) -> url(data:font/woff2;base64,...)
    cachedCss = css.replace(
      /url\(([^)]+?\.(woff2|woff|ttf))\)/g,
      (whole, rel: string, ext: string) => {
        const clean = rel.replace(/['"]/g, "").trim();
        try {
          const buf = readFileSync(path.join(dir, clean));
          const mime =
            ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : "font/ttf";
          return `url(data:${mime};base64,${buf.toString("base64")})`;
        } catch {
          return whole;
        }
      }
    );
  } catch {
    // Without KaTeX CSS math still renders, just with fallback glyph metrics.
    cachedCss = "";
  }
  return cachedCss;
}

/**
 * Institution logos live in public Supabase Storage. Headless Chromium would
 * have to fetch them over the network mid-render, which is slow and fails
 * silently; inlining guarantees the logo actually appears on the page.
 */
export async function fetchImageAsDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
