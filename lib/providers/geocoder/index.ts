/**
 * GeocoderProvider: reverse geocoding (lat, lng) → place name.
 * Real = Nominatim (no key; 1 req/s; identifying User-Agent). Mock = nearest known city.
 * Both are wrapped in a DB cache keyed by coordinates rounded to 3 dp (≈110 m).
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getConfig } from "../../config";
import { getDb, type DB } from "../../db/client";
import { geocache } from "../../db/schema";
import { coordKey, isValidLatLng } from "../../geo";
import { MockGeocoder } from "./mock";
import { NominatimGeocoder } from "./real";

export interface GeocoderProvider {
  readonly kind: "mock" | "real";
  /** Human-readable place name, or null when the service has none for this point. */
  reverse(lat: number, lng: number): Promise<string | null>;
}

/**
 * Adds the geocache table in front of a provider. "No place" results are cached too;
 * provider failures (network, rate limit) are logged and not cached.
 */
export function withGeocache(inner: GeocoderProvider, db: () => Promise<DB>): GeocoderProvider {
  return {
    kind: inner.kind,
    async reverse(lat, lng) {
      if (!isValidLatLng({ lat, lng })) return null;
      const key = coordKey(lat, lng);
      const conn = await db();
      const [hit] = await conn.select().from(geocache).where(eq(geocache.key, key)).limit(1);
      if (hit) return hit.placeName;
      let placeName: string | null;
      try {
        placeName = await inner.reverse(lat, lng);
      } catch (err) {
        console.warn(`[geocoder] reverse(${key}) failed: ${err instanceof Error ? err.message : err}`);
        return null;
      }
      await conn.insert(geocache).values({ key, placeName }).onConflictDoNothing();
      return placeName;
    },
  };
}

let instance: GeocoderProvider | undefined;

export function getGeocoder(): GeocoderProvider {
  if (!instance) {
    const config = getConfig();
    const inner =
      config.providers.geocoder.mode === "real"
        ? new NominatimGeocoder({ appUrl: config.appUrl, contactEmail: config.env.APP_CONTACT_EMAIL })
        : new MockGeocoder();
    instance = withGeocache(inner, getDb);
  }
  return instance;
}
