import { Glyph } from "@/components/glyph";
import { LOGO_BITS } from "@/lib/glyph";

/**
 * The QR poster (QR_Poster → /spots/[slug]/poster, template QP:422-449): one A4 sheet, sized in
 * container units so it prints the same on any screen. On screen it sits on a desk like the
 * prototype's <doc-page> shell (48 px × 24 px padding, a 210 mm card with a 7 px radius); in print
 * it is one full-bleed A4 page. Always light: it is paper. Headings balance and list text wraps
 * "pretty", as the shell's injected typography defaults did.
 */
export interface PosterData {
  project: { name: string; city: string };
  /** Inline SVG (lib/qr.ts, level Q) of the short link. */
  qrSvg: string;
  steps: Array<{ title: string; body: string; thumb?: { src: string; alt: string } | null }>;
  spot: { name: string; coords: string; short: string };
  privacy: string;
}

const STEP_TITLE = { fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "4.4cqw", lineHeight: "1" } as const;
const STEP_BODY = { fontSize: "2.5cqw", lineHeight: "1.35", color: "var(--muted-foreground)" } as const;
const MONO = { fontFamily: "var(--font-mono)", fontSize: "2.2cqw", color: "var(--muted-foreground)" } as const;

/** Print rules: one A4 page, no desk, no card. The prototype's shell did the same (doc-page). */
const PRINT = `@page { size: A4; margin: 0 }
@media print {
  html, body { background: none !important; }
  .qp-desk { padding: 0 !important; background: none !important; min-height: 0 !important; }
  .qp-sheet { width: 210mm !important; }
  .qp-page { width: 210mm !important; height: 297mm !important; aspect-ratio: auto !important; border-radius: 0 !important; box-shadow: none !important; }
  .qp-noprint { display: none !important; }
}`;

export function QrPoster({ data, toolbar }: { data: PosterData; toolbar?: React.ReactNode }) {
  return (
    // The prototype has no body styles: proportional figures, default text rendering (not the app's). A main landmark (Lighthouse).
    <main className="design-root light qp-desk" style={{ position: "relative", display: "block", minWidth: "max-content", minHeight: "100vh", background: "var(--desk)", padding: "48px 24px", boxSizing: "border-box", fontVariantNumeric: "normal", textRendering: "auto", WebkitFontSmoothing: "auto" }}>
      <style>{PRINT}</style>
      {toolbar && <div className="qp-noprint">{toolbar}</div>}
      <div className="qp-sheet" style={{ width: "210mm", margin: "0 auto" }}>
        <section
          className="page qp-page"
          data-screen-label="QR poster"
          data-testid="poster"
          style={{ position: "relative", width: "100%", aspectRatio: "210/297", containerType: "size", overflow: "hidden", borderRadius: "7px", boxShadow: "0 2px 10px color-mix(in srgb, var(--ink-black) 25%, transparent)", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact", breakInside: "avoid", boxSizing: "border-box", padding: "7cqw", display: "flex", flexDirection: "column", gap: "3.2cqw", background: "var(--card)", color: "var(--foreground)", fontFamily: "var(--font-sans)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2cqw" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "2cqw" }}>
              <Glyph bits={LOGO_BITS} colors={{ off: "color-mix(in srgb, var(--primary) 12%, transparent)" }} style={{ width: "7cqw", height: "7cqw" }} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "6cqw" }}>Saakshi</span>
              <span style={{ fontFamily: "var(--font-deva)", fontSize: "4.8cqw", color: "var(--muted-foreground)" }}>साक्षी</span>
            </div>
            <span style={{ fontSize: "2.2cqw", color: "var(--muted-foreground)", textAlign: "right" }}>
              {data.project.name}
              {data.project.city && (
                <>
                  <br />
                  {data.project.city}
                </>
              )}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2cqw" }}>
            <h1 style={{ textWrap: "balance", margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "86%", fontSize: "11.5cqw", lineHeight: "0.9", letterSpacing: "-0.02em" }}>Be a witness at this spot.</h1>
            <span style={{ fontFamily: "var(--font-deva)", fontWeight: "600", fontSize: "6.4cqw", lineHeight: "1.1", color: "var(--primary)" }}>इस जगह के साक्षी बनें।</span>
          </div>
          <div style={{ display: "flex", gap: "5cqw", alignItems: "center" }}>
            <div id="qp-qr" role="img" aria-label={`QR code for ${data.spot.short}`} style={{ flex: "0 0 46cqw", aspectRatio: "1", padding: "2.5cqw", boxSizing: "border-box", border: "0.6cqw solid var(--foreground)", borderRadius: "3cqw" }} dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
            <ol style={{ flex: "1", margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "3cqw" }}>
              {data.steps.map((s) => (
                <li key={s.title} style={{ textWrap: "pretty", display: "flex", flexDirection: "column", gap: "0.6cqw" }}>
                  <span style={STEP_TITLE}>{s.title}</span>
                  <span style={STEP_BODY}>{s.body}</span>
                  {s.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail of the baseline (B5.13)
                    <img src={s.thumb.src} alt={s.thumb.alt} style={{ width: "18cqw", height: "13.5cqw", objectFit: "cover", borderRadius: "1.2cqw", marginTop: "0.6cqw" }} />
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div style={{ flex: "1" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "3cqw", paddingTop: "2.4cqw", borderTop: "0.3cqw solid var(--foreground)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8cqw" }}>
              <span style={{ fontWeight: "600", fontSize: "2.8cqw" }}>{data.spot.name}</span>
              <span style={MONO}>{data.spot.coords}</span>
              <span style={MONO}>{data.spot.short}</span>
            </div>
            <span style={{ maxWidth: "40cqw", textAlign: "right", fontSize: "2.1cqw", lineHeight: "1.4", color: "var(--muted-foreground)" }}>{data.privacy}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
