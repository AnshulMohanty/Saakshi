/**
 * `pnpm parity:capture <route> [--name <page>] [--base <url>] [--no-video]` or
 * `pnpm parity:capture --preset <design page>`: the same capture as design:capture, of a running
 * app route → design/actual/<page>/…  The page name defaults to the route ("/" → index,
 * "/spots/x" → spots-x); pass --name to match a design export. A preset captures the states the
 * design capture has (same variant ids, so parity:report pairs them): motion through the dev
 * override ?motion= (B5.11) or the same browser settings, app states through ?state= and
 * ?theme=, fixture routes under /dev/parity/<page>. Base URL: --base, else APP_URL, else
 * http://localhost:3000 (start `pnpm dev` first).
 */
import "./_env";
import path from "node:path";
import { capturePage, launchBrowser, pageSlug, VIEWPORTS, type Variant } from "./_capture";
import { captureStateVariants } from "./_capture-states";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const WALL = { width: 1920, height: 1080, mobile: false } as const;
const LOW_POWER = "Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });";

/** Design page → the app route and the variants that mirror scripts/design-capture.ts. */
export function preset(page: string, fixture: boolean): { route: string; variants?: Variant[] } | null {
  const q = (route: string, params: Record<string, string>) => `${route}${route.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`;
  const at = (route: string) => (fixture ? `/dev/parity/${page}` : route);
  switch (page) {
    case "saakshi-landing":
      return {
        route: at("/"),
        variants: [
          { id: "full", url: q(at("/"), { motion: "full" }) },
          { id: "low-power", initScript: LOW_POWER, url: q(at("/"), { motion: "low-power" }) },
          { id: "reduced", reducedMotion: "reduce" },
        ],
      };
    case "witness-wall":
      return {
        route: at("/witness"),
        variants: [
          { id: "idle", viewports: [...VIEWPORTS, WALL], mode: "timeline", timeline: { ready: "!!document.querySelector('[data-wall-ready]')", trigger: "0", at: [0] } },
          { id: "arrival", viewports: [WALL], mode: "timeline", url: q(at("/witness"), { operator: "rehearsal" }), timeline: { ready: "!!document.querySelector('[data-wall-ready]')", trigger: "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))", at: [0, 0.1, 1.5, 2.3, 2.9, 3.6, 4.4, 7.4, 8.0] } },
        ],
      };
    case "saakshi-app": {
      // The design capture sets demoState and theme, then clicks the rail (one page). The fixture
      // takes ?state= and ?theme= and is driven the same way; the product has a route per screen.
      const wait = (ms: number) => `await new Promise((r) => setTimeout(r, ${ms}));`;
      const rail = (label: string) => `[...document.querySelectorAll('nav[aria-label="Main"] button')].find((b) => (b.title || b.textContent || "").trim().startsWith(${JSON.stringify(label)}))?.click();`;
      const routes: Record<string, string> = { library: "/library", review: "/review", projects: "/projects/demo-hero-cleanup", studio: "/studio" };
      const out: Variant[] = [];
      for (const state of ["normal", "loading", "empty", "error", "offline"])
        for (const theme of ["light", "dark"])
          for (const screen of ["Library", "Review", "Projects", "Studio"]) {
            const k = screen.toLowerCase();
            out.push({
              id: `${state}-${theme}-${k}`,
              mode: state === "normal" && theme === "light" ? "scroll" : "single",
              url: q(fixture ? at("/library") : routes[k], { state, theme }),
              ...(fixture ? { prepare: `(async () => { ${wait(300)} ${rail(screen)} ${wait(900)} })()` } : {}),
            });
          }
      const lib = q(fixture ? at("/library") : "/library", { state: "normal", theme: "light" });
      out.push({ id: "drawer", mode: "single", url: lib, prepare: `(async () => { document.querySelector('#lib-grid button')?.click(); ${wait(1200)} })()` });
      out.push({ id: "drawer-exploded", mode: "single", url: lib, prepare: `(async () => { document.querySelector('#lib-grid button')?.click(); ${wait(900)} [...document.querySelectorAll("aside button")].find((b) => (b.textContent || "").trim().startsWith("Take it apart"))?.click(); ${wait(1400)} })()` });
      out.push({ id: "palette", mode: "single", url: lib, prepare: `(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true })); ${wait(600)} })()` });
      return { route: at("/library"), variants: out };
    }
    case "capture":
      // Fixture: the harness, as the design capture drives it. App: the phone screen on the dev states (?state=, B5.11).
      return fixture
        ? { route: at("/capture"), variants: captureStateVariants("!!document.querySelector('#cam')", VIEWPORTS[0]) }
        : { route: "/capture", variants: ["live-flow", "permission-prompt", "location-denied", "low-accuracy", "offline", "done"].map((s) => ({ id: `${s}-screen`, mode: "single" as const, element: "#cam", url: q("/capture", { state: s }) })) };
    case "how-it-works": {
      // The same clicks as design-capture: a preset, then the simulator in view.
      const pick = (label: string) => `(async () => { [...document.querySelectorAll("#sim button")].find((b) => (b.textContent || "").trim().startsWith(${JSON.stringify(label)}))?.click(); await new Promise((r) => setTimeout(r, 900)); document.querySelector('#sim').scrollIntoView(); await new Promise((r) => setTimeout(r, 300)); })()`;
      return {
        route: at("/how-it-works"),
        variants: [{ id: "default" }, { id: "preset-google", mode: "single", prepare: pick("Google image") }, { id: "preset-reused", mode: "single", prepare: pick("Reused photo") }],
      };
    }
    case "evidence-page":
      return {
        route: at("/e/<asset id>"),
        variants: [{ id: "default" }, { id: "exploded", mode: "single", prepare: "(async () => { document.querySelector('button[aria-pressed]')?.click(); await new Promise((r) => setTimeout(r, 1200)); })()" }],
      };
    case "report-page": {
      // The fixture keeps the prototype's number keys; the app keys numbers by claim id.
      const num = fixture ? "verified" : "photos_verified";
      return {
        route: at("/r/<report id>"),
        variants: [{ id: "default" }, { id: "hover-verified", mode: "single", prepare: `(async () => { document.querySelector('[data-num="${num}"]')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); document.querySelector('[data-num="${num}"]')?.focus(); await new Promise((r) => setTimeout(r, 900)); })()` }],
      };
    }
    case "qr-poster":
      return { route: at("/spots/demo-hero-cleanup-spot-1/poster"), variants: [{ id: "default", mode: "single" }] };
    case "spot-page":
      return { route: at("/spots/demo-hero-cleanup-spot-1"), variants: [{ id: "default" }] };
    case "demo-entry":
      return {
        route: at("/demo"),
        variants: [
          { id: "default" },
          { id: "loops", viewports: [VIEWPORTS[0]], mode: "timeline", timeline: { ready: "!!document.querySelector('[data-loops-ready]')", trigger: "0", at: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5] } },
          { id: "reduced", reducedMotion: "reduce" },
        ],
      };
    default:
      return null;
  }
}

