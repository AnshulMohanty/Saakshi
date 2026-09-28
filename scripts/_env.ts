/**
 * Loads .env, .env.local and .env.<mode> the way `next dev` / `next build` do (@next/env), so the
 * CLI scripts see the same variables as the app. Import it first. `--prod` (verify:env) loads
 * the production files.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), !process.argv.includes("--prod"), { info: () => {}, error: console.error });
