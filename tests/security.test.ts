/** Pre-deploy hardening: constant-time compares, signatures, upload trust, public-screen moderation, client keys, public errors. */
import { createHash } from "node:crypto";
import cloudinary from "cloudinary";
import { describe, expect, it } from "vitest";
import { screenState } from "@/lib/ai/questions";
import { sanitizeContext } from "@/lib/ingest/tickets";
import { trustedResponse, verifyCloudinaryNotification, verifyCloudinaryUploadResponse } from "@/lib/ingest/verify";
import { publicError } from "@/lib/library";
import { clientKey } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-equal";

const creds = { cloudName: "demo", apiKey: "123", apiSecret: "abcd" };

describe("safeEqual", () => {
  it("compares in constant time and never throws on multi-byte input of the same character count", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("éééééé", "secret")).toBe(false); // 6 characters, 12 bytes: timingSafeEqual would throw
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("Cloudinary signatures, compared by us", () => {
  it("upload responses match the SDK's api_sign_request over public_id and version", () => {
    const signature = cloudinary.v2.utils.api_sign_request({ public_id: "saakshi/evidence/a", version: 17 }, creds.apiSecret);
    expect(verifyCloudinaryUploadResponse({ public_id: "saakshi/evidence/a", version: 17, signature }, creds)).toBe(true);
    expect(verifyCloudinaryUploadResponse({ public_id: "saakshi/evidence/b", version: 17, signature }, creds)).toBe(false);
    expect(verifyCloudinaryUploadResponse({ public_id: "saakshi/evidence/a", version: 17, signature: "ééé" }, creds)).toBe(false);
  });

  it("webhooks: sha1(body + timestamp + secret), within the window and not from the future", () => {
    const body = '{"public_id":"x"}';
    const now = Date.parse("2026-10-02T00:00:00Z");
    const sign = (t: number) => createHash("sha1").update(`${body}${t}abcd`).digest("hex");
    const t = Math.floor(now / 1000) - 60;
    expect(verifyCloudinaryNotification(body, t, sign(t), creds, 7200, now)).toBe(true);
    expect(verifyCloudinaryNotification(body, t, sign(t + 1), creds, 7200, now)).toBe(false);
    const future = Math.floor(now / 1000) + 3600;
    expect(verifyCloudinaryNotification(body, future, sign(future), creds, 7200, now)).toBe(false);
    const old = Math.floor(now / 1000) - 7300;
    expect(verifyCloudinaryNotification(body, old, sign(old), creds, 7200, now)).toBe(false);
  });
});

describe("upload trust", () => {
  it("confirm ingests the provider's record, keeping only the signed public_id and version from the browser", () => {
    const r = trustedResponse(
      { public_id: "saakshi/evidence/a", version: 3, signature: "s" },
      { assetId: "aid", etag: "e1", phash: "0123456789abcdef", width: 1600, height: 1200, format: "jpg", bytes: 1000, facesCount: 2, qualityScore: 0.7, mediaMetadata: { Make: "NIKON" } },
    );
    expect(r).toMatchObject({ public_id: "saakshi/evidence/a", version: 3, etag: "e1", phash: "0123456789abcdef", width: 1600, quality_analysis: { focus: 0.7 }, media_metadata: { Make: "NIKON" } });
    expect(r.faces).toHaveLength(2);
  });

  it("a witness upload needs a capture token; anything else is a gallery upload", () => {
    expect(sanitizeContext({ source: "witness" }).source).toBe("upload");
    expect(sanitizeContext({ source: "witness", token: "t" }).source).toBe("witness");
  });
});

describe("public screens", () => {
  it("a photo is pending until moderated, unfit when unsafe, rejected or unanswered, else fit", () => {
    expect(screenState({ moderation: null, pipeline: { steps: { analyze: { status: "running" } } } })).toBe("pending");
    expect(screenState({ moderation: null, pipeline: { steps: {} } })).toBe("pending");
    expect(screenState({ moderation: null, pipeline: { steps: { analyze: { status: "error" } } } })).toBe("unfit");
    expect(screenState({ moderation: { status: "pending", answers: { unsafe_content: false } } })).toBe("fit");
    expect(screenState({ moderation: { status: "pending", answers: { unsafe_content: true } } })).toBe("unfit");
    expect(screenState({ moderation: { status: "rejected", answers: {} } })).toBe("unfit");
  });
});

describe("clientKey", () => {
  const req = (h: Record<string, string>) => new Request("https://x", { headers: h });
  it("prefers the IP the platform vouches for over a client-supplied X-Forwarded-For", () => {
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientKey(req({}))).toBe("local");
  });
});

describe("publicError", () => {
  it("hides provider error text in production, keeps it in development", () => {
    expect(publicError("Cloudinary 401: Invalid Signature 1a2b…", { production: true })).toBe("This step failed; it will be retried.");
    expect(publicError("Cloudinary 401", { production: false })).toBe("Cloudinary 401");
    expect(publicError(null, { production: true })).toBeNull();
  });
});
