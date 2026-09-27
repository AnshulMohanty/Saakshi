import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  return (
    <Placeholder title="Project" phase="Phase 5">
      Project <code>{id}</code>: spots, before/after pairs and measured change.
    </Placeholder>
  );
}
