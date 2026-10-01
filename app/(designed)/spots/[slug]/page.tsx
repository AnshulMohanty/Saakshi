import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SpotPage } from "@/components/spot/spot-page";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { spotView } from "@/lib/measure/views";
import { getMediaProvider } from "@/lib/providers/media";
import { spotPageData } from "@/lib/spot-page";

export async function generateMetadata({ params }: PageProps<"/spots/[slug]">) {
  await connection();
  const v = await spotView(await getDb(), getMediaProvider(), (await params).slug);
  return { title: v ? `${v.spot.name} · ${v.project.name}` : "Spot" };
}

/** Public spot page: where it is, how it has changed, and a link to check in with a new photo. */
export default async function Spot({ params }: PageProps<"/spots/[slug]">) {
  await connection();
  const data = await spotPageData(await getDb(), getMediaProvider(), (await params).slug, { policy: displayPolicy() });
  if (!data) notFound();
  return <SpotPage data={data} />;
}
