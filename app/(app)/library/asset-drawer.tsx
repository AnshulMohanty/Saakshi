"use client";

import { useEffect, useState } from "react";
import { BandBadge, HistoryIntact, ReasonList } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AssetDetail } from "@/lib/library";
import { statusVariant } from "./status";

const loadDetail = (id: string) =>
  fetch(`/api/assets/${id}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<AssetDetail>;
  });

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function AssetDrawer({ id, refreshKey, onClose }: { id: string | null; refreshKey: number; onClose: () => void }) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadDetail(id).then(
      (d) => {
        if (!live) return;
        setDetail(d);
        setError(null);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
    // refreshKey: re-fetch on library live ticks so the timeline advances.
  }, [id, refreshKey]);

  const d = detail && detail.id === id ? detail : null;

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="asset-drawer">
        <SheetHeader>
          <SheetTitle>{d?.caption ?? (error ? "Couldn't load photo" : "Loading…")}</SheetTitle>
          <SheetDescription>{d ? `${d.source.replace("_", " ")} · uploaded ${time(d.uploadedAt)}` : (error ?? "")}</SheetDescription>
        </SheetHeader>
        {d ? (
          <div className="flex flex-col gap-4 px-4 pb-6 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred derivative */}
            <img src={d.previewUrl} alt={d.caption ?? "Photo"} className="w-full rounded-md border bg-muted" />
            <div className="flex flex-wrap gap-1">
              <Badge variant={statusVariant(d.status, d.steps.some((s) => s.status === "error"))}>{d.status}</Badge>
              {d.testCase ? <Badge variant="destructive">test: {d.testCase.replace("_", " ")}</Badge> : null}
              {d.watermark ? <Badge variant="destructive">watermark</Badge> : null}
              {d.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t.replaceAll("_", " ")}
                </Badge>
              ))}
            </div>

            <Section title="Trust">
              <div className="flex flex-wrap items-center gap-2" data-testid="drawer-trust">
                <BandBadge band={d.trust.band} score={d.trust.score} />
                <HistoryIntact assetId={d.id} refreshKey={refreshKey} />
              </div>
              {d.trust.reasons.length ? <ReasonList reasons={d.trust.reasons} /> : <p className="text-muted-foreground">Not scored yet.</p>}
              {d.review ? (
                <p className="text-muted-foreground">
                  {d.review.decision === "approve" ? "Approved" : "Rejected"} by {d.review.actor} on {time(d.review.at)}: “{d.review.note}”
                </p>
              ) : null}
              {d.duplicates.length ? (
                <Rows
                  rows={d.duplicates.map((m) => [
                    m.exact ? "Identical file" : `Near-duplicate (${m.hamming} bits)`,
                    `${m.projectName ?? "Unassigned"}${m.sameProject ? " (this project)" : ""} · ${m.matchIsLater ? "copy submitted later" : "earlier photo"}`,
                  ])}
                />
              ) : null}
            </Section>

            <Section title="AI understanding">
              {d.ai ? (
                <Rows
                  rows={[
                    ["Activity", `${d.ai.activity} · ${d.ai.stage}`],
                    ["Confidence", `${Math.round(d.ai.confidence * 100)}% (${d.ai.method}, ${d.ai.model})`],
                    ["Visible", d.ai.visibleCounts.map((c) => `${c.label} ≈${c.count}`).join(", ") || "—"],
                    ["Text in image", d.ai.textInImage ?? "—"],
                  ]}
                />
              ) : (
                <p className="text-muted-foreground">Not analysed yet.</p>
              )}
            </Section>

            <Section title="Moderation">
              {d.moderation.length ? <Rows rows={d.moderation.map((m) => [m.question, m.answer ? "yes" : "no"])} /> : <p className="text-muted-foreground">Not checked yet.</p>}
            </Section>

            <Section title="Capture metadata">
              <Rows
                rows={[
                  ["Source of metadata", d.exif.source === "commons_api" ? "Wikimedia Commons API (not the file)" : d.exif.source === "file" ? "File EXIF" : "None"],
                  ["Captured", d.exif.capturedAt ? `${time(d.exif.capturedAt)}${d.exif.tzAssumed ? " (time zone assumed)" : ""}` : "—"],
                  ["GPS", d.exif.lat !== null && d.exif.lng !== null ? `${d.exif.lat.toFixed(5)}, ${d.exif.lng.toFixed(5)}` : "—"],
                  ["Camera", [d.exif.make, d.exif.model].filter(Boolean).join(" ") || "—"],
                  ["Place", d.placeName ?? "—"],
                  ["Size", d.dimensions.width ? `${d.dimensions.width}×${d.dimensions.height}` : "—"],
                ]}
              />
            </Section>

            {d.capture ? (
              <Section title="Capture attestation">
                <div className="mb-2">
                  <Badge variant={d.capture.attested ? "default" : "outline"}>{d.capture.attested ? "attested" : "not attested"}</Badge>
                </div>
                <Rows
                  rows={[
                    ["Device fix", d.capture.deviceFix ? `${d.capture.deviceFix.lat.toFixed(5)}, ${d.capture.deviceFix.lng.toFixed(5)} ±${d.capture.deviceFix.accuracyM ?? "?"} m` : "—"],
                    ["Client time", time(d.capture.clientCapturedAt)],
                    ["Server received", time(d.capture.serverReceivedAt)],
                    ["Uploader location", d.capture.uploaderLocation ? `${d.capture.uploaderLocation.lat.toFixed(4)}, ${d.capture.uploaderLocation.lng.toFixed(4)} (info only)` : "—"],
                  ]}
                />
                {d.capture.reasons.length ? (
                  <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                    {d.capture.reasons.map((r) => (
                      <li key={r.code}>{r.message}</li>
                    ))}
                  </ul>
                ) : null}
              </Section>
            ) : null}

            <Section title="Project">
              <Rows
                rows={[
                  ["Project", d.project?.name ?? "Unassigned"],
                  ["Spot", d.spot?.name ?? "—"],
                  ["Assigned by", d.assignment.method.replace("_", " ")],
                  ...(d.assignment.detail ? Object.entries(d.assignment.detail).map(([k, v]) => [k, String(v)] as [string, string]) : []),
                ]}
              />
            </Section>

            {d.attribution ? (
              <Section title="Attribution">
                <Rows
                  rows={[
                    ["Title", d.attribution.title ?? "—"],
                    ["Author", d.attribution.author ?? "—"],
                    ["License", d.attribution.license ?? "—"],
                  ]}
                />
                <div className="mt-2 flex gap-3">
                  {d.attribution.source_url ? (
                    <a className="underline underline-offset-2" href={d.attribution.source_url} target="_blank" rel="noreferrer">
                      View on Wikimedia Commons
                    </a>
                  ) : null}
                  {d.attribution.license_url ? (
                    <a className="underline underline-offset-2" href={d.attribution.license_url} target="_blank" rel="noreferrer">
                      License
                    </a>
                  ) : null}
                </div>
              </Section>
            ) : null}

            <Section title="Pipeline">
              <ol className="flex flex-col gap-1" data-testid="pipeline-steps">
                {d.steps.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {s.finishedAt ? new Date(s.finishedAt).toLocaleTimeString() : ""}
                      <Badge variant={s.status === "error" ? "destructive" : s.status === "done" ? "secondary" : "outline"}>{s.status}</Badge>
                    </span>
                  </li>
                ))}
              </ol>
              {d.steps.filter((s) => s.error).map((s) => (
                <p key={s.name} className="mt-1 text-destructive">
                  {s.name}: {s.error}
                </p>
              ))}
            </Section>

            <Section title={`Audit trail (${d.audit.length})`}>
              <ol className="flex flex-col gap-1 font-mono text-xs">
                {d.audit.map((r) => (
                  <li key={r.seq} className="flex justify-between gap-2">
                    <span>
                      #{r.seq} {r.action}
                    </span>
                    <span className="text-muted-foreground">{r.hash}…</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <Separator />
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
