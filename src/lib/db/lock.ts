/**
 * Single-process guard for a PGlite data directory. PGlite has no cross-process locking, and two
 * processes writing the same directory corrupt it (e.g. `pnpm dev` plus `pnpm db:migrate`).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export class DatabaseLockedError extends Error {
  constructor(dir: string, pid: number, command: string) {
    super(
      `The local database at ${dir} is in use by process ${pid} (${command}). ` +
        `Stop that process first; PGlite supports one process at a time.`,
    );
    this.name = "DatabaseLockedError";
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

const held = new Set<string>();

/** Takes the lock for `dataDir` (idempotent within a process). Released on process exit. */
export function acquireDataDirLock(dataDir: string): void {
  const lockPath = `${path.resolve(dataDir)}.lock`;
  if (held.has(lockPath)) return;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const mine = JSON.stringify({ pid: process.pid, command: process.argv.slice(1).join(" ").slice(0, 200) });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockPath, mine, { flag: "wx" });
      held.add(lockPath);
      process.once("exit", () => rmSync(lockPath, { force: true }));
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      let owner: { pid?: number; command?: string } = {};
      try {
        owner = JSON.parse(readFileSync(lockPath, "utf8"));
      } catch {
        // Unreadable lock: treat as stale.
      }
      if (owner.pid === process.pid) {
        held.add(lockPath);
        return;
      }
      if (owner.pid && isAlive(owner.pid)) throw new DatabaseLockedError(dataDir, owner.pid, owner.command ?? "unknown");
      rmSync(lockPath, { force: true }); // stale lock from a crashed process
    }
  }
  throw new Error(`Could not acquire database lock ${lockPath}`);
}

export function releaseDataDirLock(dataDir: string): void {
  const lockPath = `${path.resolve(dataDir)}.lock`;
  if (held.delete(lockPath)) rmSync(lockPath, { force: true });
}
