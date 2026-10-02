/**
 * Wikimedia Commons API client, written to the API etiquette:
 * - descriptive User-Agent with contact details (APP_CONTACT_EMAIL),
 * - one request at a time with a minimum gap, maxlag=5,
 * - back-off on 429/5xx/maxlag, honouring Retry-After,
 * - every API response and downloaded file cached under ARCHIVE_CACHE_DIR, so re-runs
 *   (and `demo:reset`) work offline and pick the same files.
 * https://www.mediawiki.org/wiki/API:Etiquette
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseQueryResponse, type CommonsFile } from "./parse";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
export const THUMB_WIDTH = 1920;
const IIPROP = "url|size|mime|sha1|extmetadata|commonmetadata";
const EXTMETADATA = [
  "DateTimeOriginal", "GPSLatitude", "GPSLongitude", "Artist", "LicenseShortName", "LicenseUrl",
  "AttributionRequired", "ImageDescription", "UsageTerms", "Restrictions",
].join("|");

export class ArchiveOfflineError extends Error {
  constructor(what: string) {
    super(`Not in the archive cache and offline mode is on: ${what}`);
    this.name = "ArchiveOfflineError";
  }
}

export interface CommonsClientOptions {
  cacheDir: string;
  contactEmail?: string;
  /** Project URL for the User-Agent when there is no contact email. */
  repoUrl?: string;
  /** Never touch the network; cache misses throw ArchiveOfflineError. */
  offline?: boolean;
  /** Minimum gap between requests (ms). */
  minIntervalMs?: number;
  maxAttempts?: number;
  log?: (message: string) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Wikimedia asks for contact details: APP_CONTACT_EMAIL if set, else the repository URL
 * (APP_REPO_URL or package.json "repository"). Never an invented address.
 */
export function commonsUserAgent({ contactEmail, repoUrl }: { contactEmail?: string; repoUrl?: string } = {}): string {
  const contact = contactEmail ?? repoUrl ?? "no contact configured: set APP_CONTACT_EMAIL or APP_REPO_URL";
  return `SaakshiDemoImporter/0.1 (+${contact}; Code Cubicle hackathon demo importer) node/${process.versions.node}`;
}

