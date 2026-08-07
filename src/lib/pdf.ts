"use client";

import { MAX_REFERENCE_PDF_PAGES, MIN_FIGURE_CROP_INK } from "./constants";
import type { ReferencePage } from "./types";

export interface PdfRenderResult {
  pages: ReferencePage[];
  totalPages: number;
  truncated: boolean;
}

/**
 * Renders the first MAX_REFERENCE_PDF_PAGES pages of a PDF to JPEG data URLs
 * in the browser. We deliberately never extract text: equations and diagrams
 * only survive as images, which the vision model reads directly.
 */
export async function renderPdfToImages(file: File): Promise<PdfRenderResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const pageCount = Math.min(doc.numPages, MAX_REFERENCE_PDF_PAGES);
  const pages: ReferencePage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    // Target ~1200px width: enough for the model to read equations, small
    // enough to keep request size and vision cost down.
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1200 / base.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push({ page: i, data_url: canvas.toDataURL("image/jpeg", 0.75) });
    page.cleanup();
  }

  const totalPages = doc.numPages;
  await doc.cleanup();
  return { pages, totalPages, truncated: totalPages > pageCount };
}

/* ------------------------------------------------------------------ */
/* Figure crops for reference-led generation                           */

export interface FigureCropRequest {
  item_id: string;
  /** 1-based index into the rendered page array. */
  page: number;
  /** Normalised box on that page, top-left origin. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface FigureCrop {
  item_id: string;
  data_url: string;
}

/**
 * Padding around the model's box, as a fraction of page size.
 *
 * Small on purpose. The failure this guards against is not a figure with its
 * edges shaved — it is a crop that swallows the line of question text above the
 * diagram and the first row of the source's own options below it, both of which
 * then print on the new paper underneath the question that already says the
 * same thing. Given a box that is slightly wrong, too tight is recoverable by
 * eye and too loose is not.
 */
const CROP_PADDING = 0.003;
/** Crops are re-rendered well above the ~1200px used for reading the page. */
const CROP_RENDER_WIDTH = 2200;
/** Cap on a crop's own width, so a page-wide figure is not shipped at full scale. */
const MAX_CROP_WIDTH = 1000;

/** One line of the page's text layer, positioned in normalised page space. */
export interface TextLine {
  text: string;
  /** Vertical centre, 0 at the top of the page. */
  y: number;
  x0: number;
  x1: number;
}

/**
 * True for a line that belongs to the question, not to the figure.
 *
 * Figure labels are short and value-shaped: "10 V", "4 Ω", "A", "Circuit 1",
 * "X", "l₁". Question text and answer options are sentences, or begin with an
 * option marker. Two consecutive words of real letters is the cheapest
 * separator that gets this right on a physics page, where almost every genuine
 * label is a number with a unit.
 */
export function isQuestionProse(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (/^\(?[a-dA-D][).]/.test(s)) return true;
  return /[a-z]{4,}\s+[a-z]{3,}/i.test(s);
}

/**
 * Shrinks a model-supplied figure box until it holds no question text.
 *
 * The model localises figures well but bounds them generously, and on the
 * first live run that put the tail of the question's own sentence and the top
 * row of the source's "(a)/(b)/(c)/(d)" options *inside* the printed figure —
 * so the new paper showed the answer options twice, once in the crop. Tuning
 * the prompt did not fix it; the boxes still enclosed the option markers.
 *
 * The PDF's text layer settles it without guessing: any prose line inside the
 * box is either above the drawing or below it, so the box is closed in from
 * whichever side it sits on. Figure labels are left alone, which is what keeps
 * "10 V" and "Circuit 1" in the crop.
 *
 * A scanned PDF has no text layer and simply gets the box unchanged — nothing
 * to trim with, and a slightly loose crop is still far better than no figure.
 */
export function trimBoxToFigure(
  box: { x0: number; y0: number; x1: number; y1: number },
  lines: TextLine[]
): { x0: number; y0: number; x1: number; y1: number } {
  const centre = (box.y0 + box.y1) / 2;
  /** Half a line of clearance, so a trimmed edge does not clip a descender. */
  const gap = 0.004;

  let y0 = box.y0;
  let y1 = box.y1;
  for (const line of lines) {
    if (line.y < box.y0 || line.y > box.y1) continue;
    // Ignore text that sits entirely beside the box — a neighbouring column.
    if (line.x1 < box.x0 || line.x0 > box.x1) continue;
    if (!isQuestionProse(line.text)) continue;
    if (line.y < centre) y0 = Math.max(y0, line.y + gap);
    else y1 = Math.min(y1, line.y - gap);
  }

  // If trimming ate the box, the localisation was wrong about where the figure
  // is; hand back the original and let the ink check and the teacher decide.
  return y1 - y0 < 0.02 ? box : { ...box, y0, y1 };
}

/**
 * Groups a pdfjs text content stream into lines in normalised page space.
 * Exported so the trimming can be measured against a real PDF without a
 * browser (see the bbox audit in the plan doc).
 */
export function toTextLines(
  items: { str: string; transform: number[] }[],
  pageWidth: number,
  pageHeight: number
): TextLine[] {
  const rows = new Map<number, { text: string; x: number; y: number }[]>();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4] / pageWidth;
    // PDF user space is y-up from the bottom; boxes are y-down from the top.
    const y = 1 - it.transform[5] / pageHeight;
    // 0.5% of page height per row: tight enough to keep a figure label off the
    // question line above it, loose enough to join one line's glyph runs.
    const key = Math.round(y / 0.005);
    const row = rows.get(key);
    if (row) row.push({ text: it.str, x, y });
    else rows.set(key, [{ text: it.str, x, y }]);
  }

  /*
   * Rows are then split into column segments. A question bank prints two
   * columns, so a single height carries unrelated text on both sides of the
   * page — and merging them produced a "line" spanning the full width, which
   * made the left column's prose trim a figure in the right column. This was
   * measured: it cut a correct circuit box down by 58%.
   */
  const COLUMN_GAP = 0.06;
  const out: TextLine[] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    let seg: typeof row = [];
    const flush = () => {
      if (seg.length === 0) return;
      out.push({
        text: seg.map((s) => s.text).join(" "),
        y: seg[0].y,
        x0: seg[0].x,
        x1: seg[seg.length - 1].x,
      });
      seg = [];
    };
    for (const glyph of row) {
      if (seg.length > 0 && glyph.x - seg[seg.length - 1].x > COLUMN_GAP) flush();
      seg.push(glyph);
    }
    flush();
  }
  return out;
}

