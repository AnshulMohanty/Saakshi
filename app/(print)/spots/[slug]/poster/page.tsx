import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { spotView } from "@/lib/measure/views";
import { getMediaProvider } from "@/lib/providers/media";
import { PrintButton } from "./print-button";

export const metadata = { title: "Spot poster" };

/** The public origin for the QR: APP_URL if set, else the host this request came in on (tunnels too). */
async function origin(): Promise<string> {
  const { env } = getConfig();
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * One A4 sheet (210 × 297 mm, fixed size, overflow hidden) to put up at the spot: a large QR to
 * the spot's public page, the spot name, the clean-up (or planting) date, one line of instructions.
 */
export default async function SpotPoster({ params }: PageProps<"/spots/[slug]/poster">) {
  await connection();
  const v = await spotView(await getDb(), getMediaProvider(), (await params).slug);
  if (!v) notFound();
  const url = `${await origin()}/spots/${encodeURIComponent(v.spot.slug ?? v.spot.id)}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const green = v.metric?.id === "green_cover";
  // Clean-up: the baseline (best "after") photo. Plantation: the first photo (planting day).
  const date = green ? (v.trend[0]?.label ?? v.baseline?.date ?? null) : (v.baseline?.date ?? null);

  return (
    <>
      <style>{`@page { size: A4; margin: 0 } @media print { html, body { background: white } }`}</style>
      <div className="mb-4 print:hidden">
        <PrintButton />
      </div>
      <article
        className="flex h-[297mm] w-[210mm] flex-col items-center overflow-hidden bg-white px-[16mm] py-[14mm] text-center text-neutral-900 shadow-lg print:shadow-none"
        style={{ breakInside: "avoid", breakAfter: "avoid" }}
        data-testid="poster"
      >
        <p className="font-heading text-[7mm] font-bold">Saakshi · साक्षी</p>
        <h1 className="mt-[10mm] font-heading text-[14mm] font-bold leading-[1.05]">{v.spot.name}</h1>
        <p className="mt-[3mm] text-[6mm] text-neutral-700">{v.project.name}</p>
        {date ? (
          <p className="mt-[5mm] text-[7mm] font-medium" data-testid="poster-date">
            {green ? "Planted" : "Cleaned up"}: {date}
          </p>
        ) : null}
        <div className="mt-[12mm] h-[120mm] w-[120mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-[10mm] max-w-[160mm] text-[7mm] font-medium leading-snug">
          {green ? "Scan to see how these trees are growing, and add today's photo." : "Scan to see if this spot is still clean, and add today's photo."}
        </p>
        <p className="mt-auto font-mono text-[3.5mm] text-neutral-600 [overflow-wrap:anywhere]">{url}</p>
      </article>
    </>
  );
}
