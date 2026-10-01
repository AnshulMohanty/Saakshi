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

/** A secret given in a URL (the Wall's operator link) matches DEMO_ADMIN_SECRET. */
export function secretMatches(given: string | null | undefined): boolean {
  const secret = getConfig().env.DEMO_ADMIN_SECRET;
  const g = given ?? "";
  return !!secret && g.length === secret.length && timingSafeEqual(Buffer.from(g), Buffer.from(secret));
}

/**
 * Witness Wall operator mode (B5.8): `?operator=1` in development; in production
 * `?operator=<DEMO_ADMIN_SECRET>`. Operators can rehearse arrivals; rehearsals are labelled and
 * never counted.
 */
export function operatorAllowed(operator: string | null | undefined): boolean {
  if (!operator) return false;
  return !getConfig().isProduction || secretMatches(operator);
}
