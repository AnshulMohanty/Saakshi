import type { Metadata } from "next";
import { HowItWorksDesign } from "@/components/how/design";
import { designArchive } from "@/lib/parity/archive";

export const metadata: Metadata = { title: "Parity: How it works", robots: { index: false } };

/** /dev/parity/how-it-works: the page on the prototype's placeholder rules and its own photo. */
export default async function HowParity() {
  const { src } = await designArchive("how-it-works");
  return (
    <HowItWorksDesign
      data={{
        photo: { src: src("photos/before.jpg"), credit: "Measured on photo pixels. Camera angle, framing, season and light affect the result. Photo: Ravi Khemka, CC BY 2.0, Wikimedia Commons. Faces blurred. The demo mask is computed from pixel colour; the live stage uses a segmentation model.", badge: "Measured", metric: "litter", threshold: 0.5 },
        stages: [
          { n: 1, name: "Intake forensics", what: "Reads the camera file and fingerprints the pixels.", code: "phash: true, image_metadata: true", writes: "location, time, device, fingerprint" },
          { n: 2, name: "Perception", what: "Finds watermarks, screens and what is in the frame.", code: 'detection: "coco_v2", ocr: "adv_ocr"', writes: "tags with confidence, text found" },
          { n: 3, name: "Measurement", what: "Segments litter into a mask.", code: "e_extract:prompt_litter;mode_mask", writes: "mask image, threshold, model version" },
          { n: 4, name: "Privacy", what: "Blurs faces on a signed public copy.", code: "e_blur_faces:1200, sign_url: true", writes: "public URL, signature" },
          { n: 5, name: "Provenance", what: "Pins the version and logs every edit.", code: "v1727000000, s--tQ3v9XkP--", writes: "audit entry, history hash" },
        ],
        homeHref: "Saakshi Landing.html",
        demoHref: "Demo Entry.html",
        ruleNote: "The rules are fixed code, the same for every photo and every organisation. Their weights are published with each report, so a funder can recompute any score.",
      }}
    />
  );
}
