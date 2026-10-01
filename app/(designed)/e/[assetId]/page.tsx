import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EvidencePage } from "@/components/evidence/evidence-page";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { evidencePageData } from "@/lib/evidence-page";
import { getMediaProvider } from "@/lib/providers/media";

const load = async (assetId: string) => (/^[0-9a-f-]{36}$/i.test(assetId) ? evidencePageData(await getDb(), getMediaProvider(), assetId, { appUrl: getConfig().appUrl, policy: displayPolicy() }) : null);

export async function generateMetadata({ params }: PageProps<"/e/[assetId]">): Promise<Metadata> {
  await connection();
  const d = await load((await params).assetId);
  return d ? { title: `${d.title}, evidence`, description: "Where and when this photo was taken, its fingerprint, trust score and every edit to its public copy." } : { title: "Evidence not found" };
}

/** The public evidence page (Evidence_Page): one photo, everything that was checked, and how. */
export default async function Evidence({ params }: PageProps<"/e/[assetId]">) {
  await connection();
  const d = await load((await params).assetId);
  if (!d) notFound();
  return <EvidencePage data={d} />;
}
