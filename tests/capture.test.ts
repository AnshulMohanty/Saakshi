import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_CLOCK_SKEW_MS, MAX_FIX_AGE_MS, MAX_UPLOAD_MS, signCaptureToken, TOKEN_TTL_MS, validateCapture, verifyCaptureToken, type TokenRow } from "@/lib/capture/token";
import { createCloudinaryTicket, createMockTicket, sanitizeContext } from "@/lib/ingest/tickets";
import {
  decodeContext,
  encodeContext,
  mockResponseSignature,
  paramsToSign,
  verifyCloudinaryNotification,
  verifyCloudinaryUploadResponse,
  verifyMockTicket,
  verifyMockUploadResponse,
} from "@/lib/ingest/verify";

const SECRET = "test-capture-secret-0123456789abcdef";
const issuedAt = new Date("2025-06-01T04:30:00Z");
const row: TokenRow = { id: "11111111-1111-4111-8111-111111111111", issuedAt, expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS), projectId: "p-a", spotId: null };
const token = signCaptureToken({ tid: row.id, pid: row.projectId, sid: null, iat: issuedAt.getTime(), exp: row.expiresAt.getTime() }, SECRET);
const at = (mins: number) => new Date(issuedAt.getTime() + mins * 60_000);

// Shutter at minute 3: device clock, the server's ticket time a moment later, fix 10 s old.
const ok = {
  token,
  secret: SECRET,
  row,
  clientCapturedAt: at(3).toISOString(),
  ticketIssuedAt: new Date(at(3).getTime() + 800),
  confirmedAt: at(3.5),
  fixTimestamp: new Date(at(3).getTime() - 10_000).toISOString(),
  accuracyM: 12,
  hint: { projectId: "p-a" },
};
const codes = (input: Parameters<typeof validateCapture>[0]) => validateCapture(input).reasons.map((r) => r.code);

