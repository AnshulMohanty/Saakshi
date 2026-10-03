"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { matches, parseChip, type BandName, type Chip } from "@/lib/app/chips";
import { LibraryMap, type MapFocus } from "./library-map";
import { bandMark } from "./marks";
import type { AppData } from "./types";

/**
 * The library (AP:482-551): search chips and the band filter, the map, the result count with the
 * bulk bar, and the photo grid (score badge with its band shape, the fingerprint on hover, a
 * select box). `importTick` replays the import animation (AP:977-985).
 */
/** The first row or two of tiles is above the fold: loaded at once, the first two first (the page's LCP). */
const EAGER_TILES = 8;

export function LibraryScreen({ data, dark, onOpen, toast, onImport, importTick, actions }: { data: AppData; dark: boolean; onOpen: (id: string) => void; toast: (t: string) => void; onImport: () => void; importTick: number; actions?: { bulkReview?: (ids: string[]) => Promise<string>; bulkReport?: (ids: string[]) => Promise<string>; searchText?: (q: string) => Promise<string[] | null> } }) {
  const [chips, setChips] = useState<Chip[]>([]);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<BandName | "all">("all");
  const [focus, setFocus] = useState<MapFocus>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const grid = useRef<HTMLDivElement>(null);

  // AP:979-984: tiles fall in from above, then the pins pop.
  useEffect(() => {
    if (!importTick) return;
    const raf = requestAnimationFrame(() => {
      const tiles = Array.from(document.querySelectorAll("[data-lt]"));
      const pins = Array.from(document.querySelectorAll("[data-pin]"));
      gsap.fromTo(tiles, { y: () => -300 - Math.random() * 300, x: () => (Math.random() - 0.5) * 600, rotate: () => (Math.random() - 0.5) * 50, opacity: 0 }, { y: 0, x: 0, rotate: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.02 });
      gsap.fromTo(pins, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.6)", stagger: 0.1, delay: 0.5 });
    });
    return () => cancelAnimationFrame(raf);
  }, [importTick]);

  // The map counts what the search and band leave; picking a project or cluster on it narrows the grid too.
  const onMap = data.photos.filter((p) => matches(p, { band, zoom: null, chips }));
  const shown = focus ? onMap.filter((p) => matches(p, { band: "all", zoom: focus.keys, chips: [] })) : onMap;
  const selected = Object.keys(sel).filter((k) => sel[k]);
  const filtering = chips.length > 0 || band !== "all" || !!focus;
  const bulk = async (kind: "report" | "review") => {
    const fn = kind === "report" ? actions?.bulkReport : actions?.bulkReview;
    const msg = fn ? await fn(selected).catch((e: unknown) => (e instanceof Error ? e.message : String(e))) : kind === "report" ? `${selected.length} photos added to the Versova report` : `${selected.length} photos sent to review`;
    toast(msg);
    setSel({});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "6px 8px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)" }}>
          {chips.map((c, i) => (
            <span key={`${c.t}-${c.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 4px 3px 8px", borderRadius: "6px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "12px", whiteSpace: "nowrap" }}>
              <span style={{ opacity: "0.7" }}>{c.kind}</span>
              <span style={{ fontWeight: "500" }}>{c.label}</span>
              <button type="button" onClick={() => setChips((cs) => cs.filter((_, j) => j !== i))} aria-label={`Remove ${c.kind} ${c.label}`} style={{ width: "18px", height: "18px", borderRadius: "4px", border: "0", background: "transparent", cursor: "pointer", lineHeight: "1" }}>
                ×
              </button>
            </span>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const c = parseChip(query, data.projects);
                if (c) {
                  setChips((cs) => [...cs, c]);
                  setQuery("");
                  // Text goes to the hybrid search (Hinglish, synonyms, embeddings) when the product has it.
                  if (c.t === "text" && actions?.searchText) void actions.searchText(c.v).then((ids) => ids && setChips((cs) => cs.map((x) => (x === c ? { ...c, ids } : x))));
                }
              } else if (e.key === "Backspace" && !query && chips.length) setChips((cs) => cs.slice(0, -1));
            }}
            placeholder={chips.length ? "Add another filter" : "Try: flagged, Pune, 2024, no location"}
            aria-label="Search photos"
            className="focus-ring"
            style={{ flex: "1", minWidth: "140px", border: "0", outline: "0", background: "transparent", padding: "4px" }}
          />
        </div>
        <div role="radiogroup" aria-label="Band" style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "9px", background: "var(--muted)" }}>
          {(
            [
              ["all", "All"],
              ["Verified", "Verified"],
              ["Needs review", "Needs review"],
              ["Flagged", "Flagged"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={band === v} onClick={() => setBand(v)} style={{ padding: "6px 10px", borderRadius: "7px", border: "0", cursor: "pointer", whiteSpace: "nowrap", fontSize: "13px", background: band === v ? "var(--card)" : "transparent", color: band === v ? "var(--foreground)" : "var(--muted-foreground)" }}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onImport} style={{ padding: "8px 12px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", whiteSpace: "nowrap" }}>
          Live import
        </button>
      </div>

      <LibraryMap photos={onMap} projects={data.projects} focus={focus} onFocus={setFocus} onOpen={onOpen} dark={dark} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted-foreground)" }} data-testid="library-count">
          {`${shown.length} photos${filtering ? " match" : ""}`}
        </span>
        {selected.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 4px 4px 12px", borderRadius: "9px", background: "var(--foreground)", color: "var(--background)" }}>
            <span style={{ fontWeight: "500", marginRight: "6px" }}>{`${selected.length} selected`}</span>
            <button type="button" onClick={() => void bulk("report")} style={{ padding: "6px 10px", borderRadius: "7px", border: "0", background: "transparent", color: "inherit", cursor: "pointer" }}>
              Add to report
            </button>
            <button type="button" onClick={() => void bulk("review")} style={{ padding: "6px 10px", borderRadius: "7px", border: "0", background: "transparent", color: "inherit", cursor: "pointer" }}>
              Send to review
            </button>
            <button type="button" onClick={() => setSel({})} style={{ padding: "6px 10px", borderRadius: "7px", border: "0", background: "transparent", color: "inherit", cursor: "pointer" }}>
              Clear
            </button>
          </div>
        )}
      </div>
      <div ref={grid} id="lib-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "8px" }}>
        {shown.map((p, i) => {
          const m = bandMark(p.band);
          const s = !!sel[p.id];
          return (
            <div key={p.id} data-lt="" className="app-tile" style={{ position: "relative", aspectRatio: "1", borderRadius: "9px", overflow: "hidden", background: "var(--muted)", outline: s ? "2px solid var(--primary)" : "0 solid transparent", outlineOffset: "-2px" }}>
              <button type="button" onClick={() => onOpen(p.id)} aria-label={`Open ${p.title}`} style={{ position: "absolute", inset: "0", padding: "0", border: "0", cursor: "pointer", background: "transparent" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                <img src={p.src} alt="" loading={i < EAGER_TILES ? "eager" : "lazy"} fetchPriority={i < 2 ? "high" : "auto"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span className="app-tile-glyph" style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--n-background) 72%, transparent)", opacity: "0", transition: "opacity 160ms" }}>
                  <Glyph bits={p.hash ?? "0".repeat(64)} colors={{ on: "var(--n-primary)", off: "color-mix(in srgb, var(--n-foreground) 16%, transparent)" }} style={{ width: "46%", height: "46%" }} />
                </span>
              </button>
              <span style={{ position: "absolute", left: "6px", bottom: "6px", display: "flex", alignItems: "center", gap: "5px", padding: "2px 7px 2px 5px", borderRadius: "6px", background: "var(--card)", fontSize: "11px", fontWeight: "600", pointerEvents: "none" }}>
                <span style={{ width: "9px", height: "9px", background: m.color, borderRadius: m.radius, clipPath: m.clip, transform: `rotate(${m.rot})` }} />
                {p.score !== null ? `${p.score} ${p.band}` : p.band}
              </span>
              <label style={{ position: "absolute", right: "6px", top: "6px", width: "24px", height: "24px", borderRadius: "6px", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={s} onChange={() => setSel((x) => ({ ...x, [p.id]: !x[p.id] }))} aria-label={`Select ${p.title}`} style={{ margin: "0", accentColor: "var(--primary)" }} />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
