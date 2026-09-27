"use client";

import { useState } from "react";
import { BandBadge } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchResult } from "@/lib/search";

const CHIP_VARIANT = { rejected: "destructive", rewrite: "secondary", text: "outline" } as const;

/** Natural-language search ("verified paudhe in 2021") with "Understood as" chips. */
export function SearchPanel({ onOpen }: { onOpen: (assetId: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) });
      const body = (await res.json()) as SearchResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Search">
      <form onSubmit={search} className="flex gap-2" role="search">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: “verified paudhe in 2021”, “flagged test inputs”, “nadi ke kinare ka kachra”" maxLength={200} data-testid="search-input" />
        <Button type="submit" disabled={busy}>
          Search
        </Button>
        {result ? (
          <Button type="button" variant="ghost" onClick={() => (setResult(null), setQ(""))}>
            Clear
          </Button>
        ) : null}
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="search-results">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span className="text-muted-foreground">Understood as:</span>
            {result.chips.length ? (
              result.chips.map((c, i) => (
                <Badge key={`${c.kind}-${i}`} variant={CHIP_VARIANT[c.kind as keyof typeof CHIP_VARIANT] ?? "default"} data-chip={c.kind}>
                  {c.label}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">everything</Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {result.results.length} result(s) · {result.mode === "fulltext" ? "full-text match" : result.mode === "semantic" ? "semantic match" : "filters only"}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {result.results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-col gap-1 rounded-md border text-left text-xs hover:bg-muted/50">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={r.thumbUrl} alt={r.caption ?? "Photo"} className="aspect-[4/3] w-full rounded-t-md object-cover" loading="lazy" />
                  <span className="flex flex-wrap gap-1 px-1.5">
                    <BandBadge band={r.band as "VERIFIED" | "NEEDS_REVIEW" | "FLAGGED" | null} />
                    {r.testCase ? <Badge variant="destructive">test input</Badge> : null}
                  </span>
                  <span className="line-clamp-2 px-1.5 pb-1.5 text-muted-foreground">{r.caption ?? r.placeName ?? "Photo"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
