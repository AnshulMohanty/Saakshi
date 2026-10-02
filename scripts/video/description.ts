/**
 * `pnpm video:description`: video/preview/DESCRIPTION.md, the YouTube description for both preview
 * videos: what they show, the preview note, the music, and a credit for every Wikimedia Commons
 * photo in the demo archive (every photo the footage can show), read from the database. Run it
 * with the server stopped (PGlite: one process).
 */
import "../_env";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { closeDb, getDb } from "../../src/lib/db/client";
import { assets, projects } from "../../src/lib/db/schema";
import { END_NOTE } from "./render";

async function main() {
  const db = await getDb();
  const rows = await db
    .select({ title: assets.attribution, project: projects.name })
    .from(assets)
    .leftJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.source, "archive"), isNotNull(assets.attribution)))
    .orderBy(asc(projects.name), asc(assets.id));
  const byProject = new Map<string, string[]>();
  for (const r of rows) {
    const a = r.title!;
    const line = `- ${(a.title ?? "Untitled").replace(/^File:/, "").replace(/\.(jpe?g|png)$/i, "")}, by ${a.author ?? "unknown"}, ${a.license ?? "licence unknown"}${a.source_url ? `: ${a.source_url}` : ""}`;
    const k = r.project ?? "Not assigned to a project";
    byProject.set(k, [...(byProject.get(k) ?? []), line]);
  }
  const md = [
    "# Saakshi: preview videos",
    "",
    "Two videos of the same build: **Saakshi: launch film (preview)**, 88 s, and **Saakshi: 3-minute walkthrough (preview)**.",
    "",
    "Saakshi (साक्षी, \"witness\") turns field photos from NGOs and community groups into verified, measured, traceable proof of impact. Every number in a report links to the photos behind it; trust scores come from fixed, published rules; faces stay blurred on signed links that cannot be edited. Built for Code Cubicle 6.0 (PS02, Cloudinary track).",
    "",
    "## Preview note",
    "",
    END_NOTE,
    "",
    "- **Real:** the photos (Wikimedia Commons, credited below), their locations and dates from the Commons records, the perceptual fingerprints and duplicate matches, the distances, and the trust rules and their scores.",
    "- **Prototype:** litter masks come from a colour heuristic until the segmentation service is connected; they are badged \"Prototype measurement\". AI captions, tags and moderation answers are not shown (\"AI reading pending\").",
    "- **Test inputs:** four planted fakes (a reused photo, a stock-site watermark, a photo taken far from the site, a drawn-on location stamp) are labelled \"Test input\".",
    "- **Operator rehearsal:** the Witness Wall arrival is a rehearsal replay, labelled on screen.",
    "- **Simulated camera:** the capture scene uses the browser's fake camera, showing an archive photo at the spot's own coordinates (labelled). Saakshi sends it to review because the identical file was already submitted; the check-in is deleted after recording.",
    "",
    "All footage is the real product, recorded frame by frame from the production build. No stock footage, no AI-generated images, no voiceover.",
    "",
    "## Music",
    "",
    "\"Happy Beats / Business Moves\", Vol. 11 (launch film) and Vols. 1 and 10 (walkthrough), by ende.app (https://ende.app/en), bundled with the brag video skill. Licence: confirm the terms with ende.app before publishing (docs/MANUAL_STEPS.md).",
    "",
    "## Fonts",
    "",
    "Anek Latin and Anek Devanagari (The Anek Project Authors) and IBM Plex Sans (IBM Corp.), SIL Open Font License 1.1.",
    "",
    `## Photo credits (${rows.length} Wikimedia Commons photos in the demo archive)`,
    "",
    ...[...byProject.entries()].flatMap(([p, lines]) => [`### ${p}`, "", ...lines, ""]),
  ].join("\n");
  await writeFile(path.join(process.cwd(), "video", "preview", "DESCRIPTION.md"), md);
  console.log(`video/preview/DESCRIPTION.md: ${rows.length} credits in ${byProject.size} projects`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
