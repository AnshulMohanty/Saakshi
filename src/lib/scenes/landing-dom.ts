/**
 * The landing's scroll choreography (browser only): the design's Component.setup() and its
 * helpers (landing template L:1233-1572), ported nearly verbatim and scoped to the landing root.
 * Numbers live in lib/motion/scenes/landing.ts; the WebGL stage in ./landing-stage.ts.
 *
 * Changes from the prototype: the mode comes from lib/motion/mode.ts; chapter 9 (components/landing/
 * witness.tsx) shows real arrivals from /api/live on the shared India map; the QR is rendered on the server; the
 * trust score counts to the hero's real score and band (B5.1, bands 75/45); cleanup is a
 * gsap.context so React can mount and unmount it.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { LandingData } from "../landing/types";
import type { MotionMode } from "../motion/mode";
import { COLORS, DUST, LABELS, LENIS, MOBILE_BELOW, NAV, REFRESH, STAGE_START, T1, T2, T3, T4, T5, T7 } from "../motion/scenes/landing";
import { oklchCssToHex } from "../color/oklch";
import { defaultTrustConfig } from "../trust/config";
import type { TrustBand } from "../trust/types";
import { DUST_REVEAL, glyphOrigin, glyphPhoto, nearestGlyph } from "../landing/dust";
import { drawLayers, loadImage } from "./layers";
import { sealRunning } from "../landing/seal";
import { cellId } from "../landing/storm-slots";
import type { Stage, StageFrame, StageTargets } from "./landing-stage";

export interface LandingController {
  /** Highlight a number's threads and tiles (chapter 5), or clear with null. */
  hi(k: string | null): void;
  dispose(): void;
}

