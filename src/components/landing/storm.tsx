import type { LandingData } from "@/lib/landing/types";
import { StormMap } from "./storm-map";

/**
 * Chapter 2 (L:677-702): the storm of photos settling onto the map of India, and its static
 * version. The headline sits on a soft panel and the storm keeps clear of it (the stage reads
 * #c2-t1's box), so the mess never covers the words.
 */
export function StormChapter({ data }: { data: LandingData }) {
  const n = data.stormCount;
  return (
    <>
      {/* CHAPTER 2: CHAOS TO ORDER */}
      <section id="ch2" data-pin="" data-screen-label="02 Chaos to order" style={{ position: "relative", zIndex: "2", height: "420vh" }}>
        <div id="ch2-sticky" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden" }}>
          <div id="c2-t1" style={{ position: "absolute", left: "clamp(8px,calc(5vw - 22px),50px)", top: "clamp(88px,16vh,176px)", maxWidth: "min(520px,calc(100% - 16px))", boxSizing: "border-box", opacity: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "20px 22px", borderRadius: "20px", background: "color-mix(in srgb, var(--l-background) 78%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "0 20px 60px color-mix(in srgb, var(--l-foreground) 10%, transparent)" }}>
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
          <div style={{ position: "relative", flex: "1 1 420px", width: "100%", maxWidth: "640px", aspectRatio: "0.92" }}>
            <StormMap data={data} still />
          </div>
        </div>
      </section>
    </>
  );
}
