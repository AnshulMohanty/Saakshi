/**
 * The evidence pipeline as an Inngest function. Same steps as the inline runner: each pipeline
 * step is one Inngest step.run, so retries resume at the failed step and done steps are memoised
 * (our own per-step records make them idempotent even outside Inngest).
 */
import "server-only";
import { getConfig } from "../config";
import { getInngestClient } from "../providers/queue/real";
import { getPipelineDeps } from "./index";
import { runPipeline, type StepWrapper } from "./runner";

export function inngestEnabled(): boolean {
  return getConfig().providers.queue.mode === "real";
}

export function createPipelineFunctions() {
  const { env } = getConfig();
  const inngest = getInngestClient(!(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY));
  const evidencePipeline = inngest.createFunction(
    { id: "evidence-pipeline", triggers: [{ event: "asset.uploaded" }], concurrency: { limit: 4 } },
    async ({ event, step }) => {
      const deps = await getPipelineDeps();
      const wrap = ((name: string, fn: () => Promise<unknown>) => step.run(name, fn)) as unknown as StepWrapper;
      const outcomes = await runPipeline(deps, (event.data as { assetId: string }).assetId, wrap);
      return { steps: outcomes.map((o) => ({ step: o.step, skipped: o.skipped })) };
    },
  );
  return { inngest, functions: [evidencePipeline] };
}
