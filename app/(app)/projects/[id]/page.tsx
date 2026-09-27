import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CompareCard } from "@/components/compare-card";
import { BandBadge } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { projectView } from "@/lib/measure/views";
import { getMediaProvider } from "@/lib/providers/media";
import { GenerateReportButton } from "./generate-report";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  await connection();
  const v = await projectView(await getDb(), getMediaProvider(), (await params).id);
  return { title: v?.project.name ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  await connection();
  const v = await projectView(await getDb(), getMediaProvider(), (await params).id);
  if (!v) notFound();
  const p = v.project;
  const rs = await (await getDb()).select({ id: reports.id, periodFrom: reports.periodFrom, periodTo: reports.periodTo, createdAt: reports.createdAt }).from(reports).where(eq(reports.projectId, p.id)).orderBy(desc(reports.createdAt)).limit(10);
  const tint = v.kind === "green" ? "#22c55e" : "#f43f5e";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{p.type}</Badge>
          {p.startDate ? (
            <span>
              {p.startDate} → {p.endDate}
            </span>
          ) : null}
          {p.radiusM ? <span>· {Math.round(p.radiusM)} m site</span> : null}
          {p.locationApproximate ? <Badge variant="secondary">approximate location</Badge> : null}
        </div>
        <h1 className="font-heading text-2xl font-semibold">{p.name}</h1>
        {p.description ? <p className="max-w-3xl text-sm text-muted-foreground">{p.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{v.photos} photos:</span>
          {(["VERIFIED", "NEEDS_REVIEW", "FLAGGED"] as const).map((b) => (
            <span key={b} className="flex items-center gap-1">
              <BandBadge band={b} /> {v.bands[b]}
            </span>
          ))}
          <Link href={`/library?project=${p.id}`} className="ml-2 underline underline-offset-2">
            Open in library
          </Link>
          {p.slug ? (
            <Link href={`/capture?project=${p.slug}`} className="underline underline-offset-2">
              Capture here
            </Link>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3" data-testid="reports">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-medium">Impact reports</h2>
          <GenerateReportButton projectId={p.id} />
        </div>
        {rs.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {rs.map((r) => (
              <li key={r.id}>
                <Link href={`/r/${r.id}`} className="underline underline-offset-2">
                  {r.periodFrom} to {r.periodTo}
                </Link>{" "}
                <span className="text-muted-foreground">· generated {r.createdAt.toISOString().slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No report yet. Every number in a report links to its evidence.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Spots</h2>
        {v.spots.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {v.spots.map((s) => (
              <li key={s.id}>
                <Link href={`/spots/${s.slug ?? s.id}`} className="flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-muted/50">
                  {s.name} <span className="text-muted-foreground">{s.photos} photos</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No spots yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="comparisons">
        <h2 className="font-heading text-lg font-medium">Before and after</h2>
        {!v.kind ? (
          <p className="text-sm text-muted-foreground">A {p.type} project has no before/after measurement yet.</p>
        ) : v.cards.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {v.cards.map((c) => (
              <CompareCard key={c.key} card={c} tint={tint} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border p-6 text-sm text-muted-foreground">
            No before/after pair meets the rules yet: two photos of the same spot, close together, at least {p.minPairGapHours} h apart, neither flagged. Pairs
            are never forced.
          </p>
        )}
      </section>
    </div>
  );
}
