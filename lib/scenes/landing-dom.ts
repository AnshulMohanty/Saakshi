/**
 * The landing's scroll choreography (browser only): the design's Component.setup() and its
 * helpers (landing template L:1233-1572), ported nearly verbatim and scoped to the landing root.
 * Numbers live in lib/motion/scenes/landing.ts; the WebGL stage in ./landing-stage.ts.
 *
 * Changes from the prototype: the mode comes from lib/motion/mode.ts; chapter 9's map shows real
 * arrivals from /api/live (B5.8) instead of random ones; the QR is rendered on the server; the
 * trust score counts to the hero's real score and band (B5.1, bands 75/45); cleanup is a
 * gsap.context so React can mount and unmount it.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { LandingData } from "../landing/types";
import type { MotionMode } from "../motion/mode";
import { C9_MAP, COLORS, DUST, LABELS, LENIS, MOBILE_BELOW, NAV, REFRESH, STAGE_START, T1, T2, T3, T4, T5, T7 } from "../motion/scenes/landing";
import { oklchCssToHex } from "../color/oklch";
import { defaultTrustConfig } from "../trust/config";
import type { TrustBand } from "../trust/types";
import type { LiveEvent } from "../live";
import { drawLayers, loadImage } from "./layers";
import type { Stage, StageFrame } from "./landing-stage";

export interface LandingController {
  /** Highlight a number's threads and tiles (chapter 5), or clear with null. */
  hi(k: string | null): void;
  dispose(): void;
}

const BAND: Record<TrustBand, string> = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" };
const bandOf = (v: number): TrustBand => (v >= defaultTrustConfig.verifiedMin ? "VERIFIED" : v >= defaultTrustConfig.reviewMin ? "NEEDS_REVIEW" : "FLAGGED");
const BAND_VAR: Record<TrustBand, string> = { VERIFIED: "var(--verified)", NEEDS_REVIEW: "var(--review)", FLAGGED: "var(--flagged)" };

