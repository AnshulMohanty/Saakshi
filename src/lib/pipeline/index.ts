/**
 * Pipeline entry points: build the provider-backed deps, register the "asset.uploaded" handler
 * for the inline queue, and enqueue assets.
 */
import "server-only";
import { getConfig } from "../config";
import { getDb } from "../db/client";
import { getAIProvider } from "../providers/ai";
import { getAnalysisProvider } from "../providers/analysis";
import { getGeocoder } from "../providers/geocoder";
import { getMediaProvider } from "../providers/media";
import { getQueue, handlers } from "../providers/queue";
import { runPipeline } from "./runner";
import type { PipelineDeps } from "./steps";

export async function getPipelineDeps(): Promise<PipelineDeps> {
  const { env } = getConfig();
  return {
    db: await getDb(),
    media: getMediaProvider(),
    analysis: getAnalysisProvider(),
    ai: getAIProvider(),
    geocoder: getGeocoder(),
    exifDefaultOffset: env.EXIF_DEFAULT_UTC_OFFSET,
    similarityThreshold: env.ASSIGN_SIMILARITY_THRESHOLD,
    measureMax: env.MEASURE_MAX_PER_PROJECT,
  };
}

const g = globalThis as typeof globalThis & { __saakshiPipelineRegistered?: WeakSet<object> };

/** Registers the inline handler once per registry (module graphs may each have their own). */
export function ensurePipelineRegistered(): void {
  g.__saakshiPipelineRegistered ??= new WeakSet();
  if (g.__saakshiPipelineRegistered.has(handlers)) return;
  g.__saakshiPipelineRegistered.add(handlers);
  handlers.on("asset.uploaded", async ({ assetId }) => {
    await runPipeline(await getPipelineDeps(), assetId);
  });
}

/** Queues the evidence pipeline for an asset (inline: starts now, returns immediately). */
export async function enqueueAsset(assetId: string): Promise<void> {
  ensurePipelineRegistered();
  await getQueue().send("asset.uploaded", { assetId });
}

/** Waits for in-process pipeline work to finish (inline queue only). */
export async function drainQueue(): Promise<void> {
  await getQueue().drain();
}
