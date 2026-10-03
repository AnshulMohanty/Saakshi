"use client";

import { useSyncExternalStore } from "react";

/** The app shell's theme: the viewer's own choice (localStorage), read without a hydration mismatch. */
export const THEME_KEY = "saakshi-theme";
const themeListeners = new Set<() => void>();
const subscribeTheme = (cb: () => void) => {
  themeListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    themeListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const readTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
};
export const writeTheme = (dark: boolean) => {
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    // private mode: the choice lasts this page only
  }
  themeListeners.forEach((cb) => cb());
};
/** True when the viewer chose dark (false on the server and before hydration). */
export const useStoredDark = () => useSyncExternalStore(subscribeTheme, readTheme, () => false);
