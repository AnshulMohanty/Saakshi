"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LibraryData } from "@/lib/library";
import { AssetDrawer } from "./asset-drawer";
import { statusVariant } from "./status";

// Leaflet touches `window`: client-only.
const LibraryMap = dynamic(() => import("./library-map"), { ssr: false, loading: () => <div className="h-[60vh] animate-pulse rounded-lg border bg-muted" /> });

export interface LibraryState {
  view: "grid" | "map";
  project: string | null;
  source: string | null;
  status: string | null;
  test: boolean;
  live: boolean;
  /** ?live=1: keep polling even when nothing is processing yet (e.g. right after a demo reset). */
  followNew: boolean;
  asset: string | null;
}

const SOURCES = ["witness", "upload", "archive", "planted_test"];
const STATUSES = ["processing", "ready", "flagged", "approved", "rejected"];
const POLL_MS = 2000;

function query(s: LibraryState): string {
  const q = new URLSearchParams();
  if (s.project) q.set("project", s.project);
  if (s.source) q.set("source", s.source);
  if (s.status) q.set("status", s.status);
  if (s.test) q.set("test", "1");
  return q.toString();
}

const loadLibrary = (s: LibraryState) =>
  fetch(`/api/library?${query(s)}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<LibraryData>;
  });

export function LibraryClient({ initial }: { initial: LibraryState }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<LibraryState>(initial);
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const update = useCallback(
    (patch: Partial<LibraryState>) => {
      const next = { ...state, ...patch };
      setState(next);
      // Keep the URL shareable (filters, view, open asset) without adding history entries.
      const q = new URLSearchParams(query(next));
      if (next.view === "map") q.set("view", "map");
      if (!next.live) q.set("live", "0");
      if (next.asset) q.set("asset", next.asset);
      router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
    },
    [state, pathname, router],
  );

  // Fetch on filter change and on every live tick.
  useEffect(() => {
    let live = true;
    loadLibrary(state).then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [state, tick]);

  // Live mode: poll every 2 s while anything is processing (or while following a demo reset).
  const processing = data?.processing ?? 0;
  const polling = state.live && (processing > 0 || state.followNew);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(t);
  }, [polling]);

  const projectsById = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground" data-testid="library-summary">
            {data ? `${items.length} photo${items.length === 1 ? "" : "s"}` : "Loading…"}
            {processing ? ` · ${processing} processing` : ""}
            {polling ? " · live" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="View">
          {(["grid", "map"] as const).map((v) => (
            <Button key={v} size="sm" variant={state.view === v ? "default" : "ghost"} onClick={() => update({ view: v })} aria-pressed={state.view === v}>
              {v === "grid" ? "Grid" : "Map"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterSelect label="Project" value={state.project} onChange={(v) => update({ project: v })} options={(data?.projects ?? []).map((p) => [p.id, p.name])} />
        <FilterSelect label="Source" value={state.source} onChange={(v) => update({ source: v })} options={SOURCES.map((s) => [s, s.replace("_", " ")])} />
        <FilterSelect label="Status" value={state.status} onChange={(v) => update({ status: v })} options={STATUSES.map((s) => [s, s])} />
        <label className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <input type="checkbox" checked={state.test} onChange={(e) => update({ test: e.target.checked })} />
          Test inputs only
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <input type="checkbox" checked={state.live} onChange={(e) => update({ live: e.target.checked, followNew: false })} />
          Live
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">Couldn&apos;t load the library: {error}</p> : null}

      {state.view === "map" ? (
        <LibraryMap items={items} projects={data?.projects ?? []} spots={data?.spots ?? []} onSelect={(id) => update({ asset: id })} />
      ) : items.length === 0 && data ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No photos yet. Run the demo import from <a className="underline" href="/dev/status">/dev/status</a> or capture one at <a className="underline" href="/capture">/capture</a>.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="library-grid">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => update({ asset: a.id })} className="group flex w-full flex-col overflow-hidden rounded-lg border text-left hover:bg-muted/50" data-status={a.status}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, transformed media URL */}
                <img src={a.thumbUrl} alt={a.caption ?? "Photo"} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />
                <div className="flex flex-col gap-1 p-2 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={statusVariant(a.status, a.failed)}>{a.failed ? "error" : a.status}</Badge>
                    <Badge variant="outline">{a.source.replace("_", " ")}</Badge>
                    {a.testCase ? <Badge variant="destructive">{a.testCase.replace("_", " ")}</Badge> : null}
                    {a.attested ? <Badge>attested</Badge> : null}
                  </div>
                  <span className="line-clamp-1 font-medium">{a.projectId ? (projectsById.get(a.projectId)?.name ?? "Project") : "Unassigned"}</span>
                  <span className="line-clamp-1 text-muted-foreground">{a.placeName ?? (a.status === "processing" ? "…" : "No location")}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AssetDrawer id={state.asset} refreshKey={tick} onClose={() => update({ asset: null })} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string | null) => void; options: Array<[string, string]> }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <select className="max-w-[14rem] bg-transparent outline-none" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
