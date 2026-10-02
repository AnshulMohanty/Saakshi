import { connection } from "next/server";
import { AppRoute } from "@/components/app/app-route";

export const metadata = { title: "Project overview" };

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  await connection();
  return <AppRoute screen="projects" project={(await params).id} sp={await searchParams} />;
}
