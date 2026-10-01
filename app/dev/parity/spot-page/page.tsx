import type { Metadata } from "next";
import { SpotPage, type SpotPoint } from "@/components/spot/spot-page";
import { fullDateTime } from "@/lib/charts/time-axis";

export const metadata: Metadata = { title: "Parity: spot page", robots: { index: false } };

const asset = (uuid: string) => `/dev/parity/asset/spot-page/${uuid}`;

/**
 * /dev/parity/spot-page: the spot page on the prototype's data (SP:394-404). Its clean-up-day
 * photos carry dates only; the fixture puts them at 07:30 and 11:30 IST so the time axis has
 * times, and check-ins at noon as the prototype's own day count assumes (SP:412). The day count
 * is the prototype's on its capture date (28 Sep 2026).
 */
export default function SpotParity() {
  const D: Array<{ date: string; at: string; label: string; v: number; who?: string; before?: boolean }> = [
    { date: "14 Sep 2026, before the clean-up", at: "2026-09-14T07:30:00+05:30", label: "Before", v: 10, before: true },
    { date: "14 Sep 2026, after the clean-up", at: "2026-09-14T11:30:00+05:30", label: "After", v: 2 },
    { date: "17 Sep 2026", at: "2026-09-17T12:00:00+05:30", label: "Check-in 1", v: 3, who: "Witness, QR poster" },
    { date: "20 Sep 2026", at: "2026-09-20T12:00:00+05:30", label: "Check-in 2", v: 2, who: "Volunteer, Saakshi app" },
    { date: "23 Sep 2026", at: "2026-09-23T12:00:00+05:30", label: "Check-in 3", v: 6, who: "Witness, QR poster" },
    { date: "25 Sep 2026", at: "2026-09-25T12:00:00+05:30", label: "Check-in 4", v: 4, who: "Witness, QR poster" },
    { date: "27 Sep 2026", at: "2026-09-27T12:00:00+05:30", label: "Check-in 5", v: 3, who: "Volunteer, Saakshi app" },
  ];
  const points: SpotPoint[] = D.map((p) => ({
    key: p.label,
    t: Date.parse(p.at),
    value: p.v,
    v: String(p.v),
    label: p.label,
    date: p.date,
    when: fullDateTime(Date.parse(p.at), "minute", 330),
    photo: p.before ? { src: asset("e6f40fd4-d48d-4acb-9264-3f101b22b596"), alt: "The spot before the clean-up: plastic litter on the beach. Faces blurred." } : null,
    mask: p.before ? asset("b237c2da-422c-4f0b-9244-91e6af0d9b2e") : null,
    placeholder: { title: "Real photo here", sub: `${p.label}, same pole, same framing` },
  }));
  return (
    <SpotPage
      data={{
        project: "Versova beach clean-up, Mumbai",
        title: "Versova beach, pole 3",
        coords: "19.12650° N, 72.81560° E, site radius 150 m",
        event: "clean-up",
        metric: "litter",
        counters: { checkins: String(D.length - 2), daysSince: "1", change: `${D[0].v}% to ${D.at(-1)!.v}%` },
        hidden: null,
        mock: false,
        points,
        maskMode: "alpha",
        frameAspect: "1024/685",
        offsetMinutes: 330,
        latestTitle: "Latest check-ins",
        latest: D.slice(2)
          .reverse()
          .map((c) => ({ key: c.label, date: c.date, who: c.who!, v: String(c.v), band: "VERIFIED" as const, thumb: null, thumbText: "Real photo here", href: "Evidence Page.html" })),
        caveat: "Measured on photo pixels. Camera angle, framing, season and light affect the result. The poster fixes the pole, which keeps framing close.",
        framing: null,
        map: null,
        homeHref: "Saakshi Landing.html",
        posterHref: "QR Poster.html",
        checkinHref: "#capture",
      }}
    />
  );
}
