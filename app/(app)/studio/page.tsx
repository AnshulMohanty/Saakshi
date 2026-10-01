import { connection } from "next/server";
import { AppRoute } from "@/components/app/app-route";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  await connection();
  return <AppRoute screen="studio" project={null} sp={await searchParams} />;
}
