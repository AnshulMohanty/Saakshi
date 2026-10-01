import type { Metadata } from "next";
import { WitnessWall } from "@/components/witness/wall";
import { qrSvg } from "@/lib/qr";
import { wallFixture } from "@/lib/wall/fixture";

export const metadata: Metadata = { title: "Parity: Witness Wall", robots: { index: false } };

/** /dev/parity/witness-wall: the Wall on the design's sample data and simulated arrivals. */
export default async function WallParity() {
  const data = await wallFixture();
  return <WitnessWall data={data} qrSvg={await qrSvg(data.qr.url, { maskPattern: 5 })} allowMotionOverride />;
}
