"use client";

import { useState, type CSSProperties } from "react";
import { IndiaMap, type MapPin, type Projector } from "@/components/map/india-map";
import { clusterPoints, fanOut, pinPosition, placeCards } from "@/lib/app/map";
import { INDIA_BOUNDS, viewFor, type View } from "@/lib/map/india";
import { bandMark } from "./marks";
import type { AppPhoto, AppProject } from "./types";

/**
 * The library map: the shared map of India (official boundary), interactive: drag to pan, zoom with
 * the buttons, ⌘/Ctrl + scroll, a double-click or a pinch. Each project is a pulsing site with a
 * card (photos, the band split, the name); projects too close to tell apart at this zoom merge into
 * one cluster (lib/app/map.ts). Picking a project or a cluster filters the grid to its photos and
 * flies there; a single project then shows one pin per photo by band shape, and a pin opens the
 * photo. Hover or focus shows the details. The legend names the shapes.
 */
export type MapFocus = { keys: string[] } | null;

const CLUSTER_PX = 46;
const ASPECT = 2.4;
const WIDE = { w: 188, h: 64, gap: 12, edge: 8, top: 52, bottom: 40 };
const COMPACT = { w: 134, h: 46, gap: 10, edge: 6, top: 52, bottom: 64 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The overview is the whole country, official boundary and all; picking a project or cluster flies in. */
const overview = (): View => INDIA_BOUNDS;

function viewOf(projects: AppProject[], photos: AppPhoto[], keys: string[]): View {
  const ps = projects.filter((p) => keys.includes(p.key));
  if (ps.length !== 1) return viewFor(ps, ASPECT, { pad: 0.35, minSpan: 1.2 });
  const c = ps[0];
  const at = photos.filter((p) => p.project === c.key).flatMap((p) => pinPosition(p, c) ?? []);
  return viewFor([c, ...at], ASPECT, { pad: 0.2, minSpan: 0.5 });
}

export function LibraryMap({ photos, projects, focus, onFocus, onOpen, dark }: { photos: AppPhoto[]; projects: AppProject[]; focus: MapFocus; onFocus: (f: MapFocus) => void; onOpen: (id: string) => void; dark: boolean }) {
  const [target, setTarget] = useState<View>(() => (focus ? viewOf(projects, photos, focus.keys) : overview()));
  const [hover, setHover] = useState<string | null>(null);

  const go = (keys: string[] | null) => {
    onFocus(keys ? { keys } : null);
    setTarget(keys ? viewOf(projects, photos, keys) : overview());
    setHover(null);
  };

  const single = focus?.keys.length === 1 ? (projects.find((p) => p.key === focus.keys[0]) ?? null) : null;
  const byProject = (k: string) => photos.filter((p) => p.project === k);
  const split = (ps: AppPhoto[]) => ({ v: ps.filter((p) => p.band === "Verified").length, r: ps.filter((p) => p.band === "Needs review").length, f: ps.filter((p) => p.band === "Flagged").length });

  let outside = 0;
  const placed: MapPin[] = single
    ? byProject(single.key).flatMap((p) => {
        const at = pinPosition(p, single);
        if (!at) {
          outside++;
          return [];
        }
        const m = bandMark(p.band);
        const score = p.score !== null ? `${p.score}, ${p.band}` : (p.scoreHidden ?? p.band);
        return [{ id: p.id, lat: at.lat, lng: at.lng, title: `${p.band}, ${p.title}`, tip: [p.title.replace(/\.(jpe?g|png)$/i, ""), score, p.gps ? p.reason : `No GPS: shown near the site. ${p.reason}`], mark: { background: m.color, borderRadius: m.radius, clipPath: m.clip, transform: `rotate(${m.rot})` } as CSSProperties, z: p.band === "Flagged" ? 3 : p.band === "Needs review" ? 2 : 1 }];
      })
    : [];
  const nudge = fanOut(placed, 11);
  const pins = placed.map((p) => ({ ...p, offset: nudge[p.id] }));

  const overlay = (pj: Projector) => {
    const box = pj.W < 560 ? COMPACT : WIDE;
    const pts = projects
      .filter((pr) => pr.key !== single?.key)
      .map((pr) => ({ key: pr.key, x: pj.x(pr.lng), y: pj.y(pr.lat), n: byProject(pr.key).length }))
      .filter((p) => p.x > -20 && p.y > -20 && p.x < pj.W + 20 && p.y < pj.H + 20);
    const clusters = clusterPoints(pts, CLUSTER_PX);
    const offs = placeCards(
      clusters.map((c) => ({ key: c.keys.join("|"), x: c.x, y: c.y })),
      pj.W,
      pj.H,
      box,
    );
    const tipFor = clusters.find((c) => c.keys.join("|") === hover);
    return (
      <>
        {clusters.map((c) => {
          const id = c.keys.join("|");
          const members = c.keys.map((k) => projects.find((p) => p.key === k)!);
          const ps = c.keys.flatMap(byProject);
          const s = split(ps);
          const n = ps.length || 1;
          const [dx, dy] = offs[id];
          const name = members.length === 1 ? (members[0].city ? `${members[0].name}, ${members[0].city}` : members[0].name) : `${members.length} projects nearby`;
          const dim = !!focus && !c.keys.some((k) => focus.keys.includes(k));
          const r = Math.round(Math.min(30, 13 + Math.sqrt(ps.length) * 2.2));
          return (
            <button
              key={id}
              type="button"
              data-pin=""
              className="focus-ring lm-site"
              aria-label={`${name}: ${plural(ps.length, "photo", "photos")}. Show only ${members.length === 1 ? "its" : "their"} photos`}
              onClick={() => go(c.keys)}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover((h) => (h === id ? null : h))}
              onFocus={() => setHover(id)}
              onBlur={() => setHover((h) => (h === id ? null : h))}
              style={{ position: "absolute", left: `${c.x - r}px`, top: `${c.y - r}px`, width: `${r * 2}px`, height: `${r * 2}px`, padding: "0", border: "0", borderRadius: "50%", background: "transparent", cursor: "pointer", zIndex: hover === id ? 5 : 3, opacity: dim ? 0.55 : 1, transition: "opacity var(--dur-ui)" }}
            >
              <span aria-hidden="true" style={{ position: "absolute", left: `${-r}px`, top: `${-r}px`, width: `${r * 4}px`, height: `${r * 4}px`, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 66%)", pointerEvents: "none" }} />
              <span className="im-pulse" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: `${r * 2}px`, height: `${r * 2}px`, borderRadius: "50%", border: "2px solid var(--primary)" }} />
              <span aria-hidden="true" style={{ position: "absolute", inset: "0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: "700", fontSize: r > 20 ? "14px" : "12px", boxShadow: "0 0 0 3px var(--card), 0 6px 18px color-mix(in srgb, var(--primary) 45%, transparent)" }}>
                {ps.length}
              </span>
              <span aria-hidden="true" style={{ position: "absolute", left: `${r}px`, top: `${r}px`, transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`, width: `${box.w}px`, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start", padding: box === WIDE ? "8px 10px" : "6px 8px", borderRadius: "var(--radius)", background: "var(--card)", border: `1px solid ${hover === id ? "var(--primary)" : "var(--border)"}`, boxShadow: "0 6px 18px color-mix(in srgb, var(--ink-black) 14%, transparent)", textAlign: "left", color: "var(--foreground)" }}>
                {box === WIDE && (
                  <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "22px", lineHeight: "1" }}>{ps.length}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{ps.length === 1 ? "photo" : "photos"}</span>
                  </span>
                )}
                <span style={{ display: "flex", width: "100%", height: "5px", borderRadius: "3px", overflow: "hidden", background: "var(--muted)" }}>
                  <span style={{ width: `${(s.v / n) * 100}%`, background: "var(--verified)" }} />
                  <span style={{ width: `${(s.r / n) * 100}%`, background: "var(--review)" }} />
                  <span style={{ width: `${(s.f / n) * 100}%`, background: "var(--flagged)" }} />
                </span>
                <span style={{ maxWidth: "100%", fontSize: "12px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              </span>
            </button>
          );
        })}
        {tipFor &&
          (() => {
            const ps = tipFor.keys.flatMap(byProject);
            const s = split(ps);
            const members = tipFor.keys.map((k) => projects.find((p) => p.key === k)!);
            const W = 230;
            return (
              <div role="tooltip" style={{ position: "absolute", left: `${Math.max(8, Math.min(pj.W - W - 8, tipFor.x - W / 2))}px`, top: `${tipFor.y > pj.H / 2 ? Math.max(8, tipFor.y - 40 - 22 * (members.length + 2)) : tipFor.y + 34}px`, zIndex: 8, width: `${W}px`, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "3px", padding: "9px 11px", borderRadius: "9px", background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", boxShadow: "0 10px 28px color-mix(in srgb, var(--ink-black) 22%, transparent)", fontSize: "12px", lineHeight: "1.4", pointerEvents: "none" }}>
                {members.map((m) => (
                  <span key={m.key} style={{ fontWeight: "600" }}>
                    {m.city ? `${m.name}, ${m.city}` : m.name}
                    <span style={{ fontWeight: "400", color: "var(--muted-foreground)" }}>{` · ${plural(byProject(m.key).length, "photo", "photos")}`}</span>
                  </span>
                ))}
                <span style={{ color: "var(--muted-foreground)" }}>{`${s.v} verified · ${s.r} need review · ${s.f} flagged`}</span>
                <span style={{ color: "var(--primary)", fontWeight: "500" }}>{members.length === 1 ? "Click to show only its photos" : "Click to zoom in and show only these photos"}</span>
              </div>
            );
          })()}
      </>
    );
  };

  const focusPhotos = focus ? focus.keys.flatMap(byProject).length : 0;
  const caption = single
    ? `${single.city ? `${single.name}, ${single.city}` : single.name}: ${plural(focusPhotos, "photo", "photos")}${outside ? `, ${outside} taken outside this view` : ""}. Photos without GPS wait near the site.`
    : focus
      ? `${focus.keys.length} projects nearby: ${plural(focusPhotos, "photo", "photos")}. Pick one to see its photos on the map.`
      : `${plural(projects.length, "project", "projects")} across India. Pick one to see only its photos.`;

  return (
    <IndiaMap
      variant="interactive"
      theme={dark ? "dark" : "day"}
      view={target}
      pins={pins}
      onPin={onOpen}
      overlay={overlay}
      pad={16}
      ariaLabel="Map of India with the projects. Drag or use the arrow keys to move, plus and minus to zoom."
      className="lm-box"
      style={{ borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div style={{ position: "absolute", left: "10px", top: "10px", right: "54px", zIndex: 6, display: "flex", gap: "6px", alignItems: "center", pointerEvents: "none" }}>
        {focus && (
          <button type="button" className="focus-ring" onClick={() => go(null)} style={{ pointerEvents: "auto", flexShrink: "0", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontSize: "13px" }}>
            ← All projects
          </button>
        )}
        <span data-testid="map-caption" style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--card) 92%, transparent)", border: "1px solid var(--border)", fontSize: "12px" }}>
          {caption}
        </span>
      </div>
      <div className="lm-legend" style={{ position: "absolute", left: "10px", bottom: "10px", zIndex: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "6px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--card) 92%, transparent)", border: "1px solid var(--border)", fontSize: "12px", pointerEvents: "none" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--primary)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)" }} />
          Project (photos)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--verified)" }} />
          Verified
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "2px", transform: "rotate(45deg)", background: "var(--review)" }} />
          Needs review
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "10px", height: "10px", clipPath: "polygon(50% 0,100% 100%,0 100%)", background: "var(--flagged)" }} />
          Flagged
        </span>
        <span className="lm-hint" style={{ color: "var(--muted-foreground)" }}>
          Drag to move · ⌘/Ctrl + scroll to zoom
        </span>
      </div>
    </IndiaMap>
  );
}
