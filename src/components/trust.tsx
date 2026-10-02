"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { describeReason, formatPoints, type TrustBand, type TrustReason } from "@/lib/trust";

const BAND_LABEL: Record<TrustBand, string> = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" };

export function BandBadge({ band, score }: { band: TrustBand | null; score?: number | null }) {
  if (!band) return <Badge variant="secondary">not scored</Badge>;
  const variant = band === "VERIFIED" ? "default" : band === "FLAGGED" ? "destructive" : "outline";
  return (
    <Badge variant={variant} data-band={band}>
      {BAND_LABEL[band]}
      {score !== undefined && score !== null ? ` · ${score}` : ""}
    </Badge>
  );
}

const KIND_CLASS: Record<TrustReason["kind"], string> = {
  hard: "text-destructive font-medium",
  review: "text-amber-600 dark:text-amber-400 font-medium",
  info: "text-muted-foreground",
  points: "",
};

/** The Trust Engine's ledger: every point added or removed, and every flag, with its sentence. */
export function ReasonList({ reasons }: { reasons: TrustReason[] }) {
  return (
    <ul className="flex flex-col gap-1" data-testid="trust-reasons">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex items-start gap-2">
          <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{r.kind === "points" || r.points ? formatPoints(r.points) : ""}</span>
          <span className={KIND_CLASS[r.kind]}>
            {r.kind === "hard" ? "Flag: " : r.kind === "review" ? "Review: " : ""}
            {describeReason(r)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Verify {
  intact: boolean;
  entries: number;
  firstBrokenAt: number | null;
}

/** Re-walks the photo's audit hash chain on the server and says whether it is intact. */
export function HistoryIntact({ assetId, refreshKey = 0 }: { assetId: string; refreshKey?: number }) {
  const [v, setV] = useState<Verify | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/audit/verify?assetId=${assetId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Verify>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (d) => live && (setV(d), setError(false)),
        () => live && setError(true),
      );
    return () => {
      live = false;
    };
  }, [assetId, refreshKey]);
  if (error) return <Badge variant="outline">history not checked</Badge>;
  if (!v) return <Badge variant="secondary">checking history…</Badge>;
  return v.intact ? (
    <Badge variant="default" data-testid="history-intact">
      History intact · {v.entries} entries
    </Badge>
  ) : (
    <Badge variant="destructive" data-testid="history-broken">
      History broken at entry #{v.firstBrokenAt}
    </Badge>
  );
}
