"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { accText, coordsText, levelText, miniMapDot, rollDeg, spotShort, stepLabels, stepOf } from "@/lib/capture/hud";
import { MAX_ACCURACY_M } from "@/lib/capture/token";
import { hexToBits } from "@/lib/glyph";
import { VIBRATE } from "@/lib/motion/scenes/capture";
import { enqueue, flush, idbStore, type ShotStore } from "@/lib/client/offline-queue";
import { previewPhash } from "@/lib/client/phash";
import { captureFrame, fetchAssetStatus, uploadImage, type AssetStatus } from "@/lib/client/upload";
import type { BandTone, CaptureHandle, CaptureHandlers, CapturePhase, CaptureView } from "./capture-screen";

/**
 * The live capture controller: the rear camera, watchPosition, DeviceOrientation (iOS asks from
 * the first-run button), the capture token, then for each photo the on-device fingerprint (B5.2),
 * the upload, and the real pipeline's progress and result in the sheet. Offline, photos queue in
 * IndexedDB (B5.12) and upload, unattested, when the phone is back online.
 */
export interface LiveSpot {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

interface TokenInfo {
  token: string;
  expiresAt: string;
  project: { id: string; name: string; slug: string } | null;
  spot: { id: string; name: string; slug: string } | null;
}

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface Shot {
  preview: string;
  hash: string | null;
  source: "witness" | "upload";
  queued: boolean;
  step: number;
  status: AssetStatus | null;
  assetId: string | null;
  error: string | null;
  lowAcc: number | null;
  noLoc: boolean;
}

type CameraFail = "denied" | "unsupported" | "insecure" | "error";

const CAMERA_TEXT: Record<CameraFail, { title: string; body: string; retry: boolean }> = {
  denied: { title: "The camera is blocked.", body: "Allow it in your browser's site settings: tap the lock next to the address, then Camera, then Allow. On iPhone: Settings, Safari, Camera, Allow.", retry: true },
  insecure: { title: "The camera needs a secure link.", body: "Open this page over HTTPS (for phone testing, the tunnel in the README).", retry: false },
  unsupported: { title: "No camera this page can use.", body: "Use your phone's own camera app instead. Those photos are saved as uploads, not witness captures.", retry: false },
  error: { title: "The camera didn't start.", body: "Try again. If it keeps failing, use your phone's own camera app; those photos are saved as uploads.", retry: true },
};

async function fetchToken(project: string | null, spot: string | null): Promise<TokenInfo> {
  const res = await fetch("/api/capture/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: project ?? undefined, spot: spot ?? undefined }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as TokenInfo;
}

async function openCamera(): Promise<{ stream?: MediaStream; fail?: CameraFail }> {
  if (!window.isSecureContext) return { fail: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { fail: "unsupported" };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }) };
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return { fail: "denied" };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { fail: "unsupported" };
    return { fail: "error" };
  }
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const vibrate = (p: number | readonly number[]) => {
  // Browsers refuse vibration before the first tap (and log it): skip it until then.
  if (!navigator.userActivation?.hasBeenActive) return;
  try {
    navigator.vibrate?.(p as number | number[]);
  } catch {
    // not supported
  }
};
const ZERO = "0".repeat(64);

