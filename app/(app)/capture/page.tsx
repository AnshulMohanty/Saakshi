import { CaptureClient } from "./capture-client";

export const metadata = { title: "Capture" };

export default async function CapturePage({ searchParams }: PageProps<"/capture">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <CaptureClient project={one(sp.project)} spot={one(sp.spot)} />;
}
