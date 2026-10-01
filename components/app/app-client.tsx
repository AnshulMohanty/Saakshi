"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AppShell, type AppActions, type AppShellProps } from "./app-shell";

const ROUTES = { library: "/library", review: "/review", projects: (k: string) => `/projects/${encodeURIComponent(k)}`, studio: "/studio" };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
  return out;
}

/**
 * The app on our server: decisions go to POST /api/review/[assetId] (note required, audit chain),
 * "Send to review" to /api/review/request, text chips to the hybrid search (/api/search), the
 * import and the reset to the demo job (/api/demo/reset), reports to /api/reports. Each refreshes
 * the server data afterwards.
 */
export function AppClient(props: Omit<AppShellProps, "routes" | "actions">) {
  const router = useRouter();
  const actions = useMemo<AppActions>(() => {
    const reset = async (what: string) => {
      await post("/api/demo/reset", {});
      // The job runs in the background; refresh as photos arrive, then once it ends.
      const until = Date.now() + 5 * 60_000;
      const tick = async () => {
        router.refresh();
        const r = await fetch("/api/demo/reset", { cache: "no-store" }).then((x) => x.json() as Promise<{ job?: { status?: string } }>).catch(() => null);
        if (r?.job?.status === "running" && Date.now() < until) setTimeout(() => void tick(), 2500);
      };
      setTimeout(() => void tick(), 2500);
      return what;
    };
    return {
      decide: async (p, d) => {
        await post(`/api/review/${p.id}`, { decision: d.kind === "approved" ? "approve" : "reject", note: d.note });
        router.refresh();
      },
      resetDemo: () => reset("Demo reset started: decisions cleared, photos re-imported in the background."),
      startImport: () => reset("Importing the demo photos. They appear here as the pipeline checks each one."),
      bulkReview: async (ids) => {
        const { queued } = await post<{ queued: number }>("/api/review/request", { ids });
        router.refresh();
        return `${queued} ${queued === 1 ? "photo" : "photos"} sent to review`;
      },
      bulkReport: async (ids) => {
        const key = props.data?.photos.find((p) => ids.includes(p.id) && p.project)?.project ?? null;
        router.push(key ? `/studio?project=${encodeURIComponent(key)}` : "/studio");
        return "A report counts every verified photo in its project: opening Studio.";
      },
      searchText: async (q) => {
        const r = await post<{ results: Array<{ id: string }> }>("/api/search", { q }).catch(() => null);
        return r ? r.results.map((x) => x.id) : null;
      },
      generateReport: async (projectKey) => {
        const projectId = props.data?.projectIds[projectKey];
        if (!projectId) return;
        await post("/api/reports", { projectId });
        router.refresh();
      },
    };
  }, [router, props.data]);
  return <AppShell {...props} routes={ROUTES} actions={actions} />;
}