async function main() {
  const presetName = arg("--preset");
  const fixture = process.argv.includes("--fixture");
  const p = presetName ? preset(pageSlug(presetName), fixture) : null;
  if (presetName && !p) throw new Error(`No preset for ${presetName}. Presets: saakshi-landing, witness-wall, saakshi-app, capture, how-it-works, demo-entry.`);
  const raw = p?.route ?? process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !["--name", "--base", "--preset", "--variant", "--width"].includes(all[i - 1] ?? ""));
  if (!raw) throw new Error("Usage: pnpm parity:capture <route> [--name <page>] [--base <url>] | --preset <design page> [--fixture]");
  // Git Bash (MSYS) rewrites "/spots/x" into "C:/Program Files/Git/spots/x": undo that.
  const route = raw.replace(/^[A-Za-z]:[\\/](?:.*?[\\/])?Git[\\/]/, "/").replaceAll("\\", "/");
  const base = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const abs = (r: string) => `${base}${r.startsWith("/") ? r : `/${r}`}`;
  const url = abs(route);
  const name = pageSlug(arg("--name") ?? presetName ?? (route.replace(/^\/+|\/+$/g, "") || "index"));
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch((e: unknown) => e);
  if (!(res instanceof Response)) throw new Error(`${url} is not reachable (${res instanceof Error ? res.message : res}). Start the app with \`pnpm dev\`, or pass --base.`);
  if (!res.ok) console.warn(`${url} answered HTTP ${res.status}; capturing anyway.`);

  // --variant full,reduced and --width 1440 narrow a preset while iterating: those are re-captured
  // and merged into the existing manifest (everything else is kept).
  const only = arg("--variant")?.split(",");
  const width = arg("--width") ? Number(arg("--width")) : null;
  const variants = p?.variants
    ?.filter((v) => !only || only.includes(v.id))
    .map((v) => ({ ...v, ...(v.url ? { url: abs(v.url) } : {}), ...(width ? { viewports: (v.viewports ?? VIEWPORTS).filter((vp) => vp.width === width) } : {}) }));
  const browser = await launchBrowser();
  try {
    console.log(`${url} → design/actual/${name}/`);
    await capturePage(browser, { name, url, outDir: path.join(process.cwd(), "design", "actual"), video: !process.argv.includes("--no-video"), variants, merge: !!(only || width), log: console.log });
  } finally {
    await browser.close();
  }
  console.log(`\nNext: pnpm parity:report (pairs design/reference/${name} with design/actual/${name}).`);
}

if (process.argv[1] && /parity-capture/.test(process.argv[1]))
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
