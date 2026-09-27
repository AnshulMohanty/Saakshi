import Link from "next/link";

/** Minimal chrome for public, shareable pages (spots, evidence; reports in Phase 6): no app nav. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-6 py-6 text-xs text-muted-foreground">
        Verified with{" "}
        <Link href="/" className="underline-offset-2 hover:underline">
          Saakshi
        </Link>
      </footer>
    </div>
  );
}
