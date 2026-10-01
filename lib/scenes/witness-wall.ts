/**
 * Witness Wall choreography (browser only): the design's Component.setup/arrive/ripple/drift
 * (witness-wall template WW:521-620), ported nearly verbatim. Changes, all from the spec or the
 * product (B5.8): arrivals are real Witness photos from /api/live, queued one at a time (beyond
 * QUEUE.maxWaiting they land straight on the map); the score waits for the real one; operator
 * rehearsals replay demo photos and are labelled; reduced motion has no drift or flight; a
 * dropped feed shows "Reconnecting". Numbers in lib/motion/scenes/witness-wall.ts.
 */
import { gsap } from "gsap";
import type { LiveEvent } from "../live";
import type { MotionMode } from "../motion/mode";
import { ARRIVAL, DOTS, DRIFT, LIVE_PULSE, PLANE, QUEUE, RIPPLE, SCORE_WAIT_MS, STAGE } from "../motion/scenes/witness-wall";
import { DUST } from "../motion/scenes/landing";
import type { TrustBand } from "../trust/types";
import type { WallArrival, WallData, WallSpot } from "../wall/types";
import { rng } from "./landing-stage";

export interface WallCard {
  src: string;
  place: string;
  score: number | null;
  band: TrustBand | null;
  reason: string;
  resultOpacity: number;
  caption: string;
}

export interface WallHooks {
  setCard(c: WallCard | null): void;
  patchCard(p: Partial<WallCard>): void;
  setStep(n: number): void;
  landed(a: WallArrival): void;
  setLive(s: "live" | "reconnecting" | "off"): void;
}

export interface WallController {
  rehearse(): void;
  dispose(): void;
}

interface Item {
  id: string;
  src: string;
  spot: WallSpot | null;
  place: string;
  rehearsal: boolean;
  result: () => { score: number | null; band: TrustBand | null; reason: string } | null;
}

/**
 * The dot plane's height: equal pixels per degree on both axes, as the prototype's 1400×1067 is
 * for its 21°×16° frame (B5.10's 24°×24° frame gives 1400×1400).
 */
export const planeHeight = (f: WallData["frame"]) => Math.round((PLANE.width * (f.lat1 - f.lat0)) / (f.lng1 - f.lng0));

/** Spot pixel position on the plane (WW:518). */
export function spotPx(s: Pick<WallSpot, "lat" | "lng">, f: WallData["frame"]) {
  return { px: ((s.lng - f.lng0) / (f.lng1 - f.lng0)) * PLANE.width, py: (1 - (s.lat - f.lat0) / (f.lat1 - f.lat0)) * planeHeight(f) };
}

