import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportPage } from "@/components/report/report-page";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { getMediaProvider } from "@/lib/providers/media";
import { reportPageData } from "@/lib/report-page";
import { loadReport } from "@/lib/report/view";

export async function generateMetadata({ params }: PageProps<"/r/[reportId]">) {
  await connection();
  const r = await loadReport(await getDb(), (await params).reportId);
  return { title: r?.title ?? "Report" };
}

/** Public Impact Report: every number with the photos behind it, the PDF, and the campaign kit. */
export default async function Report({ params }: PageProps<"/r/[reportId]">) {
  await connection();
  const data = await reportPageData(await getDb(), getMediaProvider(), (await params).reportId, displayPolicy());
  if (!data) notFound();
  return <ReportPage data={data} />;
}
