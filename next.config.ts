import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone testing: `pnpm tunnel` serves the dev server on a Cloudflare quick-tunnel hostname,
  // which Next's dev server would otherwise refuse as cross-origin.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // No dev-mode badge over the page: it would land in every parity screenshot.
  devIndicators: false,
  serverExternalPackages: [
    // PGlite loads its .wasm/.data files relative to its own module, which bundling breaks.
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    // Renders PDFs with fontkit/yoga (wasm) at runtime; keep it out of the bundle.
    "@react-pdf/renderer",
    "@electric-sql/pglite-socket",
    // exifr lazily imports fs/zlib; bundled, those imports fail and it logs "Couldn't load fs".
    "exifr",
    // (sharp is already on Next's built-in external list.)
  ],
  // The report PDF reads the bundled Noto fonts from disk at runtime: ship them with that route.
  outputFileTracingIncludes: {
    "/api/reports": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
