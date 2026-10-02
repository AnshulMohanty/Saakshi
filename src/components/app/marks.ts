/**
 * Small shared pieces of the app port: band marks (AP:882-884: Verified a circle, Needs review a
 * diamond, Flagged a triangle, so colour is never the only cue), and the threads from a number to
 * the photos behind it (AP:1013-1020: two paths per photo, drawn with a 600 ms dash).
 */
import type { BandName } from "@/lib/app/chips";

export interface BandMark {
  color: string;
  radius: string;
  clip: string;
  rot: string;
}

export function bandMark(b: BandName): BandMark {
  return b === "Verified"
    ? { color: "var(--verified)", radius: "50%", clip: "none", rot: "0deg" }
    : b === "Needs review"
      ? { color: "var(--review)", radius: "2px", clip: "none", rot: "45deg" }
      : { color: "var(--flagged)", radius: "0", clip: "polygon(50% 0,100% 100%,0 100%)", rot: "0deg" };
}

/** Draws threads from each `a` to its `b` inside `svg` (cleared first). */
export function drawThreads(svg: SVGSVGElement | null, pairs: Array<[Element, Element]>, color: string) {
  if (!svg) return;
  svg.replaceChildren();
  const o = svg.getBoundingClientRect();
  const ns = "http://www.w3.org/2000/svg";
  for (const [a, b] of pairs) {
    const n = a.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const x1 = n.left + n.width / 2 - o.left;
    const y1 = n.bottom - o.top;
    const x2 = r.left + r.width / 2 - o.left;
    const y2 = r.top - o.top + 2;
    const dy = Math.max(20, (y2 - y1) * 0.5);
    for (const [op, w] of [
      [0.16, 5],
      [0.9, 1.2],
    ] as const) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`);
      p.setAttribute("fill", "none");
      p.style.stroke = color;
      p.setAttribute("stroke-opacity", String(op));
      p.setAttribute("stroke-width", String(w));
      p.setAttribute("pathLength", "1");
      p.setAttribute("stroke-dasharray", "1");
      p.setAttribute("stroke-dashoffset", "1");
      p.style.transition = "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)";
      svg.appendChild(p);
      requestAnimationFrame(() => requestAnimationFrame(() => p.setAttribute("stroke-dashoffset", "0")));
    }
  }
}

/** A CSS colour (tokens, color-mix) resolved to a concrete value, for images and canvases that can't read variables. */
export function resolveColor(css: string, within: Element): string {
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  within.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}
