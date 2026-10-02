import { connection } from "next/server";
import { CaptureDevState, CaptureLive } from "@/components/capture/capture-live";
import { captureSpot, devSimConfig } from "@/lib/capture/screen-data";
import { STATE_MODE } from "@/lib/capture/sim-states";
import { devToolsEnabled } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";

export const metadata = { title: "Capture" };
export const viewport = { themeColor: "#000000", viewportFit: "cover" };

/** Witness Capture: the phone camera screen. `?spot=` (from a poster) or `?project=` scopes the capture token. */
export default async function CapturePage({ searchParams }: PageProps<"/capture">) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const db = await getDb();
  const state = one(sp.state);
  if (state && devToolsEnabled() && STATE_MODE[state]) {
    const cfg = await devSimConfig(db, getMediaProvider(), STATE_MODE[state]);
    if (cfg) return <CaptureDevState cfg={cfg} />;
  }
  const spot = one(sp.spot);
  return <CaptureLive project={one(sp.project)} spot={spot} spotInfo={await captureSpot(db, spot)} />;
}
