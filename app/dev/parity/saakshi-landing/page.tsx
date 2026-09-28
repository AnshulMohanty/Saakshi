import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { landingFixture } from "@/lib/landing/fixture";
import { qrSvg } from "@/lib/qr";

export const metadata: Metadata = { title: "Parity: landing", robots: { index: false } };

/**
 * /dev/parity/saakshi-landing: the landing on the design's own sample data, for pixel parity
 * with design/reference/saakshi-landing (pnpm parity:capture --preset saakshi-landing --fixture).
 */
export default async function LandingParity() {
  const data = await landingFixture();
  return <Landing data={data} qrSvg={await qrSvg(data.witness.url, { maskPattern: 5 })} demoHref="#ch8" heroProject="Versova" allowMotionOverride live={false} />;
}
