/**
 * `pnpm verify:env [--prod]`: checks the environment. Without --prod (development) only mistakes
 * are errors; with --prod every real service is required (lib/verify-env.ts). Exit code 1 on errors.
 * --prod loads .env.production* files, like `next build`.
 */
import "./_env";
import { verifyEnv } from "../lib/verify-env";

const prod = process.argv.includes("--prod");
const { ok, checks } = verifyEnv(process.env, { prod });
console.log(`verify:env${prod ? " --prod" : ""}\n`);
const mark = { ok: "✓", warning: "!", error: "✗" } as const;
for (const c of checks) console.log(`${mark[c.level]} ${c.name.padEnd(24)} ${c.message}`);
const errors = checks.filter((c) => c.level === "error").length;
const warnings = checks.filter((c) => c.level === "warning").length;
console.log(`\n${ok ? "OK" : "NOT READY"}: ${errors} error(s), ${warnings} warning(s).${!ok && prod ? " What to set, and where: docs/MANUAL_STEPS.md." : ""}`);
if (!ok) process.exitCode = 1;
