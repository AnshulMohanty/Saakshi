/** The shape of data/archive-candidates.json (written by archive:discover, read by demo:import). */
import type { CommonsFile } from "./parse";

export type Candidate = Pick<
  CommonsFile,
  | "pageId" | "externalId" | "title" | "descriptionUrl" | "thumbUrl" | "thumbWidth" | "thumbHeight" | "width" | "height"
  | "mime" | "sha1" | "author" | "license" | "licenseClass" | "licenseUrl" | "attributionRequired" | "description"
  | "date" | "lat" | "lng" | "gpsSource" | "make" | "model"
> & {
  /** Discovery query ids that returned this file. */
  groups: string[];
};

export interface ArchiveCandidates {
  generatedAt: string;
  queries: string[];
  files: Candidate[];
}

export function toCandidate(f: CommonsFile, groups: string[]): Candidate {
  return {
    pageId: f.pageId, externalId: f.externalId, title: f.title, descriptionUrl: f.descriptionUrl, thumbUrl: f.thumbUrl,
    thumbWidth: f.thumbWidth, thumbHeight: f.thumbHeight, width: f.width, height: f.height, mime: f.mime, sha1: f.sha1,
    author: f.author, license: f.license, licenseClass: f.licenseClass, licenseUrl: f.licenseUrl,
    attributionRequired: f.attributionRequired, description: f.description?.slice(0, 300) ?? null, date: f.date,
    lat: f.lat, lng: f.lng, gpsSource: f.gpsSource, make: f.make, model: f.model, groups,
  };
}
