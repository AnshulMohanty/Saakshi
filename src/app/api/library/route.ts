import { getDb } from "@/lib/db/client";
import { listLibrary, SOURCES, STATUSES } from "@/lib/library";
import { getMediaProvider } from "@/lib/providers/media";

/** GET ?project=&source=&status=&test=1 → assets (signed, face-blurred thumbs), projects, spots. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const pick = <T extends string>(v: string | null, allowed: readonly T[]) => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null);
  const project = q.get("project");
  const data = await listLibrary(await getDb(), getMediaProvider(), {
    project: project && /^[0-9a-f-]{36}$/i.test(project) ? project : null,
    source: pick(q.get("source"), SOURCES),
    status: pick(q.get("status"), STATUSES),
    test: q.get("test") === "1",
  });
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
