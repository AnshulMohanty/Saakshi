import "server-only";
import { getConfig } from "./config";
import { safeEqual } from "./safe-equal";

/** The request carries x-demo-admin-secret matching DEMO_ADMIN_SECRET (never set means never). */
export function hasAdminSecret(request: Request): boolean {
  const secret = getConfig().env.DEMO_ADMIN_SECRET;
  return !!secret && safeEqual(request.headers.get("x-demo-admin-secret") ?? "", secret);
}

/** Admin actions: open in development; production needs DEMO_ADMIN_SECRET. */
export function adminAllowed(request: Request): boolean {
  return !getConfig().isProduction || hasAdminSecret(request);
}

/**
 * Witness Wall operator mode (B5.8): `?operator=1` in development; in production
 * `?operator=<WALL_OPERATOR_SECRET>`, a key that can only turn on rehearsals (it rides in a URL
 * on a venue screen, so it is never the admin secret). Rehearsals are labelled and never counted.
 */
export function operatorAllowed(operator: string | null | undefined): boolean {
  if (!operator) return false;
  if (!getConfig().isProduction) return true;
  const key = getConfig().env.WALL_OPERATOR_SECRET;
  return !!key && safeEqual(operator, key);
}
