/**
 * Browser upload, provider-agnostic: get a signed ticket from our server, send the file straight
 * to the provider (Cloudinary, or the mock endpoint), then have the server verify the provider's
 * response and ingest it.
 */

export interface UploadReason {
  code: string;
  message: string;
}

export interface UploadOutcome {
  assetId: string;
  source: "witness" | "upload";
  attested: boolean;
  reasons: UploadReason[];
}

export interface AssetStatus {
  id: string;
  status: "processing" | "ready" | "flagged" | "approved" | "rejected";
  steps: Array<{ name: string; status: string; error?: string }>;
  failed: boolean;
  scored: boolean;
  attested: boolean;
  reasons: UploadReason[];
  projectId: string | null;
  spotId: string | null;
  caption: string | null;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string | { message?: string } };
  if (!res.ok) {
    const e = body.error;
    throw new Error((typeof e === "string" ? e : e?.message) ?? `HTTP ${res.status}`);
  }
  return body as T;
}

/** Sends one image. `context` values are strings (see lib/ingest/tickets.ts CONTEXT_KEYS). */
export async function uploadImage(file: Blob, filename: string, context: Record<string, string | undefined>): Promise<UploadOutcome> {
  const clean = Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined && v !== ""));
  const ticket = await json<{ provider: "mock" | "cloudinary"; uploadUrl: string; fields: Record<string, string> }>(
    await fetch("/api/uploads/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: clean }) }),
  );
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) form.set(k, v);
  form.set("file", file, filename);
  const response = await json<Record<string, unknown>>(await fetch(ticket.uploadUrl, { method: "POST", body: form }));
  return json<UploadOutcome>(
    await fetch("/api/uploads/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: ticket.provider, response }),
    }),
  );
}

export async function fetchAssetStatus(assetId: string): Promise<AssetStatus> {
  return json<AssetStatus>(await fetch(`/api/assets/${assetId}/status`, { cache: "no-store" }));
}

/** Draws a video frame into a JPEG no larger than `maxEdge` px on its long side. */
export async function captureFrame(video: HTMLVideoElement, maxEdge = 2048, quality = 0.9): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera is not ready yet");
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode JPEG"))), "image/jpeg", quality));
}
