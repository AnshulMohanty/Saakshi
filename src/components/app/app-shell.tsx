"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Glyph } from "@/components/glyph";
import { useStoredDark, writeTheme } from "@/lib/client/theme";
import { LOGO_BITS } from "@/lib/glyph";
import { EvidenceDrawer } from "./evidence-drawer";
import { LibraryScreen } from "./library-screen";
import { ProjectsScreen } from "./projects-screen";
import { reviewQueue, ReviewScreen, type Decision } from "./review-screen";
import { StudioScreen } from "./studio-screen";
import type { AppData, AppPhoto, DemoState, Screen } from "./types";

/**
 * The app shell (Saakshi_App, template AP:415-831): the demo bar and offline notice, the rail
 * (220 px, or 60 px collapsed; collapsed on phones), the top bar with ⌘K, the content area in
 * its five states, the evidence drawer, the command palette and toasts. In the product each
 * screen is a route; on the parity fixture the rail switches screens in place, as the prototype
 * does. `actions` are the product's server calls; without them (the fixture) everything is local.
 */
export interface AppActions {
  decide?: (p: AppPhoto, d: Decision) => Promise<void>;
  resetDemo?: () => Promise<string>;
  startImport?: () => Promise<string>;
  bulkReview?: (ids: string[]) => Promise<string>;
  bulkReport?: (ids: string[]) => Promise<string>;
  searchText?: (q: string) => Promise<string[] | null>;
  generateReport?: (projectKey: string) => Promise<void>;
}

