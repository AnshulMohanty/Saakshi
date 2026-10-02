import { getDb } from "@/lib/db/client";
import { liveSince, liveStream } from "@/lib/live";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey } from "@/lib/ratelimit";

/** A stream lives at most this long; EventSource reconnects with Last-Event-ID. */
export const maxDuration = 300;
const MAX_STREAMS_PER_CLIENT = 4;
const open = new Map<string, number>();

const parseSince = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * GET: Server-Sent Events of Witness Capture arrivals and status changes (event: arrival|status).
 * GET ?since=<ISO>: polling fallback, the same events as JSON {events, cursor}; pass the cursor
 * back as ?since= next time. SSE clients resume from Last-Event-ID.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await getDb();
  const media = getMediaProvider();
  const since = parseSince(url.searchParams.get("since"));
  if (url.searchParams.has("since")) {
    if (!since) return Response.json({ error: "since must be an ISO date-time" }, { status: 400 });
    return Response.json(await liveSince(db, media, since), { headers: { "cache-control": "no-store" } });
  }
  const key = clientKey(request);
  if ((open.get(key) ?? 0) >= MAX_STREAMS_PER_CLIENT) return Response.json({ error: "Too many open streams; use ?since= polling" }, { status: 429, headers: { "retry-after": "30" } });
  open.set(key, (open.get(key) ?? 0) + 1);
  const release = () => {
    const n = (open.get(key) ?? 1) - 1;
    if (n <= 0) open.delete(key);
    else open.set(key, n);
  };
  // Close on its own before the platform's limit, so the count is always released.
  const deadline = AbortSignal.timeout((maxDuration - 10) * 1000);
  const signal = AbortSignal.any([request.signal, deadline]);
  signal.addEventListener("abort", release, { once: true });
  const resume = parseSince(request.headers.get("last-event-id"));
  const stream = liveStream(db, media, { since: resume ?? new Date(), signal });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
