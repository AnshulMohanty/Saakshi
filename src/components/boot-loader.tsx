import { CELL, glyphCells, LOGO_BITS } from "@/lib/glyph";

/**
 * The reload loader (lib/boot.ts): the Saakshi mark draws itself cell by cell over a faint grid,
 * then fades, 1.2 s at most. Plain CSS, no client JS: hidden unless the pre-paint check set
 * html[data-boot="on"]; reduced motion and print never show it.
 */
export function BootLoader() {
  const cells = glyphCells(LOGO_BITS);
  let lit = 0;
  return (
    <div className="boot" aria-hidden="true">
      <svg className="boot-mark" viewBox="0 0 8 8">
        {cells.map((c, i) => (
          <rect key={i} className={c.on ? "boot-on" : "boot-off"} x={c.x} y={c.y} width={CELL.size} height={CELL.size} rx={CELL.radius} style={c.on ? { animationDelay: `${60 + lit++ * 28}ms` } : undefined} />
        ))}
      </svg>
    </div>
  );
}