/** package.json "repository" (string or { url }), if any. */
export function packageRepoUrl(pkg: { repository?: string | { url?: string } } | null | undefined): string | undefined {
  const r = pkg?.repository;
  const url = typeof r === "string" ? r : r?.url;
  return url ? url.replace(/^git\+/, "").replace(/\.git$/, "") : undefined;
}

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export class CommonsClient {
  private readonly ua: string;
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Network requests made (cache hits don't count). */
  requests = 0;

  constructor(private readonly opts: CommonsClientOptions) {
    this.ua = commonsUserAgent({ contactEmail: opts.contactEmail, repoUrl: opts.repoUrl });
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // -------------------------------------------------------------------------------------------
  // Cache

  private cachePath(kind: "api" | "files", key: string, ext: string) {
    // Runtime data directory, not source: keep Turbopack's file tracing out of it.
    return path.join(/*turbopackIgnore: true*/ this.opts.cacheDir, kind, `${key}.${ext}`);
  }

  private async readCache(file: string): Promise<Buffer | null> {
    try {
      return await readFile(file);
    } catch {
      return null;
    }
  }

  private async writeCache(file: string, data: Buffer | string) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }

  // -------------------------------------------------------------------------------------------
  // Serialised, polite fetch with back-off

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.last + (this.opts.minIntervalMs ?? 1000) - Date.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async politeFetch(url: string, what: string): Promise<Response> {
    const max = this.opts.maxAttempts ?? 6;
    for (let attempt = 1; ; attempt++) {
      const res = await this.serial(() => {
        this.requests++;
        return this.fetchImpl(url, { headers: { "user-agent": this.ua, "api-user-agent": this.ua }, signal: AbortSignal.timeout(60_000) });
      });
      let retry = res.status === 429 || res.status >= 500;
      let body: string | null = null;
      if (!retry && url.startsWith(COMMONS_API)) {
        body = await res.text();
        // maxlag comes back as HTTP 200 with error.code "maxlag".
        retry = /"code"\s*:\s*"maxlag"/.test(body);
      }
      if (!retry) return body === null ? res : new Response(body, { status: res.status, headers: res.headers });
      if (attempt >= max) throw new Error(`${what}: gave up after ${attempt} attempts (HTTP ${res.status})`);
      const wait = retryAfterMs(res.headers.get("retry-after")) ?? Math.min(60_000, 2 ** attempt * 1000);
      this.opts.log?.(`  ↻ ${what}: HTTP ${res.status}${body ? " maxlag" : ""}, retrying in ${Math.round(wait / 1000)}s`);
      await res.body?.cancel().catch(() => undefined);
      await this.sleep(wait);
    }
  }

  // -------------------------------------------------------------------------------------------
  // API

  /** action=query with the given params (format/formatversion/maxlag added). Cached by params. */
  async query(params: Record<string, string>): Promise<Record<string, unknown>> {
    const full: Record<string, string> = { action: "query", format: "json", formatversion: "2", maxlag: "5", ...params };
    const sorted = Object.keys(full).sort().map((k) => [k, full[k]]);
    const key = createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
    const file = this.cachePath("api", key, "json");
    const cached = await this.readCache(file);
    if (cached) return JSON.parse(cached.toString("utf8"));
    if (this.opts.offline) throw new ArchiveOfflineError(`query ${JSON.stringify(params).slice(0, 120)}`);

    const url = `${COMMONS_API}?${new URLSearchParams(full)}`;
    const res = await this.politeFetch(url, "Commons API");
    const text = await res.text();
    if (!res.ok) throw new Error(`Commons API HTTP ${res.status}: ${text.slice(0, 200)}`);
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Commons API returned non-JSON: ${text.slice(0, 200)}`);
    }
    if (json.error) throw new Error(`Commons API error: ${JSON.stringify(json.error).slice(0, 300)}`);
    await this.writeCache(file, JSON.stringify(json));
    return json;
  }

  private imageinfoParams(): Record<string, string> {
    return { prop: "imageinfo", iiprop: IIPROP, iiurlwidth: String(THUMB_WIDTH), iiextmetadatafilter: EXTMETADATA, iiextmetadatalanguage: "en" };
  }

  /** Pages through a generator until `limit` files or no `continue`. */
  private async collect(generator: Record<string, string>, limit: number): Promise<CommonsFile[]> {
    const out: CommonsFile[] = [];
    let cont: Record<string, string> = {};
    while (out.length < limit) {
      const json = await this.query({ ...generator, ...this.imageinfoParams(), ...cont });
      out.push(...parseQueryResponse(json as Parameters<typeof parseQueryResponse>[0]));
      const next = json.continue as Record<string, string> | undefined;
      if (!next) break;
      cont = next;
    }
    return out.slice(0, limit);
  }

  /** Full-text search in the File namespace ("filetype:bitmap " is prepended). */
  search(terms: string, limit = 200): Promise<CommonsFile[]> {
    return this.collect({ generator: "search", gsrnamespace: "6", gsrlimit: "50", gsrsearch: `filetype:bitmap ${terms}` }, limit);
  }

  /** Files directly in a category ("Category:…"). */
  category(title: string, limit = 200): Promise<CommonsFile[]> {
    return this.collect({ generator: "categorymembers", gcmtitle: title, gcmtype: "file", gcmlimit: "50" }, limit);
  }

  /** Re-fetches metadata for known page ids (used by the importer). */
  async byPageIds(pageIds: number[]): Promise<CommonsFile[]> {
    const out: CommonsFile[] = [];
    for (let i = 0; i < pageIds.length; i += 50) {
      const json = await this.query({ pageids: pageIds.slice(i, i + 50).join("|"), ...this.imageinfoParams() });
      out.push(...parseQueryResponse(json as Parameters<typeof parseQueryResponse>[0]));
    }
    return out;
  }

  /** Downloads the ~1920px thumbnail (not the original: free Cloudinary caps uploads at 10 MB). */
  async downloadThumb(file: Pick<CommonsFile, "pageId" | "thumbUrl" | "mime">): Promise<Buffer> {
    if (!file.thumbUrl) throw new Error(`File ${file.pageId} has no thumbnail URL`);
    const ext = file.mime === "image/png" ? "png" : "jpg";
    const cachePath = this.cachePath("files", `${file.pageId}-${THUMB_WIDTH}`, ext);
    const cached = await this.readCache(cachePath);
    if (cached) return cached;
    if (this.opts.offline) throw new ArchiveOfflineError(`thumbnail for page ${file.pageId}`);
    const res = await this.politeFetch(file.thumbUrl, `thumbnail ${file.pageId}`);
    if (!res.ok) throw new Error(`Thumbnail ${file.pageId}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await this.writeCache(cachePath, buf);
    return buf;
  }
}
