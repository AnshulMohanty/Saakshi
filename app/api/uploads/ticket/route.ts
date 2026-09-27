import { deriveKey, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { uploadTickets } from "@/lib/db/schema";
import { createCloudinaryTicket, createMockTicket, sanitizeContext } from "@/lib/ingest/tickets";

/**
 * POST {context} → a provider-specific signed upload ticket. The browser asks at the shutter, so
 * the server's issue time anchors the capture time. The ticket (context + issue time) is stored:
 * confirm and the webhook read it from here, not from what the browser sends back.
 */
export async function POST(request: Request) {
  const issuedAt = new Date(Math.floor(Date.now()));
  const body = (await request.json().catch(() => ({}))) as { context?: unknown };
  const context = { ...sanitizeContext(body.context), ticket_issued_at: issuedAt.toISOString() };
  const config = getConfig();
  const ticket =
    config.providers.media.mode === "real"
      ? createCloudinaryTicket(context, { cloudName: config.cloudinary.cloudName!, apiKey: config.cloudinary.apiKey!, apiSecret: config.cloudinary.apiSecret! }, config.appUrl, issuedAt)
      : createMockTicket(context, deriveKey("mock-upload:v1"), issuedAt);
  const db = await getDb();
  await db.insert(uploadTickets).values({ publicId: ticket.publicId, provider: ticket.provider, context, issuedAt });
  return Response.json(ticket);
}
