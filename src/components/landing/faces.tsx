"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { LandingData } from "@/lib/landing/types";
import { CHIP_REMOVE } from "@/lib/motion/scenes/landing";

/**
 * Chapter 6 (L:877-921): the photo's real signed link as chips; remove any of them and the
 * server requests the edited link and reports the real status (B5.6, /api/demo/tamper). Two
 * numbered steps say what to do (remove a part → 401; put it back → 200) and light up as you
 * go. The fixture (no asset) decides locally the way the prototype did.
 */
type Status = { code: number; pending: boolean };

export function FacesChapter({ data }: { data: LandingData }) {
  const t = data.tamper;
  const reduce = useReducedMotion();
  const [removed, setRemoved] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ code: 200, pending: false });
  if (!t) return null;

  const check = (next: string[]) => {
    setRemoved(next);
    if (!t.assetId) {
      setStatus({ code: next.length ? 401 : 200, pending: false });
      return;
    }
    setStatus((s) => ({ ...s, pending: true }));
    fetch(`/api/demo/tamper?assetId=${t.assetId}&chips=${next.join(",")}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ status: number }>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (d) => setStatus({ code: d.status, pending: false }),
        () => setStatus({ code: next.length ? 401 : 200, pending: false }),
      );
  };

  const broken = status.code !== 200;
  const edited = removed.length > 0;
  const title = removed.includes("sig") ? "This link has no signature, so it is refused." : "This link was edited, so the signature no longer matches.";
  const chips = t.chips.filter((c) => !removed.includes(c.k));
  const gone = t.chips.filter((c) => removed.includes(c.k));
  const fade = reduce ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const };
  const steps = [
    { n: 1, text: "Remove any part of the link (the × on a chip): the blur, the crop, the signature.", done: edited, active: !edited },
    { n: 2, text: "Cloudinary refuses the edited link: 401. The only copy anyone can reach is the blurred one.", done: edited && broken, active: edited },
    { n: 3, text: "Put the link back: 200 again, faces blurred.", done: false, active: edited },
  ];
  return (
    <section id="ch6" className="night" data-night="" data-screen-label="06 Faces stay blurred" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(72px,10vh,110px) clamp(20px,5vw,72px)", minHeight: "100vh", boxSizing: "border-box", display: "flex", alignItems: "center" }}>
      <div className="c6-layout" style={{ width: "100%", maxWidth: "1240px", margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(36px,4.6vw,72px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Faces stay blurred.</h2>
          <p style={{ margin: "0", fontSize: "clamp(15px,1.3vw,17px)", lineHeight: "1.55", color: "var(--muted-foreground)", textWrap: "pretty" }}>
            Every public image is served from a signed Cloudinary link. The blur is part of what&apos;s signed: the signature covers every step written after it, so taking the blur out breaks it.
          </p>
          <ol aria-label="Try it" style={{ margin: "4px 0 0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            {steps.map((s) => (
              <li key={s.n} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "12px", border: `1px solid ${s.active ? "var(--primary)" : "var(--border)"}`, background: s.active ? "color-mix(in srgb, var(--primary) 12%, var(--card))" : "var(--card)", transition: "background var(--dur-ui), border-color var(--dur-ui)" }}>
                <span aria-hidden="true" style={{ flexShrink: "0", width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "700", background: s.done ? "var(--verified)" : s.active ? "var(--primary)" : "var(--muted)", color: s.done || s.active ? "var(--primary-foreground)" : "var(--muted-foreground)", transition: "background var(--dur-ui)" }}>
                  {s.done ? "✓" : s.n}
                </span>
                <span style={{ fontSize: "14px", lineHeight: "1.45", color: s.active || s.done ? "var(--foreground)" : "var(--muted-foreground)" }}>{s.text}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="focus-ring" disabled={!edited} onClick={() => check([])} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "8px", padding: "11px 16px", borderRadius: "10px", border: "1px solid var(--primary)", background: edited ? "var(--primary)" : "transparent", color: edited ? "var(--primary-foreground)" : "var(--muted-foreground)", cursor: edited ? "pointer" : "default", fontSize: "14px", fontWeight: "600", opacity: edited ? 1 : 0.6, transition: "background var(--dur-ui), color var(--dur-ui), opacity var(--dur-ui)" }}>
            ↺ Restore the original link
          </button>
        </div>
        <div style={{ minWidth: "0", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 30px 90px color-mix(in srgb, var(--ink-black) 50%, transparent)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: "10px", height: "10px", borderRadius: "5px", background: "var(--night-chrome)" }} />
              ))}
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>The public link to this photo, part by part</span>
            </div>
            <div role="group" aria-label="Signed image link" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", padding: "8px 10px", borderRadius: "8px", background: "var(--background)", border: `1px solid ${broken ? "var(--flagged)" : "var(--border)"}`, fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.3", transition: "border-color var(--dur-ui)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>{t.base}</span>
              <AnimatePresence initial={false}>
                {chips.map((c) => (
                  <motion.span
                    key={c.k}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={reduce ? { duration: 0 } : { type: CHIP_REMOVE.type, duration: CHIP_REMOVE.durationMs / 1000, bounce: CHIP_REMOVE.bounce }}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 4px 3px 8px", borderRadius: "6px", background: c.k === "sig" ? "color-mix(in srgb, var(--primary) 18%, var(--muted))" : "var(--muted)", border: `1px solid ${c.k === "sig" ? "var(--primary)" : "var(--night-code-border)"}` }}
                  >
                    <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: "10px", color: "var(--muted-foreground)" }}>{c.label}</span>
                      <span style={{ color: "var(--foreground)" }}>{c.text}</span>
                    </span>
                    {c.removable && (
                      <button type="button" onClick={() => check([...removed, c.k])} aria-label={`Remove ${c.label} from the link`} className="focus-ring" style={{ all: "unset", cursor: "pointer", width: "22px", height: "22px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)", background: "var(--border)", fontFamily: "var(--font-sans)", fontSize: "14px", lineHeight: "1" }}>
                        ×
                      </button>
                    )}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            {gone.length > 0 && <span style={{ fontSize: "12px", color: "var(--flagged)" }}>{`Removed: ${gone.map((c) => c.label).join(", ")}`}</span>}
          </div>
          <div style={{ position: "relative", aspectRatio: "3/2", maxHeight: "min(48vh,520px)", width: "100%", background: "var(--background)", overflow: "hidden" }}>
            <div role="img" aria-label="The public copy of the photo, faces blurred" style={{ position: "absolute", inset: "0", backgroundImage: `url("${t.photo}")`, backgroundSize: t.bgSize, backgroundPosition: t.bgPosition, filter: broken ? "grayscale(1) blur(2px)" : "none", transform: broken ? "scale(1.02)" : "none", transition: reduce ? "none" : "filter 300ms, transform 300ms" }} />
            <AnimatePresence>
              {broken && (
                <motion.div key="refused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} style={{ position: "absolute", inset: "0", background: "color-mix(in srgb, var(--background) 72%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", boxSizing: "border-box" }}>
                  <motion.div role="alert" initial={reduce ? false : { y: 14, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={fade} style={{ maxWidth: "400px", display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--l-destructive)" }}>
                    <span style={{ alignSelf: "flex-start", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 7px", borderRadius: "5px", background: "var(--l-destructive)", color: "var(--l-card)" }}>{`${status.code} refused`}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px", lineHeight: "1.1" }}>{title}</span>
                    <span style={{ fontSize: "13px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>Cloudinary refused the edited link. Behind this notice is the only copy anyone can reach: the blurred one.</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "10px 12px", fontSize: "13px", borderTop: "1px solid var(--border)" }}>
            <span aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={status.pending ? "p" : status.code} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={fade} style={{ padding: "2px 9px", borderRadius: "999px", fontWeight: "700", background: status.pending ? "var(--muted)" : broken ? "var(--l-destructive)" : "var(--verified)", color: status.pending ? "var(--muted-foreground)" : "var(--l-card)" }}>
                  {status.pending ? "…" : status.code}
                </motion.span>
              </AnimatePresence>
              <span style={{ color: status.pending ? "var(--muted-foreground)" : broken ? "var(--flagged)" : "var(--verified)" }}>{status.pending ? "checking with Cloudinary…" : broken ? "signature does not match: refused" : "served, faces blurred"}</span>
            </span>
            <span style={{ color: "var(--muted-foreground)" }}>Faces blurred with e_blur_faces</span>
          </div>
        </div>
      </div>
    </section>
  );
}
