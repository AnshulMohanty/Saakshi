import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

/** The request carries x-demo-admin-secret matching DEMO_ADMIN_SECRET (never set means never). */
export function hasAdminSecret(request: Request): boolean {
  const secret = getConfig().env.DEMO_ADMIN_SECRET;
  const given = request.headers.get("x-demo-admin-secret") ?? "";
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Admin actions: open in development; production needs DEMO_ADMIN_SECRET. */
export function adminAllowed(request: Request): boolean {
  return !getConfig().isProduction || hasAdminSecret(request);
}
