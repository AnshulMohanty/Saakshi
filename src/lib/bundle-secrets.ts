/**
 * Scans browser bundles for secrets (pure; `pnpm check:bundle` feeds it .next/static after a build
 * made with canary values). A leak is a canary value, the name of a secret env var, or a string
 * shaped like a known key. Names matter too: a secret's name in client code means server code
 * that reads it was bundled for the browser.
 */
export const SECRET_ENV_NAMES = [
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_API_KEY",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
  "CAPTURE_TOKEN_SECRET",
  "DEMO_ADMIN_SECRET",
] as const;

const KEY_SHAPES: Array<[string, RegExp]> = [
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["Postgres URL with password", /postgres(?:ql)?:\/\/[^:\s"'/]+:[^@\s"']+@/],
  ["Inngest signing key", /\bsignkey-(?:prod|test|branch)-[0-9a-f]{16,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

export interface BundleLeak {
  file: string;
  kind: "canary" | "env_name" | "key_shape";
  what: string;
  excerpt: string;
}

export function findBundleLeaks(files: Array<{ file: string; text: string }>, canaries: Record<string, string> = {}): BundleLeak[] {
  const leaks: BundleLeak[] = [];
  const excerpt = (text: string, i: number) => text.slice(Math.max(0, i - 40), i + 60).replace(/\s+/g, " ");
  for (const { file, text } of files) {
    for (const [name, value] of Object.entries(canaries)) {
      const i = value ? text.indexOf(value) : -1;
      if (i >= 0) leaks.push({ file, kind: "canary", what: name, excerpt: excerpt(text, i) });
    }
    for (const name of SECRET_ENV_NAMES) {
      const i = text.search(new RegExp(`\\b${name}\\b`));
      if (i >= 0) leaks.push({ file, kind: "env_name", what: name, excerpt: excerpt(text, i) });
    }
    for (const [what, re] of KEY_SHAPES) {
      const m = re.exec(text);
      if (m) leaks.push({ file, kind: "key_shape", what, excerpt: excerpt(text, m.index) });
    }
  }
  return leaks;
}
