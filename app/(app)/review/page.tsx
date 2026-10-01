import { connection } from "next/server";
import { AppRoute } from "@/components/app/app-route";

export const metadata = { title: "Review" };

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  await connection();
  return <AppRoute screen="review" project={null} sp={await searchParams} />;
}
