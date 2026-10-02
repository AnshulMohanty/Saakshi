import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";
import { listReviewQueue } from "@/lib/review";

/** GET ?reason=CODE: photos awaiting review, worst score first, with per-reason counts. */
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason");
  if (reason && !/^[A-Z_]{3,40}$/.test(reason)) return Response.json({ error: "Bad reason" }, { status: 400 });
  const queue = await listReviewQueue(await getDb(), getMediaProvider(), { reason });
  return Response.json(queue, { headers: { "cache-control": "no-store" } });
}
