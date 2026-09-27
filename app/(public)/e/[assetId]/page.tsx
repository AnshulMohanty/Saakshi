import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Evidence" };

export default async function EvidencePage({ params }: PageProps<"/e/[assetId]">) {
  const { assetId } = await params;
  return (
    <Placeholder title="Evidence" phase="Phase 6">
      Public evidence page for asset <code>{assetId}</code>: signed, face-blurred image, trust
      reasons, provenance and audit trail.
    </Placeholder>
  );
}
