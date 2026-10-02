"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { LandingData } from "@/lib/landing/types";
import { CHIP_REMOVE } from "@/lib/motion/scenes/landing";

/**
 * Chapter 6 (L:877-921): the photo's real signed link as chips; remove any of them and the
 * server requests the edited link and reports the real status (B5.6, /api/demo/tamper). Chips
 * leave with the pass 1 spec's 180 ms spring (D-0074). The fixture (no asset) decides locally
 * the way the prototype did.
 */
type Status = { code: number; pending: boolean };

export function FacesChapter({ data }: { data: LandingData }) {
  const t = data.tamper;
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
  const title = removed.includes("sig") ? "This link has no signature, so it is refused." : "This link was edited, so the signature no longer matches.";
  const chips = t.chips.filter((c) => !removed.includes(c.k));
  return (
    <section id="ch6" className="night" data-night="" data-screen-label="06 Faces stay blurred" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(80px,14vh,140px) clamp(20px,5vw,72px)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,72px)", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 300px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Faces stay blurred.</h2>
          <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", color: "var(--muted-foreground)", textWrap: "pretty" }}>
            Every public image is served from a signed Cloudinary link. The blur is part of what&apos;s signed, so taking it out of the link breaks the signature. Try it: remove any part of the link.
          </p>
          <button type="button" onClick={() => check([])} style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontSize: "14px" }}>
            Restore the original link
          </button>
        </div>
        <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", borderRadius: "12px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: "10px", height: "10px", borderRadius: "5px", background: "var(--night-chrome)" }} />
              ))}
            </div>
            <div role="group" aria-label="Signed image link" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", padding: "8px 10px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.3" }}>
              <span style={{ color: "var(--muted-foreground)" }}>{t.base}</span>
              <AnimatePresence initial={false}>
                {chips.map((c) => (
                  <motion.span
                    key={c.k}
                    layout
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: CHIP_REMOVE.type, duration: CHIP_REMOVE.durationMs / 1000, bounce: CHIP_REMOVE.bounce }}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 4px 3px 8px", borderRadius: "6px", background: "var(--muted)", border: "1px solid var(--night-code-border)" }}
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
          </div>
          <div style={{ position: "relative", aspectRatio: "3/2", background: "var(--background)", overflow: "hidden" }}>
            <div role="img" aria-label="The public copy of the photo, faces blurred" style={{ position: "absolute", inset: "0", backgroundImage: `url("${t.photo}")`, backgroundSize: t.bgSize, backgroundPosition: t.bgPosition }} />
            {broken && (
              <div style={{ position: "absolute", inset: "0", background: "color-mix(in srgb, var(--background) 78%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", boxSizing: "border-box" }}>
                <div role="alert" style={{ maxWidth: "380px", display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--l-destructive)" }}>
                  <span style={{ alignSelf: "flex-start", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 7px", borderRadius: "5px", background: "var(--l-destructive)", color: "var(--l-card)" }}>{`${status.code} refused`}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px", lineHeight: "1.1" }}>{title}</span>
                  <span style={{ fontSize: "13px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>Cloudinary refused the edited link. Behind this notice is the only copy anyone can reach: the blurred one.</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "10px 12px", fontSize: "13px", borderTop: "1px solid var(--border)" }}>
            <span aria-live="polite" style={{ fontFamily: "var(--font-mono)", color: broken ? "var(--flagged)" : "var(--verified)" }}>
              {status.pending ? "checking…" : broken ? `${status.code}: signature does not match` : "200: served, faces blurred"}
            </span>
            <span style={{ color: "var(--muted-foreground)" }}>Faces blurred with e_blur_faces</span>
          </div>
        </div>
      </div>
    </section>
  );
}
