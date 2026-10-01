import { LogoGlyph } from "@/components/glyph";
import type { LandingData } from "@/lib/landing/types";

/** Footer (L:1068-1089): mark, credits for every photo on the page (C17), disclaimer. */
export function LandingFooter({ data }: { data: LandingData }) {
  const f = data.footer;
  return (
    <footer className="night" data-night="" data-screen-label="11 Footer" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "64px clamp(20px,5vw,72px) 40px", borderTop: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "36px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 64px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "360px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <LogoGlyph size={28} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "24px" }}>Saakshi</span>
              <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "19px", color: "var(--muted-foreground)" }}>
                साक्षी
              </span>
            </div>
            <span style={{ fontSize: "14px", color: "var(--muted-foreground)", lineHeight: "1.5" }}>{f.built}</span>
            {f.repoUrl && (
              <a href={f.repoUrl} style={{ fontSize: "14px", color: "var(--code-ink)" }}>
                Source on GitHub
              </a>
            )}
          </div>
          <p style={{ margin: "0", maxWidth: "460px", fontSize: "13px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>{f.disclaimer}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ fontWeight: "600", fontSize: "14px" }}>Photo credits</span>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>All demo photos are from Wikimedia Commons, shown with faces blurred. Planted fakes are marked.</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "6px 24px", fontSize: "12px", lineHeight: "1.4" }}>
            {data.credits.map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                {c.page ? (
                  <a href={c.page} style={{ color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title}
                  </a>
                ) : (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                )}
                <span style={{ color: "var(--muted-foreground)" }}>{`${c.author}, ${c.license}${c.note}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
