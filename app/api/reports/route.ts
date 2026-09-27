import { z } from "zod";
import { adminAllowed } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getAIProvider } from "@/lib/providers/ai";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";
import { generateReport, reportPath } from "@/lib/report/generate";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({ projectId: z.string().regex(/^[0-9a-f-]{36}$/i), from: Day.optional(), to: Day.optional() });
const limiter = createRateLimiter({ limit: 6, windowMs: 60_000 });

/** POST {projectId, from?, to?}: builds claims, prose, the PDF and the campaign kit. Development: open; production: admin secret. */
export async function POST(request: Request) {
  if (!adminAllowed(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {projectId, from?, to?}" }, { status: 400 });
  try {
    const out = await generateReport({ db: await getDb(), media: getMediaProvider(), ai: getAIProvider(), appUrl: getConfig().appUrl }, parsed.data.projectId, parsed.data);
    return Response.json({ id: out.report.id, url: reportPath(out.report.id), claims: out.report.claims.length, pdfBytes: out.pdfBytes }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
