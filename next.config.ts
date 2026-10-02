import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Same-origin everything, plus Cloudinary for delivery and direct browser uploads, and OSM tiles for the spot map. */
const CSP = [
  "default-src 'self'",
  // Next's inline flight data and the intro's before-paint script.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No upgrade-insecure-requests: HSTS covers https on the real domain, and WebKit would upgrade http://localhost too.
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return isProd ? [{ source: "/:path*", headers: SECURITY_HEADERS }] : [];
  },
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
    "/api/reports": ["./src/assets/fonts/**/*"],
  },
};

export default nextConfig;
