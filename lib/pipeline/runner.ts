/**
 * Runs the evidence pipeline for one asset, Inngest-style: each step goes through a `step`
 * wrapper (Inngest's step.run when on Inngest, a direct call inline), so the pipeline is
 * written once.
 *
 * Idempotency (rule 6), keyed by asset id: a step whose record is "done" is skipped and returns
 * its stored output: no writes, no audit row. Otherwise the patch, the step record and one
 * hash-chained audit row are written in a single transaction. Failures record the error on the
 * step and rethrow, so retries resume from the failed step.
 */
import { eq, sql } from "drizzle-orm";
import { appendAudit } from "../audit";
import type { DB } from "../db/client";
import { assets, type PipelineStepName, type PipelineStepRecord } from "../db/schema";
import { loadAsset, STEP_ORDER, STEPS, type PipelineDeps } from "./steps";

export type StepWrapper = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
export const directStep: StepWrapper = (_name, fn) => fn();

export const PIPELINE_ACTOR = "pipeline";

function stepPath(name: PipelineStepName) {
  return `{steps,${name}}`;
}

async function writeStepRecord(db: DB, assetId: string, name: PipelineStepName, rec: PipelineStepRecord) {
  await db
    .update(assets)
    .set({ pipeline: sql`jsonb_set(${assets.pipeline}, ${stepPath(name)}::text[], ${JSON.stringify(rec)}::jsonb, true)` })
    .where(eq(assets.id, assetId));
}

/** Keeps audit detail small: scalar outputs and short arrays only. */
function auditDetail(output: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(output)) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 200) : v;
    else if (Array.isArray(v) && v.length <= 20) out[k] = v;
    else if (typeof v === "object") out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

export interface StepOutcome {
  step: PipelineStepName;
  skipped: boolean;
  output: unknown;
}

export async function executeStep(deps: PipelineDeps, assetId: string, name: PipelineStepName): Promise<StepOutcome> {
  const asset = await loadAsset(deps.db, assetId);
  const previous = asset.pipeline?.steps?.[name];
  if (previous?.status === "done") return { step: name, skipped: true, output: previous.output };

  const startedAt = new Date().toISOString();
  const attempts = (previous?.attempts ?? 0) + 1;
  await writeStepRecord(deps.db, assetId, name, { status: "running", attempts, startedAt });
  try {
    const { output, patch, apply } = await STEPS[name](deps, asset);
    const rec: PipelineStepRecord = { status: "done", attempts, startedAt, finishedAt: new Date().toISOString(), output };
    await deps.db.transaction(async (tx) => {
      const pipelinePatch =
        name === "finalize"
          ? sql`jsonb_set(jsonb_set(${assets.pipeline}, ${stepPath(name)}::text[], ${JSON.stringify(rec)}::jsonb, true), '{completedAt}', ${JSON.stringify(rec.finishedAt)}::jsonb, true)`
          : sql`jsonb_set(${assets.pipeline}, ${stepPath(name)}::text[], ${JSON.stringify(rec)}::jsonb, true)`;
      if (apply) await apply(tx as unknown as DB);
      await tx.update(assets).set({ ...patch, pipeline: pipelinePatch }).where(eq(assets.id, assetId));
      await appendAudit(tx as unknown as DB, { assetId, actor: PIPELINE_ACTOR, action: `pipeline.${name}`, detail: auditDetail(output) });
    });
    return { step: name, skipped: false, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeStepRecord(deps.db, assetId, name, { status: "error", attempts, startedAt, finishedAt: new Date().toISOString(), error: message.slice(0, 500) });
    throw err;
  }
}

/** All steps in order. `step` is Inngest's step.run on Inngest, a direct call inline. */
export async function runPipeline(deps: PipelineDeps, assetId: string, step: StepWrapper = directStep): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (const name of STEP_ORDER) outcomes.push(await step(name, () => executeStep(deps, assetId, name)));
  return outcomes;
}
