/**
 * Read-only status of the pipeline (`pnpm demo:status`): assets by status, steps by status,
 * step errors grouped by message, and provider spend from provider_usage. The grouping is pure
 * (tested); `readStatus` only selects.
 */
import { and, count, gte, sql, sum } from "drizzle-orm";
import type { DB } from "../db/client";
import { assets, providerUsage, type PipelineStepName } from "../db/schema";
import { STEP_ORDER } from "../pipeline/steps";

export interface StatusAsset {
  id: string;
  source: string;
  status: string;
  externalId: string | null;
  testCase: string | null;
  steps: Partial<Record<PipelineStepName, { status?: string; error?: string; output?: unknown } | undefined>>;
}

export interface ErrorGroup {
  step: PipelineStepName;
  message: string;
  n: number;
  examples: string[];
}

/** Ids, hex and numbers vary per asset; the rest of the message is the reason. */
export const errorKey = (message: string) =>
  message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/saakshi\/[\w/-]+/g, "<public id>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

/** The furthest step each asset reached, and where it stopped. */
export function stepOf(a: StatusAsset): { reached: PipelineStepName | null; failed: PipelineStepName | null; running: PipelineStepName | null } {
  let reached: PipelineStepName | null = null;
  let failed: PipelineStepName | null = null;
  let running: PipelineStepName | null = null;
  for (const name of STEP_ORDER) {
    const s = a.steps[name]?.status;
    if (s === "done") reached = name;
    else if (s === "error") failed ??= name;
    else if (s === "running") running ??= name;
  }
  return { reached, failed, running };
}

export function summariseStatus(rows: StatusAsset[]) {
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, Record<string, number>> = {};
  const bySteps: Record<string, Record<string, number>> = {};
  const groups = new Map<string, ErrorGroup>();
  for (const a of rows) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    (bySource[a.source] ??= {})[a.status] = (bySource[a.source][a.status] ?? 0) + 1;
    for (const name of STEP_ORDER) {
      const s = a.steps[name]?.status ?? "not run";
      (bySteps[name] ??= {})[s] = (bySteps[name][s] ?? 0) + 1;
      const err = a.steps[name]?.error;
      if (a.steps[name]?.status === "error" && err) {
        const k = `${name}|${errorKey(err)}`;
        const g = groups.get(k) ?? { step: name, message: errorKey(err), n: 0, examples: [] };
        g.n++;
        if (g.examples.length < 3) g.examples.push(a.externalId ?? a.testCase ?? a.id);
        groups.set(k, g);
      }
    }
  }
  return { total: rows.length, byStatus, bySource, bySteps, errors: [...groups.values()].sort((x, y) => y.n - x.n) };
}

export async function readStatus(db: DB) {
  const rows = await db
    .select({ id: assets.id, source: assets.source, status: assets.status, externalId: assets.externalId, testCase: assets.testCase, pipeline: assets.pipeline })
    .from(assets);
  return summariseStatus(rows.map((r) => ({ ...r, steps: (r.pipeline?.steps ?? {}) as StatusAsset["steps"] })));
}

/** Calls and documented cost per provider since `since` (cost is null where no price is documented). */
export async function readSpend(db: DB, since: Date) {
  return db
    .select({
      provider: providerUsage.provider,
      operation: providerUsage.operation,
      calls: count(),
      failed: sql<number>`count(*) filter (where ${providerUsage.ok} = false)`.mapWith(Number),
      costUsd: sum(providerUsage.costUsd).mapWith(Number),
      transformations: sql<number>`coalesce(sum((${providerUsage.units}->>'transformations')::numeric), 0)`.mapWith(Number),
    })
    .from(providerUsage)
    .where(and(gte(providerUsage.at, since), sql`${providerUsage.mode} = 'real'`))
    .groupBy(providerUsage.provider, providerUsage.operation);
}
