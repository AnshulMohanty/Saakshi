/**
 * Opens Drizzle Studio.
 * - DATABASE_URL set → Studio connects to Postgres directly (drizzle/drizzle.config.ts).
 * - Otherwise → opens local PGlite (with pgvector), serves it on a local port via
 *   pglite-socket, and points Studio at that (drizzle/studio.config.ts).
 * Stop `pnpm dev` first: PGlite supports one process at a time.
 */
import "./_env";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { getConfig } from "../src/lib/config";
import { openPglite } from "../src/lib/db/client";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

function runStudio(config: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    // One command string (config is one of our constant file names), so Windows' shell resolves pnpm.
    // One command string (config is one of our constant file names) so Windows' shell resolves pnpm.
    const child = spawn(`pnpm exec drizzle-kit studio --config ${config}`, { stdio: "inherit", env, shell: true });
    child.on("exit", (code) => resolve(code ?? 0));
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
  });
}

async function main() {
  const { env } = getConfig();
  if (env.DATABASE_URL) process.exit(await runStudio("drizzle/drizzle.config.ts", process.env));

  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const handle = await openPglite(path.resolve(env.PGLITE_DIR));
  const port = await freePort();
  const server = new PGLiteSocketServer({ db: handle.client, host: "127.0.0.1", port, maxConnections: 8 });
  await server.start();
  console.log(`PGlite (${env.PGLITE_DIR}) served on 127.0.0.1:${port} for Drizzle Studio.`);

  const code = await runStudio("drizzle/studio.config.ts", {
    ...process.env,
    STUDIO_DATABASE_URL: `postgres://postgres@127.0.0.1:${port}/postgres`,
  });
  await server.stop();
  await handle.close();
  process.exit(code);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
