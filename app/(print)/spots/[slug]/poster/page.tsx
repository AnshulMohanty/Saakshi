import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { QrPoster } from "@/components/poster/qr-poster";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { posterData } from "@/lib/poster";
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

/** One A4 sheet to put up at the spot: a QR to the spot's short link, three steps, the spot's facts. */
export default async function SpotPoster({ params }: PageProps<"/spots/[slug]/poster">) {
  await connection();
  const data = await posterData(await getDb(), getMediaProvider(), (await params).slug, await origin());
  if (!data) notFound();
  return <QrPoster data={data} toolbar={<PrintButton />} />;
}
