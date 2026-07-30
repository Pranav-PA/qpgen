"use client";

import { MAX_REFERENCE_PDF_PAGES } from "./constants";
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
