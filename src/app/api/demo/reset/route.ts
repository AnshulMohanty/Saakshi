import { adminAllowed as authorised, hasAdminSecret } from "@/lib/admin";
import { currentDemoJob, startDemoReset } from "@/lib/demo/job";

/**
 * POST {includeWitness?}: wipe demo data, re-import (cache-first) and re-plant, in the background.
 * includeWitness (a full wipe, deleting witness photos too) always needs the admin secret.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Forbidden: x-demo-admin-secret required" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { includeWitness?: boolean };
  const includeWitness = body.includeWitness === true;
  if (includeWitness && !hasAdminSecret(request)) {
    return Response.json({ error: "includeWitness deletes witness photos: set DEMO_ADMIN_SECRET and send x-demo-admin-secret" }, { status: 403 });
  }
  const started = startDemoReset(Date.now(), { includeWitness });
  if (!started.ok) {
    return Response.json(
      { error: started.reason === "busy" ? "A demo reset is already running" : "Demo reset is rate-limited (one per minute)", job: currentDemoJob() },
      { status: started.reason === "busy" ? 409 : 429, headers: { "retry-after": String(started.retryAfterS) } },
    );
  }
  return Response.json({ job: started.job }, { status: 202 });
}

/** GET: status and log of the current/last demo reset. */
export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ job: currentDemoJob() });
}
