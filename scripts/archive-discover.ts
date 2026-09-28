/**
 * `pnpm archive:discover`: runs the demo discovery queries against Wikimedia Commons (no API
 * key), prints per-query stats and the top geographic clusters, and saves the usable files to
 * data/archive-candidates.json. API responses are cached, so re-runs are offline.
 *   --offline   use only the cache
 */
import "./_env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_DATASET, DISCOVERY_QUERIES } from "../data/demo-dataset.config";
import { dbscan } from "../lib/archive/cluster";
import { CommonsClient, packageRepoUrl } from "../lib/archive/commons";
import { buildDemoDataset, clusterPairability } from "../lib/archive/build";
import { isUsable, rejectReasons, type CommonsFile } from "../lib/archive/parse";
import { toCandidate, type ArchiveCandidates, type Candidate } from "../lib/archive/candidates";
import { MockGeocoder } from "../lib/providers/geocoder/mock";

const OUT = path.join(process.cwd(), "data", "archive-candidates.json");

async function main() {
  const offline = process.argv.includes("--offline");
  const contactEmail = process.env.APP_CONTACT_EMAIL?.trim() || undefined;
  const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
  const repoUrl = process.env.APP_REPO_URL?.trim() || packageRepoUrl(pkg);
  if (!contactEmail && !repoUrl && !offline) {
    console.warn("⚠ Neither APP_CONTACT_EMAIL nor APP_REPO_URL is set. Wikimedia asks for contact details in the User-Agent and throttles anonymous clients harder.\n");
  }
  const client = new CommonsClient({
    cacheDir: path.resolve(process.env.ARCHIVE_CACHE_DIR || "./.data/archive-cache"),
    contactEmail,
    repoUrl,
    offline,
    log: (m) => console.log(m),
  });
  const cityOf = new MockGeocoder(); // offline nearest-city label, for display only

  const byPage = new Map<number, Candidate>();
  const rows: string[][] = [];
  for (const q of DISCOVERY_QUERIES) {
    const found = new Map<number, CommonsFile>();
    for (const term of q.search ?? []) {
      process.stdout.write(`… ${q.id}: search ${term.replace(/ nearcoord:\S+/, " (geotagged, India)")}\n`);
      for (const f of await client.search(term, q.limit ?? 200)) found.set(f.pageId, f);
    }
    for (const cat of q.categories ?? []) {
      process.stdout.write(`… ${q.id}: ${cat}\n`);
      for (const f of await client.category(cat, q.limit ?? 300)) found.set(f.pageId, f);
    }
    const files = [...found.values()];
    const usable = files.filter(isUsable);
    const geo = usable.filter((f) => f.lat !== null);
    const dated = usable.filter((f) => f.date !== null);
    const years = dated.map((f) => Number(f.date!.local.slice(0, 4))).sort();
    const { clusters } = dbscan(geo, (f) => ({ lat: f.lat!, lng: f.lng! }), { epsM: DEMO_DATASET.clusterEpsM, minPts: DEMO_DATASET.clusterMinPts });
    const gap = DEMO_DATASET.minPairGapHours[q.activity];
    const top = await Promise.all(
      clusters.slice(0, 3).map(async (c) => {
        const place = (await cityOf.reverse(c.centroid.lat, c.centroid.lng))?.split(",")[0].replace("Near ", "~") ?? `${c.centroid.lat.toFixed(2)},${c.centroid.lng.toFixed(2)}`;
        const pair = clusterPairability(c.members.map((m) => toCandidate(m, [q.id])), DEMO_DATASET, gap);
        return `${c.members.length}@${place}(p${pair.score})`;
      }),
    );
    rows.push([q.id, String(files.length), String(usable.length), String(geo.length), String(dated.length), years.length ? `${years[0]}–${years.at(-1)}` : "—", top.join(" ") || "—"]);

    for (const f of usable) {
      const existing = byPage.get(f.pageId);
      if (existing) existing.groups = [...new Set([...existing.groups, q.id])];
      else byPage.set(f.pageId, toCandidate(f, [q.id]));
    }
    const rejected = files.length - usable.length;
    if (rejected) {
      const counts = new Map<string, number>();
      for (const f of files) for (const r of rejectReasons(f)) counts.set(r, (counts.get(r) ?? 0) + 1);
      console.log(`  rejected ${rejected}: ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
  }

  const header = ["query", "found", "license-ok", "geotagged", "dated", "years", "top clusters (size@place(pPairability), eps 1.5 km)"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join("  ");
  console.log(`\n${line(header)}\n${widths.map((w) => "-".repeat(w)).join("  ")}`);
  for (const r of rows) console.log(line(r));

  const candidates = [...byPage.values()].sort((a, b) => a.pageId - b.pageId);
  const out: ArchiveCandidates = { generatedAt: new Date().toISOString(), queries: DISCOVERY_QUERIES.map((q) => q.id), files: candidates };
  await mkdir(path.dirname(OUT), { recursive: true });
  // One file per line: compact but diff-friendly.
  const body = out.files.map((f) => JSON.stringify(f)).join(",\n");
  await writeFile(OUT, `{"generatedAt":${JSON.stringify(out.generatedAt)},"queries":${JSON.stringify(out.queries)},"files":[\n${body}\n]}\n`);
  const geoCount = candidates.filter((c) => c.lat !== null).length;
  console.log(`\nSaved ${candidates.length} usable files (${geoCount} geotagged) to ${path.relative(process.cwd(), OUT)}. Network requests: ${client.requests}.`);

  // What demo:import will build: clusters ranked by pairability, then photo count.
  const plan = buildDemoDataset(candidates, DEMO_DATASET);
  console.log("\nProject ranking (pairability = same-spot photo pairs meeting the pair gap):");
  for (const rule of DEMO_DATASET.projects) {
    const ranked = plan.ranking[rule.key] ?? [];
    const chosen = plan.projects.find((p) => p.key === rule.key);
    console.log(`  ${rule.key} ${rule.slug}: ${ranked.map((r, i) => `${i === 0 ? "▶ " : ""}${r.size} photos, ${r.spots} spot(s), pairability ${r.pairability.score}`).join(" | ") || "no cluster"}`);
    if (chosen) console.log(`     → ${chosen.label}: ${chosen.files.length} photos, ${chosen.spots.length} spot(s), ${chosen.pairability.selected.pairs} pairs (gap ${chosen.minPairGapHours} h)`);
  }
  for (const w of plan.warnings) console.log(`  ! ${w}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
