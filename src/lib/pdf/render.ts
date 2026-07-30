import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

/** Local dev uses whatever Chrome/Edge is already installed. */
const LOCAL_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean) as string[];

function localExecutable(): string | null {
  return LOCAL_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

async function launch(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = localExecutable();
  if (!executablePath) {
    throw new Error(
      "No local Chrome or Edge installation was found for PDF rendering. Set PUPPETEER_EXECUTABLE_PATH to a Chrome executable."
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/** Render a self-contained HTML document to an A4 PDF buffer. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    // No external requests are needed — fonts and images are already inlined.
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font-size:8pt;color:#666;font-family:Times New Roman,serif;padding:0 14mm;text-align:center;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
