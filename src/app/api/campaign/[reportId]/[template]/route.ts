import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { ensureQr } from "@/lib/evidence";
import { getMediaProvider } from "@/lib/providers/media";
import { TEMPLATES, type TemplateId } from "@/lib/report/campaign";
import { campaignTemplate, loadReport } from "@/lib/report/view";

/** GET: one campaign-kit image as a PNG download. The server fetches the signed derivative and streams it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/campaign/[reportId]/[template]">) {
  const { reportId, template } = await ctx.params;
  if (!(TEMPLATES as string[]).includes(template)) return Response.json({ error: "Unknown template" }, { status: 404 });
  const db = await getDb();
  const report = await loadReport(db, reportId);
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });
  const tpl = await campaignTemplate(db, report, template as TemplateId, true);
  if (!tpl) return Response.json({ error: "This report has no data for that template" }, { status: 404 });
  const media = getMediaProvider();
  if (template === "proof" && report.campaign?.photoAssetId) await ensureQr(media, report.campaign.photoAssetId, getConfig().appUrl);
  const png = await media.fetchDerived(tpl.publicId, tpl.transform);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "content-disposition": `attachment; filename="${tpl.filename}"`, "cache-control": "private, max-age=600" },
  });
}