const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
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
  let threadsLit = false;
  let settled = false;
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

  // D-0029: one tile of glyphs (each a demo photo's pHash) behind the night stickies.
  const dustSet = d.dust.map((bits, i) => ({ bits, thumb: d.dustThumbs[i] ?? "" })).filter((g) => /^[01]{64}$/.test(g.bits));
  function dust() {
    if (!dustSet.length) return;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${DUST.width}" height="${DUST.height}" viewBox="0 0 ${DUST.width} ${DUST.height}">`;
    for (let i = 0; i < DUST.glyphs; i++) {
      const p = dustSet[glyphPhoto(i, dustSet.length)].bits;
      const o = glyphOrigin(i);
      for (let k = 0; k < 64; k++) if (p[k] === "1") s += `<rect x="${o.x + (k % 8) * DUST.cell}" y="${o.y + Math.floor(k / 8) * DUST.cell}" width="${DUST.size}" height="${DUST.size}" rx="${DUST.radius}" fill="${COLORS.dust}" fill-opacity="${DUST.alpha}"/>`;
    }
    const url = `url("data:image/svg+xml,${encodeURIComponent(s + "</svg>")}")`;
    qa("[data-dust]").forEach((el) => (el.style.backgroundImage = url));
  }

  // D-0088 (C26): near the cursor, the nearest glyph resolves into the photo it fingerprints. A
  // mouse only, never under reduced motion; the thumbnail sits in the dust layer, under the
  // chapter's content.
  function dustReveal() {
    if (reduced || !dustSet.some((g) => g.thumb) || !matchMedia("(pointer: fine)").matches) return;
    for (const el of qa("[data-dust]")) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.setAttribute("aria-hidden", "true");
      img.dataset.dustThumb = "";
      Object.assign(img.style, { position: "absolute", left: "0", top: "0", zIndex: "0", width: `${DUST_REVEAL.side}px`, height: `${DUST_REVEAL.side}px`, objectFit: "cover", borderRadius: "4px", outline: "1px solid var(--n-border)", pointerEvents: "none", opacity: "0", transition: `opacity ${DUST_REVEAL.fadeMs}ms ease-out` });
      el.prepend(img);
      cleanups.push(() => img.remove());
      let at = -1;
      const hide = () => {
        at = -1;
        img.style.opacity = "0";
      };
      on(img, "load", () => {
        if (at >= 0) img.style.opacity = "1";
      });
      on(el, "pointermove", (e) => {
        const ev = e as PointerEvent;
        if (ev.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        const g = nearestGlyph(ev.clientX - r.left, ev.clientY - r.top, DUST_REVEAL.reach);
        const thumb = g ? dustSet[glyphPhoto(g.i, dustSet.length)].thumb : "";
        if (!g || !thumb) return hide();
        img.style.transform = `translate(${g.x - DUST_REVEAL.side / 2}px, ${g.y - DUST_REVEAL.side / 2}px)`;
        if (g.i === at) return;
        at = g.i;
        img.style.opacity = "0";
        if (img.getAttribute("src") === thumb && img.complete) img.style.opacity = "1";
        else img.src = thumb;
      });
      on(el, "pointerleave", hide);
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
      let dd: string;
      if (r.left > n.right) {
        // Card left, photos right (wide screens): from the number's right edge to the photo's left edge.
        const x1 = n.right - o.left - 2;
        const y1 = n.top + n.height / 2 - o.top;
        const x2 = r.left - o.left + 2;
        const y2 = r.top + r.height / 2 - o.top;
        const dx = Math.max(T5.thread.minBend, (x2 - x1) * T5.thread.bend);
        dd = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)} ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      } else {
        // Stacked (phones): from the number's bottom to the photo's top.
        const x1 = n.left + n.width / 2 - o.left;
        const y1 = n.bottom - o.top - 4;
        const x2 = r.left + r.width / 2 - o.left;
        const y2 = r.top - o.top + 2;
        const dy = Math.max(T5.thread.minBend, (y2 - y1) * T5.thread.bend);
        dd = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + dy).toFixed(1)} ${x2.toFixed(1)} ${(y2 - dy).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      }
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

  /** Chapter 7: show visit k (frame, filmstrip, texts). Only touches the DOM when k changes. */
  let ch7k = -1;
  function ch7Set(k: number) {
    const pts = d.checkins?.points ?? [];
    const p = pts[k];
    if (!p || k === ch7k) return;
    ch7k = k;
    qa("[data-c7-frame]").forEach((el) => (el.style.opacity = el.dataset.c7Frame === String(k) ? "1" : "0"));
    qa("[data-c7-thumb]").forEach((el) => {
      const on = el.dataset.c7Thumb === String(k);
      el.style.outlineColor = on ? "var(--measured)" : "transparent";
      el.style.transform = on ? "translateY(-2px)" : "none";
    });
    const kk = q("#c7-k");
    if (kk) kk.textContent = `Visit ${k + 1} of ${pts.length}`;
    const when = q("#c7-when");
    if (when) when.textContent = p.when ?? p.label;
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
  }

  /** Where the storm's tiles go: chapter 2's map cells and pins, and the headline to keep clear (all read from the DOM). */
  function stageTargets(): StageTargets {
    const cache = new Map<string, HTMLElement>();
    const find = (sel: string) => {
      let el = cache.get(sel);
      if (!el || !el.isConnected) {
        el = root.querySelector<HTMLElement>(sel) ?? undefined;
        if (el) cache.set(sel, el);
      }
      return el ?? null;
    };
    const centre = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null;
    };
    return {
      cell: (k, slot) => centre(find(`[data-cell="${CSS.escape(cellId(k, slot))}"]`)),
      site: (k) => centre(find(`[data-site="${CSS.escape(k)}"]`)),
      avoid: () => {
        const el = find("#c2-t1");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      },
    };
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
      close.style.visibility = "visible";
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
    if (q("#ch7") && d.checkins?.points.length) ch7Set(d.checkins.points.length - 1);
    const gl = q("#sk-gl");
    if (gl) gl.style.display = "none";
    const ov = q("#gl-overlay");
    if (ov) ov.style.display = "none";
  }

  // ---------- setup (L:1234-1377)
  async function setup() {
    dust();
    dustReveal();
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
                targets: stageTargets(),
              },
              onFrame,
            );
            if (dead) {
              stage.dispose();
              return;
            }
            // For scripts/quality-gates.ts: when the 3D took over (after idle, never before the still).
            performance.mark("saakshi:stage");
            root.dataset.stage = "on";
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
          .fromTo("#h-proof-in", { opacity: 0, y: T1.proofIn.y }, { opacity: 1, y: 0, duration: T1.proofIn.dur, ease: "expo.out" }, T1.proofIn.at);
        const target = hero.trust?.score ?? 0;
        const finalBand = hero.trust?.band ?? bandOf(target);
        const sv = { v: 0 };
        /** The strip at a running score; the final value shows the engine's own band (a hard flag decides it). */
        const paint = () => {
          const v = Math.round(sv.v);
          const band = v === target && sv.v === target && done ? finalBand : bandOf(v);
          const col = BAND_VAR[band];
          const score = q("#h-score");
          const bandEl = q("#h-band");
          const bar = q("#h-bar");
          const marker = q("#h-marker");
          if (score) {
            score.textContent = String(v);
            score.style.color = v === 0 ? "var(--muted-foreground)" : col;
          }
          if (bandEl) {
            // While the layers land the band is still being decided: only the final score names it.
            const final = done && v === target;
            bandEl.textContent = v === 0 ? "Checking" : final ? BAND[band] : "Adding up…";
            bandEl.style.color = final ? col : "var(--muted-foreground)";
          }
          if (bar) {
            bar.style.width = `${v}%`;
            bar.style.background = col;
          }
          if (marker) marker.style.left = `${v}%`;
        };
        let done = false;
        const seal = hero.trust?.seal;
        if (seal) {
          const running = sealRunning(seal);
          const keys = [...seal.steps.map((_, k) => String(k)), ...(seal.cap ? ["cap"] : [])];
          keys.forEach((k, i) => {
            const at = T1.steps.first + i * T1.steps.every;
            const last = i === keys.length - 1;
            t1.fromTo(`[data-build="${k}"]`, { opacity: 0, x: T1.steps.rowX }, { opacity: 1, x: 0, duration: T1.steps.rowDur, ease: "expo.out" }, at)
              .fromTo(`#h-proof [data-step="${k}"]`, { opacity: 0.18, y: -6 }, { opacity: 1, y: 0, duration: T1.steps.chipDur, ease: "back.out(2)" }, at + T1.steps.chipAt)
              .to(sv, { v: running[i], duration: T1.steps.countDur, onUpdate: paint, onComplete: () => void (last && ((done = true), paint())), onReverseComplete: () => void (done = false) }, at + T1.steps.chipAt);
          });
          t1.fromTo('[data-build="total"]', { opacity: 0 }, { opacity: 1, duration: T1.total.dur }, T1.steps.first + keys.length * T1.steps.every);
        } else {
          t1.fromTo("[data-rule]", { opacity: 0, x: T1.rules.x }, { opacity: 1, x: 0, stagger: T1.rules.stagger, duration: T1.rules.dur }, T1.rules.at).to(sv, { v: target, duration: T1.score.dur, onUpdate: paint, onComplete: () => ((done = true), paint()) }, T1.score.at);
        }
        t1.to({}, { duration: T1.hold.dur }, T1.hold.at);

        const t2 = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: sc("#ch2", {
            start: "top bottom",
            onUpdate: (s) => {
              stage?.setStorm(s.progress);
              // The map fades in as the photos head for it; the DOM grids take over from the tiles.
              const map = q("#c2-map");
              if (map) {
                map.style.opacity = String(seg(s.progress, T2.mapIn.at, T2.mapIn.at + T2.mapIn.dur));
                map.style.visibility = s.progress > T2.mapIn.at ? "visible" : "hidden";
              }
              const grids = q("#c2-grids");
              if (grids) grids.style.opacity = String(seg(s.progress, T2.gridsIn.at, T2.gridsIn.at + T2.gridsIn.dur));
              const nowSettled = s.progress >= T2.gridsIn.at + T2.gridsIn.dur;
              if (nowSettled !== settled) {
                settled = nowSettled;
                window.dispatchEvent(new CustomEvent("saakshi:c2-settled", { detail: settled }));
              }
            },
          }),
        });
        // The fixed layers stay until chapter 3 has covered the screen (it slides over them), then hide.
        const fixedLayers = (on: boolean) => {
          for (const id of ["#sk-gl", "#c2-map"]) {
            const el = q(id);
            if (el) el.style.visibility = on ? "visible" : "hidden";
          }
        };
        ScrollTrigger.create({ trigger: q("#ch3"), start: "top top", onEnter: () => fixedLayers(false), onLeaveBack: () => fixedLayers(true) });
        t2.to("#h-proof", { opacity: 0, duration: T2.proofOut.dur }, T2.proofOut.at)
          .to("#gl-labels", { opacity: 0, duration: T2.labelsOut.dur }, T2.labelsOut.at)
          .fromTo("#c2-t1", { opacity: 0, y: T2.t1In.y }, { opacity: 1, y: 0, duration: T2.t1In.dur, ease: "expo.out" }, T2.t1In.at)
          .to("#c2-t1", { opacity: 0, y: T2.t1Out.y, duration: T2.t1Out.dur }, T2.t1Out.at)
          .fromTo("#sk-sky", { backgroundColor: tok("--l-background") }, { backgroundColor: tok("--n-border"), duration: T2.dusk.dur, immediateRender: false }, T2.dusk.at)
          .fromTo("#c2-t2", { opacity: 0, y: T2.t2In.y }, { opacity: 1, y: 0, duration: T2.t2In.dur, ease: "expo.out" }, T2.t2In.at)
          .to("#sk-sky", { backgroundColor: tok("--n-background"), duration: T2.night.dur }, T2.night.at);
      }

      // Chapter 3: the catch
      {
        const holes = qa("#c3-grid [data-hole]").filter((el) => el.dataset.hole !== "");
        const items = qa("#c3-slot [data-flag]");
        // The heading and grid arrive while the chapter scrolls in, so it never shows an empty screen.
        gsap
          .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: q("#ch3"), start: T3.entry.start, end: T3.entry.end, scrub: true } })
          .fromTo("#c3-title", { opacity: 0, y: T3.entry.y }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0)
          .fromTo("#c3-grid [data-hole]", { opacity: 0, scale: T3.entry.scale }, { opacity: 1, scale: 1, stagger: T3.entry.stagger, duration: 0.4, ease: "power2.out" }, 0.2);
        const t3 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch3", { invalidateOnRefresh: true }) });
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
        // The grid leaves completely before the close comes in: no text over text.
        t3.to("#c3-main", { opacity: T3.close.mainDim, duration: T3.close.mainDur }, T3.close.mainAt)
          .set("#c3-main", { visibility: "hidden" }, T3.close.mainAt + T3.close.mainDur)
          .set("#c3-close", { visibility: "visible" }, T3.close.in)
          .fromTo("#c3-close", { opacity: 0, y: T3.close.y }, { opacity: 1, y: 0, duration: T3.close.inDur, ease: "expo.out", immediateRender: false }, T3.close.in)
          .fromTo("#c3-ledger [data-lrow]", { opacity: 0, x: 14 }, { opacity: 1, x: 0, stagger: T3.close.rowsStagger, duration: T3.close.rowDur, ease: "expo.out" }, T3.close.rowsAt);
        const ls = q("#c3-lscore");
        if (ls) {
          const fin = Number(ls.dataset.final ?? ls.textContent ?? 0);
          const n = { v: 0 };
          t3.fromTo(n, { v: 0 }, { v: fin, duration: T3.close.scoreDur, onUpdate: () => void (ls.textContent = String(Math.round(n.v))) }, T3.close.scoreAt);
        }
        t3.to({}, { duration: T3.close.holdDur }, T3.close.holdAt);
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
        // The card and the wall arrive while the chapter scrolls in (no empty screen before it pins).
        gsap
          .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: q("#ch5"), start: T5.entry.start, end: T5.entry.end, scrub: true, onUpdate: () => threadsLayout() } })
          .fromTo("#c5-report", { y: T5.report.y, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, 0)
          .fromTo("#c5-field [data-tile]", { opacity: 0, y: 18 }, { opacity: T5.hover.tileIdle, y: 0, stagger: T5.entry.stagger, duration: 0.3, ease: "power2.out" }, 0.15);
        const t5 = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: sc("#ch5", { onUpdate: () => threadsLayout() }) });
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
      if (q("#ch7") && (d.checkins?.points.length ?? 0) > 1) {
        const n = d.checkins!.points.length;
        ch7Set(0);
        ScrollTrigger.create({
          ...sc("#ch7"),
          // Discrete steps through the visits: one index per stretch of scroll, cross-faded by CSS.
          onUpdate: (s) => ch7Set(Math.min(n - 1, Math.max(0, Math.floor(((s.progress - T7.from) / T7.span) * n)))),
        });
      }
    });

    // Chapter 10: scrolling walks through the pipeline's stages (reversible); the rail fills with the scroll.
    if (q("#ch10") && d.nodes.length) {
      const n = d.nodes.length;
      let at = -1;
      ctx.add(() => ScrollTrigger.create({
        trigger: q("#ch10"),
        start: "top top",
        end: "bottom bottom",
        onUpdate: (s) => {
          const fill = q("#c10-fill");
          if (fill) fill.style.transform = `scaleX(${s.progress.toFixed(4)})`;
          const i = Math.min(n - 1, Math.floor(s.progress * n));
          if (i !== at) {
            at = i;
            window.dispatchEvent(new CustomEvent("saakshi:c10", { detail: i }));
          }
        },
      }));
    }

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
      for (const c of cleanups.splice(0)) c();
      ctx.revert();
    },
  };
}
