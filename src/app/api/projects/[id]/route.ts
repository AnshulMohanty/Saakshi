import { eq } from "drizzle-orm";
import { adminAllowed } from "@/lib/admin";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { ProjectPatch, updateProject } from "@/lib/projects";
import { getMediaProvider } from "@/lib/providers/media";

const badId = (id: string) => !/^[0-9a-f-]{36}$/i.test(id);

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (badId(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const [p] = await (await getDb()).select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  const { embedding: _e, ...rest } = p;
  void _e;
  return Response.json(rest);
}

/**
 * PATCH: edit a project. A change to its centre, radius, dates or pair gap re-scores every photo
 * in it. Development: open; production: x-demo-admin-secret.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  if (!adminAllowed(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (badId(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const parsed = ProjectPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    const out = await updateProject(await getDb(), getMediaProvider(), id, parsed.data);
    if (!out) return Response.json({ error: "Not found" }, { status: 404 });
    const { embedding: _e, ...project } = out.project;
    void _e;
    return Response.json({ project, changed: out.changed, rescore: out.rescore });
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
