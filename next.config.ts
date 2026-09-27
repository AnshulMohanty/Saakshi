import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone testing: `pnpm tunnel` serves the dev server on a Cloudflare quick-tunnel hostname,
  // which Next's dev server would otherwise refuse as cross-origin.
  allowedDevOrigins: ["*.trycloudflare.com"],
  serverExternalPackages: [
    // PGlite loads its .wasm/.data files relative to its own module, which bundling breaks.
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "@electric-sql/pglite-socket",
    // exifr lazily imports fs/zlib; bundled, those imports fail and it logs "Couldn't load fs".
    "exifr",
    // (sharp is already on Next's built-in external list.)
  ],
};

export default nextConfig;
