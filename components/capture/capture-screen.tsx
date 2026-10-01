"use client";

import gsap from "gsap";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Glyph } from "@/components/glyph";
import { accTone, isLevel, MAP, ringPx, type AccTone } from "@/lib/capture/hud";
import { LOGO_BITS } from "@/lib/glyph";
import { FEED_DRIFT, HUD_TWEEN, SHUTTER } from "@/lib/motion/scenes/capture";

/**
 * The witness camera screen (Capture → /capture, template CA:333-422): feed, top HUD (place,
 * coordinates, accuracy), the spot mini-map, the GPS ring and horizon, the fingerprint grid,
 * the bottom bar (tray, shutter, spot) and the pipeline sheet, plus the first-run and
 * location-off screens. Presentational: a controller (the live camera, or the prototype's
 * simulation for the fixture and dev states) supplies `view` and drives the shutter through
 * `ref`. Element ids follow the prototype (#cam, #feed, #ring, #sheet…), as the captures use them.
 */
export type CapturePhase = "permission" | "denied" | "camera" | "aim" | "shooting" | "done";
export type BandTone = "verified" | "review" | "flagged" | "muted";

export interface CaptureView {
  phase: CapturePhase;
  spotName: string;
  spotShort: string;
  coords: string;
  /** Accuracy radius in metres; null = location off. */
  acc: number | null;
  accText: string;
  level: number | null;
  levelText: string;
  dot: { x: number; y: number; text: string } | null;
  offline: boolean;
  lowAcc: boolean;
  trayPhoto: string | null;
  queued: number;
  stepLabels: string[];
  step: number;
  band: { text: string; tone: BandTone; note: string; mock?: boolean };
  /** 64 bits: the sheet's fingerprint glyph. */
  glyphBits: string;
  /** 64 bits: the grid that lights up at the shutter. */
  cells: string;
  chips: Array<{ label: string; full: boolean }>;
  seeHref: string | null;
  flySrc: string | null;
  /** The camera couldn't start: what happened and what to do. */
  camera?: { title: string; body: string; retry: boolean } | null;
}

export interface CaptureHandlers {
  shoot: () => void;
  again: () => void;
  allow: () => void;
  deny: () => void;
  retryLocation: () => void;
  continueNoLoc: () => void;
  retryCamera?: () => void;
  /** Gallery or the phone's own camera app: saved as uploads, not witness captures. */
  files?: (files: FileList | null) => void;
}

export interface ShutterScript {
  /** Step indices to show, at 1.9 s + i · 0.45 s (CA:479-480). */
  steps: number[];
  onStep: (k: number) => void;
  /** Score to count to at 3.3 s; null = none (offline). */
  score: number | null;
  onDone: () => void;
}

export interface CaptureHandle {
  /** The shutter sequence (CA:468-485); without a script it ends with the sheet up, and the caller drives steps and the score. */
  shutter(o: { instant?: boolean; onTray: () => void; script?: ShutterScript }): void;
  /** Counts the score up (CA:483) and calls back when it's shown. */
  countScore(to: number, onDone: () => void): void;
  /** Sets the score text without counting (a hidden or missing score). */
  setScore(text: string): void;
  /** Back to aiming (CA:452). */
  reset(): void;
}

const ACC: Record<AccTone, string> = { good: "var(--n-verified)", fair: "var(--n-review)", poor: "var(--n-flagged)", none: "var(--neutral-dot)" };
const BAND: Record<BandTone, string> = { verified: "var(--verified)", review: "var(--review)", flagged: "var(--destructive)", muted: "var(--muted-foreground)" };
const OVERLAY = { position: "absolute", inset: "0", background: "var(--n-background)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "28px 22px 40px", gap: "14px" } as const;
const PRIMARY_BTN = { padding: "14px", borderRadius: "12px", border: "0", background: "var(--n-primary)", color: "var(--n-background)", cursor: "pointer", fontWeight: "600", fontSize: "16px" } as const;
const SECOND_BTN = { padding: "12px", borderRadius: "12px", border: "1px solid var(--d-accent)", background: "transparent", color: "var(--n-foreground)", cursor: "pointer" } as const;
const one = (root: HTMLElement | null, sel: string) => root?.querySelector<HTMLElement>(sel) ?? null;
const all = (root: HTMLElement | null, sel: string) => Array.from(root?.querySelectorAll<HTMLElement>(sel) ?? []);
const BANNER = { position: "absolute", left: "12px", right: "12px", top: "156px", padding: "8px 10px", borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--review) 92%, transparent)", fontSize: "12px", lineHeight: "1.4" } as const;

