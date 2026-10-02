import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoEntry } from "@/components/demo/demo-entry";
import { getDb } from "@/lib/db/client";
import { demoEntryView } from "@/lib/demo-entry/view";
import { displayPolicy } from "@/lib/display-policy";
import { getMediaProvider } from "@/lib/providers/media";

export const metadata: Metadata = { title: "Open the demo" };

/** Demo entry (Demo_Entry): volunteer, program manager or funder, on the demo archive. */
export default async function DemoPage() {
  await connection();
  return <DemoEntry data={await demoEntryView(await getDb(), getMediaProvider(), displayPolicy())} />;
}
