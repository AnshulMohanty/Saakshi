/**
 * The ink-drop intro's first-visit rule (components/landing/ink-intro.tsx). INTRO_CHECK runs in
 * the root layout's head, before paint: a returning visitor (the flag in localStorage) or reduced
 * motion sets html[data-intro="off"], which hides the intro before it can flash.
 */
export const INTRO_KEY = "saakshi-intro-seen";
export const INTRO_MS = 1200;
export const INTRO_CHECK = `try{if(localStorage.getItem("${INTRO_KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.intro="off"}catch(e){document.documentElement.dataset.intro="off"}`;
