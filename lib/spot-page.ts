import "server-only";
/**
 * The spot page's model (SpotPageData) from lib/measure/views.ts spotView: every measured photo
 * on the scrubber with its same-frame view and mask, the counters as SQL-backed facts (check-ins,
 * days since the last one, first and latest measured value), the latest check-ins, the framing
 * instruction (B5.13) and the map pins. Never samples: an empty spot says so.
 */
import type { SpotPageData } from "@/components/spot/spot-page";
import { fullDateTime, offsetMinutes } from "./charts/time-axis";
import { getConfig } from "./config";
import type { DB } from "./db/client";
import { daysSince, EVENT_WORD, pct, SOURCE_WHO, timelineLabels } from "./measure/timeline";
import { spotView } from "./measure/views";
import { mockLabel, type DisplayPolicy } from "./provenance";
import type { MediaProvider } from "./providers/media";

const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;
export const FRAMING_FALLBACK = "Stand where this photo was taken";

export async function spotPageData(db: DB, media: MediaProvider, slug: string, o: { policy: DisplayPolicy; now?: number }): Promise<SpotPageData | null> {
  const v = await spotView(db, media, slug, o.policy);
  if (!v) return null;
  const off = offsetMinutes(getConfig().env.EXIF_DEFAULT_UTC_OFFSET);
  const event = EVENT_WORD[v.project.type] ?? "event";
  const metric = v.metric?.id === "green_cover" ? "green" : "litter";
  const labels = timelineLabels(v.trend.map((p) => ({ id: p.assetId, t: p.t, source: p.source })), v.baseline?.id ?? null);
  const points = v.trend.map((p, i) => ({
    key: p.assetId,
    t: p.t,
    value: p.value,
    v: pct(p.value),
    label: labels[i].label,
    date: `${p.label}${labels[i].suffix}`,
    when: `${fullDateTime(p.t, p.precision, off)}, ${labels[i].who.toLowerCase()}`,
    photo: { src: p.viewUrl, alt: `${labels[i].label} at ${v.spot.name}, ${p.label}. Faces blurred.` },
    mask: p.maskUrl,
  }));
  const byId = new Map(points.map((p) => [p.key, p]));
  const days = daysSince(v.checkins, o.now ?? Date.now());
  const checkins = v.latest.filter((a) => a.source === "witness");
  const latest = (checkins.length ? checkins : v.latest).slice(0, 8);
  return {
    project: v.project.name,
    title: v.spot.name,
    coords: `${coord(v.spot.lat, ["N", "S"])}, ${coord(v.spot.lng, ["E", "W"])}, site radius ${Math.round(v.spot.radiusM)} m${v.project.locationApproximate ? " (approximate)" : ""}`,
    event,
    metric,
    counters: {
      checkins: String(v.checkins.length),
      daysSince: days === null ? "–" : String(days),
      change: points.length >= 2 ? `${points[0].v}% to ${points.at(-1)!.v}%` : points.length === 1 ? `${points[0].v}%` : "–",
    },
    hidden: v.trendHidden,
    mock: v.trendMock,
    mockTag: mockLabel(o.policy),
    points,
    maskMode: "luminance",
    frameAspect: "800/600",
    offsetMinutes: off,
    latestTitle: checkins.length ? "Latest check-ins" : "Latest photos",
    latest: latest.map((a) => ({ key: a.id, date: a.date, who: SOURCE_WHO[a.source] ?? "Photo", v: byId.get(a.id)?.v ?? null, band: a.band, thumb: a.thumbUrl, href: `/e/${a.id}` })),
    caveat: `${v.caveat} The poster fixes the spot, which keeps framing close.`,
    framing: v.spot.framingNote ? { note: v.spot.framingNote, thumb: null } : v.baseline ? { note: FRAMING_FALLBACK, thumb: v.baseline.thumbUrl } : null,
    map: { lat: v.spot.lat, lng: v.spot.lng, radiusM: Math.round(v.spot.radiusM), pins: v.latest.filter((a) => a.location).map((a) => ({ id: a.id, lat: a.location!.lat, lng: a.location!.lng, label: `${a.date}, ${(SOURCE_WHO[a.source] ?? "photo").toLowerCase()}` })) },
    homeHref: "/",
    posterHref: `/spots/${v.spot.slug ?? v.spot.id}/poster`,
    checkinHref: v.checkinPath,
  };
}
