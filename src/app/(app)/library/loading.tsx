import { connection } from "next/server";
import { preload } from "react-dom";
import { AppSkeleton } from "@/components/skeletons";
import { firstTileSrcs } from "@/lib/app/view";
import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";

/** The library's skeleton; it also preloads the first tiles (the LCP) so they download while the page streams. */
export default async function Loading() {
  await connection();
  try {
    for (const src of await firstTileSrcs(await getDb(), getMediaProvider())) preload(src, { as: "image", fetchPriority: "high" });
  } catch {
    // no preload: the tiles load as usual
  }
  return <AppSkeleton screen="library" />;
}