export function setupWall(root: HTMLElement, d: WallData, mode: MotionMode, hooks: WallHooks): WallController {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const reduced = mode === "reduced";
  let dead = false;
  let scale = 1;
  let busy = false;
  let n = 0;
  let drift: gsap.core.Timeline | null = null;
  let es: EventSource | null = null;
  const queue: Item[] = [];
  const results = new Map<string, { score: number | null; band: TrustBand | null; reason: string }>();
  const ctx = gsap.context(() => {}, root);
  const cleanups: Array<() => void> = [];
  const spots = d.spots.map((s) => ({ ...s, ...spotPx(s, d.frame) }));

  // fit 1920×1080
  const fit = () => {
    const f = q("#ww-fit");
    const st = q("#ww-stage");
    if (!f || !st) return;
    const s = Math.min(f.clientWidth / STAGE.width, f.clientHeight / STAGE.height);
    scale = s;
    st.style.transform = `translate(${(f.clientWidth - STAGE.width * s) / 2}px, ${(f.clientHeight - STAGE.height * s) / 2}px) scale(${s})`;
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(q("#ww-fit")!);
  cleanups.push(() => ro.disconnect());

  // dots (edges dissolved; seeded where the prototype used Math.random)
  const c = q<HTMLCanvasElement>("#ww-dots");
  if (c) {
    const x = c.getContext("2d")!;
    const { lng0: L0, lng1: L1, lat0: A0, lat1: A1 } = d.frame;
    const r = rng(d.seed);
    const PH = planeHeight(d.frame);
    x.fillStyle = DOTS.color;
    for (const [lng, lat] of d.land) {
      const e = Math.min((A1 - lat) / DOTS.edge.lat, (lng - L0) / DOTS.edge.lng, (L1 - lng) / DOTS.edge.lng, 1);
      if (r() > e) continue;
      x.beginPath();
      x.arc(((lng - L0) / (L1 - L0)) * PLANE.width, (1 - (lat - A0) / (A1 - A0)) * PH, DOTS.radius, 0, 7);
      x.fill();
    }
  }
  // dust (the landing's)
  const bits = d.dust.filter((b) => /^[01]{64}$/.test(b));
  if (bits.length) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${DUST.width}" height="${DUST.height}" viewBox="0 0 ${DUST.width} ${DUST.height}">`;
    for (let i = 0; i < DUST.glyphs; i++) {
      const p = bits[(i * 7) % bits.length];
      const ox = (i % DUST.cols) * DUST.colStep + DUST.x0 + (Math.floor(i / DUST.cols) % 2) * DUST.rowShift;
      const oy = Math.floor(i / DUST.cols) * DUST.rowStep + DUST.y0;
      for (let k = 0; k < 64; k++) if (p[k] === "1") s += `<rect x="${ox + (k % 8) * DUST.cell}" y="${oy + Math.floor(k / 8) * DUST.cell}" width="${DUST.size}" height="${DUST.size}" rx="${DUST.radius}" fill="#9C7DFF" fill-opacity="${DUST.alpha}"/>`;
    }
    root.querySelectorAll<HTMLElement>("[data-dust]").forEach((el) => (el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(s + "</svg>")}")`));
  }

  const camTo = (sp: (typeof spots)[number] | null, dur: number) =>
    sp ? gsap.to("#ww-plane", { x: PLANE.width / 2 - sp.px, y: Math.floor(planeHeight(d.frame) / 2) - sp.py + DRIFT.spot.yOffset, duration: dur, ease: DRIFT.ease }) : gsap.to("#ww-plane", { x: DRIFT.overview.x, y: DRIFT.overview.y, duration: dur, ease: DRIFT.ease });

  const startDrift = () => {
    drift?.kill();
    const tl = gsap.timeline({ repeat: -1 });
    for (const s of [null, ...spots]) {
      tl.call(() => {
        const el = q("#ww-focus-name");
        if (el) el.textContent = s ? s.label : "All demo spots";
      })
        .add(camTo(s, DRIFT.move))
        .to("#ww-cam", { rotateZ: s ? DRIFT.spot.rotateZ : DRIFT.overview.rotateZ, scale: s ? DRIFT.spot.scale : DRIFT.overview.scale, duration: DRIFT.move, ease: DRIFT.ease }, "<")
        .to({}, { duration: DRIFT.hold });
    }
    drift = tl;
  };

  const ripple = (sp: (typeof spots)[number] | null) => {
    const host = q("#ww-ripples");
    if (!host || !sp) return;
    for (let i = 0; i < (reduced ? 1 : RIPPLE.count); i++) {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "absolute", left: `${sp.px - RIPPLE.size / 2}px`, top: `${sp.py - RIPPLE.size / 2}px`, width: `${RIPPLE.size}px`, height: `${RIPPLE.size}px`, borderRadius: "50%", border: `${RIPPLE.border}px solid ${RIPPLE.color}`, boxShadow: RIPPLE.glow });
      host.appendChild(r);
      gsap.fromTo(r, { scale: RIPPLE.from, opacity: 1 }, { scale: reduced ? 2 : RIPPLE.to, opacity: 0, duration: RIPPLE.dur, delay: i * RIPPLE.gap, ease: "power3.out", onComplete: () => r.remove() });
    }
  };

  const finish = (it: Item, res: { score: number | null; band: TrustBand | null; reason: string } | null) => {
    hooks.landed({ id: it.id, src: it.src, place: it.place, reason: res?.reason ?? "Still checking", score: res?.score ?? null, band: res?.band ?? null, rehearsal: it.rehearsal });
    hooks.setStep(-1);
  };

  const next = () => {
    if (busy || dead) return;
    const it = queue.shift();
    if (!it) return;
    // Too many waiting: land this one straight on the map (P2 Queueing).
    if (queue.length >= QUEUE.maxWaiting) {
      ripple(it.spot && spots.find((s) => s.k === it.spot!.k)!);
      finish(it, it.result());
      next();
      return;
    }
    busy = true;
    const sp = it.spot ? spots.find((s) => s.k === it.spot!.k) ?? null : null;
    drift?.pause();
    hooks.setCard({ src: it.src, place: it.place, score: 0, band: null, reason: "", resultOpacity: 0, caption: it.rehearsal ? d.rehearsalLabel : "just now" });
    const focus = q("#ww-focus-name");
    if (focus) focus.textContent = it.place;
    const card = q("#ww-card")!;
    const done = () => {
      busy = false;
      if (!reduced) drift?.restart();
      next();
    };
    const tl = gsap.timeline({ onComplete: done });
    if (!reduced) {
      tl.add(camTo(sp, ARRIVAL.fly.dur), ARRIVAL.fly.at).to("#ww-cam", { rotateZ: DRIFT.spot.rotateZ, scale: DRIFT.spot.scale, duration: ARRIVAL.fly.dur, ease: DRIFT.ease }, ARRIVAL.fly.at);
      tl.fromTo(card, { x: ARRIVAL.drop.from.x, y: ARRIVAL.drop.from.y, scale: 1, opacity: 1, rotate: ARRIVAL.drop.from.rotate }, { y: ARRIVAL.drop.to.y, rotate: ARRIVAL.drop.to.rotate, duration: ARRIVAL.drop.dur, ease: "expo.out" }, ARRIVAL.drop.at);
    }
    tl.add(() => {
      const pin = sp ? root.querySelector<HTMLElement>(`[data-spot="${sp.k}"] [data-pin]`) : null;
      const st = q("#ww-stage")!;
      const sr = st.getBoundingClientRect();
      const pr = pin?.getBoundingClientRect() ?? { left: sr.left + (STAGE.mapWidth / 2) * scale, top: sr.top + (STAGE.height / 2) * scale, width: 0, height: 0 };
      const px = (pr.left + pr.width / 2 - sr.left) / scale;
      const py = (pr.top + pr.height / 2 - sr.top) / scale;
      if (reduced) {
        gsap.set(card, { x: px + ARRIVAL.toPin.dx, y: py + ARRIVAL.toPin.dy, scale: ARRIVAL.toPin.scale, rotate: 0 });
        gsap.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.3 });
        ripple(sp);
      } else gsap.to(card, { x: px + ARRIVAL.toPin.dx, y: py + ARRIVAL.toPin.dy, scale: ARRIVAL.toPin.scale, duration: ARRIVAL.toPin.dur, ease: "power3.inOut", onComplete: () => ripple(sp) });
    }, reduced ? 0 : ARRIVAL.toPin.at);
    ARRIVAL.steps.slice(0, 3).forEach((t, i) => tl.add(() => hooks.setStep(i), reduced ? i * 0.4 : t));
    // Scored: the real result, waited for if the pipeline is still running.
    const scoreAt = reduced ? 1.2 : ARRIVAL.steps[3];
    let pending: ReturnType<Item["result"]> = null;
    const count = (res: ReturnType<Item["result"]>) => {
      pending = res;
      hooks.setStep(3);
      const o = { v: 0 };
      gsap.to(o, {
        v: res?.score ?? 0,
        duration: ARRIVAL.count.dur,
        ease: "power2.out",
        onUpdate: () => hooks.patchCard({ score: res && res.score !== null ? Math.round(o.v) : null, band: res?.band ?? null, reason: res?.reason ?? "Still checking", resultOpacity: 1 }),
      });
    };
    tl.add(() => {
      const res = it.result();
      if (res) return count(res); // as the prototype: the count runs alongside the timeline
      // The pipeline is still running: hold at "Checking" until the real score arrives.
      tl.pause();
      const started = Date.now();
      const poll = () => {
        if (dead) return;
        const r2 = it.result();
        if (!r2 && Date.now() - started < SCORE_WAIT_MS) return void setTimeout(poll, 250);
        count(r2);
        tl.resume();
      };
      poll();
    }, scoreAt);
    const listAt = reduced ? scoreAt + 2.5 : ARRIVAL.toList.at;
    tl.add(() => {
      const list = q("#ww-list")!;
      const st = q("#ww-stage")!;
      const lr = list.getBoundingClientRect();
      const sr = st.getBoundingClientRect();
      gsap.to(card, reduced ? { opacity: 0, duration: 0.3 } : { x: (lr.left - sr.left) / scale, y: (lr.top - sr.top) / scale, scale: ARRIVAL.toList.scale, opacity: 0, duration: ARRIVAL.toList.dur, ease: "power3.in" });
    }, listAt)
      .add(() => finish(it, pending ?? it.result()), reduced ? listAt + 0.4 : ARRIVAL.settle.at)
      .to({}, { duration: ARRIVAL.settle.tail });
  };

  const enqueue = (it: Item) => {
    queue.push(it);
    next();
  };

  const nearest = (lat: number, lng: number) => spots.reduce<(typeof spots)[number] | null>((b, s) => (!b || (s.lat - lat) ** 2 + (s.lng - lng) ** 2 < (b.lat - lat) ** 2 + (b.lng - lng) ** 2 ? s : b), null);

  ctx.add(() => {
    if (!reduced) {
      gsap.to("#ww-live", { opacity: LIVE_PULSE.opacity, duration: LIVE_PULSE.duration, repeat: -1, yoyo: true, ease: LIVE_PULSE.ease });
      startDrift();
    }
  });

  // Real arrivals (B5.8).
  if (d.live) {
    try {
      es = new EventSource("/api/live");
      es.onopen = () => hooks.setLive("live");
      es.onerror = () => hooks.setLive("reconnecting");
      const onEvent = (m: MessageEvent<string>) => {
        const ev = JSON.parse(m.data) as LiveEvent;
        if (ev.band) results.set(ev.id, { score: ev.score, band: ev.band, reason: ev.reason ?? "" });
        if (m.type !== "arrival") return;
        const sp = ev.location ? nearest(ev.location.lat, ev.location.lng) : spots[0] ?? null;
        enqueue({ id: ev.id, src: ev.thumbUrl, spot: sp, place: ev.place ?? sp?.label ?? "A new spot", rehearsal: false, result: () => results.get(ev.id) ?? null });
      };
      es.addEventListener("arrival", onEvent as EventListener);
      es.addEventListener("status", onEvent as EventListener);
    } catch {
      hooks.setLive("off");
    }
  }

  const rehearse = () => {
    if (!d.operator || !d.rehearsals.length) return;
    const p = d.rehearsals[n++ % d.rehearsals.length];
    const sp = spots.find((s) => s.k === p.spot) ?? spots[0] ?? null;
    enqueue({ id: `rehearsal-${n}`, src: p.src, spot: sp, place: sp?.label ?? "Demo spot", rehearsal: true, result: () => ({ score: p.score, band: p.band, reason: p.reason }) });
  };
  if (d.operator) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") rehearse();
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));
  }
  root.dataset.wallReady = "";

  return {
    rehearse,
    dispose() {
      dead = true;
      es?.close();
      drift?.kill();
      for (const c2 of cleanups.splice(0)) c2();
      ctx.revert();
    },
  };
}
