/**
 * Pure: an asset's ingest inputs → capture time, location and camera, with provenance.
 * Sources: Commons API metadata (archive), provider media_metadata (uploads), Witness Capture
 * device fix + client time (witness). Never reads the clock or the network.
 */
import type { CaptureInfo } from "../db/schema";
import type { LatLng } from "../geo";
import { parseExifDateTime, summarizeExif } from "../media/exif";

export interface CommonsIngest {
  date: { local: string; precision: string } | null;
  lat: number | null;
  lng: number | null;
  make: string | null;
  model: string | null;
}

export interface MetadataInput {
  source: "witness" | "upload" | "archive" | "planted_test";
  ingest?: { commons?: CommonsIngest | null; mediaMetadata?: Record<string, string> | null } | null;
  capture?: CaptureInfo | null;
  defaultOffset: string;
}

export interface ParsedMetadata {
  exifSource: "file" | "commons_api" | "none";
  capturedAt: string | null;
  capturedAtTzAssumed: boolean;
  /** From the source: Commons dates can be day/month/year only; EXIF and Witness Capture are seconds. */
  capturedAtPrecision: "second" | "minute" | "hour" | "day" | "month" | "year" | null;
  exifLat: number | null;
  exifLng: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  /** Best capture location: witness device fix > EXIF/Commons GPS. */
  location: (LatLng & { source: "device" | "exif" | "commons" }) | null;
}

export function parseAssetMetadata({ source, ingest, capture, defaultOffset }: MetadataInput): ParsedMetadata {
  let out: ParsedMetadata = {
    exifSource: "none",
    capturedAt: null,
    capturedAtTzAssumed: false,
    capturedAtPrecision: null,
    exifLat: null,
    exifLng: null,
    cameraMake: null,
    cameraModel: null,
    location: null,
  };

  if (ingest?.commons) {
    const c = ingest.commons;
    // Commons dates never carry a timezone: always assumed.
    const at = c.date ? parseExifDateTime(c.date.local, null, defaultOffset) : null;
    out = {
      ...out,
      exifSource: "commons_api",
      capturedAt: at,
      capturedAtTzAssumed: at !== null,
      capturedAtPrecision: at ? (c.date!.precision as ParsedMetadata["capturedAtPrecision"]) : null,
      exifLat: c.lat,
      exifLng: c.lng,
      cameraMake: c.make,
      cameraModel: c.model,
    };
  } else if (ingest?.mediaMetadata && Object.keys(ingest.mediaMetadata).length > 0) {
    const e = summarizeExif(ingest.mediaMetadata, { defaultOffset });
    if (e) {
      out = {
        ...out,
        exifSource: "file",
        capturedAt: e.takenAt,
        capturedAtTzAssumed: e.takenAtTzAssumed,
        capturedAtPrecision: e.takenAt ? "second" : null,
        exifLat: e.lat,
        exifLng: e.lng,
        cameraMake: e.make,
        cameraModel: e.model,
      };
    }
  }

  if (out.exifLat !== null && out.exifLng !== null) {
    out.location = { lat: out.exifLat, lng: out.exifLng, source: out.exifSource === "commons_api" ? "commons" : "exif" };
  }

  // Witness Capture: the device fix and the client clock (with offset) are the primary evidence.
  if (source === "witness" && capture) {
    if (capture.deviceFix) out.location = { lat: capture.deviceFix.lat, lng: capture.deviceFix.lng, source: "device" };
    if (capture.clientCapturedAt && !Number.isNaN(Date.parse(capture.clientCapturedAt))) {
      out.capturedAt = new Date(capture.clientCapturedAt).toISOString();
      out.capturedAtTzAssumed = false;
      out.capturedAtPrecision = "second";
    }
  }
  return out;
}