/** `feedImage` + `drift`: a still photo (the fixture, dev states); else `videoRef`, the live camera. */
export function CaptureScreen({ view, on, feedImage = null, drift: driftOn = false, videoRef, framed, ref }: { view: CaptureView; on: CaptureHandlers; feedImage?: string | null; drift?: boolean; videoRef?: Ref<HTMLVideoElement>; framed: boolean; ref?: Ref<CaptureHandle> }) {
  const camRef = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const drift = useRef<gsap.core.Tween | null>(null);
  const showHud = view.phase === "aim" || view.phase === "shooting";
  const tone = accTone(view.acc);
  const accColor = ACC[tone];

  // D-1304: the prototype's hand-held drift (simulated feeds only).
  useEffect(() => {
    if (!driftOn) return;
    drift.current = gsap.to(one(camRef.current, "#feed"), { x: FEED_DRIFT.x, y: FEED_DRIFT.y, rotate: FEED_DRIFT.rotate, duration: FEED_DRIFT.duration, ease: FEED_DRIFT.ease, yoyo: true, repeat: -1 });
    return () => {
      drift.current?.kill();
      drift.current = null;
    };
  }, [driftOn]);

  // D-1191: ring and horizon ease to each sample (CA:446-448).
  useEffect(() => {
    const r = one(camRef.current, "#ring");
    if (r) {
      const px = ringPx(view.acc);
      gsap.to(r, { width: px, height: px, left: -px / 2, top: -px / 2, duration: HUD_TWEEN.duration, ease: HUD_TWEEN.ease, overwrite: true });
    }
    const h = one(camRef.current, "#horizon");
    if (h) gsap.to(h, { rotate: view.level ?? 0, duration: HUD_TWEEN.duration, ease: HUD_TWEEN.ease, overwrite: true });
  }, [view.acc, view.level, showHud]);

  useEffect(() => () => void tl.current?.kill(), []);

  useImperativeHandle(ref, () => ({
    shutter({ instant, onTray, script }) {
      const cam = camRef.current!.getBoundingClientRect();
      const tray = one(camRef.current, "#tray")!.getBoundingClientRect();
      const S = SHUTTER;
      tl.current?.kill();
      const t = gsap.timeline();
      tl.current = t;
      if (instant) t.timeScale(S.instantScale);
      t.fromTo(one(camRef.current, "#flash"), { opacity: S.flash.from }, { opacity: 0, duration: S.flash.duration })
        .call(() => void drift.current?.pause(), undefined, 0)
        .set(one(camRef.current, "#glyph"), { opacity: 1 }, S.glyphIn)
        .to(all(camRef.current, "[data-cell]"), { opacity: 1, duration: S.cells.duration, stagger: { each: S.cells.each, from: "start" } }, S.cells.at)
        .set(one(camRef.current, "#fly"), { opacity: 1, x: 0, y: 0, scale: 1 }, S.flyIn)
        .to(one(camRef.current, "#glyph"), { opacity: 0, duration: S.glyphOut.duration }, S.glyphOut.at)
        .to(one(camRef.current, "#fly"), { x: tray.left - cam.left, y: tray.top - cam.top, scale: tray.width / cam.width, borderRadius: S.fly.radius, duration: S.fly.duration, ease: S.fly.ease }, S.fly.at)
        .set(one(camRef.current, "#fly"), { opacity: 0 }, S.trayAt)
        .call(onTray, undefined, S.trayAt)
        .to(one(camRef.current, "#sheet"), { transform: S.sheet.shown, duration: S.sheet.duration, ease: S.sheet.ease }, S.sheet.at);
      if (!script) return;
      script.steps.forEach((k, i) => t.call(() => script.onStep(k), undefined, S.steps.from + i * S.steps.every));
      if (script.score !== null) {
        const o = { v: 0 };
        const el = one(camRef.current, "#score");
        t.to(o, { v: script.score, duration: S.score.duration, ease: S.score.ease, onUpdate: () => void (el && (el.textContent = String(Math.round(o.v)))) }, S.score.at).call(script.onDone, undefined, S.doneAt);
      } else t.call(script.onDone, undefined, S.offlineDoneAt);
    },
    countScore(to, onDone) {
      const o = { v: 0 };
      const el = one(camRef.current, "#score");
      gsap.to(o, { v: to, duration: SHUTTER.score.duration, ease: SHUTTER.score.ease, onUpdate: () => void (el && (el.textContent = String(Math.round(o.v)))), onComplete: onDone });
    },
    setScore(text) {
      const el = one(camRef.current, "#score");
      if (el) el.textContent = text;
    },
    reset() {
      tl.current?.kill();
      gsap.set(one(camRef.current, "#sheet"), { yPercent: 0, y: 0 });
      gsap.set(one(camRef.current, "#sheet"), { transform: SHUTTER.sheet.hidden });
      gsap.set(one(camRef.current, "#glyph"), { opacity: 0 });
      gsap.set(all(camRef.current, "[data-cell]"), { opacity: 0 });
      gsap.set(one(camRef.current, "#fly"), { opacity: 0 });
      gsap.set(one(camRef.current, "#flash"), { opacity: 0 });
      const el = one(camRef.current, "#score");
      if (el) el.textContent = "0";
    },
  }));

  return (
    <div ref={camRef} id="cam" style={{ position: "relative", width: "100%", height: "100%", borderRadius: framed ? "36px" : "0", overflow: "hidden", background: "var(--ink-black)", color: "var(--card)" }}>
      {feedImage ? (
        <div id="feed" style={{ position: "absolute", inset: "-4%", backgroundImage: `url("${feedImage}")`, backgroundSize: "cover", backgroundPosition: "45% 50%" }} />
      ) : (
        <video id="feed" ref={videoRef} playsInline muted autoPlay style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <div id="flash" style={{ position: "absolute", inset: "0", background: "var(--card)", opacity: "0", pointerEvents: "none" }} />

      <div style={{ position: "absolute", left: "0", right: "0", top: "0", padding: "46px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 10px", borderRadius: "12px", background: "color-mix(in srgb, var(--n-background) 72%, transparent)" }}>
          <span style={{ fontSize: "11px", color: "var(--n-muted-foreground)" }}>{view.spotName}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }} data-testid="capture-coords">
            {view.coords}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }} data-testid="capture-accuracy">
            <span style={{ width: "8px", height: "8px", borderRadius: "4px", background: accColor }} />
            {view.accText}
          </span>
        </div>
        <div aria-label="Spot radius map" role="img" style={{ position: "relative", width: `${MAP.box}px`, height: `${MAP.box}px`, borderRadius: "14px", overflow: "hidden", background: "color-mix(in srgb, var(--n-background) 78%, transparent)" }}>
          <div style={{ position: "absolute", left: "18px", top: "18px", width: "60px", height: "60px", borderRadius: "50%", border: "1.5px dashed var(--n-verified)", background: "color-mix(in srgb, var(--n-verified) 12%, transparent)" }} />
          {view.dot && <div id="me" style={{ position: "absolute", left: `${view.dot.x}px`, top: `${view.dot.y}px`, width: "10px", height: "10px", margin: "-5px 0 0 -5px", borderRadius: "5px", background: "var(--n-primary)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--n-primary) 35%, transparent)" }} />}
          <span style={{ position: "absolute", left: "6px", bottom: "4px", fontSize: "9px", color: "var(--n-muted-foreground)" }}>{view.dot?.text ?? "No location"}</span>
        </div>
      </div>

      {showHud && (
        <>
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "44%", width: "0", height: "0" }}>
            <div id="ring" style={{ position: "absolute", left: "-60px", top: "-60px", width: "120px", height: "120px", borderRadius: "50%", border: `2px solid ${accColor}`, boxShadow: `0 0 16px color-mix(in srgb, ${accColor} 40%, transparent)` }} />
            <div style={{ position: "absolute", left: "-4px", top: "-4px", width: "8px", height: "8px", borderRadius: "4px", background: accColor }} />
          </div>
          <div id="horizon" aria-hidden="true" style={{ position: "absolute", left: "18%", right: "18%", top: "44%", height: "0", borderTop: `1.5px solid ${isLevel(view.level) ? "var(--n-verified)" : "color-mix(in srgb, var(--card) 80%, transparent)"}` }} />
          <span style={{ position: "absolute", left: "0", right: "0", top: "calc(44% + 76px)", textAlign: "center", fontSize: "12px", textShadow: "0 1px 3px color-mix(in srgb, var(--ink-black) 70%, transparent)" }}>{view.levelText}</span>
        </>
      )}

      {view.offline && (
        <div role="status" style={BANNER}>
          Offline. Photos queue on this phone and upload when you&apos;re back. Location and time are still recorded now.
        </div>
      )}
      {view.lowAcc && !view.offline && (
        <div role="status" style={BANNER}>
          Waiting for a better location fix. Step into the open. You can still shoot; the photo will need review.
        </div>
      )}

      <div id="glyph" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "40%", width: "150px", height: "150px", margin: "-75px 0 0 -75px", display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: "3px", opacity: "0" }}>
        {[...view.cells].map((b, i) => (
          <span key={i} data-cell="" style={{ borderRadius: "3px", background: b === "1" ? "var(--n-primary)" : "color-mix(in srgb, var(--card) 28%, transparent)", opacity: "0" }} />
        ))}
      </div>

      <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "150px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 34px 24px", boxSizing: "border-box" }}>
        <div id="tray" style={{ width: "52px", height: "52px", borderRadius: "var(--radius)", border: "2px solid color-mix(in srgb, var(--card) 80%, transparent)", overflow: "hidden", background: "color-mix(in srgb, var(--card) 12%, transparent)", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the photo just taken (an object URL, or the fixture's) */}
          {view.trayPhoto && <img src={view.trayPhoto} alt="Last photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {view.queued > 0 && <span style={{ position: "absolute", right: "2px", top: "2px", padding: "0 4px", borderRadius: "4px", background: "var(--review)", fontSize: "9px" }}>{view.queued}</span>}
          {on.files && (
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Upload photos from the gallery (saved as uploads, not witness captures)" onChange={(e) => on.files?.(e.target.files)} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", opacity: "0", cursor: "pointer" }} />
          )}
        </div>
        <button type="button" onClick={on.shoot} aria-label="Take photo" disabled={view.phase !== "aim"} style={{ width: "76px", height: "76px", borderRadius: "38px", border: "4px solid var(--card)", background: view.phase === "aim" ? "color-mix(in srgb, var(--card) 18%, transparent)" : "color-mix(in srgb, var(--card) 50%, transparent)", cursor: "pointer", padding: "0" }} />
        <span style={{ width: "52px", textAlign: "center", fontSize: "11px", color: "color-mix(in srgb, var(--card) 80%, transparent)" }}>{view.spotShort}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- the photo just taken, flying to the tray */}
      <img id="fly" src={view.flySrc ?? undefined} alt="" style={{ position: "absolute", left: "0", top: "0", width: "100%", height: "100%", objectFit: "cover", opacity: "0", pointerEvents: "none", transformOrigin: "0 0" }} />

      <div id="sheet" style={{ position: "absolute", left: "0", right: "0", bottom: "0", padding: "16px 18px 28px", borderRadius: "22px 22px 0 0", background: "var(--card)", color: "var(--foreground)", display: "flex", flexDirection: "column", gap: "12px", transform: SHUTTER.sheet.hidden }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--border)", alignSelf: "center" }} />
        <div style={{ display: "flex", gap: "6px" }} data-testid="capture-steps" data-step={view.step}>
          {view.stepLabels.map((label, i) => (
            <div key={label} style={{ flex: "1", display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ height: "4px", borderRadius: "2px", background: i < view.step ? "var(--primary)" : i === view.step ? "var(--n-primary)" : "var(--secondary)" }} />
              <span style={{ fontSize: "11px", color: i <= view.step ? "var(--foreground)" : "var(--neutral-dot)" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span id="score" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "52px", lineHeight: "1", color: BAND[view.band.tone] }}>
            0
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: "600", color: BAND[view.band.tone] }} data-testid="capture-band">
              {view.band.text}
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{view.band.note}</span>
            {view.band.mock && <span style={{ alignSelf: "flex-start", marginTop: "2px", fontSize: "11px", padding: "0 5px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)" }}>Mock output</span>}
          </div>
          <Glyph bits={view.glyphBits} label="Fingerprint" style={{ marginLeft: "auto", width: "48px", height: "48px" }} />
        </div>
        {view.phase === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {view.chips.map((r) => (
                <span key={r.label} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 7px", borderRadius: "6px", background: r.full ? "var(--verified-tint)" : "var(--background)", color: r.full ? "var(--verified-ink)" : "var(--muted-foreground)", fontSize: "11px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "3px", background: r.full ? "var(--verified)" : "var(--neutral-dot)" }} />
                  {r.label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={on.again} style={{ flex: "1", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontWeight: "500" }}>
                Take another
              </button>
              <a href={view.seeHref ?? undefined} aria-disabled={!view.seeHref} style={{ flex: "1", padding: "12px", borderRadius: "var(--radius)", background: "var(--primary)", color: "var(--card)", textAlign: "center", textDecoration: "none", fontWeight: "500", opacity: view.seeHref ? undefined : "0.6" }}>
                See it
              </a>
            </div>
          </div>
        )}
      </div>

      {view.phase === "permission" && (
        <div style={OVERLAY}>
          <Glyph bits={LOGO_BITS} colors={{ on: "var(--n-primary)", off: "transparent" }} style={{ width: "44px", height: "44px" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "34px", lineHeight: "1" }}>Your photo is proof when it knows where and when.</span>
          <span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--n-muted-foreground)" }}>Saakshi needs your camera, and your location only while you take the photo. Faces are blurred before anything is public.</span>
          <button type="button" onClick={on.allow} style={PRIMARY_BTN}>
            Allow camera and location
          </button>
          <button type="button" onClick={on.deny} style={SECOND_BTN}>
            Not now
          </button>
        </div>
      )}
      {view.phase === "denied" && (
        <div style={OVERLAY}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "30px", lineHeight: "1.02" }}>Location is off, so photos can&apos;t be verified.</span>
          <span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--n-muted-foreground)" }}>
            Turn it on in your browser&apos;s site settings: tap the lock next to the address, then Location, then Allow. Or continue: your photo still counts, but it will wait at Needs review.
          </span>
          <button type="button" onClick={on.retryLocation} style={PRIMARY_BTN}>
            I&apos;ve turned it on
          </button>
          <button type="button" onClick={on.continueNoLoc} style={SECOND_BTN}>
            Continue without location
          </button>
        </div>
      )}
      {view.phase === "camera" && view.camera && (
        <div style={OVERLAY} data-testid="camera-message">
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "30px", lineHeight: "1.02" }}>{view.camera.title}</span>
          <span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--n-muted-foreground)" }}>{view.camera.body}</span>
          {view.camera.retry && on.retryCamera && (
            <button type="button" onClick={on.retryCamera} style={PRIMARY_BTN}>
              Try again
            </button>
          )}
          {on.files && (
            <label style={{ ...SECOND_BTN, display: "block", textAlign: "center" }}>
              Open the phone&apos;s camera app
              <input type="file" accept="image/*" capture="environment" onChange={(e) => on.files?.(e.target.files)} style={{ position: "absolute", width: "1px", height: "1px", opacity: "0" }} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
