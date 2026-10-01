import { connection } from "next/server";
import { AppRoute } from "@/components/app/app-route";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  await connection();
  return <AppRoute screen="library" project={null} sp={await searchParams} />;
}
