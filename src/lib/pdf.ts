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

/** Padding around the model's box, as a fraction of page size. */
const CROP_PADDING = 0.012;
/** Crops are re-rendered well above the ~1200px used for reading the page. */
const CROP_RENDER_WIDTH = 2200;
/** Cap on a crop's own width, so a page-wide figure is not shipped at full scale. */
const MAX_CROP_WIDTH = 1000;

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

    for (const req of pageRequests) {
      const crop = cutOut(canvas, req.bbox);
      if (crop) out.push({ item_id: req.item_id, data_url: crop });
    }
    page.cleanup();
  }

  await doc.cleanup();
  return out;
}

/** One crop, or null when the region is blank or degenerate. */
function cutOut(
  source: HTMLCanvasElement,
  bbox: { x0: number; y0: number; x1: number; y1: number }
): string | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(bbox.x0 - CROP_PADDING) * source.width;
  const y0 = clamp(bbox.y0 - CROP_PADDING) * source.height;
  const x1 = clamp(bbox.x1 + CROP_PADDING) * source.width;
  const y1 = clamp(bbox.y1 + CROP_PADDING) * source.height;

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
