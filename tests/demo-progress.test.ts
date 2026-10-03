/** Demo-run observability (pure): per-asset outcome lines, the heartbeat, and pnpm demo:status grouping. */
import { describe, expect, it, vi } from "vitest";
import { outcomeLine, PipelineProgress } from "@/lib/demo/progress";
import { errorKey, stepOf, summariseStatus, type StatusAsset } from "@/lib/demo/status";

describe("PipelineProgress", () => {
  it("prints one line per asset with its outcome and duration, and counts done / error / running / queued", () => {
    const lines: string[] = [];
    let t = 0;
    const p = new PipelineProgress((m) => void lines.push(m), () => t);
    p.enqueue();
    p.enqueue();
    p.enqueue();
    p.start("a");
    p.start("b");
    t = 14_000;
    p.finish("a", { label: "commons:1", status: "ready", band: "VERIFIED", score: 85, measure: "measured" });
    t = 75_000;
    p.finish("b", { label: "commons:2", status: null, failed: { step: "measure", error: "cloudinary derived failed (HTTP 400): Invalid transformation" } });
    expect(lines).toEqual([
      "  ✓ commons:1  ready VERIFIED 85  · measure: measured (14 s)",
      "  ✗ commons:2  measure failed: cloudinary derived failed (HTTP 400): Invalid transformation (75 s)",
    ]);
    expect(p.line()).toBe("  … done 1 / error 1 / running 0 / queued 1, 1 min 15 s elapsed");
    expect(outcomeLine({ label: "planted:stock", status: "flagged", band: "FLAGGED", score: 40, measure: "skipped: flagged" })).toBe("  ✓ planted:stock  flagged FLAGGED 40  · measure: skipped: flagged");
  });

  it("the heartbeat logs while work is pending and stops when it settles", async () => {
    vi.useFakeTimers();
    try {
      const lines: string[] = [];
      const p = new PipelineProgress((m) => void lines.push(m));
      let resolve!: () => void;
      const done = p.heartbeat(new Promise<void>((r) => (resolve = r)), 30_000);
      await vi.advanceTimersByTimeAsync(95_000);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^ {2}… done 0 \/ error 0 \/ running 0 \/ queued 0, /);
      resolve();
      await done;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(lines).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("demo:status", () => {
  const asset = (o: Partial<StatusAsset>): StatusAsset => ({ id: "00000000-0000-4000-8000-000000000001", source: "archive", status: "ready", externalId: null, testCase: null, steps: {}, ...o });

  it("groups step errors by reason, ignoring ids and public ids", () => {
    expect(errorKey("cloudinary derived failed for saakshi/archive/abc123 (asset 6b1f0c3e-1d2a-4b5c-8d9e-0f1a2b3c4d5e)")).toBe("cloudinary derived failed for <public id> (asset <id>)");
    const err = (msg: string) => ({ parseMetadata: { status: "done" }, measure: { status: "error", error: msg } });
    const s = summariseStatus([
      asset({ externalId: "commons:1", steps: err("cloudinary derived failed (HTTP 401): ") }),
      asset({ externalId: "commons:2", steps: err("cloudinary derived failed (HTTP 401): ") }),
      asset({ externalId: "commons:3", status: "processing", steps: err("cloudinary derived failed (HTTP 400): Invalid input for extract") }),
      asset({ source: "planted_test", testCase: "stock", status: "flagged", steps: { finalize: { status: "done" } } }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ ready: 2, processing: 1, flagged: 1 });
    expect(s.bySource).toEqual({ archive: { ready: 2, processing: 1 }, planted_test: { flagged: 1 } });
    expect(s.bySteps.measure).toEqual({ error: 3, "not run": 1 });
    expect(s.errors).toEqual([
      { step: "measure", message: "cloudinary derived failed (HTTP 401):", n: 2, examples: ["commons:1", "commons:2"] },
      { step: "measure", message: "cloudinary derived failed (HTTP 400): Invalid input for extract", n: 1, examples: ["commons:3"] },
    ]);
  });

  it("stepOf: the furthest step done, the first failed and the first running", () => {
    expect(stepOf(asset({ steps: { parseMetadata: { status: "done" }, analyze: { status: "done" }, understand: { status: "running" } } }))).toEqual({ reached: "analyze", failed: null, running: "understand" });
    expect(stepOf(asset({ steps: { score: { status: "done" }, measure: { status: "error" } } }))).toEqual({ reached: "score", failed: "measure", running: null });
  });
});