export function setupLanding(root: HTMLElement, d: LandingData, opts: { mode: MotionMode; live?: boolean }): LandingController {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const qa = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  let dead = false;
  let stage: Stage | null = null;
  let lenis: Lenis | null = null;
  let ro: ResizeObserver | null = null;
  let es: EventSource | null = null;
  let mapRaf = 0;
  let threadsLit = false;
  let threads: Array<{ num: HTMLElement; tile: HTMLElement; a: SVGPathElement; b: SVGPathElement }> | null = null;
  const cleanups: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, f: EventListener) => {
    t.addEventListener(ev, f);
    cleanups.push(() => t.removeEventListener(ev, f));
  };
  const mode = opts.mode;
  const reduced = mode === "reduced";
  const ctx = gsap.context(() => {}, root);
  /** A token as hex: GSAP interpolates rgb/hex, not var() or oklch(). */
  const tok = (name: string) => {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return oklchCssToHex(v) ?? v;
  };

  // ---------- helpers (L:1420-1572)
  function onFrame(o: StageFrame) {
    const mobile = window.innerWidth < MOBILE_BELOW;
    const Wd = window.innerWidth;
    if (o.hero) {
      const L = o.hero.labels;
      qa("[data-ll]").forEach((el, i) => {
        const l = L[i];
        if (!l) return;
        const ld = root.querySelector<SVGLineElement>(`[data-ld="${i}"]`);
        if (mobile) {
          const next = L[i + 1] ? L[i + 1].o : 0;
          Object.assign(el.style, { left: `${LABELS.mobileInset}px`, right: `${LABELS.mobileInset}px`, maxWidth: "none", top: "auto", bottom: `${LABELS.mobileBottom}px`, transform: "none", opacity: (l.o * (1 - next)).toFixed(3) });
          if (ld) ld.style.opacity = "0";
        } else {
          const lx = Math.max(l.x + LABELS.offsetX, Wd - Math.max(LABELS.marginMin, Wd * LABELS.marginOfWidth) - LABELS.boxWidth);
          Object.assign(el.style, { left: "0", top: "0", bottom: "auto", right: "auto", transform: `translate(${Math.round(lx)}px, ${Math.round(l.y)}px) translate(0, -50%)`, opacity: l.o.toFixed(3) });
          if (ld) {
            ld.setAttribute("x1", String(l.x + LABELS.leaderGap));
            ld.setAttribute("y1", String(l.y));
            ld.setAttribute("x2", String(lx - LABELS.leaderGap));
            ld.setAttribute("y2", String(l.y));
            ld.style.opacity = String(l.o);
          }
        }
      });
      const c = o.hero.card;
      const pr = q("#h-proof");
      if (pr) {
        const w = mobile ? Math.min(window.innerWidth - 32, T1.proofMaxWidth) : Math.max(c.w, T1.proofMinWidth);
        pr.style.width = `${w}px`;
        pr.style.transform = `translate(${Math.round(mobile ? (window.innerWidth - w) / 2 : c.x)}px, ${Math.round(c.y + c.h + T1.proofGap)}px)`;
      }
    }
    if (o.storm) {
      for (const p of o.storm.projects) {
        const el = root.querySelector<HTMLElement>(`[data-pl="${p.k}"]`);
        if (!el) continue;
        el.style.transform = p.below ? `translate(${Math.round(p.x)}px, ${Math.round(p.y + 8)}px)` : `translate(${Math.round(p.x)}px, ${Math.round(p.y - 8)}px) translate(0, -100%)`;
        el.style.opacity = p.o.toFixed(3);
      }
    } else qa("[data-pl]").forEach((el) => (el.style.opacity = "0"));
  }

  function navTheme() {
    const nav = q("#sk-nav");
    if (!nav) return;
    const set = (night: boolean) => {
      nav.style.background = night ? "color-mix(in srgb, var(--n-muted) 92%, transparent)" : "color-mix(in srgb, var(--card) 94%, transparent)";
      nav.style.color = night ? "var(--n-foreground)" : "var(--foreground)";
      nav.style.borderColor = night ? "var(--n-border)" : "var(--border)";
    };
    qa("[data-night]").forEach((el) => ScrollTrigger.create({ trigger: el, start: NAV.start, end: NAV.end, onToggle: (s) => set(s.isActive) }));
  }

  function dust() {
    const bits = d.dust.filter((b) => /^[01]{64}$/.test(b));
    if (!bits.length) return;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${DUST.width}" height="${DUST.height}" viewBox="0 0 ${DUST.width} ${DUST.height}">`;
    for (let i = 0; i < DUST.glyphs; i++) {
      const p = bits[(i * 7) % bits.length];
      const ox = (i % DUST.cols) * DUST.colStep + DUST.x0 + (Math.floor(i / DUST.cols) % 2) * DUST.rowShift;
      const oy = Math.floor(i / DUST.cols) * DUST.rowStep + DUST.y0;
      for (let k = 0; k < 64; k++) if (p[k] === "1") s += `<rect x="${ox + (k % 8) * DUST.cell}" y="${oy + Math.floor(k / 8) * DUST.cell}" width="${DUST.size}" height="${DUST.size}" rx="${DUST.radius}" fill="${COLORS.dust}" fill-opacity="${DUST.alpha}"/>`;
    }
    const url = `url("data:image/svg+xml,${encodeURIComponent(s + "</svg>")}")`;
    qa("[data-dust]").forEach((el) => (el.style.backgroundImage = url));
  }

  function mapInit() {
    const c = q<HTMLCanvasElement>("#c9-map");
    if (!c) return;
    const { lng0: L0, lng1: L1, lat0: A0, lat1: A1 } = d.frame;
    const spots = d.witness.spots;
    const ripples: Array<{ x: number; y: number; t: number }> = [];
    let W = 0;
    let H = 0;
    let x: CanvasRenderingContext2D;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth * dpr;
      H = c.clientHeight * dpr;
      c.width = W;
      c.height = H;
      x = c.getContext("2d")!;
    };
    const P = (lat: number, lng: number) => [((lng - L0) / (L1 - L0)) * W, H - ((lat - A0) / (A1 - A0)) * H] as const;
    const draw = (t: number) => {
      x.clearRect(0, 0, W, H);
      const r = Math.max(1, W / C9_MAP.unit);
      x.fillStyle = COLORS.c9Land;
      for (const [lng, lat] of d.land) {
        const [a, b] = P(lat, lng);
        x.fillRect(a - r, b - r, r * 2, r * 2);
      }
      for (const s of spots) {
        const [a, b] = P(s.lat, s.lng);
        x.fillStyle = COLORS.pin;
        x.beginPath();
        x.arc(a, b, r * C9_MAP.pinRadius, 0, 7);
        x.fill();
        x.fillStyle = `rgb(${COLORS.c9Centre})`;
        x.font = `500 ${Math.round(r * C9_MAP.labelSize)}px "IBM Plex Sans"`;
        x.fillText(s.city, a + r * 7, b + r * 4);
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const k = (t - rp.t) / C9_MAP.ripple.ms;
        if (k > 1) {
          ripples.splice(i, 1);
          continue;
        }
        const e = 1 - Math.pow(1 - k, 3);
        x.strokeStyle = `rgba(${COLORS.c9Ripple},${(1 - k) * C9_MAP.ripple.alpha})`;
        x.lineWidth = r * C9_MAP.ripple.width;
        x.beginPath();
        x.arc(rp.x, rp.y, r * (C9_MAP.ripple.from + e * C9_MAP.ripple.grow), 0, 7);
        x.stroke();
        x.fillStyle = `rgba(${COLORS.c9Centre},${1 - k * 0.6})`;
        x.beginPath();
        x.arc(rp.x, rp.y, r * C9_MAP.ripple.centre, 0, 7);
        x.fill();
      }
    };
    size();
    on(window, "resize", () => {
      size();
      draw(performance.now());
    });
    draw(0);
    if (reduced || !opts.live) return;
    // Real arrivals (B5.8): a ripple where each Witness photo was taken.
    let visible = false;
    const nearest = (lat: number, lng: number) => spots.reduce((best, s) => ((s.lat - lat) ** 2 + (s.lng - lng) ** 2 < (best.lat - lat) ** 2 + (best.lng - lng) ** 2 ? s : best), spots[0]);
    const loop = (t: number) => {
      if (dead) return;
      draw(t);
      if (ripples.length && visible) mapRaf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) mapRaf = requestAnimationFrame(loop);
    });
    io.observe(c);
    cleanups.push(() => io.disconnect());
    try {
      es = new EventSource("/api/live");
      // Named events (lib/live.ts liveStream): only a new photo ripples.
      es.addEventListener("arrival", (m) => {
        const ev = JSON.parse((m as MessageEvent<string>).data) as LiveEvent;
        if (!ev.location) return;
        const [a, b] = P(ev.location.lat, ev.location.lng);
        ripples.push({ x: a, y: b, t: performance.now() });
        const el = q("#c9-latest");
        if (el && spots.length) el.textContent = `New witness photo near ${nearest(ev.location.lat, ev.location.lng).city}`;
        if (visible) {
          cancelAnimationFrame(mapRaf);
          mapRaf = requestAnimationFrame(loop);
        }
      });
    } catch {
      /* no live feed: the map stays still */
    }
  }

  function threadsInit() {
    const svg = root.querySelector<SVGSVGElement>("#c5-threads");
    if (!svg || svg.childElementCount) return;
    const ns = "http://www.w3.org/2000/svg";
    threads = [];
    for (const t of qa("[data-tile]")) {
      const k = t.dataset.tile!;
      const num = q(`[data-num="${k}"]`);
      if (!num) continue;
      const g = document.createElementNS(ns, "g");
      g.setAttribute("data-t", k);
      g.style.transition = `opacity ${T5.hover.ms}ms`;
      const col = k === "flagged" ? COLORS.threadFlagged : k === "before" || k === "after" ? COLORS.threadMeasured : COLORS.threadViolet;
      const a = document.createElementNS(ns, "path");
      const b = document.createElementNS(ns, "path");
      for (const [p, s, w] of [
        [a, `rgba(${col},${T5.thread.underAlpha})`, T5.thread.underWidth],
        [b, `rgba(${col},${T5.thread.overAlpha})`, T5.thread.overWidth],
      ] as const) {
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", s);
        p.setAttribute("stroke-width", String(w));
        p.setAttribute("pathLength", "1");
        p.setAttribute("stroke-dasharray", "1");
        p.setAttribute("stroke-dashoffset", "1");
        p.setAttribute("data-t", k);
        g.appendChild(p);
      }
      svg.appendChild(g);
      threads.push({ num, tile: t, a, b });
    }
    threadsLayout();
  }

  function threadsLayout() {
    const svg = root.querySelector<SVGSVGElement>("#c5-threads");
    if (!svg || !threads) return;
    const o = svg.getBoundingClientRect();
    for (const t of threads) {
      const n = t.num.getBoundingClientRect();
      const r = t.tile.getBoundingClientRect();
      const x1 = n.left + n.width / 2 - o.left;
      const y1 = n.bottom - o.top - 4;
      const x2 = r.left + r.width / 2 - o.left;
      const y2 = r.top - o.top + 2;
      const dy = Math.max(T5.thread.minBend, (y2 - y1) * T5.thread.bend);
      const dd = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + dy).toFixed(1)} ${x2.toFixed(1)} ${(y2 - dy).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      t.a.setAttribute("d", dd);
      t.b.setAttribute("d", dd);
    }
  }

  function hi(k: string | null) {
    qa("[data-tile]").forEach((el) => {
      const lit = !!k && el.dataset.tile === k;
      el.style.opacity = k ? (lit ? "1" : String(T5.hover.tilesOther)) : String(threadsLit ? T5.hover.tileLit : T5.hover.tileIdle);
      el.style.outlineColor = lit ? "var(--n-primary)" : "transparent";
    });
    root.querySelectorAll<SVGElement>("#c5-threads [data-t]").forEach((el) => {
      el.style.opacity = k ? (el.dataset.t === k ? "1" : String(T5.hover.others)) : "";
    });
    qa("[data-num]").forEach((el) => {
      const lit = el.dataset.num === k;
      el.style.borderColor = lit ? "var(--l-primary)" : "var(--l-border)";
      el.style.boxShadow = lit ? `0 0 0 ${T5.hover.ringWidth}px color-mix(in srgb, var(--n-primary) ${T5.hover.ringAlpha * 100}%, transparent)` : "none";
    });
  }

  const ch7Geo = () => {
    const pts = d.checkins?.points ?? [];
    const max = Math.max(10, ...pts.map((p) => p.value.value ?? 0));
    const n = Math.max(1, pts.length - 1);
    return pts.map((p, i) => ({ ...p, x: T7.chart.x0 + i * (T7.chart.plotWidth / n), y: T7.chart.base - ((p.value.value ?? 0) / max) * (T7.chart.base - T7.chart.top) }));
  };
  function ch7Draw() {
    const g = ch7Geo();
    const line = q("#c7-line");
    if (!line || !g.length) return g;
    line.setAttribute("d", g.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "));
    const dots = q("#c7-dots");
    if (dots) {
      dots.innerHTML = "";
      const ns = "http://www.w3.org/2000/svg";
      for (const p of g) {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
        c.setAttribute("r", "4");
        c.style.fill = "var(--measured)";
        dots.appendChild(c);
      }
    }
    return g;
  }
  function ch7Set(i: number, g: ReturnType<typeof ch7Geo>) {
    const p = g[i];
    if (!p) return;
    q("#c7-marker")?.setAttribute("cx", String(p.x));
    q("#c7-marker")?.setAttribute("cy", String(p.y));
    const photo = q("#c7-photo");
    if (photo) photo.textContent = p.label;
    const img = q<HTMLImageElement>("#c7-img");
    if (img && p.photo) img.src = p.photo;
    const count = q("#c7-count");
    if (count) count.textContent = String(i);
    const val = q("#c7-val");
    if (val) val.textContent = p.value.value === null ? p.value.text : `${p.value.text}%`;
  }

  async function staticHero() {
    const gl = q("#sk-gl");
    const overlay = q("#gl-overlay");
    if (gl) gl.style.display = "none";
    if (overlay) overlay.style.display = "none";
    const ch1 = q("#ch1");
    if (ch1) ch1.style.height = "100vh";
    const ch2 = q("#ch2");
    if (ch2) ch2.style.display = "none";
    for (const id of ["#ch1s", "#ch2s"]) {
      const el = q(id);
      if (el) el.style.display = "block";
    }
    if (d.hero) {
      const mask = await loadImage(d.hero.mask);
      const arts = await drawLayers({ bits: d.hero.bits, lat: d.hero.lat, lng: d.hero.lng, when: d.hero.when, extra: d.hero.extra, aiBoxes: d.hero.aiBoxes, aiTags: d.hero.aiText.replace(/\.$/, "").split(/,\s*/) }, mask);
      if (dead) return;
      arts.forEach((c, i) => {
        const el = root.querySelector<HTMLImageElement>(`[data-ls="${i}"]`);
        if (el) el.src = c.toDataURL("image/png");
      });
    }
    staticMap();
  }

  function staticMap() {
    const c = q<HTMLCanvasElement>("#c2-static-map");
    if (!c) return;
    const W = c.clientWidth * 2 || 1200;
    const { lng0: L0, lng1: L1, lat0: A0, lat1: A1 } = d.frame;
    const H = Math.round((W * (A1 - A0)) / ((L1 - L0) * 0.96 || 1) / 1.0);
    c.width = W;
    c.height = Math.round((W * 16) / 21) || H;
    const x = c.getContext("2d")!;
    const HH = c.height;
    const P = (lat: number, lng: number) => [((lng - L0) / (L1 - L0)) * W, HH - ((lat - A0) / (A1 - A0)) * HH] as const;
    x.fillStyle = COLORS.staticLand;
    for (const [lng, lat] of d.land) {
      const [a, b] = P(lat, lng);
      x.fillRect(a - 1.5, b - 1.5, 3, 3);
    }
    for (const p of d.projects) {
      const [a, b] = P(p.lat, p.lng);
      x.fillStyle = COLORS.staticPin;
      x.beginPath();
      x.arc(a, b, 8, 0, 7);
      x.fill();
      x.fillStyle = COLORS.staticLabel;
      x.font = '600 26px "IBM Plex Sans"';
      x.fillText(p.city, a + 14, b + 8);
    }
  }

  function applyReduced() {
    qa("[data-pin]").forEach((s) => {
      s.style.height = "auto";
      const st = s.firstElementChild as HTMLElement | null;
      if (st) {
        st.style.position = "relative";
        st.style.height = "auto";
        st.style.minHeight = "100vh";
      }
    });
    for (const id of ["#ch3-sticky", "#ch4-sticky", "#ch5-sticky", "#ch7-sticky"]) {
      const el = q(id);
      if (el) el.style.overflow = "visible";
    }
    qa("#ch3-sticky > div, #ch4-sticky > div, #ch5-sticky > div, #ch7-sticky > div").forEach((el) => {
      if (el.style.position === "absolute" && el.style.inset !== "") el.style.position = "relative";
    });
    // chapter 3: all four reasons as a list
    const t3 = q("#c3-title");
    if (t3) t3.style.opacity = "1";
    const close = q("#c3-close");
    if (close) {
      close.style.opacity = "1";
      close.style.position = "relative";
    }
    const slot = q("#c3-slot");
    if (slot) Object.assign(slot.style, { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "16px", maxWidth: "none", flexBasis: "100%" });
    qa("#c3-slot [data-flag]").forEach((el) => {
      el.style.position = "relative";
      el.style.opacity = "1";
    });
    qa("#c3-grid [data-hole]").forEach((el) => {
      if (el.dataset.hole !== "") {
        const m = el.querySelector<HTMLElement>("[data-holemark]");
        if (m) m.style.opacity = "1";
      }
    });
    // chapter 4 end state
    for (const id of ["#c4-mask-a", "#c4-mask-b"]) {
      const m = q(id);
      if (m) m.style.clipPath = "none";
    }
    const num = q("#c4-num");
    if (num && d.measurement) num.textContent = d.measurement.before.value.text;
    const cav = q("#c4-caveat");
    if (cav) cav.style.opacity = "1";
    // chapter 5 end state
    const field = q("#c5-field");
    if (field) field.style.transform = "none";
    threadsInit();
    requestAnimationFrame(() => {
      threadsLayout();
      root.querySelectorAll<SVGPathElement>("#c5-threads [data-t]").forEach((p) => (p.style.strokeDashoffset = "0"));
    });
    on(window, "resize", () => threadsLayout());
    if (q("#ch7")) {
      const g = ch7Draw();
      q("#c7-line")?.setAttribute("stroke-dashoffset", "0");
      ch7Set(g.length - 1, g);
    }
    const gl = q("#sk-gl");
    if (gl) gl.style.display = "none";
    const ov = q("#gl-overlay");
    if (ov) ov.style.display = "none";
  }

  // ---------- setup (L:1234-1377)
  async function setup() {
    dust();
    mapInit();
    const staticHeroMode = mode !== "full" || !d.hero;
    if (staticHeroMode) await staticHero();
    if (dead) return;
    if (reduced) {
      applyReduced();
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    lenis = new Lenis({ lerp: LENIS.lerp, smoothWheel: LENIS.smoothWheel });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    cleanups.push(() => gsap.ticker.remove(tick));

    ctx.add(() => {
      navTheme();
      const sc = (trigger: string, extra: ScrollTrigger.Vars = {}): ScrollTrigger.Vars => ({ trigger: q(trigger), start: "top top", end: "bottom bottom", scrub: true, ...extra });

      // Chapter 1 + 2 (WebGL)
      if (!staticHeroMode && d.hero) {
        const hero = d.hero;
        const start = async () => {
          try {
            const mod = await import("./landing-stage");
            if (dead) return;
            const canvas = q<HTMLCanvasElement>("#sk-gl")!;
            stage = await mod.createStage(
              canvas,
              {
                hero: { src: hero.src, w: hero.w, h: hero.h, mask: hero.mask, layer: { bits: hero.bits, lat: hero.lat, lng: hero.lng, when: hero.when, extra: hero.extra, aiBoxes: hero.aiBoxes, aiTags: hero.aiText.replace(/\.$/, "").split(/,\s*/) } },
                tiles: d.storm,
                projects: d.projects,
                land: d.land,
                frame: d.frame,
              },
              onFrame,
            );
            if (dead) {
              stage.dispose();
              return;
            }
            setTimeout(() => {
              const still = q("#hero-still");
              if (still) still.style.opacity = "0";
            }, STAGE_START.stillHideAfterMs);
            ScrollTrigger.refresh();
          } catch (e) {
            console.warn("WebGL stage failed, using stills", e);
            const gl = q("#sk-gl");
            if (gl) gl.style.display = "none";
          }
        };
        const ric = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, STAGE_START.idleFallbackMs));
        ric(() => void start(), { timeout: STAGE_START.idleTimeoutMs });
        const t1 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch1", { onUpdate: (s) => stage?.setHero(s.progress) }) });
        t1.to("#h-tint", { opacity: 0, duration: T1.tint.dur }, T1.tint.at)
          .to("#h-copy", { y: T1.copy.y, opacity: 0, duration: T1.copy.dur }, T1.copy.at)
          .to("#h-credit", { opacity: 0, duration: T1.credit.dur }, T1.credit.at)
          .fromTo("#h-explain", { opacity: 0, y: T1.explainIn.y }, { opacity: 1, y: 0, duration: T1.explainIn.dur, ease: "expo.out" }, T1.explainIn.at)
          .to("#h-explain", { opacity: 0, y: T1.explainOut.y, duration: T1.explainOut.dur }, T1.explainOut.at)
          .fromTo("#h-seal", { opacity: 0, y: T1.sealIn.y }, { opacity: 1, y: 0, duration: T1.sealIn.dur, ease: "expo.out" }, T1.sealIn.at)
          .fromTo("#h-seal-t", { fontStretch: T1.sealStretch.from }, { fontStretch: T1.sealStretch.to, duration: T1.sealStretch.dur, ease: "power2.inOut" }, T1.sealStretch.at)
          .fromTo("#h-proof-in", { opacity: 0, y: T1.proofIn.y }, { opacity: 1, y: 0, duration: T1.proofIn.dur, ease: "expo.out" }, T1.proofIn.at)
          .fromTo("[data-rule]", { opacity: 0, x: T1.rules.x }, { opacity: 1, x: 0, stagger: T1.rules.stagger, duration: T1.rules.dur }, T1.rules.at);
        const target = hero.trust?.score ?? 0;
        const sv = { v: 0 };
        t1.to(
          sv,
          {
            v: target,
            duration: T1.score.dur,
            onUpdate: () => {
              const v = Math.round(sv.v);
              const band = bandOf(v);
              const col = BAND_VAR[band];
              const score = q("#h-score");
              const bandEl = q("#h-band");
              const bar = q("#h-bar");
              if (score) {
                score.textContent = String(v);
                score.style.color = col;
              }
              if (bandEl) {
                bandEl.textContent = v === 0 ? "Checking" : BAND[band];
                bandEl.style.color = col;
              }
              if (bar) {
                bar.style.width = `${v}%`;
                bar.style.background = col;
              }
            },
          },
          T1.score.at,
        );
        t1.to({}, { duration: T1.hold.dur }, T1.hold.at);

        const t2 = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: sc("#ch2", {
            start: "top bottom",
            onUpdate: (s) => stage?.setStorm(s.progress),
            onLeave: () => {
              const gl = q("#sk-gl");
              if (gl) gl.style.visibility = "hidden";
            },
            onEnterBack: () => {
              const gl = q("#sk-gl");
              if (gl) gl.style.visibility = "visible";
            },
          }),
        });
        t2.to("#h-proof", { opacity: 0, duration: T2.proofOut.dur }, T2.proofOut.at)
          .to("#gl-labels", { opacity: 0, duration: T2.labelsOut.dur }, T2.labelsOut.at)
          .fromTo("#c2-t1", { opacity: 0, y: T2.t1In.y }, { opacity: 1, y: 0, duration: T2.t1In.dur, ease: "expo.out" }, T2.t1In.at)
          .to("#c2-t1", { opacity: 0, y: T2.t1Out.y, duration: T2.t1Out.dur }, T2.t1Out.at)
          .fromTo("#sk-sky", { backgroundColor: tok("--l-background") }, { backgroundColor: tok("--n-border"), duration: T2.dusk.dur, immediateRender: false }, T2.dusk.at)
          .fromTo("#c2-t2", { opacity: 0, y: T2.t2In.y }, { opacity: 1, y: 0, duration: T2.t2In.dur, ease: "expo.out" }, T2.t2In.at)
          .to("#sk-sky", { backgroundColor: tok("--n-background"), duration: T2.night.dur }, T2.night.at)
          .to("#gl-projects", { opacity: 0, duration: T2.projectsOut.dur }, T2.projectsOut.at);
      }

      // Chapter 3: the catch
      {
        const holes = qa("#c3-grid [data-hole]").filter((el) => el.dataset.hole !== "");
        const items = qa("#c3-slot [data-flag]");
        const t3 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch3", { invalidateOnRefresh: true }) });
        t3.fromTo("#c3-title", { opacity: 0, y: T3.title.y }, { opacity: 1, y: 0, duration: T3.title.dur, ease: "expo.out" }, T3.title.at).fromTo(
          "#c3-grid [data-hole]",
          { opacity: 0, scale: T3.grid.scale },
          { opacity: 1, scale: 1, stagger: T3.grid.stagger, duration: T3.grid.dur, ease: "expo.out" },
          T3.grid.at,
        );
        const slot = q("#c3-slot")!;
        items.forEach((it, k) => {
          const hole = holes.find((h) => h.dataset.hole === String(k));
          if (!hole) return;
          const img = it.querySelector<HTMLElement>("[data-flagimg]")!;
          const g = it.querySelector<HTMLElement>("[data-glitch]")!;
          const rs = it.querySelector<HTMLElement>("[data-reason]")!;
          const dx = () => hole.getBoundingClientRect().left - slot.getBoundingClientRect().left;
          const dy = () => hole.getBoundingClientRect().top - slot.getBoundingClientRect().top;
          const ds = () => hole.getBoundingClientRect().width / Math.max(1, img.offsetWidth);
          const f = T3.fake;
          const t = f.first + k * f.every;
          t3.set(it, { opacity: 1 }, t)
            .fromTo(img, { x: dx, y: dy, scale: ds }, { x: 0, y: 0, scale: 1, duration: f.fly, ease: "power3.inOut", immediateRender: false }, t)
            .to(hole.querySelector("img"), { opacity: f.cellDim, duration: f.cellDimDur }, t)
            .to(hole.querySelector("[data-holemark]"), { opacity: 1, duration: f.markDur }, t + f.markAt)
            .fromTo(g, { opacity: 0 }, { opacity: T3.glitch[0].opacity, x: T3.glitch[0].x, clipPath: T3.glitch[0].clip, duration: T3.glitch[0].dur, immediateRender: false }, t + f.glitchAt)
            .to(g, { x: T3.glitch[1].x, clipPath: T3.glitch[1].clip, duration: T3.glitch[1].dur })
            .to(g, { x: T3.glitch[2].x, clipPath: T3.glitch[2].clip, duration: T3.glitch[2].dur })
            .to(g, { opacity: 0, duration: T3.glitch[3].dur })
            .fromTo(rs, { opacity: 0, y: f.reasonY }, { opacity: 1, y: 0, duration: f.reasonDur, ease: "expo.out", immediateRender: false }, t + f.reasonAt);
          if (k < items.length - 1) t3.to(it, { opacity: 0, duration: f.outDur }, t + f.outAt);
        });
        t3.to("#c3-main", { opacity: T3.close.mainDim, duration: T3.close.mainDur }, T3.close.mainAt)
          .fromTo("#c3-close", { opacity: 0, y: T3.close.y }, { opacity: 1, y: 0, duration: T3.close.inDur, ease: "expo.out" }, T3.close.in)
          .to({}, { duration: T3.close.holdDur }, T3.close.holdAt);
      }

      // Chapter 4: measured
      if (d.measurement) {
        const m = d.measurement;
        const n = { v: 0 };
        const before = m.before.value.value ?? 0;
        const after = m.after.value.value ?? 0;
        const show = () => {
          const el = q("#c4-num");
          if (el) el.textContent = m.before.value.value === null ? m.before.value.text : String(Math.round(n.v));
        };
        const t4 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch4") });
        t4.set("#c4-scan-a", { opacity: 1 }, T4.before.at)
          .fromTo("#c4-scan-a", { top: "0%" }, { top: "100%", duration: T4.before.dur }, T4.before.at)
          .fromTo("#c4-mask-a", { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: T4.before.dur }, T4.before.at)
          .to(n, { v: before, duration: T4.before.dur, onUpdate: show }, T4.before.at)
          .set("#c4-scan-a", { opacity: 0 }, T4.before.scanOffAt)
          .set("#c4-scan-b", { opacity: 1 }, T4.after.at)
          .fromTo("#c4-scan-b", { top: "0%" }, { top: "100%", duration: T4.after.dur }, T4.after.at)
          .to(
            n,
            {
              v: after,
              duration: T4.after.dur,
              onUpdate: () => {
                show();
                const w = q("#c4-which");
                if (w) w.textContent = Math.abs(n.v - before) > 0.5 ? "after" : "before";
              },
            },
            T4.after.at,
          )
          .set("#c4-scan-b", { opacity: 0 }, T4.after.scanOffAt)
          .fromTo("#c4-caveat", { opacity: 0, y: T4.caveat.y }, { opacity: 1, y: 0, duration: T4.caveat.dur, ease: "expo.out" }, T4.caveat.at)
          .to({}, { duration: T4.hold.dur }, T4.hold.at);
        // Our after photo has its own mask (the prototype's after frame was a placeholder).
        if (q("#c4-mask-b")) t4.fromTo("#c4-mask-b", { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: T4.after.dur }, T4.after.at);
      }

      // Chapter 5: threads
      threadsInit();
      {
        const keys = ["verified", "flagged", "before", "after"].filter((k) => q(`[data-num="${k}"]`));
        const t5 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch5", { onUpdate: () => threadsLayout() }) });
        t5.fromTo("#c5-report", { rotateX: T5.report.rotateFrom, y: T5.report.y, opacity: 0 }, { rotateX: T5.report.rotateTo, y: 0, opacity: 1, duration: T5.report.dur, ease: "expo.out" }, T5.report.at).fromTo(
          "#c5-field",
          { opacity: 0 },
          { opacity: 1, duration: T5.field.dur },
          T5.field.at,
        );
        keys.forEach((k, i) => {
          const t = T5.numbers.first + i * T5.numbers.every;
          t5.fromTo(`[data-num="${k}"]`, { borderColor: tok("--l-border") }, { borderColor: tok("--l-primary"), duration: T5.numbers.border }, t)
            .fromTo(`#c5-threads [data-t="${k}"]`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: T5.numbers.draw, stagger: T5.numbers.stagger }, t)
            .to(`[data-tile="${k}"]`, { opacity: T5.numbers.tileOpacity, duration: T5.numbers.tilesDur }, t + T5.numbers.tilesAt);
        });
        t5.to("[data-num]", { borderColor: tok("--l-border"), duration: T5.release.dur }, T5.release.at)
          .call(
            () => {
              threadsLit = true;
            },
            undefined,
            T5.release.litAt,
          )
          .to({}, { duration: T5.release.holdDur }, T5.release.holdAt);
        on(window, "resize", () => threadsLayout());
      }

      // Chapter 7: it keeps watching (P1)
      if (q("#ch7") && d.checkins?.points.length) {
        const g = ch7Draw();
        ch7Set(0, g);
        gsap
          .timeline({
            defaults: { ease: "none" },
            scrollTrigger: sc("#ch7", {
              onUpdate: (s) => {
                const k = Math.min(g.length - 1, Math.floor(Math.max(0, (s.progress - T7.from) / T7.span) * (g.length - 1) + 0.0001));
                ch7Set(k, g);
              },
            }),
          })
          .fromTo("#c7-line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: T7.span }, T7.from)
          .to({}, { duration: T7.holdDur }, T7.holdAt);
      }
    });

    requestAnimationFrame(() => ScrollTrigger.refresh());
    let rt = 0;
    let lastH = 0;
    ro = new ResizeObserver(() => {
      const hh = root.offsetHeight;
      if (Math.abs(hh - lastH) < REFRESH.minHeightChange) return;
      lastH = hh;
      clearTimeout(rt);
      rt = window.setTimeout(() => ScrollTrigger.refresh(), REFRESH.debounceMs);
    });
    ro.observe(root);
    void document.fonts?.ready.then(() => !dead && ScrollTrigger.refresh());
    on(window, "load", () => ScrollTrigger.refresh());
  }

  void setup().catch((e) => console.error("Saakshi landing setup failed", e));

  return {
    hi,
    dispose() {
      dead = true;
      ro?.disconnect();
      stage?.dispose();
      stage = null;
      lenis?.destroy();
      lenis = null;
      es?.close();
      cancelAnimationFrame(mapRaf);
      for (const c of cleanups.splice(0)) c();
      ctx.revert();
    },
  };
}
