"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accText, isLevel, levelText, stepLabels } from "@/lib/capture/hud";
import { LOW_ACC_SCORE_CAP, SAMPLE_MS, SIM, simSample, VIBRATE } from "@/lib/motion/scenes/capture";
import type { SimMode } from "@/lib/capture/sim-states";
import type { BandTone, CaptureHandle, CaptureHandlers, CaptureView } from "./capture-screen";

export type { SimMode };

/**
 * The prototype's capture logic (CA:428-517), for the parity fixture and the dev states
 * (`/capture?state=…`, B5.11): simulated GPS samples, the scripted shutter sequence, and a score
 * computed beforehand by the server (the prototype's rules on the fixture, our Trust Engine in
 * dev). Never used for a real photo.
 */

export interface SimResult {
  score: number;
  rows: Array<{ label: string; full: boolean }>;
}

export interface SimConfig {
  mode: SimMode;
  spotName: string;
  spotShort: string;
  coords: string;
  feed: string;
  /** 64 bits. */
  hash: string;
  /** With a location (Witness Capture) and without one. */
  results: { witness: SimResult; none: SimResult };
  /** Band thresholds: the prototype's 80/40 on the fixture, ours (75/45) in dev. */
  bands: { verified: number; review: number };
  /** Mini-map dot per mode (CA:503): inside the spot, or near its edge with weak GPS. */
  dots: { live: { x: number; y: number }; low: { x: number; y: number } };
  seeHref: string | null;
  /** The weak-GPS floor quoted in the done note (CA:510). */
  lowAccNote: string;
}

type Phase = "permission" | "denied" | "aim" | "shooting" | "done";
interface St {
  mode: SimMode;
  acc: number;
  level: number;
  step: number;
  phase: Phase;
  noLoc: boolean;
  tray: boolean;
  final: number | null | undefined;
}

const vibrate = (p: number | readonly number[]) => {
  // Browsers refuse vibration before the first tap (and log it): skip it until then.
  if (!navigator.userActivation?.hasBeenActive) return;
  try {
    navigator.vibrate?.(p as number | number[]);
  } catch {
    // not supported
  }
};

export function useSimCapture(cfg: SimConfig) {
  const screen = useRef<CaptureHandle | null>(null);
  const bindScreen = useCallback((h: CaptureHandle | null) => {
    screen.current = h;
  }, []);
  const [st, setSt] = useState<St>({ mode: "live", acc: SIM.start.acc, level: SIM.start.level, step: -1, phase: "aim", noLoc: false, tray: false, final: undefined });
  const stRef = useRef(st);
  useEffect(() => {
    stRef.current = st;
  }, [st]);

  // CA:439-443: one GPS sample every 450 ms while aiming.
  useEffect(() => {
    const iv = setInterval(() => {
      setSt((s) => (s.phase !== "aim" ? s : { ...s, ...simSample(s, s.mode === "low") }));
    }, SAMPLE_MS);
    return () => clearInterval(iv);
  }, []);

  const shoot = useCallback(
    (instant: boolean, base?: St) => {
      const s = base ?? stRef.current;
      if (s.phase !== "aim" && !instant) return;
      setSt((x) => ({ ...x, phase: "shooting", step: -1 }));
      vibrate(VIBRATE.shutter);
      const r = s.noLoc ? cfg.results.none : cfg.results.witness;
      const offline = s.mode === "offline";
      const final = s.mode === "low" ? Math.min(r.score, LOW_ACC_SCORE_CAP) : r.score;
      screen.current?.shutter({
        instant,
        onTray: () => setSt((x) => ({ ...x, tray: true })),
        script: {
          steps: offline ? [0] : [0, 1, 2, 3],
          onStep: (k) => setSt((x) => ({ ...x, step: k })),
          score: offline ? null : final,
          onDone: () => {
            setSt((x) => ({ ...x, phase: "done", final: offline ? null : final }));
            if (!offline) vibrate(VIBRATE.scored);
          },
        },
      });
    },
    [cfg.results],
  );

  // CA:450-455.
  const setMode = useCallback(
    (m: SimMode) => {
      screen.current?.reset();
      const next: St = { ...stRef.current, mode: m, step: -1, phase: m === "permission" ? "permission" : m === "denied" ? "denied" : "aim", acc: m === "low" ? SIM.reset.lowAcc : SIM.reset.acc, noLoc: false, tray: false, final: undefined };
      setSt(next);
      stRef.current = next;
      if (m === "done") requestAnimationFrame(() => shoot(true, next));
    },
    [shoot],
  );

  // The starting state (?state= or the fixture's), once the screen is mounted.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (cfg.mode !== "live") requestAnimationFrame(() => setMode(cfg.mode));
  }, [cfg.mode, setMode]);

  const view = useMemo<CaptureView>(() => {
    const low = st.mode === "low";
    const offline = st.mode === "offline";
    const r = st.noLoc ? cfg.results.none : cfg.results.witness;
    const final = st.final ?? r.score;
    const done = st.phase === "done";
    const band = offline ? "Queued" : done ? (final >= cfg.bands.verified ? "Verified" : final >= cfg.bands.review ? "Needs review" : "Flagged") : "Checking";
    const tone: BandTone = band === "Verified" ? "verified" : band === "Needs review" ? "review" : band === "Flagged" ? "flagged" : "muted";
    const dot = low ? cfg.dots.low : cfg.dots.live;
    return {
      phase: st.phase,
      spotName: cfg.spotName,
      spotShort: cfg.spotShort,
      coords: st.noLoc ? "No location" : cfg.coords,
      acc: st.noLoc ? null : st.acc,
      accText: st.noLoc ? accText(null) : accText(st.acc),
      level: st.level,
      levelText: levelText(st.level),
      dot: { ...dot, text: low ? "Near the edge" : "Inside the spot" },
      offline,
      lowAcc: low && st.phase === "aim",
      trayPhoto: st.tray ? cfg.feed : null,
      queued: offline && st.tray ? 1 : 0,
      stepLabels: stepLabels(offline),
      step: st.step,
      band: { text: band, tone, note: offline ? "Uploads when you are back online" : done ? (low ? cfg.lowAccNote : st.noLoc ? "No location recorded" : "Location, time and fingerprint check out") : "Checking the photo" },
      glyphBits: cfg.hash,
      cells: cfg.hash,
      chips: r.rows,
      seeHref: cfg.seeHref,
      flySrc: cfg.feed,
    };
  }, [st, cfg]);

  const on = useMemo<CaptureHandlers>(
    () => ({
      shoot: () => shoot(false),
      again: () => setMode(stRef.current.mode === "done" ? "live" : stRef.current.mode),
      allow: () => setMode("live"),
      deny: () => setMode("denied"),
      retryLocation: () => setMode("live"),
      continueNoLoc: () => setSt((s) => ({ ...s, phase: "aim", noLoc: true, mode: "live" })),
    }),
    [shoot, setMode],
  );

  return { view, on, bindScreen, setMode, mode: st.mode, isLevel: isLevel(st.level) };
}
