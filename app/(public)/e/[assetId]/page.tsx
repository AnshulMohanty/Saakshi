import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BandBadge, ReasonList } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getConfig } from "@/lib/config";
import { displayPolicy } from "@/lib/display-policy";
import { MockTag } from "@/components/mock-tag";
import { getDb } from "@/lib/db/client";
import { evidenceView } from "@/lib/evidence";
import { getMediaProvider } from "@/lib/providers/media";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST" : "—");

async function load(assetId: string) {
  if (!UUID.test(assetId)) return null;
  return evidenceView(await getDb(), getMediaProvider(), assetId, { appUrl: getConfig().appUrl, policy: displayPolicy() });
}

export async function generateMetadata({ params }: PageProps<"/e/[assetId]">) {
  await connection();
  const v = await load((await params).assetId);
  return { title: v ? `Evidence · ${v.caption ?? v.id.slice(0, 8)}` : "Evidence" };
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="flex flex-col gap-2" id={id}>
      <Separator />
      <h2 className="font-heading text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Public evidence page: everything Saakshi knows about one photo, and how to check it. */
export default async function EvidencePage({ params }: PageProps<"/e/[assetId]">) {
  await connection();
  const v = await load((await params).assetId);
  if (!v) notFound();
  const f = v.facts;

  return (
    <article className="flex flex-col gap-5" data-testid="evidence">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {v.trust.hiddenText ? <Badge variant="outline">{v.trust.hiddenText}</Badge> : <BandBadge band={v.trust.band} score={v.trust.score} />}
          {v.trust.mock ? <MockTag /> : null}
          <Badge variant={v.history.intact ? "default" : "destructive"} data-testid={v.history.intact ? "history-intact" : "history-broken"}>
            {v.history.intact ? `History intact · ${v.history.entries} entries` : `History broken at entry #${v.history.firstBrokenAt}`}
          </Badge>
          {v.testCase ? (
            <Badge variant="destructive" data-testid="test-input">
              Test input: {v.testCase.replace("_", " ")}
            </Badge>
          ) : null}
          {v.status === "approved" || v.status === "rejected" ? <Badge variant="outline">{v.status} by a reviewer</Badge> : null}
        </div>
        <h1 className="font-heading text-2xl font-semibold">{v.caption ?? "Photo evidence"}</h1>
        <p className="text-sm text-muted-foreground">
          {v.project ? (
            <>
              {v.project.name}
              {v.spot ? (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/spots/${v.spot.slug}`} className="underline underline-offset-2">
                    {v.spot.name}
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            "Not assigned to a project"
          )}
        </p>
      </header>

      {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred, with the proof strip layers */}
      <img src={v.imageUrl} alt={v.caption ?? "Evidence photo"} className="w-full rounded-lg border bg-muted" data-testid="proof-image" />
      <p className="text-xs text-muted-foreground">Faces are blurred. The strip under the photo is added by Cloudinary layers; its QR code links back to this page.</p>

      <Section title="Trust ledger">
        {v.trust.hiddenText ? (
          <p className="text-sm text-muted-foreground">{v.trust.hiddenText}. The ledger appears once real providers have analysed this photo.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Rule-based: every point and flag below comes from a fixed rule (docs/trust.md). Score {v.trust.score ?? "—"} of 100.
              {v.trust.mock ? " The signals behind it came from mock providers." : ""}
            </p>
            <ReasonList reasons={v.trust.reasons} />
          </>
        )}
        {v.review ? (
          <p className="text-sm">
            A reviewer {v.review.decision === "approve" ? "approved" : "rejected"} this photo on {when(v.review.at)}: “{v.review.note}”. The score and band are unchanged.
          </p>
        ) : null}
      </Section>

      <Section title="Facts">
        <Facts
          rows={[
            ["Taken", <>{f.dateOnly ? f.captureLabel : when(f.capturedAt)}{f.tzNote && !f.dateOnly ? <span className="block text-xs text-muted-foreground">{f.tzNote}</span> : null}</>],
            ["Uploaded", when(f.uploadedAt)],
            ["Device", f.device],
            ["Location", f.location ? `${f.location.lat.toFixed(5)}, ${f.location.lng.toFixed(5)} (${f.location.from})` : "No location recorded"],
            ["Place", f.place],
            ["Distance to spot", f.distanceToSpotM !== null ? `${f.distanceToSpotM} m (spot radius ${v.spot?.radiusM ?? "?"} m)` : null],
            ["Distance to site centre", f.distanceToSiteM !== null ? `${f.distanceToSiteM} m` : null],
            ["Metadata from", f.metadataSource],
            ["Perceptual hash", <code key="p">{f.pHash ?? "—"}</code>],
          ]}
        />
      </Section>

      {v.attestation ? (
        <Section title="Capture attestation">
          <p className="text-sm">
            <Badge variant={v.attestation.attested ? "default" : "outline"}>{v.attestation.attested ? "attested" : "not attested"}</Badge>{" "}
            Witness Capture anchors the photo&apos;s time to the server&apos;s clock:
          </p>
          <Facts
            rows={[
              ["Shutter (device clock)", when(v.attestation.clientCapturedAt)],
              ["Upload ticket issued (server)", when(v.attestation.ticketIssuedAt)],
              ["Upload received (server)", when(v.attestation.serverReceivedAt)],
            ]}
          />
          {v.attestation.reasons.length ? (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {v.attestation.reasons.map((r) => (
                <li key={r.code}>{r.message}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}

      <Section title="Near-duplicates">
        {v.duplicates.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {v.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={d.href} className="underline underline-offset-2">
                  {d.exact ? "Identical file" : `${d.similarityPct}% match`}
                </Link>{" "}
                in {d.projectName ?? "no project"}
                {d.capturedAt ? `, taken ${when(d.capturedAt)}` : ""} · {d.isLater ? "submitted later (a copy of this photo)" : "the earlier photo"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No near-duplicate of this photo exists.</p>
        )}
      </Section>

      {v.comparisons.length ? (
        <Section title="Before/after comparisons">
          <ul className="flex flex-col gap-1 text-sm">
            {v.comparisons.map((c) => (
              <li key={c.id}>
                {c.metric}:{" "}
                {c.shown?.kind === "hidden" ? (
                  <span className="text-muted-foreground">{c.shown.text}</span>
                ) : (
                  <>
                    {c.before} → {c.after}
                    {c.unit === "%" ? "%" : ""} ({c.delta! > 0 ? "+" : ""}
                    {c.delta})
                  </>
                )}{" "}
                · {c.method === "measured" ? "measured" : "AI estimate"}
                {c.shown?.kind === "value" && c.shown.mock ? " (mock output)" : ""} · this photo is the {c.role} ·{" "}
                <Link href={`/e/${c.other}`} className="underline underline-offset-2">
                  the {c.role === "before" ? "after" : "before"} photo
                </Link>
                {v.project ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={`/projects/${v.project.slug ?? v.project.id}`} className="underline underline-offset-2">
                      project
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{v.comparisons[0].caveat}</p>
        </Section>
      ) : null}

      <Section title="Every edit made to this photo" id="edits">
        <p className="text-sm text-muted-foreground">
          The original is never shown. Every version is a Transform applied on delivery, listed here in words and as its URL segment. The URLs are signed: change
          any step and the signature no longer matches, so an edit can&apos;t be forged.
        </p>
        <ol className="flex flex-col gap-3" data-testid="edits">
          {v.edits.map((e, i) => (
            <li key={i} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                {e.who}
                {e.when ? ` · ${when(e.when)}` : ""}
                {e.note ? ` · ${e.note}` : ""}
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
                {e.steps.map((s, j) => (
                  <li key={j}>
                    {s.words} <code className="break-all text-xs text-muted-foreground">{s.segment}</code>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Audit timeline">
        <p className="text-sm">
          {v.history.intact
            ? `History intact: all ${v.history.entries} entries re-hash to the stored chain.`
            : `History broken: entry #${v.history.firstBrokenAt} does not match the chain.`}
        </p>
        <ol className="flex flex-col gap-1 font-mono text-xs">
          {v.audit.map((r) => (
            <li key={r.seq} className="flex flex-wrap justify-between gap-2">
              <span>
                #{r.seq} {r.action} <span className="text-muted-foreground">by {r.actor}</span>
              </span>
              <span className="text-muted-foreground">
                {when(r.at)} · {r.hash}…
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {v.attribution ? (
        <Section title="Credits">
          <p className="text-sm">
            {v.testCase ? "This test input was built from " : "Photo: "}
            {v.attribution.title || "a Wikimedia Commons file"} by {v.attribution.author?.trim() || "unknown"}, {v.attribution.license || "licence unknown"}.{" "}
            {v.attribution.source_url ? (
              <a href={v.attribution.source_url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                View on Wikimedia Commons
              </a>
            ) : null}
          </p>
          {v.testCase ? <p className="text-xs text-muted-foreground">Test inputs are planted on purpose to show that the Trust Engine catches them.</p> : null}
        </Section>
      ) : null}
    </article>
  );
}
