"use client";

import { useSyncExternalStore } from "react";

/** A CSS media query as React state (false on the server and before hydration). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (on) => {
      const m = matchMedia(query);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** The desktop loupe's condition (C25): a fine pointer and full motion. */
export const LOUPE_QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";
