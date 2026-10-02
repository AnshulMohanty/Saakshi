/** Shared helpers for the demo importer, planted tests and reset. */
import { createHash } from "node:crypto";
import type { ProjectType } from "../../../data/demo-dataset.config";
import type { Candidate } from "../archive/candidates";
import type { CommonsIngest } from "../pipeline/metadata";
import type { Attribution } from "../db/schema";

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "Mannarai, Tiruppur, Tamil Nadu, India" → "Tiruppur"; "Near Coimbatore, Tamil Nadu, India" → "Coimbatore". */
export function shortPlace(place: string | null): string | null {
  if (!place) return null;
  // OSM sometimes joins words ("TiruppurNorth"): split lower→Upper boundaries.
  const parts = place
    .split(",")
    .map((p) => p.trim().replace(/^Near\s+/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"))
    .filter(Boolean);
  if (parts.length >= 4) return parts[1];
  return parts[0] ?? null;
}

/** Deterministic project descriptions (not LLM text): used for display and the project embedding. */
export function projectDescription(type: ProjectType, label: string, place: string): string {
  switch (type) {
    case "water":
      return `${label} at ${place}: clearing rubbish and plastic from the water body and its banks. Photos document the shore before and after the clean-up.`;
    case "plantation":
      return `${label} at ${place}: planting saplings and young trees. Photos document planting day and the saplings as they grow.`;
    case "school":
      return `${label} at ${place}: repairing and renovating a school. Photos document classrooms before and after the work.`;
    default:
      return `${label} at ${place}: volunteers removing litter, plastic and garbage. Photos document the site before and after the clean-up.`;
  }
}

export function attributionOf(c: Candidate): Attribution {
  return { author: c.author, license: c.license, license_url: c.licenseUrl, source_url: c.descriptionUrl, title: c.title.replace(/^File:/, "") };
}

export function commonsIngest(c: Candidate): CommonsIngest {
  return { date: c.date ? { local: c.date.local, precision: c.date.precision } : null, lat: c.lat, lng: c.lng, make: c.make, model: c.model };
}

/** Cloudinary context values: short, no separators. */
export function contextValue(s: string | null | undefined, max = 200): string {
  return (s ?? "").replace(/[|=]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export type Logger = (message: string) => void;

/** Anything that can fetch a candidate's (cached) thumbnail. */
export interface ThumbSource {
  downloadThumb(file: Pick<Candidate, "pageId" | "thumbUrl" | "mime">): Promise<Buffer>;
}

/** Namespace for Saakshi demo ids (fixed, arbitrary). */
export const DEMO_NAMESPACE = "8d0f4c3a-2b1e-5d7c-9a6b-3e4f5a6b7c8d";

/** RFC 4122 version-5 (SHA-1, name-based) UUID: the same name always gives the same id. */
export function uuidv5(name: string, namespace = DEMO_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const demoProjectId = (slug: string) => uuidv5(`project:${slug}`);
export const demoSpotId = (spotSlug: string) => uuidv5(`spot:${spotSlug}`);
export const demoSpotSlug = (projectSlug: string, index: number) => `${projectSlug}-spot-${index + 1}`;
