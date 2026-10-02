import "server-only";
/**
 * How it works data: a real demo photo for the threshold demo (the hero, face-blurred, on the
 * demo frame) and the pipeline stages as we really call them (B5.5, compiled by our own code).
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { HowData } from "@/components/how/how-it-works";
import type { DB } from "../db/client";
import { assets } from "../db/schema";
import { heroProject } from "../demo/hero";
import { placeShort } from "../landing/copy";
import { FRAME, PREVIEW } from "../media/derivatives";
import { compileTransform, type Transform } from "../media/transform";
import { MASK_THRESHOLD } from "../measure/cover";
import { LITTER_PROMPTS } from "../measure/measure";
import { maskTransform, type MediaProvider } from "../providers/media";

const DEMO_FRAME: Transform = [{ crop: "fill", gravity: "auto", width: 1024, height: 685 }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];

export async function howView(db: DB, media: MediaProvider): Promise<HowData> {
  const hero = await heroProject(db);
  const [a] = hero.project ? await db.select().from(assets).where(and(eq(assets.projectId, hero.project.id), eq(assets.trustBand, "VERIFIED"), isNotNull(assets.attribution))).orderBy(desc(assets.trustScore), assets.id).limit(1) : [];
  const threshold = Math.round((MASK_THRESHOLD / 255) * 100) / 100;
  return {
    photo: a
      ? {
          src: media.url(a.cldPublicId, DEMO_FRAME, { signed: true }),
          credit: `${placeShort(a.placeName) ?? hero.project?.name ?? "Demo photo"}. Photo: ${a.attribution?.author ?? "unknown"}, ${a.attribution?.license ?? "licence unknown"}, Wikimedia Commons. Faces blurred. This demo mask is computed in your browser from pixel colour; Saakshi's measurements use Cloudinary's segmentation masks at the fixed threshold ${threshold.toFixed(2)}.`,
          badge: "Colour demo",
          metric: "litter",
          threshold,
        }
      : null,
    stages: [
      { n: 1, name: "Intake forensics", what: "Reads the camera file and fingerprints the pixels.", code: "media_metadata: true, phash: true, faces: true, quality_analysis: true", writes: "location, time, device, fingerprint, faces, quality" },
      { n: 2, name: "Perception", what: "Finds watermarks, screens and what is in the frame.", code: "analyze/ai_vision_tagging, ai_vision_moderation, watermark_detection", writes: "tags, moderation answers, watermark, each AI-estimated" },
      { n: 3, name: "Measurement", what: "Segments litter into a mask.", code: compileTransform(maskTransform(LITTER_PROMPTS, { multiple: true, frame: FRAME })), writes: `mask image, cover above ${MASK_THRESHOLD}/255, provider` },
      { n: 4, name: "Privacy", what: "Blurs faces on a signed public copy.", code: `${compileTransform(PREVIEW)}, signed`, writes: "public URL, signature" },
      { n: 5, name: "Provenance", what: "Pins the version and logs every edit.", code: "type: authenticated, v1, s--signature--", writes: "audit entry, history hash" },
    ],
    homeHref: "/",
    demoHref: "/demo",
    ruleNote: "The rules are fixed code, the same for every photo and every organisation. Their weights are published in docs/trust.md, so anyone can recompute a score.",
  };
}
