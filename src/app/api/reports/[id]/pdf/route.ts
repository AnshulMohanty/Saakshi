import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";
import { loadReport } from "@/lib/report/view";

/** GET: redirects to a freshly signed URL of the report PDF (a raw, authenticated file). */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[id]/pdf">) {
  const report = await loadReport(await getDb(), (await ctx.params).id);
  if (!report?.pdfPublicId) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.redirect(new URL(getMediaProvider().rawUrl(report.pdfPublicId), request.url), 302);
}
