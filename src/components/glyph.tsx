import type { CSSProperties } from "react";
import { CELL, glyphCells, hexToBits, LOGO_BITS } from "@/lib/glyph";

/**
 * Fingerprint glyph (Developer Handoff component "Glyph": plain, night, diff, logo). The design
 * draws it as an SVG image (SK.glyph); inline here so its colours are tokens. Geometry and
 * colours match SK.glyph: lit cells primary, unlit primary at 14% (night: foreground at 14%),
 * differing cells flagged.
 */
export type GlyphVariant = "plain" | "night" | "logo";

const COLORS: Record<GlyphVariant, { on: string; off: string; hi: string }> = {
  plain: { on: "var(--primary)", off: "color-mix(in srgb, var(--primary) 14%, transparent)", hi: "var(--n-flagged)" },
  night: { on: "var(--n-primary)", off: "color-mix(in srgb, var(--n-foreground) 14%, transparent)", hi: "var(--n-flagged)" },
  logo: { on: "var(--primary)", off: "color-mix(in srgb, var(--logo-off) 18%, transparent)", hi: "var(--n-flagged)" },
};

export interface GlyphProps {
  /** 64 bits ("0"/"1"), or give `hex`. */
  bits?: string;
  /** pHash, 16 hex digits. */
  hex?: string | null;
  /** Compare with this hash (bits or hex): differing cells light up. */
  diffWith?: string | null;
  variant?: GlyphVariant;
  /** Override one colour (e.g. the landing's "off" on a photo). */
  colors?: Partial<(typeof COLORS)["plain"]>;
  size?: number | string;
  /** Accessible name; without it the glyph is decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

const toBits = (s: string) => (/^[01]{64}$/.test(s) ? s : hexToBits(s));

export function Glyph({ bits, hex, diffWith, variant = "plain", colors, size, label, className, style }: GlyphProps) {
  const b = bits ?? (hex ? hexToBits(hex) : LOGO_BITS);
  const c = { ...COLORS[variant], ...colors };
  const cells = glyphCells(b, diffWith ? toBits(diffWith) : null);
  return (
    <svg
      viewBox="0 0 8 8"
      shapeRendering="geometricPrecision"
      width={size}
      height={size}
      className={className}
      style={style}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {cells.map((cell, i) => (
        <rect key={i} x={cell.x} y={cell.y} width={CELL.size} height={CELL.size} rx={CELL.radius} style={{ fill: cell.diff ? c.hi : cell.on ? c.on : c.off }} />
      ))}
    </svg>
  );
}

/** The Saakshi mark: the logo glyph with the ink stroke lit. */
export function LogoGlyph(props: Omit<GlyphProps, "bits" | "hex" | "variant">) {
  return <Glyph {...props} bits={LOGO_BITS} variant="logo" />;
}
