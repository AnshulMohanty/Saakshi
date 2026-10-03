import "server-only";
import { randomUUID } from "node:crypto";
import { appView } from "@/lib/app/view";
import { devToolsEnabled } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { getMediaProvider } from "@/lib/providers/media";
import { AppClient } from "./app-client";
import type { AppData, DemoState, Screen } from "./types";

const STATES: DemoState[] = ["normal", "loading", "empty", "error", "offline"];

/**
 * One app screen on our data. Real states: empty when nothing is scored yet; error when the data
 * failed (what failed and a request id, also in the server log). In development `?state=` and
 * `?theme=` force a state or theme for review (B5.11); production ignores them.
 */
export async function AppRoute({ screen, project, sp }: { screen: Screen; project: string | null; sp: Record<string, string | string[] | undefined> }) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const dev = devToolsEnabled();
  const forced = dev ? STATES.find((s) => s === one("state")) : undefined;
  const theme = dev && (one("theme") === "dark" || one("theme") === "light") ? (one("theme") as "dark" | "light") : null;
  let data: AppData | null = null;
  let state: DemoState = "normal";
  try {
    // Each route builds only what its screen shows (the shell switches screens by navigating).
    const include = { projects: screen === "projects", studio: screen === "studio" };
    data = await appView(await getDb(), getMediaProvider(), { policy: displayPolicy(), project: project ?? one("project") ?? null, include });
    if (!data.photos.length) state = "empty";
  } catch (err) {
    const id = randomUUID().slice(0, 6);
    console.error(`[app] ${screen} failed, request ${id}:`, err);
    state = "error";
    data = emptyData(`${err instanceof Error ? err.message.slice(0, 120) : "Unknown error"} (request ${id})`);
  }
  // /projects/<slug or id>: the shell keys projects by slug when there is one.
  const key = project && !data.projectScreens[project] ? (Object.entries(data.projectIds).find(([, id]) => id === project)?.[0] ?? project) : project;
  return <AppClient data={data} screen={screen} state={forced ?? state} theme={theme} project={key ?? data.studioKey} />;
}

function emptyData(errorDetail: string): AppData {
  return { banner: "Demo workspace. Photos come from Wikimedia Commons.", photos: [], projects: [], projectScreens: {}, studio: null, captureHref: "/capture", importToast: "", errorDetail, projectIds: {}, studioKey: null, studioPlace: "" };
}
