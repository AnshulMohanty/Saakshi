import type { Metadata } from "next";
import { connection } from "next/server";
import { HowItWorks } from "@/components/how/product";
import { getDb } from "@/lib/db/client";
import { howView } from "@/lib/how/view";
import { getMediaProvider } from "@/lib/providers/media";

export const metadata: Metadata = { title: "How it works", description: "The trust score's fixed rules, how a percentage is measured, and the Cloudinary pipeline behind every photo." };

/** How it works (How_It_Works): the simulator on the real Trust Engine, the threshold demo, the pipeline. */
export default async function HowItWorksPage() {
  await connection();
  return <HowItWorks data={await howView(await getDb(), getMediaProvider())} />;
}
