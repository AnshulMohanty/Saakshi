import { Glyph } from "@/components/glyph";
import { LOGO_BITS } from "@/lib/glyph";

/**
 * Landing nav (L:599-615): fixed glass bar; its theme follows night sections (landing-dom
 * navTheme). The mark is the logo glyph drawn as the design does: a 14% grid under the lit stroke.
 */
export function LandingNav({ demoHref, links }: { demoHref: string; links: Array<{ href: string; label: string }> }) {
  return (
    <header
      id="sk-nav"
      style={{ position: "fixed", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: "40", width: "min(1200px,calc(100% - 20px))", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "16px", padding: "7px 7px 7px 14px", borderRadius: "14px", background: "color-mix(in srgb, var(--card) 94%, transparent)", border: "1px solid var(--border)", color: "var(--foreground)", transition: "background 200ms,color 200ms,border-color 200ms" }}
    >
      <a href="#top" aria-label="Saakshi home" style={{ display: "flex", alignItems: "center", gap: "10px", color: "inherit", textDecoration: "none" }}>
        <Glyph bits={LOGO_BITS} size={24} colors={{ on: "var(--l-primary)", off: "color-mix(in srgb, currentColor 14%, transparent)" }} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "21px", letterSpacing: "-0.01em" }}>Saakshi</span>
        <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontWeight: "500", fontSize: "17px", opacity: "0.62" }}>
          साक्षी
        </span>
      </a>
      <nav aria-label="Main" style={{ flex: "1", minWidth: "0", height: "22px", overflow: "hidden", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "4px 22px", fontSize: "14px" }}>
        {links.map((l) => (
          <a key={l.href} href={l.href} style={{ color: "inherit", textDecoration: "none" }}>
            {l.label}
          </a>
        ))}
      </nav>
      <a href={demoHref} style={{ flexShrink: "0", padding: "9px 14px", borderRadius: "9px", background: "var(--l-primary)", color: "var(--l-card)", textDecoration: "none", fontWeight: "500", fontSize: "14px" }}>
        Open the live demo
      </a>
    </header>
  );
}
