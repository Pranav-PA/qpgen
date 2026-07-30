import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium and KaTeX's font files are loaded from disk at runtime by the PDF
  // route, so they must be traced into the serverless bundle explicitly.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/papers/[id]/export-pdf": [
      "./node_modules/katex/dist/katex.min.css",
      "./node_modules/katex/dist/fonts/**",
      // The brotli-packed Chromium build (~67 MB) is loaded from disk at
      // runtime; tracing cannot infer it because the path is built dynamically.
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
