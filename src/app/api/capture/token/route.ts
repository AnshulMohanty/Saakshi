import { eq } from "drizzle-orm";
import { signCaptureToken, TOKEN_TTL_MS } from "@/lib/capture/token";
import { getCaptureTokenSecret } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { captureTokens, projects, spots } from "@/lib/db/schema";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

/**
 * POST {project?: slug, spot?: slug} → {token, expiresAt, project, spot}.
 * One token per capture session: valid 15 minutes, usable for several photos.
 */
export async function POST(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const body = (await request.json().catch(() => ({}))) as { project?: string; spot?: string };
  const db = await getDb();

  let spot: typeof spots.$inferSelect | undefined;
  let project: typeof projects.$inferSelect | undefined;
  if (body.spot) {
    [spot] = await db.select().from(spots).where(eq(spots.slug, String(body.spot))).limit(1);
    if (!spot) return Response.json({ error: `Unknown spot "${body.spot}"` }, { status: 404 });
    [project] = await db.select().from(projects).where(eq(projects.id, spot.projectId)).limit(1);
  } else if (body.project) {
    [project] = await db.select().from(projects).where(eq(projects.slug, String(body.project))).limit(1);
    if (!project) return Response.json({ error: `Unknown project "${body.project}"` }, { status: 404 });
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + TOKEN_TTL_MS);
  const [row] = await db
    .insert(captureTokens)
    .values({ issuedAt, expiresAt, projectId: project?.id ?? null, spotId: spot?.id ?? null })
    .returning();
  const token = signCaptureToken(
    { tid: row.id, pid: row.projectId, sid: row.spotId, iat: issuedAt.getTime(), exp: expiresAt.getTime() },
    getCaptureTokenSecret(),
  );
  return Response.json({
    token,
    expiresAt: expiresAt.toISOString(),
    project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
    spot: spot ? { id: spot.id, name: spot.name, slug: spot.slug } : null,
  });
}
