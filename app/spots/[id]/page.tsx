import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Spot" };

export default async function SpotPage({ params }: PageProps<"/spots/[id]">) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <Placeholder title="Spot" phase="Phase 5">
        Spot <code>{id}</code>: baseline photo and the timeline of community check-ins at this
        location.
      </Placeholder>
    </main>
  );
}
