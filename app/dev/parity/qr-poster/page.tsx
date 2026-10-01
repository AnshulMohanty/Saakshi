import type { Metadata } from "next";
import { QrPoster } from "@/components/poster/qr-poster";
import { POSTER_PRIVACY } from "@/lib/poster";
import { qrSvg } from "@/lib/qr";

export const metadata: Metadata = { title: "Parity: QR poster", robots: { index: false } };

/** /dev/parity/qr-poster: the poster on the prototype's copy and its sample short link (QP:422-449, 462; qrcode-generator chose mask 6 at level Q). */
export default async function PosterParity() {
  return (
    <QrPoster
      data={{
        project: { name: "Versova beach clean-up", city: "Mumbai" },
        qrSvg: await qrSvg("https://saakshi.app/s/vsv-pole-3", { level: "Q", maskPattern: 6, color: "var(--foreground)" }),
        steps: [
          { title: "1. Scan", body: "No app, no login. स्कैन करें।" },
          { title: "2. Photograph the beach", body: "From this pole, facing the sea, so every check-in matches. समुद्र की ओर फ़ोटो लें।" },
          { title: "3. Watch it count", body: "Your photo is checked and measured, and shows if this spot stays clean." },
        ],
        spot: { name: "Versova beach, pole 3", coords: "19.12650° N, 72.81560° E", short: "saakshi.app/s/vsv-pole-3" },
        privacy: POSTER_PRIVACY,
      }}
    />
  );
}
