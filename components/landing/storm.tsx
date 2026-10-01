import type { LandingData } from "@/lib/landing/types";

/** Chapter 2 (L:677-702): the storm of photos settling onto the map, and its static version. */
export function StormChapter({ data }: { data: LandingData }) {
  const n = data.stormCount;
  return (
    <>
      {/* CHAPTER 2: CHAOS TO ORDER */}
      <section id="ch2" data-pin="" data-screen-label="02 Chaos to order" style={{ position: "relative", zIndex: "2", height: "420vh" }}>
        <div id="ch2-sticky" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden" }}>
          <div id="c2-t1" style={{ position: "absolute", left: "clamp(20px,5vw,72px)", top: "clamp(96px,18vh,190px)", maxWidth: "min(460px,calc(100% - 40px))", opacity: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(38px,5vw,76px)", lineHeight: "0.95", letterSpacing: "-0.02em", color: "var(--foreground)", textWrap: "balance" }}>Field photos arrive as a mess.</h2>
            <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{`WhatsApp forwards, phone galleries, shared drives. ${n} photos from the demo archive, in no order at all.`}</p>
          </div>
          <div id="c2-t2" style={{ position: "absolute", left: "clamp(20px,5vw,72px)", top: "clamp(96px,18vh,190px)", maxWidth: "min(400px,calc(100% - 40px))", opacity: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(30px,3.4vw,50px)", lineHeight: "1", letterSpacing: "-0.015em", color: "var(--n-foreground)", textWrap: "balance" }}>Saakshi sorts them by place, project and date before anyone opens a folder.</h2>
            <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.5", color: "var(--n-muted-foreground)" }}>Pins sit on each photo&apos;s camera location. Photos with no location wait at their project&apos;s site until someone confirms it.</p>
          </div>
        </div>
      </section>

      <section id="ch2s" data-screen-label="02 Chaos to order, still" style={{ display: "none", position: "relative", zIndex: "2", background: "var(--n-border)", color: "var(--n-foreground)", padding: "clamp(64px,10vh,120px) clamp(20px,5vw,72px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "center" }}>
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(30px,3.6vw,50px)", lineHeight: "1" }}>Field photos arrive as a mess. Saakshi sorts them by place, project and date.</h2>
            <p style={{ margin: "0", color: "var(--n-muted-foreground)", lineHeight: "1.5" }}>{`${n} photos from the demo archive, placed on their camera locations.`}</p>
          </div>
          <canvas id="c2-static-map" aria-label={`Map of the demo projects: ${data.projects.map((p) => p.city).join(", ")}`} role="img" style={{ flex: "1 1 420px", width: "100%", maxWidth: "640px", aspectRatio: "21/16" }} />
        </div>
      </section>
    </>
  );
}
