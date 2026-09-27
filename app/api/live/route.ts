import { getDb } from "@/lib/db/client";
import { liveSince, liveStream } from "@/lib/live";
import { getMediaProvider } from "@/lib/providers/media";

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
  const resume = parseSince(request.headers.get("last-event-id"));
  const stream = liveStream(db, media, { since: resume ?? new Date(), signal: request.signal });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
