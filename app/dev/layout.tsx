import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devToolsEnabled } from "@/lib/config";

/** Dev tools: 404 in production unless DEV_TOOLS=1. */
export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  await connection();
  if (!devToolsEnabled()) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <nav className="mb-6 flex gap-4 text-sm text-muted-foreground">
        <Link href="/" className="font-heading font-semibold text-foreground">
          Saakshi
        </Link>
        <span>dev</span>
        <Link href="/dev/status" className="hover:text-foreground">
          Provider status
        </Link>
        <Link href="/dev/upload-test" className="hover:text-foreground">
          Upload round-trip
        </Link>
      </nav>
      {children}
    </div>
  );
}
