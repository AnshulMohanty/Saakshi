/** The reload loader's pre-paint check (lib/boot.ts): when it shows, which palette, and when it ends. */
import { describe, expect, it } from "vitest";
import { BOOT_CHECK, BOOT_MAX_MS, BOOT_MIN_MS } from "@/lib/boot";

function run(o: { path: string; type?: string; reduced?: boolean; intro?: string; theme?: string | null; now?: number }) {
  const dataset: Record<string, string> = {};
  if (o.intro) dataset.intro = o.intro;
  const listeners: Record<string, () => void> = {};
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const env = {
    document: { documentElement: { dataset } },
    location: { pathname: o.path },
    performance: { getEntriesByType: () => [{ type: o.type ?? "reload" }], now: () => o.now ?? 300 },
    matchMedia: () => ({ matches: !!o.reduced }),
    localStorage: { getItem: () => o.theme ?? null },
    addEventListener: (k: string, fn: () => void) => void (listeners[k] = fn),
    setTimeout: (fn: () => void, ms: number) => void timers.push({ fn, ms }),
  };
  new Function(...Object.keys(env), BOOT_CHECK)(...Object.values(env));
  return { dataset, listeners, timers };
}

describe("BOOT_CHECK", () => {
  it("shows on a reload only: never on a first navigation (crawlers, Lighthouse) or with reduced motion", () => {
    expect(run({ path: "/library" }).dataset.boot).toBe("on");
    expect(run({ path: "/library", type: "navigate" }).dataset.boot).toBeUndefined();
    expect(run({ path: "/library", reduced: true }).dataset.boot).toBeUndefined();
  });

  it("never covers the landing's first-visit ink intro, or a print page", () => {
    expect(run({ path: "/" }).dataset.boot).toBeUndefined();
    expect(run({ path: "/", intro: "off" }).dataset.boot).toBe("on");
    expect(run({ path: "/spots/live-stage-demo-table/poster" }).dataset.boot).toBeUndefined();
  });

  it("matches the page's palette: night on the landing and dark pages, the saved theme in the app", () => {
    expect(run({ path: "/", intro: "off" }).dataset.bootTone).toBe("night");
    expect(run({ path: "/witness" }).dataset.bootTone).toBe("night");
    expect(run({ path: "/e/abc" }).dataset.bootTone).toBe("day");
    expect(run({ path: "/review", theme: "dark" }).dataset.bootTone).toBe("night");
    expect(run({ path: "/review", theme: "light" }).dataset.bootTone).toBe("day");
  });

  it("ends at the load event, but not before the minimum; past the fade it leaves CSS in charge", () => {
    const early = run({ path: "/library", now: 200 });
    early.listeners.load();
    expect(early.timers).toHaveLength(1);
    expect(early.timers[0].ms).toBe(BOOT_MIN_MS - 200);
    early.timers[0].fn();
    expect(early.dataset.boot).toBe("done");
    const late = run({ path: "/library", now: BOOT_MAX_MS });
    late.listeners.load();
    expect(late.timers).toHaveLength(0);
  });
});
