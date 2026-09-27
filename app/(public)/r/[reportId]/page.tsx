import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BandBadge } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";
import { reportView } from "@/lib/report/view";

export async function generateMetadata({ params }: PageProps<"/r/[reportId]">) {
  await connection();
  const v = await reportView(await getDb(), getMediaProvider(), (await params).reportId);
  return { title: v?.report.title ?? "Report" };
}

/** Public Impact Report: every number with the photos behind it, the PDF, and the campaign kit. */
export default async function ReportPage({ params }: PageProps<"/r/[reportId]">) {
  await connection();
  const v = await reportView(await getDb(), getMediaProvider(), (await params).reportId);
  if (!v) notFound();
  return (
    <article className="flex flex-col gap-6" data-testid="report">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {v.project ? (
            <Link href={`/projects/${v.project.slug ?? v.project.id}`} className="underline underline-offset-2">
              {v.project.name}
            </Link>
          ) : null}{" "}
          · {v.report.period.from} to {v.report.period.to}
        </p>
        <h1 className="font-heading text-2xl font-semibold">{v.report.title}</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          {v.report.pdfPath ? (
            <a href={v.report.pdfPath} className="underline underline-offset-2" data-testid="pdf-link">
              Download the PDF
            </a>
          ) : null}
          <span className="text-muted-foreground">Generated {new Date(v.report.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <p className="leading-relaxed" data-testid="prose">
          {v.prose.map((p, i) =>
            typeof p === "string" ? (
              <span key={i}>{p}</span>
            ) : (
              <a key={i} href={`#claim-${p.claim.id}`} className="font-medium underline underline-offset-2" title={p.claim.label}>
                {p.formatted}
              </a>
            ),
          )}
        </p>
        {v.report.notes.map((n) => (
          <p key={n} className="text-sm text-amber-700 dark:text-amber-400">
            {n}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">The text was written with placeholders; every number in it is filled from the claims below.</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-medium">Every number and its evidence</h2>
        {v.claims.map((c) => (
          <div key={c.id} id={`claim-${c.id}`} className="flex scroll-mt-6 flex-col gap-2 rounded-lg border p-3" data-testid="claim">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-heading text-2xl tabular-nums">{c.formatted}</span>
              <span className="font-medium">{c.label}</span>
              <Badge variant={c.method === "ai_estimated" ? "outline" : "secondary"}>{c.methodText}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              From {c.asset_ids.length} photo{c.asset_ids.length === 1 ? "" : "s"}
              {c.detail?.basis ? `. ${c.detail.basis}` : ""}
              {c.detail?.topReasons?.length ? `. Top reasons: ${c.detail.topReasons.map((r) => `${r.code.toLowerCase().replaceAll("_", " ")} (${r.n})`).join(", ")}` : ""}
              {c.detail?.testInputs?.length ? `. Includes planted test inputs: ${c.detail.testInputs.join(", ").replaceAll("_", " ")}` : ""}
            </p>
            {c.evidence.length ? (
              <ul className="flex flex-wrap gap-2">
                {c.evidence.map((e) => (
                  <li key={e.id}>
                    <Link href={`/e/${e.id}`} className="flex flex-col gap-1 text-xs" title="Open the evidence page">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                      <img src={e.thumbUrl} alt={`Evidence from ${e.date}`} className="h-16 w-20 rounded object-cover" loading="lazy" />
                      <span className="flex items-center gap-1">
                        <BandBadge band={e.band} />
                        {e.testCase ? <Badge variant="destructive">test</Badge> : null}
                      </span>
                    </Link>
                  </li>
                ))}
                {c.more ? <li className="self-center text-xs text-muted-foreground">and {c.more} more</li> : null}
              </ul>
            ) : null}
          </div>
        ))}
      </section>

      {v.campaign ? (
        <section className="flex flex-col gap-3" data-testid="campaign">
          <Separator />
          <h2 className="font-heading text-lg font-medium">Campaign kit (Instagram 4:5)</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">Caption: </span>
            {v.campaign.caption}
          </p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {v.campaign.templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred template built from Transforms */}
                <img src={t.previewUrl} alt={t.alt} width={t.width} height={t.height} className="aspect-[4/5] w-full rounded-md border object-cover" loading="lazy" />
                <a href={t.downloadPath} className="text-sm underline underline-offset-2" data-testid={`download-${t.id}`}>
                  Download PNG ({t.id === "stat" ? "stat card" : t.id === "split" ? "before/after" : "verified photo"})
                </a>
                <p className="text-xs text-muted-foreground">Alt text: {t.alt}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
