import type { Metadata } from "next";
import { connection } from "next/server";
import { Landing } from "@/components/landing/landing";
import { devToolsEnabled, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { landingView } from "@/lib/landing/view";
import { getMediaProvider } from "@/lib/providers/media";
import { qrSvg } from "@/lib/qr";

export const metadata: Metadata = {
  title: { absolute: "Saakshi: proof, not just photos" },
  description: "Saakshi checks where and when each field photo was taken, measures what changed, and links every number in your report to the photo behind it.",
};

/** The landing (Saakshi_Landing): the design's eleven chapters over our demo projects. */
export default async function LandingPage() {
  await connection();
  const cfg = getConfig();
  const data = await landingView(await getDb(), getMediaProvider(), { appUrl: cfg.appUrl, policy: displayPolicy(), preview: cfg.env.DEMO_PREVIEW === "1" });
  const hero = data.projects.find((p) => p.isHero);
  return <Landing data={data} qrSvg={await qrSvg(data.witness.url)} demoHref="/demo" heroProject={hero ? hero.name : null} allowMotionOverride={devToolsEnabled()} />;
}
