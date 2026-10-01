import type { Metadata } from "next";
import { connection } from "next/server";
import { WitnessWall } from "@/components/witness/wall";
import { operatorAllowed } from "@/lib/admin";
import { devToolsEnabled, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { getMediaProvider } from "@/lib/providers/media";
import { qrSvg } from "@/lib/qr";
import { wallView } from "@/lib/wall/view";

export const metadata: Metadata = { title: "Witness Wall" };

/** The Witness Wall (Witness_Wall): real arrivals on the venue screen; `?operator=` adds rehearsals (B5.8). */
export default async function WitnessWallPage({ searchParams }: PageProps<"/witness">) {
  await connection();
  const sp = await searchParams;
  const operator = operatorAllowed(typeof sp.operator === "string" ? sp.operator : null);
  const data = await wallView(await getDb(), getMediaProvider(), { appUrl: getConfig().appUrl, policy: displayPolicy(), operator });
  return <WitnessWall data={data} qrSvg={await qrSvg(data.qr.url)} allowMotionOverride={devToolsEnabled()} />;
}
