"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { captureFrame, fetchAssetStatus, uploadImage, type UploadReason } from "@/lib/client/upload";

const MAX_ACCURACY_M = 100;

interface TokenInfo {
  token: string;
  expiresAt: string;
  project: { id: string; name: string; slug: string } | null;
  spot: { id: string; name: string; slug: string } | null;
}

type CameraState = "starting" | "live" | "denied" | "unsupported" | "insecure" | "error";
type LocationState = "waiting" | "ok" | "denied" | "unavailable" | "unsupported";

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface Shot {
  key: string;
  preview: string;
  source: "witness" | "upload";
  phase: "uploading" | "processing" | "ready" | "failed";
  assetId?: string;
  attested?: boolean;
  reasons?: UploadReason[];
  lowAccuracy?: boolean;
  error?: string;
}

async function fetchToken(project: string | null, spot: string | null): Promise<TokenInfo> {
  const res = await fetch("/api/capture/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: project ?? undefined, spot: spot ?? undefined }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as TokenInfo;
}

/** Opens the rear camera. Returns the resulting state rather than setting it. */
async function openCamera(): Promise<{ state: CameraState; stream?: MediaStream; error?: string }> {
  if (!window.isSecureContext) return { state: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { state: "unsupported" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    return { state: "live", stream };
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return { state: "denied" };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { state: "unsupported" };
    return { state: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

const noSubscribe = () => () => {};
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function CaptureClient({ project, spot }: { project: string | null; spot: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationState>("waiting");
  const [fix, setFix] = useState<Fix | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);

  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const geoSupported = useSyncExternalStore(noSubscribe, () => "geolocation" in navigator, () => true);
  const location: LocationState = geoSupported ? locationStatus : "unsupported";

  // --- capture token (refreshed a minute before it expires) -------------------------------
  const requestToken = useCallback(
    () =>
      fetchToken(project, spot).then(
        (t) => {
          setToken(t);
          setTokenError(null);
          return t;
        },
        (err: unknown) => {
          setTokenError(err instanceof Error ? err.message : String(err));
          return null;
        },
      ),
    [project, spot],
  );

  useEffect(() => {
    let live = true;
    fetchToken(project, spot).then(
      (t) => {
        if (!live) return;
        setToken(t);
        setTokenError(null);
      },
      (err: unknown) => {
        if (live) setTokenError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      live = false;
    };
  }, [project, spot]);

  useEffect(() => {
    if (!token) return;
    const ms = Date.parse(token.expiresAt) - Date.now() - 60_000;
    const t = setTimeout(() => void requestToken(), Math.max(5_000, ms));
    return () => clearTimeout(t);
  }, [token, requestToken]);

  // --- camera -------------------------------------------------------------------------------
  const applyCamera = useCallback(async (r: Awaited<ReturnType<typeof openCamera>>) => {
    if (r.stream) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = r.stream;
      if (videoRef.current) {
        videoRef.current.srcObject = r.stream;
        await videoRef.current.play().catch(() => undefined);
      }
    }
    setCamera(r.state);
    setCameraError(r.error ?? null);
  }, []);

  const retryCamera = useCallback(() => {
    setCamera("starting");
    void openCamera().then(applyCamera);
  }, [applyCamera]);

  useEffect(() => {
    void openCamera().then(applyCamera);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [applyCamera]);

  // --- location -----------------------------------------------------------------------------
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp });
        setLocationStatus("ok");
      },
      (e) => setLocationStatus(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // --- tray ---------------------------------------------------------------------------------
  const patchShot = (key: string, patch: Partial<Shot>) => setShots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const pollUntilDone = useCallback(async (key: string, assetId: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const st = await fetchAssetStatus(assetId);
        if (st.failed) return patchShot(key, { phase: "failed", error: st.steps.find((s) => s.status === "error")?.error ?? "Pipeline step failed" });
        if (st.status !== "processing") return patchShot(key, { phase: "ready" });
      } catch {
        // transient: keep polling
      }
    }
  }, []);

  async function send(blob: Blob, filename: string, source: Shot["source"], context: Record<string, string | undefined>, lowAccuracy = false) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setShots((all) => [{ key, preview: URL.createObjectURL(blob), source, phase: "uploading", lowAccuracy }, ...all]);
    try {
      const out = await uploadImage(blob, filename, context);
      patchShot(key, { phase: "processing", assetId: out.assetId, attested: out.attested, reasons: out.reasons });
      void pollUntilDone(key, out.assetId);
    } catch (err) {
      patchShot(key, { phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function shutter() {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      let t = token;
      if (!t || Date.parse(t.expiresAt) < Date.now() + 10_000) t = await requestToken();
      const blob = await captureFrame(videoRef.current, 2048, 0.9);
      const low = !fix || fix.accuracy > MAX_ACCURACY_M;
      await send(
        blob,
        `witness-${Date.now()}.jpg`,
        "witness",
        {
          source: "witness",
          token: t?.token,
          client_captured_at: new Date().toISOString(),
          device_lat: fix ? String(fix.lat) : undefined,
          device_lng: fix ? String(fix.lng) : undefined,
          device_accuracy_m: fix ? String(Math.round(fix.accuracy)) : undefined,
          fix_timestamp: fix ? new Date(fix.timestamp).toISOString() : undefined,
          low_accuracy: low ? "1" : undefined,
          project: project ?? undefined,
          spot: spot ?? undefined,
        },
        low,
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
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
    }
  }

  const canShoot = camera === "live" && online && !busy && !!token;
  const lowAccuracy = !fix || fix.accuracy > MAX_ACCURACY_M;
  const target = token?.spot ? token.spot.name : token?.project?.name;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Witness Capture</h1>
        <p className="text-sm text-muted-foreground" data-testid="capture-target">
          {target ? (
            <>
              Capturing for <span className="font-medium text-foreground">{target}</span>
            </>
          ) : (
            "No project selected: photos are sorted automatically."
          )}
          {tokenError ? <span className="text-destructive"> · {tokenError}</span> : null}
        </p>
      </div>

      {!online ? (
        <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          You&apos;re offline. Photos can&apos;t be uploaded until you reconnect (there is no offline queue yet).
        </p>
      ) : null}

      <div className="relative overflow-hidden rounded-lg border bg-black">
        <video ref={videoRef} playsInline muted autoPlay className={camera === "live" ? "aspect-[3/4] w-full object-cover" : "hidden"} />
        {camera !== "live" ? (
          <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/85">
            <CameraMessage state={camera} error={cameraError} onRetry={retryCamera} />
          </div>
        ) : null}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 p-2">
          <LocationBadge state={location} fix={fix} />
          {token ? <Badge variant="secondary">token until {new Date(token.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Badge> : null}
        </div>
      </div>

      {camera === "live" && lowAccuracy ? (
        <p className="text-sm text-destructive">
          {fix ? `Location accuracy is ±${Math.round(fix.accuracy)} m (needs ≤${MAX_ACCURACY_M} m).` : "No location fix yet."} You can still take the photo; it will be
          saved with a low-accuracy warning and won&apos;t be attested.
        </p>
      ) : null}

      {camera === "live" ? (
        <Button size="lg" className="h-14 text-base" onClick={shutter} disabled={!canShoot} aria-label="Take photo">
          {busy ? "Capturing…" : lowAccuracy ? "Take photo (low accuracy)" : "Take photo"}
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{camera === "live" ? "Upload from gallery" : "Add photos"}</CardTitle>
          <CardDescription>Gallery photos are saved as uploads, not witness captures: they weren&apos;t taken live with a capture token.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            Choose photos…
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void uploadFiles(e.target.files)} disabled={!online} />
          </label>
          {camera !== "live" ? (
            <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted">
              Open phone camera…
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void uploadFiles(e.target.files)} disabled={!online} />
            </label>
          ) : null}
        </CardContent>
      </Card>

      {shots.length ? (
        <section aria-label="Shot tray" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">This session</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shots.map((s) => (
              <li key={s.key} className="overflow-hidden rounded-md border" data-testid="shot" data-phase={s.phase} data-attested={String(!!s.attested)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={s.preview} alt="" className="aspect-square w-full object-cover" />
                <div className="flex flex-col gap-1 p-2 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={s.phase === "failed" ? "destructive" : "secondary"}>{s.phase === "ready" ? "ready · scoring in Phase 4" : s.phase}</Badge>
                    {s.source === "witness" && s.attested !== undefined ? <Badge variant={s.attested ? "default" : "outline"}>{s.attested ? "attested" : "not attested"}</Badge> : null}
                    {s.source === "upload" ? <Badge variant="outline">upload</Badge> : null}
                  </div>
                  {s.error ? <span className="text-destructive">{s.error}</span> : null}
                  {s.reasons?.length && s.source === "witness" ? <span className="text-muted-foreground">{s.reasons.map((r) => r.message).join(" ")}</span> : null}
                  {s.assetId ? (
                    <Link href={`/library?asset=${s.assetId}`} className="text-muted-foreground underline-offset-2 hover:underline">
                      View in library
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LocationBadge({ state, fix }: { state: LocationState; fix: Fix | null }) {
  if (state === "ok" && fix) {
    return <Badge variant={fix.accuracy <= MAX_ACCURACY_M ? "default" : "destructive"}>GPS ±{Math.round(fix.accuracy)} m</Badge>;
  }
  const text = { waiting: "Finding location…", denied: "Location denied", unavailable: "Location unavailable", unsupported: "No GPS", ok: "GPS" }[state];
  return <Badge variant={state === "waiting" ? "secondary" : "destructive"}>{text}</Badge>;
}

function CameraMessage({ state, error, onRetry }: { state: CameraState; error: string | null; onRetry: () => void }) {
  switch (state) {
    case "starting":
      return <p>Starting the camera… Allow camera access when your browser asks.</p>;
    case "denied":
      return (
        <>
          <p className="font-medium">Camera access is blocked.</p>
          <p>
            To fix it: tap the lock or camera icon in the address bar → Permissions → Camera → Allow, then reload. On iPhone: Settings → Safari → Camera → Allow.
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </>
      );
    case "insecure":
      return <p>Camera and GPS need HTTPS. Open this page through the HTTPS tunnel (see README: “Phone testing”).</p>;
    case "unsupported":
      return <p>This device has no usable camera in the browser. Use “Open phone camera” below; those photos are saved as uploads, not witness captures.</p>;
    default:
      return (
        <>
          <p>The camera failed to start{error ? `: ${error}` : ""}.</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </>
      );
  }
}