/**
 * Cuts each requested figure out of the source PDF.
 *
 * The alternative — describing a circuit in prose and having an image model
 * redraw it — costs a real per-image bill and is the one part of generation no
 * verifier can check, since nothing in the pipeline can read a drawn circuit.
 * A crop is free, exact, and is the diagram the teacher's own paper printed.
 *
 * Anything doubtful is dropped rather than returned: a box that lands on white
 * space produces a blank rectangle printed where a diagram should be, which is
 * worse than falling back to a redraw. Callers treat a missing item_id as
 * "no crop available".
 */
export async function cropReferenceFigures(
  file: File,
  requests: FigureCropRequest[]
): Promise<FigureCrop[]> {
  if (requests.length === 0) return [];

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: FigureCrop[] = [];

  const byPage = new Map<number, FigureCropRequest[]>();
  for (const req of requests) {
    const list = byPage.get(req.page);
    if (list) list.push(req);
    else byPage.set(req.page, [req]);
  }

  for (const [pageNumber, pageRequests] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    if (pageNumber < 1 || pageNumber > doc.numPages) continue;
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(CROP_RENDER_WIDTH / base.width, 4),
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // The page's own text layer, used to close each box in off any question
    // text it enclosed. Absent on a scan, in which case boxes pass through.
    let lines: TextLine[] = [];
    try {
      const content = await page.getTextContent();
      lines = toTextLines(
        content.items as { str: string; transform: number[] }[],
        base.width,
        base.height
      );
    } catch {
      // No text layer; the model's box is all there is to go on.
    }

    for (const req of pageRequests) {
      /*
       * Pad first, then trim. The other order lets the padding put back the
       * very line the trim just removed — the box is closed in to just above
       * the options, and padding then reaches back down across them.
       */
      const crop = cutOut(canvas, trimBoxToFigure(padBox(req.bbox), lines));
      if (crop) out.push({ item_id: req.item_id, data_url: crop });
    }
    page.cleanup();
  }

  await doc.cleanup();
  return out;
}

/** Grows a box by CROP_PADDING on every side, staying inside the page. */
export function padBox(bbox: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}): { x0: number; y0: number; x1: number; y1: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x0: clamp(bbox.x0 - CROP_PADDING),
    y0: clamp(bbox.y0 - CROP_PADDING),
    x1: clamp(bbox.x1 + CROP_PADDING),
    y1: clamp(bbox.y1 + CROP_PADDING),
  };
}

/** One crop, or null when the region is blank or degenerate. */
function cutOut(
  source: HTMLCanvasElement,
  bbox: { x0: number; y0: number; x1: number; y1: number }
): string | null {
  const x0 = bbox.x0 * source.width;
  const y0 = bbox.y0 * source.height;
  const x1 = bbox.x1 * source.width;
  const y1 = bbox.y1 * source.height;

  const w = Math.round(x1 - x0);
  const h = Math.round(y1 - y0);
  if (w < 24 || h < 24) return null;

  const cut = document.createElement("canvas");
  cut.width = w;
  cut.height = h;
  const ctx = cut.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, Math.round(x0), Math.round(y0), w, h, 0, 0, w, h);

  if (!hasInk(ctx, w, h)) return null;

  // Scale down only if the crop is wider than a printed figure ever needs.
  if (w > MAX_CROP_WIDTH) {
    const scaled = document.createElement("canvas");
    scaled.width = MAX_CROP_WIDTH;
    scaled.height = Math.round((h * MAX_CROP_WIDTH) / w);
    const sctx = scaled.getContext("2d")!;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, scaled.width, scaled.height);
    sctx.drawImage(cut, 0, 0, scaled.width, scaled.height);
    return scaled.toDataURL("image/jpeg", 0.9);
  }
  return cut.toDataURL("image/jpeg", 0.9);
}

/**
 * True when enough of the region is non-white to be a diagram.
 *
 * A bounding box that missed lands on the page's margin or the gutter between
 * columns, and a blank rectangle printed under a question reads as a rendering
 * failure to whoever sits the paper. Sampling every 4th pixel is ample for a
 * threshold this coarse and keeps a full page of crops instant.
 */
function hasInk(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  let inked = 0;
  let sampled = 0;
  for (let i = 0; i < data.length; i += 16) {
    sampled++;
    // Rec. 601 luma is overkill here; a plain mean separates ink from paper.
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 200) inked++;
  }
  return sampled > 0 && inked / sampled >= MIN_FIGURE_CROP_INK;
}
