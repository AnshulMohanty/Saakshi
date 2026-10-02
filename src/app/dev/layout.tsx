import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devToolsEnabled } from "@/lib/config";

/** Every /dev page: 404 in production unless DEV_TOOLS=1. Chrome lives in (tools)/layout.tsx. */
export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  await connection();
  if (!devToolsEnabled()) notFound();
  return children;
}
