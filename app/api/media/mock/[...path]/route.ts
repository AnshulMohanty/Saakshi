import { MOCK_MEDIA_PREFIX, parseDeliveryPath } from "@/lib/media/transform";
import { getMediaProvider } from "@/lib/providers/media";
import { MockMediaProvider } from "@/lib/providers/media/mock";

/**
 * Mock Cloudinary delivery: /api/media/mock/image/upload/s--sig--/<transformation>/v1/<publicId>.
 * Only signed URLs are served; any edit to the path (transformation, version, public id or
 * signature) fails verification with 401.
 */
export async function GET(request: Request) {
  const media = getMediaProvider();
  if (!(media instanceof MockMediaProvider)) {
    return Response.json({ error: "Mock media is disabled (Cloudinary is configured)" }, { status: 404 });
  }
  // Use the raw, still-encoded path: signatures cover the exact bytes (%252C etc.).
  const pathname = new URL(request.url).pathname;
  const parsed = parseDeliveryPath(pathname.slice(MOCK_MEDIA_PREFIX.length + 1));
  if (!parsed) return Response.json({ error: "Not a delivery path" }, { status: 404 });

  const result = await media.render(parsed, request.headers.get("accept"));
  if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status });
  return new Response(new Uint8Array(result.rendered.body), {
    headers: {
      "content-type": result.rendered.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      vary: "Accept",
    },
  });
}
