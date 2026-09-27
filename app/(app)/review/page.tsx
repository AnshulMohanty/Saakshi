import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";
import { listReviewQueue } from "@/lib/review";
import { ReviewClient } from "./review-client";

export const metadata = { title: "Review" };

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  await connection();
  const sp = await searchParams;
  const reason = typeof sp.reason === "string" && /^[A-Z_]{3,40}$/.test(sp.reason) ? sp.reason : null;
  const queue = await listReviewQueue(await getDb(), getMediaProvider(), { reason });
  return <ReviewClient initial={queue} initialReason={reason} />;
}
