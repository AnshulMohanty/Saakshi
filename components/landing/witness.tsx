import type { LandingData } from "@/lib/landing/types";

/**
 * Chapter 9 (L:1008-1030): the QR to the witness camera and a mini map where real Witness
 * photos land as they arrive (/api/live, B5.8; landing-dom mapInit). The QR is rendered on the
 * server (qrcode, level M, as the prototype's qrcode-generator), dark modules on white.
 */
export function WitnessChapter({ data, qrSvg }: { data: LandingData; qrSvg: string }) {
  const w = data.witness;
  return (
    <section id="ch9" className="night" data-night="" data-screen-label="09 Be a witness" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(80px,14vh,140px) clamp(20px,5vw,72px)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,72px)", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "clamp(44px,6vw,96px)", lineHeight: "0.92", letterSpacing: "-0.02em" }}>Be a witness.</h2>
          <p style={{ margin: "0", fontSize: "clamp(17px,1.6vw,22px)", lineHeight: "1.45", color: "var(--foreground)", maxWidth: "440px" }}>Scan with your phone. Take a photo. Watch it land here.</p>
          <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
            <div id="qr" role="img" aria-label="QR code to open the Saakshi witness camera" dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: "clamp(180px,20vw,260px)", aspectRatio: "1", padding: "14px", borderRadius: "14px", background: "var(--l-card)", boxSizing: "border-box" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--muted-foreground)", maxWidth: "220px" }}>
              <a href={w.url} style={{ fontFamily: "var(--font-mono)", color: "var(--foreground)", textDecoration: "none" }}>
                {w.label}
              </a>
              <span>Opens the camera in your browser. Your location and time are recorded with the photo. Faces are blurred before it appears.</span>
            </div>
          </div>
        </div>
        <div style={{ flex: "1 1 360px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <canvas id="c9-map" role="img" aria-label={`Map of the demo sites: ${w.spots.map((s) => s.city).join(", ")}`} style={{ width: "100%", aspectRatio: "21/16", display: "block" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px", color: "var(--muted-foreground)" }}>
            <span id="c9-latest" aria-live="polite">
              Waiting for the next witness photo
            </span>
            <span>{data.copy.liveCaption}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
