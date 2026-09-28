import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { spotView } from "@/lib/measure/views";
import { displayPolicy } from "@/lib/display-policy";
import { MockTag } from "@/components/mock-tag";
import { getMediaProvider } from "@/lib/providers/media";
import { SpotMapLazy, SpotTrend } from "./spot-trend";

export async function generateMetadata({ params }: PageProps<"/spots/[slug]">) {
  await connection();
  const v = await spotView(await getDb(), getMediaProvider(), (await params).slug);
  return { title: v ? `${v.spot.name} · ${v.project.name}` : "Spot" };
}

/** Public spot page: where it is, how it has changed, and a link to check in with a new photo. */
export default async function SpotPage({ params }: PageProps<"/spots/[slug]">) {
  await connection();
  const v = await spotView(await getDb(), getMediaProvider(), (await params).slug, displayPolicy());
  if (!v) notFound();
  const last = v.trend.at(-1);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{v.project.name}</p>
        <h1 className="font-heading text-2xl font-semibold">{v.spot.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{v.photos} verified photos</Badge>
          {v.project.locationApproximate ? <Badge variant="secondary">approximate location</Badge> : null}
          <Link href={`/spots/${v.spot.slug ?? v.spot.id}/poster`} className="underline underline-offset-2">
            Printable poster
          </Link>
        </div>
      </header>

      <Link href={v.checkinPath} className="rounded-lg border-2 border-primary bg-primary/5 p-4 text-center font-medium hover:bg-primary/10" data-testid="checkin-link">
        Check in: take a photo of this spot now
      </Link>

      <SpotMapLazy spot={v.spot} photos={v.latest} />

      {v.metric ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-medium">
            {v.metric.label} over time{last ? `: ${last.value.toFixed(1)}${v.metric.unit === "%" ? "%" : ""} on ${last.label}` : ""}
          </h2>
          {v.trendMock ? <MockTag /> : null}
          {v.trend.length ? (
            <SpotTrend trend={v.trend} metric={v.metric} />
          ) : (
            <p className="text-sm text-muted-foreground">{v.trendHidden ?? "Nothing measured here yet."}</p>
          )}
          <p className="text-xs text-muted-foreground">One point per measured photo ({v.trend.length}). {v.caveat}</p>
        </section>
      ) : null}

      {v.baseline ? (
        <section className="flex items-center gap-3 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
          <img src={v.baseline.thumbUrl} alt="Baseline photo" className="h-16 w-20 rounded object-cover" />
          <span>
            Baseline: {v.baseline.date}. New check-ins are compared with it.{" "}
            <Link href={`/e/${v.baseline.id}`} className="underline underline-offset-2">
              Evidence
            </Link>
          </span>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Latest photos</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {v.latest.map((p) => (
            <li key={p.id}>
              <Link href={`/e/${p.id}`} className="flex flex-col gap-1 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                <img src={p.thumbUrl} alt={`Photo from ${p.date}`} className="aspect-[4/3] w-full rounded object-cover" loading="lazy" />
                <span className="text-muted-foreground">
                  {p.date} · {p.source === "witness" ? "check-in" : p.source}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
