import { describe, expect, it } from "vitest";
import { bitsToHex, diffCells, glyphCells, glyphSvg, hexToBits, LOGO_BITS } from "@/lib/glyph";
import { hamming } from "@/lib/hamming";

describe("fingerprint glyph", () => {
  it("converts pHash hex to 64 bits and back (SK.hex)", () => {
    const hex = "c3a5f00f1e2d3c4b";
    const bits = hexToBits(hex);
    expect(bits).toHaveLength(64);
    expect(bits.slice(0, 8)).toBe("11000011");
    expect(bitsToHex(bits)).toBe(hex);
    expect(() => hexToBits("xyz")).toThrow();
  });

  it("counts differing cells exactly like the hamming distance the Trust Engine uses (B5.2)", () => {
    const a = "c3a5f00f1e2d3c4b";
    const b = "c3a5f10f1e2d3c4a";
    expect(diffCells(hexToBits(a), hexToBits(b))).toBe(hamming(a, b));
  });

  it("lays cells out as the design does: row-major, 0.1 inset, 0.8 cells, 0.16 radius", () => {
    const cells = glyphCells(LOGO_BITS);
    expect(cells).toHaveLength(64);
    expect(cells[4]).toEqual({ x: 4.1, y: 0.1, on: true, diff: false });
    expect(cells[63]).toMatchObject({ x: 7.1, y: 7.1, on: false });
    expect(cells.filter((c) => c.on)).toHaveLength(15); // SK.logoCells has 15 cells
    const svg = glyphSvg(LOGO_BITS, { on: "#000", off: "#eee" });
    expect(svg).toContain('<rect x="4.1" y="0.1" width="0.8" height="0.8" rx="0.16" fill="#000"/>');
    expect(svg.match(/<rect/g)).toHaveLength(64);
  });

  it("lights differing cells in a diff glyph", () => {
    const a = hexToBits("ffffffffffffffff");
    const b = hexToBits("fffffffffffffffe");
    const cells = glyphCells(a, b);
    expect(cells.filter((c) => c.diff)).toHaveLength(1);
    expect(glyphSvg(a, { on: "#1", off: "#0", hi: "#f00", diffWith: b }).match(/#f00/g)).toHaveLength(1);
  });
});
