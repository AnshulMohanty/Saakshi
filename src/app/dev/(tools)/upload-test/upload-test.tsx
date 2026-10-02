"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Check {
  label: string;
  url: string;
  expect: number;
}

interface Result {
  asset: {
    id: string;
    publicId: string;
    phash: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
    etag: string;
    facesCount: number;
    qualityScore: number | null;
    placeName: string | null;
    status: string;
    exif: { lat: number | null; lng: number | null; takenAt: string | null; make: string | null; model: string | null } | null;
  };
  audit: { seq: number; hash: string; prevHash: string };
  mediaKind: "mock" | "real";
  urls: { unsigned: string; signed: string };
  checks: Check[];
}

/** Same-origin path for mock URLs, so checks work whatever APP_URL/port is configured. */
const local = (url: string) => {
  const u = new URL(url, window.location.href);
  return u.pathname.startsWith("/api/media/mock/") ? u.pathname : url;
};

export function UploadTest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [statuses, setStatuses] = useState<Record<string, number | "error">>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setStatuses({});
    try {
      const res = await fetch("/api/dev/upload-test", { method: "POST", body: new FormData(e.currentTarget) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body as Result);
      const entries = await Promise.all(
        (body as Result).checks.map(async (c) => {
          try {
            return [c.label, (await fetch(local(c.url), { cache: "no-store" })).status] as const;
          } catch {
            return [c.label, "error"] as const;
          }
        }),
      );
      setStatuses(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const exif = result?.asset.exif;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="file">Image</Label>
          <Input id="file" name="file" type="file" accept="image/*" required className="max-w-sm" />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Asset</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Row id</dt>
                  <dd className="font-mono text-xs break-all">{result.asset.id}</dd>
                  <dt className="text-muted-foreground">Public id</dt>
                  <dd className="font-mono text-xs break-all">{result.asset.publicId}</dd>
                  <dt className="text-muted-foreground">pHash</dt>
                  <dd className="font-mono">{result.asset.phash}</dd>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>
                    {result.asset.width}×{result.asset.height} {result.asset.format}, {result.asset.bytes.toLocaleString()} bytes
                  </dd>
                  <dt className="text-muted-foreground">Quality / faces</dt>
                  <dd>
                    {result.asset.qualityScore ?? "—"} / {result.asset.facesCount}
                  </dd>
                  <dt className="text-muted-foreground">Media provider</dt>
                  <dd>
                    <Badge variant="secondary">{result.mediaKind}</Badge>
                  </dd>
                  <dt className="text-muted-foreground">Audit</dt>
                  <dd className="font-mono text-xs break-all">
                    #{result.audit.seq} {result.audit.hash.slice(0, 16)}… ← {result.audit.prevHash.slice(0, 16)}…
                  </dd>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>EXIF</CardTitle>
              </CardHeader>
              <CardContent>
                {exif ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">GPS</dt>
                    <dd>{exif.lat != null && exif.lng != null ? `${exif.lat.toFixed(6)}, ${exif.lng.toFixed(6)}` : "—"}</dd>
                    <dt className="text-muted-foreground">Place</dt>
                    <dd>{result.asset.placeName ?? "—"}</dd>
                    <dt className="text-muted-foreground">Taken at</dt>
                    <dd>{exif.takenAt ?? "—"}</dd>
                    <dt className="text-muted-foreground">Camera</dt>
                    <dd>{[exif.make, exif.model].filter(Boolean).join(" ") || "—"}</dd>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No EXIF in this file.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Derivative: w_400 + blur (signed)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL, not an optimisable static asset */}
              <img src={local(result.urls.signed)} alt="Signed, blurred 400px derivative" className="max-w-full self-start rounded-md border" />
              <p className="font-mono text-xs break-all">
                <span className="text-muted-foreground">signed: </span>
                {result.urls.signed}
              </p>
              <p className="font-mono text-xs break-all">
                <span className="text-muted-foreground">unsigned: </span>
                {result.urls.unsigned}
              </p>
            </CardContent>
          </Card>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Got</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.checks.map((c) => {
                const got = statuses[c.label];
                return (
                  <TableRow key={c.label}>
                    <TableCell>{c.label}</TableCell>
                    <TableCell>{c.expect}</TableCell>
                    <TableCell>
                      {got === undefined ? (
                        "…"
                      ) : (
                        <Badge variant={got === c.expect ? "secondary" : "destructive"} data-testid={`check-${c.expect}`}>
                          {got === c.expect ? "✓" : "✗"} {got}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md font-mono text-xs break-all whitespace-normal">
                      <a href={local(c.url)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {c.url}
                      </a>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      ) : null}
    </div>
  );
}