const NAV: Array<[Screen, string, string]> = [
  ["library", "Library", "▦"],
  ["review", "Review", "✓"],
  ["projects", "Projects", "◎"],
  ["studio", "Studio", "✎"],
];
const TITLE: Record<Screen, string> = { library: "Library", review: "Review", projects: "Project overview", studio: "Studio" };
const COPY: Record<Screen, { loading: string; emptyTitle: string; emptyBody: string; emptyAction: string; errorTitle: string }> = {
  library: { loading: "Loading photos…", emptyTitle: "No photos yet", emptyBody: "Import a folder of field photos, or capture one at a spot. Saakshi sorts them by place, project and date.", emptyAction: "Import the demo photos", errorTitle: "Couldn't load the library" },
  review: { loading: "Loading the review queue…", emptyTitle: "Nothing to review", emptyBody: "Photos that need review or were flagged will wait here, with their reasons.", emptyAction: "Import the demo photos", errorTitle: "Couldn't load the review queue" },
  projects: { loading: "Loading the project…", emptyTitle: "No projects yet", emptyBody: "A project groups spots and their photos. Import photos and they are placed in projects by where they were taken.", emptyAction: "Import the demo photos", errorTitle: "Couldn't load this project" },
  studio: { loading: "Loading Studio…", emptyTitle: "Nothing to publish yet", emptyBody: "Studio builds reports and posts from verified photos. Import photos first.", emptyAction: "Import the demo photos", errorTitle: "Couldn't load Studio" },
};
const RAIL_BTN = { display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px", borderRadius: "8px", border: "0", background: "transparent", cursor: "pointer", whiteSpace: "nowrap", color: "var(--muted-foreground)" } as const;

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export interface AppShellProps {
  data: AppData | null;
  screen: Screen;
  state: DemoState;
  /** Forced theme (the fixture, `?theme=` in dev); null = the viewer's choice. */
  theme: "light" | "dark" | null;
  /** The project the overview and Studio show. */
  project: string | null;
  /** Product routes; null on the fixture (the rail switches screens in place). */
  routes: { library: string; review: string; projects: (key: string) => string; studio: string } | null;
  actions?: AppActions;
}

export function AppShell({ data, screen: routeScreen, state, theme, project, routes, actions }: AppShellProps) {
  const router = useRouter();
  const [localScreen, setLocalScreen] = useState<Screen>(routeScreen);
  const scr = routes ? routeScreen : localScreen;
  const [rail, setRail] = useState(true);
  // Phones show the collapsed rail from the first paint (CSS, .app-rail); it widens only once the visitor opens it.
  const [railTouched, setRailTouched] = useState(false);
  const stored = useStoredDark();
  const [forcedDark, setForcedDark] = useState<boolean | null>(theme ? theme === "dark" : null);
  const dark = forcedDark ?? stored;
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [pq, setPq] = useState("");
  const [pi, setPi] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [proj, setProj] = useState<string | null>(project ?? data?.projects[0]?.key ?? null);
  const [toast, setToast] = useState("");
  const [retried, setRetried] = useState(false);
  const [importTick, setImportTick] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const palIn = useRef<HTMLInputElement>(null);

  // AP:844: phones start with the rail collapsed.
  useEffect(() => {
    if (!matchMedia("(max-width: 760px)").matches) return;
    const raf = requestAnimationFrame(() => setRail(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  const showToast = useCallback((t: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  const go = useCallback(
    (k: Screen) => {
      if (!routes) return setLocalScreen(k);
      router.push(k === "projects" ? routes.projects(proj ?? data?.projects[0]?.key ?? "") : routes[k]);
    },
    [routes, router, proj, data],
  );
  const openPalette = () => {
    setPalette(true);
    setPq("");
    setPi(0);
    requestAnimationFrame(() => palIn.current?.focus());
  };

  // AP:918-922: ⌘/Ctrl+K toggles the palette; Esc closes the palette, then the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        setPq("");
        setPi(0);
        requestAnimationFrame(() => palIn.current?.focus());
      } else if (e.key === "Escape") {
        if (palette) setPalette(false);
        else if (drawer) setDrawer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, drawer]);

  const startImport = useCallback(async () => {
    setRetried(true);
    if (routes && scr !== "library") router.push(routes.library);
    else setLocalScreen("library");
    if (actions?.startImport) showToast(await actions.startImport().catch((e: unknown) => (e instanceof Error ? e.message : String(e))));
    setImportTick((n) => n + 1);
    if (!actions?.startImport && data) setTimeout(() => showToast(data.importToast), 1500);
  }, [actions, data, routes, router, scr, showToast]);

  const resetDemo = useCallback(async () => {
    setDecisions({});
    setDrawer(null);
    setRetried(false);
    showToast(actions?.resetDemo ? await actions.resetDemo().catch((e: unknown) => (e instanceof Error ? e.message : String(e))) : "Demo reset. Every decision cleared.");
  }, [actions, showToast]);

  const decide = useCallback(
    async (p: AppPhoto, d: Decision) => {
      await actions?.decide?.(p, d);
      setDecisions((x) => ({ ...x, [p.id]: d }));
      showToast(d.kind === "approved" ? "Approved and sealed. Note saved to the audit trail." : "Rejected. It stays out of every report.");
    },
    [actions, showToast],
  );

  const queueLen = data ? reviewQueue(data.photos, decisions).length : 0;
  const loading = !data || state === "loading";
  const empty = state === "empty" && !retried;
  const error = state === "error" && !retried;
  const copy = COPY[scr];
  const toggleTheme = () => {
    if (forcedDark !== null) setForcedDark(!dark);
    else writeTheme(!dark);
  };

  // AP:1130-1137: pages, actions, then photos matching by title, code or band.
  const palItems = useMemo(() => {
    const q = pq.trim().toLowerCase();
    const cmds: Array<{ label: string; hint: string; src: string | null; run: () => void }> = [
      ...NAV.map(([k, label]) => ({ label: `Go to ${k === "projects" ? "Project overview" : label}`, hint: "Page", src: null, run: () => (setPalette(false), go(k)) })),
      { label: "Capture a photo", hint: "Action", src: null, run: () => window.location.assign(data?.captureHref ?? "/capture") },
      { label: dark ? "Switch to light" : "Switch to dark", hint: "Action", src: null, run: () => (toggleTheme(), setPalette(false)) },
    ];
    const hits = q && data ? data.photos.filter((p) => `${p.title} ${p.code} ${p.band}`.toLowerCase().includes(q)).slice(0, 6).map((p) => ({ label: p.title.replace(/\.(jpe?g|png)$/i, ""), hint: p.band, src: p.src, run: () => (setPalette(false), setDrawer(p.id)) })) : [];
    return [...cmds.filter((c) => !q || c.label.toLowerCase().includes(q)), ...hits];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleTheme reads the same state listed here
  }, [pq, data, dark, go]);

  const drawerPhoto = drawer && data ? (data.photos.find((p) => p.id === drawer) ?? null) : null;

  return (
    <div id="app" className={`design-root app-root ${dark ? "dark" : "light"}`} data-screen-label="App" data-theme={dark ? "dark" : "light"} style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--foreground)", background: "var(--background)", fontVariantNumeric: "tabular-nums", overflow: "hidden" }}>
      <div style={{ flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "5px 12px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "12px" }}>
        <span>{data?.banner ?? "Demo workspace. Photos come from Wikimedia Commons."}</span>
        <button type="button" onClick={() => void resetDemo()} style={{ whiteSpace: "nowrap", padding: "2px 8px", borderRadius: "6px", border: "1px solid currentColor", background: "transparent", cursor: "pointer", fontSize: "12px" }}>
          Reset demo
        </button>
      </div>
      {(state === "offline" || !online) && (
        <div role="status" style={{ flexShrink: "0", padding: "7px 12px", textAlign: "center", fontSize: "13px", background: "color-mix(in oklch, var(--review) 16%, var(--card))", color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>
          You&apos;re offline. Showing photos saved on this device; decisions sync when you&apos;re back.
        </div>
      )}
      <div style={{ flex: "1", minHeight: "0", display: "flex" }}>
        <nav aria-label="Main" className="app-rail" data-touched={railTouched ? "" : undefined} style={{ flexShrink: "0", width: rail ? "220px" : "60px", display: "flex", flexDirection: "column", gap: "4px", padding: "12px 10px", boxSizing: "border-box", background: "var(--card)", borderRight: "1px solid var(--border)", transition: "width 200ms cubic-bezier(0.16,1,0.3,1)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 6px 12px" }}>
            <Glyph bits={LOGO_BITS} colors={{ on: "var(--l-primary)", off: "transparent" }} style={{ width: "24px", height: "24px", flexShrink: "0" }} />
            {rail && <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "20px", whiteSpace: "nowrap" }}>Saakshi</span>}
          </div>
          <button type="button" aria-label="Capture" onClick={() => window.location.assign(data?.captureHref ?? "/capture")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontWeight: "500", whiteSpace: "nowrap", marginBottom: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {rail && <span>Capture</span>}
          </button>
          {NAV.map(([k, label, icon]) => (
            <button key={k} type="button" onClick={() => go(k)} aria-current={scr === k ? "page" : "false"} title={label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px", borderRadius: "8px", border: "0", cursor: "pointer", background: scr === k ? "var(--accent)" : "transparent", color: scr === k ? "var(--accent-foreground)" : "var(--foreground)", textAlign: "left", whiteSpace: "nowrap", transition: "background 150ms" }}>
              <span style={{ width: "18px", height: "18px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>{icon}</span>
              {rail && <span style={{ flex: "1" }}>{label}</span>}
              {k === "review" && queueLen > 0 && <span style={{ minWidth: "20px", padding: "1px 6px", borderRadius: "var(--radius)", background: "var(--review)", color: "var(--card)", fontSize: "11px", fontWeight: "600", textAlign: "center" }}>{queueLen}</span>}
            </button>
          ))}
          <div style={{ flex: "1" }} />
          <button type="button" onClick={toggleTheme} style={RAIL_BTN}>
            <span style={{ width: "18px", textAlign: "center" }}>◐</span>
            {rail && <span>{dark ? "Light" : "Dark"}</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setRail((r) => !r);
              setRailTouched(true);
            }}
            aria-label={rail ? "Collapse the sidebar" : "Expand the sidebar"}
            style={RAIL_BTN}
          >
            <span style={{ width: "18px", textAlign: "center" }}>{rail ? "«" : "»"}</span>
            {rail && <span>Collapse</span>}
          </button>
        </nav>

        <main style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
          <div style={{ flexShrink: "0", display: "flex", alignItems: "center", gap: "12px", padding: "10px clamp(12px,2vw,24px)", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px", whiteSpace: "nowrap" }}>{TITLE[scr]}</h1>
            <div style={{ flex: "1" }} />
            <button type="button" onClick={openPalette} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0", padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", cursor: "pointer", color: "var(--muted-foreground)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Search photos, spots, actions</span>
              <kbd style={{ padding: "1px 5px", borderRadius: "4px", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>⌘K</kbd>
            </button>
          </div>

          <div id="content" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "clamp(12px,2vw,24px)", boxSizing: "border-box" }}>
            {loading && (
              <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ height: "220px", borderRadius: "12px", background: "var(--muted)", animation: "skpulse 1.4s ease-in-out infinite" }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "8px" }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} style={{ aspectRatio: "1", borderRadius: "8px", background: "var(--muted)", animation: "skpulse 1.4s ease-in-out infinite" }} />
                  ))}
                </div>
                <span style={{ color: "var(--muted-foreground)" }}>{copy.loading}</span>
              </div>
            )}
            {!loading && empty && (
              <div style={{ maxWidth: "520px", margin: "10vh auto", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", textAlign: "center" }}>
                <Glyph bits={LOGO_BITS} colors={{ on: "var(--l-primary)", off: "color-mix(in srgb, var(--logo-off) 18%, transparent)" }} style={{ width: "72px", height: "72px" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "26px" }}>{copy.emptyTitle}</span>
                <span style={{ color: "var(--muted-foreground)", lineHeight: "1.5" }}>{copy.emptyBody}</span>
                <button type="button" onClick={() => void startImport()} style={{ padding: "10px 16px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontWeight: "500" }}>
                  {copy.emptyAction}
                </button>
              </div>
            )}
            {!loading && error && (
              <div role="alert" style={{ maxWidth: "520px", margin: "10vh auto", display: "flex", flexDirection: "column", gap: "10px", padding: "20px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--flagged)" }}>
                <span style={{ fontWeight: "600", fontSize: "16px" }}>{copy.errorTitle}</span>
                <span style={{ color: "var(--muted-foreground)", lineHeight: "1.5" }}>Nothing was lost. Your photos and decisions are stored; only this view failed to load.</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--muted-foreground)" }}>{data?.errorDetail ?? ""}</code>
                <button
                  type="button"
                  onClick={() => {
                    setRetried(true);
                    if (routes) router.refresh();
                  }}
                  style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", cursor: "pointer" }}
                >
                  Try again
                </button>
              </div>
            )}
            {!loading && !empty && !error && data && (
              <>
                {scr === "library" && <LibraryScreen data={data} dark={dark} onOpen={setDrawer} toast={showToast} onImport={() => void startImport()} importTick={importTick} actions={actions} />}
                {scr === "review" && <ReviewScreen photos={data.photos} decisions={decisions} onDecide={decide} blocked={palette || !!drawer} />}
                {scr === "projects" && proj && (
                  <ProjectsScreen
                    projects={data.projects}
                    current={proj}
                    data={data.projectScreens[proj] ?? null}
                    onPick={(k) => {
                      setProj(k);
                      if (routes) router.push(routes.projects(k));
                    }}
                    onOpen={setDrawer}
                  />
                )}
                {scr === "studio" && data.studio && <StudioScreen data={data.studio} offline={state === "offline" || !online} toast={showToast} onGenerate={actions?.generateReport && data.studioKey ? () => actions.generateReport!(data.studioKey!) : undefined} />}
              </>
            )}
          </div>
        </main>
      </div>

      {drawerPhoto && <EvidenceDrawer key={drawerPhoto.id} photo={drawerPhoto} project={data?.projects.find((p) => p.key === drawerPhoto.project) ?? null} decision={decisions[drawerPhoto.id] ?? null} onClose={() => setDrawer(null)} />}

      {palette && (
        <>
          <div onClick={() => setPalette(false)} style={{ position: "fixed", inset: "0", background: "color-mix(in srgb, var(--n-background) 40%, transparent)", zIndex: "40" }} />
          <div role="dialog" aria-label="Search" className="app-palette" style={{ position: "fixed", left: "50%", top: "12vh", transform: "translateX(-50%)", width: "min(560px,calc(100% - 24px))", zIndex: "41", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 30px 80px color-mix(in srgb, var(--ink-black) 30%, transparent)", overflow: "hidden" }}>
            <input
              ref={palIn}
              id="pal-in"
              value={pq}
              onChange={(e) => {
                setPq(e.target.value);
                setPi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPi((x) => Math.min(palItems.length - 1, x + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPi((x) => Math.max(0, x - 1));
                } else if (e.key === "Enter") palItems[pi]?.run();
              }}
              placeholder="Type a command, spot or photo"
              aria-label="Search"
              style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", border: "0", borderBottom: "1px solid var(--border)", outline: "0", background: "transparent", fontSize: "16px" }}
            />
            <div style={{ maxHeight: "50vh", overflow: "auto", padding: "6px" }}>
              {palItems.map((p, i) => (
                <button key={`${p.hint}-${p.label}-${i}`} type="button" onClick={p.run} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", border: "0", background: i === pi ? "var(--accent)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  {p.src && <img loading="lazy" src={p.src} alt="" style={{ width: "32px", height: "24px", objectFit: "cover", borderRadius: "4px" }} />}
                  <span style={{ flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: "50", padding: "10px 16px", borderRadius: "var(--radius)", background: "var(--foreground)", color: "var(--background)", boxShadow: "0 10px 30px color-mix(in srgb, var(--ink-black) 20%, transparent)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
