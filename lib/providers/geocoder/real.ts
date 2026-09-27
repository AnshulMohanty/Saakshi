/**
 * Nominatim (OpenStreetMap) reverse geocoder. No key; the usage policy requires an identifying
 * User-Agent and at most 1 request per second, which this client enforces process-wide.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
import type { GeocoderProvider } from "./index";

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_INTERVAL_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let last = 0;

/** Serialises calls and spaces them ≥1.1 s apart. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface NominatimResponse {
  error?: string;
  display_name?: string;
  address?: Record<string, string>;
}

/** "Cubbon Park, Bengaluru, Karnataka, India" from Nominatim's address parts. */
export function formatPlace(r: NominatimResponse): string | null {
  if (r.error) return null;
  const a = r.address ?? {};
  const local = a.park ?? a.neighbourhood ?? a.suburb ?? a.village ?? a.hamlet ?? a.quarter;
  const city = a.city ?? a.town ?? a.municipality ?? a.county ?? a.state_district;
  const parts = [local, city, a.state, a.country].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
  return parts.length ? parts.join(", ") : (r.display_name ?? null);
}

export class NominatimGeocoder implements GeocoderProvider {
  readonly kind = "real" as const;
  private readonly userAgent: string;

  constructor({ appUrl, contactEmail }: { appUrl: string; contactEmail?: string }) {
    this.userAgent = `Saakshi/0.1 (+${appUrl}${contactEmail ? `; ${contactEmail}` : ""})`;
  }

  reverse(lat: number, lng: number): Promise<string | null> {
    return throttled(async () => {
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "16", "accept-language": "en" }).toString();
      const res = await fetch(url, { headers: { "user-agent": this.userAgent }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
      return formatPlace((await res.json()) as NominatimResponse);
    });
  }
}
