import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import type { DemoState } from "@/components/app/types";
import { appFixture } from "@/lib/app/fixture";

export const metadata: Metadata = { title: "Parity: app", robots: { index: false } };

const STATES: DemoState[] = ["normal", "loading", "empty", "error", "offline"];

/** /dev/parity/saakshi-app?state=&theme=: the app on the prototype's archive; the rail switches screens in place, as in the prototype. */
export default async function AppParity({ searchParams }: PageProps<"/dev/parity/saakshi-app">) {
  const sp = await searchParams;
  const state = STATES.find((s) => s === sp.state) ?? "normal";
  const theme = sp.theme === "dark" ? "dark" : "light";
  return <AppShell data={await appFixture()} screen="library" state={state} theme={theme} project="mumbai" routes={null} />;
}