export function useLiveCapture({ project, spot, spotInfo }: { project: string | null; spot: string | null; spotInfo: LiveSpot | null }) {
  const screen = useRef<CaptureHandle | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const store = useRef<ShotStore | null>(null);
  const [phase, setPhase] = useState<CapturePhase>("permission");
  const [cameraFail, setCameraFail] = useState<CameraFail | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [noLoc, setNoLoc] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [tray, setTray] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const watch = useRef<number | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // --- token (refreshed a minute before it expires) ---------------------------------------
  const requestToken = useCallback(() => fetchToken(project, spot).then((t) => (setToken(t), t), () => null), [project, spot]);
  useEffect(() => {
    let live = true;
    fetchToken(project, spot).then((t) => live && setToken(t), () => undefined);
    return () => {
      live = false;
    };
  }, [project, spot]);
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => void requestToken(), Math.max(5_000, Date.parse(token.expiresAt) - Date.now() - 60_000));
    return () => clearTimeout(t);
  }, [token, requestToken]);

  // --- sensors -------------------------------------------------------------------------------
  const startGeo = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoDenied(true);
      return;
    }
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp });
        setGeoDenied(false);
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setGeoDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }, []);

  const startCamera = useCallback(async () => {
    const r = await openCamera();
    if (r.stream) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = r.stream;
      if (video.current) {
        video.current.srcObject = r.stream;
        await video.current.play().catch(() => undefined);
      }
      setCameraFail(null);
      return true;
    }
    setCameraFail(r.fail ?? "error");
    setPhase("camera");
    return false;
  }, []);

  const onOrientation = useCallback((e: DeviceOrientationEvent) => setLevel(rollDeg(e.beta, e.gamma, window.screen.orientation?.angle ?? 0)), []);

  const start = useCallback(async () => {
    // iOS asks for motion access only from a user gesture: first, before any await.
    const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    const motion = DOE?.requestPermission ? DOE.requestPermission().catch(() => "denied") : Promise.resolve("granted");
    startGeo();
    const ok = await startCamera();
    if ((await motion) === "granted") window.addEventListener("deviceorientation", onOrientation);
    if (ok) setPhase("aim");
  }, [startCamera, startGeo, onOrientation]);

  // First run: ask once; if the browser already granted both, start straight away.
  useEffect(() => {
    let live = true;
    const q = (name: string) => navigator.permissions?.query({ name: name as PermissionName }).then((s) => s.state, () => "prompt") ?? Promise.resolve("prompt");
    Promise.all([q("camera"), q("geolocation")]).then(([c, g]) => {
      if (live && c === "granted" && g === "granted") void start();
    });
    return () => {
      live = false;
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      window.removeEventListener("deviceorientation", onOrientation);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [start, onOrientation]);

  // Location off while aiming: the location-off screen (unless they chose to go on without).
  const shownPhase: CapturePhase = phase === "aim" && geoDenied && !noLoc ? "denied" : phase;

  // --- offline queue -----------------------------------------------------------------------------
  const getStore = useCallback(() => (store.current ??= idbStore()), []);
  useEffect(() => {
    if (!online) return;
    let live = true;
    const s = getStore();
    s.all()
      .then((all) => {
        if (live) setQueued(all.length);
        return all.length ? flush(s, (q) => uploadImage(q.blob, q.filename, q.context), () => live && setQueued((n) => Math.max(0, n - 1))) : null;
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [online, getStore]);

  // --- a photo ----------------------------------------------------------------------------------
  const patch = useCallback((p: Partial<Shot>) => setShot((s) => (s ? { ...s, ...p } : s)), []);

  const follow = useCallback(async (assetId: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await fetchAssetStatus(assetId).catch(() => null);
      if (!st) continue;
      if (st.failed) {
        patch({ status: st, error: st.steps.find((s) => s.status === "error")?.error ?? "A pipeline step failed" });
        setPhase("done");
        return;
      }
      const step = stepOf({ uploaded: true, scored: st.scored, steps: st.steps });
      patch({ status: st, step });
      if (st.scored) {
        const done = () => {
          setPhase("done");
          vibrate(VIBRATE.scored);
        };
        if (st.trustScore !== null) screen.current?.countScore(st.trustScore, done);
        else {
          screen.current?.setScore("–");
          done();
        }
        return;
      }
    }
  }, [patch]);

  const send = useCallback(
    async (blob: Blob, filename: string, source: Shot["source"], context: Record<string, string | undefined>) => {
      try {
        const out = await uploadImage(blob, filename, context);
        patch({ assetId: out.assetId, step: 1 });
        await follow(out.assetId);
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : String(err) });
        setPhase("done");
      }
    },
    [follow, patch],
  );

  const begin = useCallback((preview: string, hash: string | null, source: Shot["source"], queuedShot: boolean) => {
    const low = !noLoc && fix && fix.accuracy > MAX_ACCURACY_M ? Math.round(fix.accuracy) : null;
    setShot({ preview, hash, source, queued: queuedShot, step: 0, status: null, assetId: null, error: null, lowAcc: low, noLoc: noLoc || !fix });
    setPhase("shooting");
    vibrate(VIBRATE.shutter);
    screen.current?.shutter({ onTray: () => setTray(preview) });
  }, [noLoc, fix]);

  const shoot = useCallback(async () => {
    if (phase !== "aim" || !video.current) return;
    const v = video.current;
    let blob: Blob;
    try {
      blob = await captureFrame(v, 2048, 0.9);
    } catch {
      return;
    }
    const at = new Date().toISOString();
    const hash = previewPhash(v, v.videoWidth, v.videoHeight);
    const f = noLoc ? null : fix;
    const context = {
      source: "witness",
      client_captured_at: at,
      device_lat: f ? String(f.lat) : undefined,
      device_lng: f ? String(f.lng) : undefined,
      device_accuracy_m: f ? String(Math.round(f.accuracy)) : undefined,
      fix_timestamp: f ? new Date(f.timestamp).toISOString() : undefined,
      low_accuracy: !f || f.accuracy > MAX_ACCURACY_M ? "1" : undefined,
      project: project ?? undefined,
      spot: spot ?? undefined,
    };
    const preview = URL.createObjectURL(blob);
    if (!navigator.onLine) {
      begin(preview, hash, "witness", true);
      await enqueue(getStore(), { createdAt: at, filename: `witness-${Date.now()}.jpg`, blob, context: { ...context, token: token?.token } });
      setQueued((n) => n + 1);
      setTimeout(() => setPhase("done"), 2400);
      return;
    }
    begin(preview, hash, "witness", false);
    let t = token;
    if (!t || Date.parse(t.expiresAt) < Date.now() + 10_000) t = await requestToken();
    await send(blob, `witness-${Date.now()}.jpg`, "witness", { ...context, token: t?.token });
  }, [phase, fix, noLoc, token, project, spot, requestToken, send, begin, getStore]);

  const files = useCallback(
    async (list: FileList | null) => {
      const f = list?.[0];
      if (!f || (phase !== "aim" && phase !== "camera")) return;
      begin(URL.createObjectURL(f), null, "upload", false);
      await send(f, f.name, "upload", {
        source: "upload",
        filename: f.name,
        project: project ?? undefined,
        spot: spot ?? undefined,
        // Informational only: where the uploader is, not where the photo was taken.
        uploader_lat: fix ? String(fix.lat) : undefined,
        uploader_lng: fix ? String(fix.lng) : undefined,
        uploader_accuracy_m: fix ? String(Math.round(fix.accuracy)) : undefined,
      });
    },
    [phase, fix, project, spot, send, begin],
  );

  const on = useMemo<CaptureHandlers>(
    () => ({
      shoot: () => void shoot(),
      again: () => {
        screen.current?.reset();
        setShot(null);
        setPhase(cameraFail ? "camera" : "aim");
      },
      allow: () => void start(),
      deny: () => {
        setGeoDenied(true);
        void startCamera().then((ok) => ok && setPhase("aim"));
      },
      retryLocation: () => {
        setNoLoc(false);
        startGeo();
      },
      continueNoLoc: () => setNoLoc(true),
      retryCamera: () => void startCamera().then((ok) => ok && setPhase("aim")),
      files: (l) => void files(l),
    }),
    [shoot, start, startCamera, startGeo, files, cameraFail],
  );

  const view = useMemo<CaptureView>(() => {
    const target = spotInfo?.name ?? token?.spot?.name ?? token?.project?.name ?? null;
    const usedFix = noLoc ? null : fix;
    const dot = miniMapDot(spotInfo, usedFix);
    const st = shot?.status;
    const offlineShot = !!shot?.queued;
    let band: CaptureView["band"] = { text: offlineShot ? "Queued" : "Checking", tone: "muted", note: offlineShot ? "Uploads when you are back online" : "Checking the photo" };
    if (shot?.error) band = { text: "Not uploaded", tone: "flagged", note: shot.error };
    else if (st?.scored) {
      const text = st.trustBand === "VERIFIED" ? "Verified" : st.trustBand === "NEEDS_REVIEW" ? "Needs review" : "Flagged";
      const tone: BandTone = st.trustBand === "VERIFIED" ? "verified" : st.trustBand === "NEEDS_REVIEW" ? "review" : "flagged";
      const note = shot!.lowAcc !== null ? `Location was weak, ±${shot!.lowAcc} m` : shot!.noLoc && shot!.source === "witness" ? "No location recorded" : st.trustBand === "VERIFIED" ? "Location, time and fingerprint check out" : (st.decisive ?? "A person will check it");
      band = { text, tone, note: st.scoreHidden ?? note, mock: st.scoreMock };
    }
    const bits = st?.phash ? hexToBits(st.phash) : shot?.hash ? hexToBits(shot.hash) : ZERO;
    return {
      phase: shownPhase,
      spotName: target ?? "No spot chosen",
      spotShort: spotShort(target),
      coords: coordsText(usedFix),
      acc: usedFix ? usedFix.accuracy : null,
      accText: usedFix ? accText(usedFix.accuracy) : noLoc || geoDenied ? accText(null) : "Finding location…",
      level,
      levelText: levelText(level),
      dot,
      offline: !online,
      lowAcc: !noLoc && !geoDenied && (!fix || fix.accuracy > MAX_ACCURACY_M) && shownPhase === "aim",
      trayPhoto: tray,
      queued,
      stepLabels: stepLabels(offlineShot),
      step: shot ? (offlineShot ? 0 : shot.step) : -1,
      band,
      glyphBits: bits,
      cells: shot?.hash ? hexToBits(shot.hash) : bits,
      chips: (st?.chips ?? []).map((c) => ({ label: c.text, full: c.tone === "good" })),
      seeHref: shot?.assetId ? `/e/${shot.assetId}` : null,
      flySrc: shot?.preview ?? null,
      camera: cameraFail ? CAMERA_TEXT[cameraFail] : null,
    };
  }, [shownPhase, spotInfo, token, noLoc, fix, shot, level, online, tray, queued, geoDenied, cameraFail]);

  const bindScreen = useCallback((h: CaptureHandle | null) => {
    screen.current = h;
  }, []);
  // The video element may mount after the stream opened (or remount): attach whatever is open.
  const bindVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (el && stream.current && el.srcObject !== stream.current) {
      el.srcObject = stream.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  return { view, on, bindScreen, bindVideo };
}
