/**
 * Usage records for real provider calls (lib/providers/http.ts writes them). The sink is
 * pluggable: by default records are queued and written to provider_usage by `flushUsage` (the
 * pipeline and scripts flush; the app flushes after each request that called a provider).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { DB } from "./db/client";
import { providerUsage, type ProviderMode } from "./db/schema";

export interface UsageEntry {
  provider: string;
  operation: string;
  model: string | null;
  mode: ProviderMode;
  units: Record<string, number>;
  latencyMs: number;
  costUsd: number | null;
  ok: boolean;
  status: number | null;
  attempts: number;
  assetId: string | null;
  error: string | null;
}

const g = globalThis as typeof globalThis & { __saakshiUsage?: UsageEntry[] };
const queue = (): UsageEntry[] => (g.__saakshiUsage ??= []);

/** The asset a call is made for (the pipeline runs each step inside one). */
const context = new AsyncLocalStorage<{ assetId: string }>();
export const withUsageAsset = <T>(assetId: string, fn: () => Promise<T>): Promise<T> => context.run({ assetId }, fn);

export function recordUsage(u: UsageEntry): void {
  const q = queue();
  q.push(u.assetId ? u : { ...u, assetId: context.getStore()?.assetId ?? null });
  if (q.length > 5000) q.splice(0, q.length - 5000); // never grow without bound
}

/** Writes queued usage to the database. Safe to call often; failures keep the records queued. */
export async function flushUsage(db: DB): Promise<number> {
  const q = queue();
  if (!q.length) return 0;
  const batch = q.splice(0, q.length);
  try {
    await db.insert(providerUsage).values(batch);
    return batch.length;
  } catch (err) {
    q.unshift(...batch);
    throw err;
  }
}

export const pendingUsage = (): readonly UsageEntry[] => queue();

/** flushUsage that never throws (usage logging must not fail the work it measures). */
export async function flushUsageQuietly(db: DB): Promise<void> {
  if (!queue().length) return;
  try {
    await flushUsage(db);
  } catch (err) {
    console.warn(`[usage] could not write provider_usage: ${err instanceof Error ? err.message : err}`);
  }
}