describe("capture tokens", () => {
  it("signs and verifies, rejecting tampering and other secrets", () => {
    expect(verifyCaptureToken(token, SECRET)).toMatchObject({ tid: row.id, pid: "p-a" });
    const [p, body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), pid: "p-b" })).toString("base64url");
    expect(verifyCaptureToken(`${p}.${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyCaptureToken(token, "another-secret")).toBeNull();
    expect(verifyCaptureToken("garbage", SECRET)).toBeNull();
  });

  it("attests a valid capture", () => {
    expect(validateCapture(ok)).toMatchObject({ attested: true, reasons: [] });
  });

  it("rejects missing, forged and unknown tokens", () => {
    expect(codes({ ...ok, token: null })).toContain("no_token");
    expect(codes({ ...ok, token: token.slice(0, -2) + "xx" })).toContain("bad_token");
    expect(codes({ ...ok, row: null })).toContain("unknown_token");
  });

  const shotAt = (mins: number) => ({
    clientCapturedAt: at(mins).toISOString(),
    ticketIssuedAt: at(mins),
    confirmedAt: at(mins + 0.5),
    fixTimestamp: at(mins).toISOString(),
  });

  it("rejects expired tokens (at the shutter) and captures outside the token window", () => {
    expect(codes({ ...ok, ...shotAt(16) })).toEqual(["expired"]);
    expect(codes({ ...ok, ...shotAt(-5) })).toEqual(["outside_window"]);
  });

  it("anchors the device clock to the server's ticket time (2 min)", () => {
    const skewed = (ms: number) => ({ ...ok, ticketIssuedAt: new Date(at(3).getTime() + ms) });
    expect(codes(skewed(MAX_CLOCK_SKEW_MS + 1000))).toEqual(["clock_skew"]);
    expect(codes(skewed(-(MAX_CLOCK_SKEW_MS + 1000)))).toEqual(["clock_skew"]);
    expect(codes(skewed(MAX_CLOCK_SKEW_MS - 1000))).toEqual([]);
    expect(codes({ ...ok, ticketIssuedAt: null })).toEqual(["no_ticket"]);
    expect(codes({ ...ok, clientCapturedAt: null })).toEqual(["no_client_time"]);
  });

  it("accepts slow uploads up to 30 minutes after the ticket, not later", () => {
    expect(codes({ ...ok, confirmedAt: new Date(ok.ticketIssuedAt.getTime() + MAX_UPLOAD_MS - 1000) })).toEqual([]);
    expect(codes({ ...ok, confirmedAt: new Date(ok.ticketIssuedAt.getTime() + MAX_UPLOAD_MS + 1000) })).toEqual(["late_upload"]);
  });

  it("requires a GPS fix at most 60 s old at the shutter", () => {
    expect(codes({ ...ok, fixTimestamp: new Date(at(3).getTime() - MAX_FIX_AGE_MS + 1000).toISOString() })).toEqual([]);
    expect(codes({ ...ok, fixTimestamp: new Date(at(3).getTime() - MAX_FIX_AGE_MS - 1000).toISOString() })).toEqual(["stale_fix"]);
    expect(codes({ ...ok, fixTimestamp: null })).toEqual(["stale_fix"]);
  });

  it("rejects a photo claiming a different project than its token", () => {
    expect(codes({ ...ok, hint: { projectId: "p-b" } })).toEqual(["wrong_project"]);
    expect(codes({ ...ok, hint: { projectId: null } })).toEqual([]);
  });

  it("rejects low or missing location accuracy", () => {
    expect(codes({ ...ok, accuracyM: 100 })).toEqual([]);
    expect(codes({ ...ok, accuracyM: 101 })).toEqual(["low_accuracy"]);
    expect(codes({ ...ok, accuracyM: null })).toEqual(["no_location"]);
  });
});

describe("upload verification", () => {
  it("mock: tickets and responses are HMAC-signed", () => {
    const t = createMockTicket({ source: "witness", token: "x" }, "key", new Date("2025-01-01T00:00:00Z"));
    const { signature, ...params } = t.fields;
    expect(t.provider).toBe("mock");
    expect(verifyMockTicket(params, signature, "key")).toBe(true);
    expect(verifyMockTicket({ ...params, context: "source=upload" }, signature, "key")).toBe(false);

    const r = { public_id: "saakshi/evidence/abc", version: 1717200000, signature: mockResponseSignature("saakshi/evidence/abc", 1717200000, "key") };
    expect(verifyMockUploadResponse(r, "key")).toBe(true);
    expect(verifyMockUploadResponse({ ...r, public_id: "saakshi/evidence/abd" }, "key")).toBe(false);
    expect(verifyMockUploadResponse({ ...r, version: 1 }, "key")).toBe(false);
    expect(verifyMockUploadResponse(r, "other")).toBe(false);
  });

  const creds = { cloudName: "demo", apiKey: "123456789012345", apiSecret: "abcd" };

  it("Cloudinary: upload-response signature, known vector via the SDK helper", () => {
    // Cloudinary signs "public_id=<id>&version=<v>" + api_secret with SHA-1 (hex).
    const expected = createHash("sha1").update("public_id=saakshi/evidence/abc&version=1717200000abcd").digest("hex");
    const r = { public_id: "saakshi/evidence/abc", version: 1717200000, signature: expected };
    expect(verifyCloudinaryUploadResponse(r, creds)).toBe(true);
    expect(verifyCloudinaryUploadResponse({ ...r, version: 1717200001 }, creds)).toBe(false);
    expect(verifyCloudinaryUploadResponse(r, { ...creds, apiSecret: "wrong" })).toBe(false);
  });

  it("Cloudinary: webhook notification signature, known vector", () => {
    const body = '{"notification_type":"upload","public_id":"saakshi/evidence/abc"}';
    const now = Math.floor(Date.now() / 1000);
    const sig = createHash("sha1").update(`${body}${now}abcd`).digest("hex");
    expect(verifyCloudinaryNotification(body, now, sig, creds)).toBe(true);
    expect(verifyCloudinaryNotification(body.replace("abc", "abd"), now, sig, creds)).toBe(false);
    const old = now - 3 * 3600;
    expect(verifyCloudinaryNotification(body, old, createHash("sha1").update(`${body}${old}abcd`).digest("hex"), creds)).toBe(false);
  });

  it("Cloudinary: direct-upload ticket signs every param except api_key", () => {
    const t = createCloudinaryTicket({ source: "witness" }, creds, "https://saakshi.example", new Date("2025-01-01T00:00:00Z"));
    const { signature, api_key, ...params } = t.fields;
    expect(api_key).toBe(creds.apiKey);
    expect(params).toMatchObject({ type: "authenticated", asset_folder: "saakshi/evidence", media_metadata: "true", phash: "true", quality_analysis: "true", faces: "true", moderation: "manual", tags: "saakshi", notification_url: "https://saakshi.example/api/webhooks/cloudinary" });
    expect(params.public_id).toMatch(/^saakshi\/evidence\/[a-z0-9]{12,16}$/);
    expect(t.publicId).toBe(params.public_id);
    expect(params.folder).toBeUndefined();
    expect(signature).toBe(createHash("sha1").update(`${paramsToSign(params)}abcd`).digest("hex"));
    expect(t.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
  });

  it("encodes Cloudinary context and only accepts known keys", () => {
    const ctx = { filename: "a=b|c.jpg", source: "witness" };
    expect(decodeContext(encodeContext(ctx))).toEqual(ctx);
    expect(sanitizeContext({ source: "witness", device_lat: 12.9, evil: "x", token: "t" })).toEqual({ source: "witness", device_lat: "12.9", token: "t" });
    expect(sanitizeContext({ source: "admin" }).source).toBe("upload");
  });
});
