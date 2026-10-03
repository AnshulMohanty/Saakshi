import { LogoGlyph } from "@/components/glyph";
import type { Credit, LandingData } from "@/lib/landing/types";

/**
 * Footer (L:1068-1089): the mark and what Saakshi is, where to go next, the disclaimer; then the
 * credits for every photo on the page (C17), grouped by project in a section that opens, full
 * titles never cut, each with its author, licence, link and note (hero, before/after, planted
 * copy). The lab's samples and the map's boundary are credited too.
 */
const LINK = { color: "var(--foreground)", textDecoration: "none", fontSize: "14px" } as const;
const HEAD = { fontSize: "12px", fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" } as const;
const SAMPLES: Credit[] = [
  { title: "Marine Debris on Midway Atoll (8125792615)", author: "NOAA Marine Debris Program", license: "Public domain", page: "https://commons.wikimedia.org/wiki/File:Marine_Debris_on_Midway_Atoll_(8125792615).jpg", note: ". A sample in Try to fool it." },
  { title: "Marine Debris -- Lighters (43102098570)", author: "National Marine Sanctuaries (NOAA)", license: "Public domain", page: "https://commons.wikimedia.org/wiki/File:Marine_Debris_--_Lighters_(43102098570).jpg", note: ". A sample in Try to fool it." },
];

function groups(credits: Credit[]): Array<{ name: string; items: Credit[] }> {
  const out = new Map<string, Credit[]>();
  for (const c of credits) {
    const g = c.group ?? "Demo photos";
    out.set(g, [...(out.get(g) ?? []), c]);
  }
  return [...out.entries()].map(([name, items]) => ({ name, items }));
}

export function LandingFooter({ data, demoHref = "/demo" }: { data: LandingData; demoHref?: string }) {
  const f = data.footer;
  const all = groups(data.credits);
  const total = data.credits.length + SAMPLES.length;
  return (
    <footer className="night" data-night="" data-screen-label="11 Footer" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(48px,8vh,72px) clamp(20px,5vw,72px) 36px", borderTop: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}>
        <div className="ft-top">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "380px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <LogoGlyph size={28} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "24px" }}>Saakshi</span>
              <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "19px", color: "var(--muted-foreground)" }}>
                साक्षी
              </span>
            </div>
            <span style={{ fontSize: "14px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>Field photos turned into verified, measured proof: every number in a report links to the photo behind it.</span>
            <span style={{ fontSize: "14px", lineHeight: "1.5" }}>{f.built}</span>
          </div>
          <nav aria-label="Footer" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={HEAD}>Explore</span>
            <a href={demoHref} style={LINK}>
              Open the live demo
            </a>
            <a href="/how-it-works" style={LINK}>
              How it works
            </a>
            <a href="/witness" style={LINK}>
              Witness wall
            </a>
            {f.repoUrl && (
              <a href={f.repoUrl} style={LINK}>
                Source on GitHub
              </a>
            )}
          </nav>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "420px" }}>
            <span style={HEAD}>About</span>
            <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.6", color: "var(--muted-foreground)" }}>{f.disclaimer}</p>
          </div>
        </div>
        <details className="ft-credits" style={{ borderTop: "1px solid var(--border)", paddingTop: "18px" }}>
          <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", listStyle: "none" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontWeight: "600", fontSize: "16px" }}>{`Photo credits (${total})`}</span>
              <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>Demo photos from Wikimedia Commons, shown with faces blurred; planted fakes are marked. Boundary of India: Survey of India, via DataMeet (CC BY-SA 2.5).</span>
            </span>
            <span className="ft-chev" aria-hidden="true" style={{ flexShrink: "0", width: "32px", height: "32px", borderRadius: "8px", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ▾
            </span>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "26px", marginTop: "22px" }}>
            {[...all, { name: "Try to fool it: sample photos", items: SAMPLES }].map((g) => (
              <section key={g.name} aria-label={g.name} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h3 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                  {g.name} <span style={{ fontWeight: "400", color: "var(--muted-foreground)" }}>{`(${g.items.length})`}</span>
                </h3>
                <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "10px 28px" }}>
                  {g.items.map((c, i) => {
                    const note = c.note.replace(/^\.\s*/, "").replace(/\.$/, "");
                    return (
                      <li key={`${c.title}-${i}`} style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "13px", lineHeight: "1.4" }}>
                        {c.page ? (
                          <a href={c.page} style={{ color: "var(--foreground)", overflowWrap: "anywhere" }}>
                            {c.title}
                          </a>
                        ) : (
                          <span style={{ overflowWrap: "anywhere" }}>{c.title}</span>
                        )}
                        <span style={{ color: "var(--muted-foreground)", display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "center" }}>
                          <span>{`${c.author}, ${c.license}`}</span>
                          {note && <span style={{ padding: "0 6px", borderRadius: "5px", border: "1px solid var(--border)", fontSize: "11px", color: /Planted/.test(note) ? "var(--flagged)" : "var(--foreground)" }}>{note}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </details>
      </div>
    </footer>
  );
}
