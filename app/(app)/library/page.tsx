import { LibraryClient } from "./library-client";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <LibraryClient
      initial={{
        view: one(sp.view) === "map" ? "map" : "grid",
        project: one(sp.project),
        source: one(sp.source),
        status: one(sp.status),
        test: one(sp.test) === "1",
        live: one(sp.live) !== "0",
        followNew: one(sp.live) === "1",
        asset: one(sp.asset),
      }}
    />
  );
}
