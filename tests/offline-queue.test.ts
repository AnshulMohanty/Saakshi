/** The offline capture queue's logic on an in-memory store (lib/client/offline-queue.ts, B5.12). */
import { describe, expect, it } from "vitest";
import { enqueue, flush, memoryStore } from "@/lib/client/offline-queue";

const blob = new Blob(["jpeg"], { type: "image/jpeg" });

describe("offline queue", () => {
  it("marks every queued photo as taken offline and drops empty context", async () => {
    const store = memoryStore();
    const q = await enqueue(store, { createdAt: "2026-09-28T10:00:00.000Z", filename: "a.jpg", blob, context: { source: "witness", client_captured_at: "2026-09-28T10:00:00.000Z", device_lat: undefined, spot: "" } });
    expect(q.context).toEqual({ source: "witness", client_captured_at: "2026-09-28T10:00:00.000Z", taken_offline: "1" });
    expect(await store.all()).toHaveLength(1);
  });

  it("uploads oldest first and removes each accepted photo", async () => {
    const store = memoryStore();
    await enqueue(store, { createdAt: "2026-09-28T10:05:00.000Z", filename: "late.jpg", blob, context: {} });
    await enqueue(store, { createdAt: "2026-09-28T10:00:00.000Z", filename: "early.jpg", blob, context: {} });
    const order: string[] = [];
    const sent: string[] = [];
    const r = await flush(store, async (s) => (order.push(s.filename), `id-${s.filename}`), (_s, id) => sent.push(id));
    expect(r).toEqual({ sent: 2, left: 0, error: null });
    expect(order).toEqual(["early.jpg", "late.jpg"]);
    expect(sent).toEqual(["id-early.jpg", "id-late.jpg"]);
    expect(await store.all()).toEqual([]);
  });

  it("stops at the first failure and keeps the rest for later", async () => {
    const store = memoryStore();
    for (const m of ["00", "01", "02"]) await enqueue(store, { createdAt: `2026-09-28T10:${m}:00.000Z`, filename: `${m}.jpg`, blob, context: {} });
    let n = 0;
    const r = await flush(store, async () => {
      if (++n === 2) throw new TypeError("Failed to fetch");
      return n;
    });
    expect(r).toEqual({ sent: 1, left: 2, error: "Failed to fetch" });
    expect((await store.all()).map((s) => s.filename).sort()).toEqual(["01.jpg", "02.jpg"]);
  });
});
