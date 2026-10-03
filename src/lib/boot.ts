/**
 * The reload loader (components/boot-loader.tsx): on a reload the Saakshi mark draws itself while
 * the page gets ready, then fades. BOOT_CHECK runs in the root layout's head, before paint, and
 * sets html[data-boot="on"] only for a reload (never a first navigation, so crawlers and the first
 * paint are untouched), only without reduced motion, and never while the landing's first-visit ink
 * intro is showing. The page renders underneath the whole time; the loader takes no input.
 *
 * CSS fades it out by BOOT_MAX_MS on its own; the page's load event ends it sooner, but not before
 * BOOT_MIN_MS, so a fast reload doesn't flash. data-boot-tone picks the page's palette: night for
 * the landing and the dark marketing pages, the app shell's saved theme for product pages.
 */
export const BOOT_MIN_MS = 480;
export const BOOT_MAX_MS = 1200;
/** Pages drawn in the night palette. */
export const BOOT_NIGHT = /^\/(how-it-works|witness|capture|demo)?(\/|$)/;
/** App-shell pages: their palette is the viewer's saved theme (components/app/app-shell.tsx). */
export const BOOT_APP = /^\/(library|review|projects|studio)(\/|$)/;
/** Print pages (one A4 sheet) never show it. */
export const BOOT_SKIP = /\/poster$|^\/dev(\/|$)/;

export const BOOT_CHECK = `try{var d=document.documentElement,p=location.pathname,n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="reload"&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!${BOOT_SKIP}.test(p)&&!(p==="/"&&d.dataset.intro!=="off")){d.dataset.bootTone=${BOOT_NIGHT}.test(p)||(${BOOT_APP}.test(p)&&localStorage.getItem("saakshi-theme")==="dark")?"night":"day";d.dataset.boot="on";addEventListener("load",function(){var t=performance.now();if(t<${BOOT_MAX_MS - 350})setTimeout(function(){d.dataset.boot="done"},Math.max(0,${BOOT_MIN_MS}-t))})}}catch(e){}`;
