/**
 * Live feed of Witness Capture photos: arrivals and status changes, for the Witness Wall and the
 * landing mini-map. Built on the database (assets.updated_at), not an in-memory bus, so it works
 * whichever process runs the pipeline. SSE streams poll; `?since=` returns the same events once.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import type { DB } from "./db/client";
import { assets, type Asset } from "./db/schema";
import { arrivalReason, placeShort } from "./landing/copy";
import { THUMB } from "./library";
import type { MediaProvider } from "./providers/media";

export interface LiveEvent {
  kind: "arrival" | "status";
  id: string;
  status: Asset["status"];
  band: Asset["trustBand"];
  score: number | null;
  projectId: string | null;
  spotId: string | null;
  location: { lat: number; lng: number } | null;
  attested: boolean;
  capturedAt: string | null;
  updatedAt: string;
  thumbUrl: string;
  /** "Palayakkadu, TiruppurNorth" (reverse-geocoded), when known. */
  place: string | null;
  /** Its flag, else its first scoring reason, once scored (lib/landing/copy.ts arrivalReason). */
  reason: string | null;
}

function toEvent(media: MediaProvider, a: Asset, kind: LiveEvent["kind"]): LiveEvent {
  const fix = a.capture?.deviceFix;
  return {
    kind,
    id: a.id,
    status: a.status,
    band: a.trustBand,
    score: a.trustScore,
    projectId: a.projectId,
    spotId: a.spotId,
    location: fix ? { lat: fix.lat, lng: fix.lng } : null,
    attested: a.capture?.attested ?? false,
    capturedAt: a.capturedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
    thumbUrl: media.url(a.cldPublicId, THUMB, { signed: true }),
    place: placeShort(a.placeName),
    reason: a.trustBand ? arrivalReason(a.trustReasons) : null,
  };
}

/** Witness photos updated after `since`, oldest first: one event each, with its latest state. */
export async function liveSince(db: DB, media: MediaProvider, since: Date, limit = 100): Promise<{ events: LiveEvent[]; cursor: string }> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.source, "witness"), gt(assets.updatedAt, since)))
    .orderBy(asc(assets.updatedAt), asc(assets.id))
    .limit(limit);
  const events = rows.map((a) => toEvent(media, a, a.createdAt > since ? "arrival" : "status"));
  return { events, cursor: (rows.at(-1)?.updatedAt ?? since).toISOString() };
}

export interface LiveStreamOptions {
  since?: Date;
  pollMs?: number;
  heartbeatMs?: number;
  signal?: AbortSignal;
}

/**
 * Server-Sent Events: `event: arrival|status` with the LiveEvent as data, only when an asset is
 * new or its status/band changed (pipeline steps touch updated_at without changing either).
 */
export function liveStream(db: DB, media: MediaProvider, { since = new Date(), pollMs = 1500, heartbeatMs = 15_000, signal }: LiveStreamOptions = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const seen = new Map<string, string>();
  let cursor = since;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastBeat = Date.now();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(enc.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        controller.close();
      };
      signal?.addEventListener("abort", close);
      send(`retry: ${Math.max(1000, pollMs)}\n: connected ${cursor.toISOString()}\n\n`);

      const tick = async () => {
        if (closed) return;
        try {
          const { events, cursor: next } = await liveSince(db, media, cursor);
          cursor = new Date(next);
          for (const e of events) {
            const key = `${e.status}|${e.band ?? ""}`;
            const prev = seen.get(e.id);
            if (prev === key) continue;
            seen.set(e.id, key);
            send(`id: ${e.updatedAt}\nevent: ${prev === undefined && e.kind === "arrival" ? "arrival" : "status"}\ndata: ${JSON.stringify(e)}\n\n`);
          }
          if (Date.now() - lastBeat > heartbeatMs) {
            lastBeat = Date.now();
            send(`: heartbeat\n\n`);
          }
        } catch (err) {
          send(`event: error\ndata: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
        }
        if (!closed) timer = setTimeout(tick, pollMs);
      };
      void tick();
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
    },
  });
}

