import { getConfig } from "@/lib/config";
import { sandboxVenue, tryToFoolIt } from "@/lib/demo-apis";
import { getPipelineDeps } from "@/lib/pipeline";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const MAX_BYTES = 10 * 1024 * 1024;
const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

/** POST multipart {file}: "Try to fool it". Runs the full pipeline in a 24-hour sandbox project and returns the trust ledger. */
export async function POST(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Send multipart form data with an image in `file`" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Images up to 10 MB" }, { status: 413 });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "JPEG, PNG or WebP only" }, { status: 415 });
  try {
    const out = await tryToFoolIt(await getPipelineDeps(), Buffer.from(await file.arrayBuffer()), file.name || "upload.jpg", getConfig().appUrl, { venue: sandboxVenue(getConfig().env) });
    return Response.json(out, { status: 201 });
  } catch (err) {
    console.error("try-to-fool-it:", err);
    return Response.json({ error: "This photo couldn't be checked. Try another image." }, { status: 422 });
  }
}
