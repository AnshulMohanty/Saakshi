// subset-font (HarfBuzz subsetter) ships no types: the one call scripts/design-fonts.ts makes.
declare module "subset-font" {
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: { targetFormat?: "woff2" | "woff" | "truetype" | "sfnt"; variationAxes?: Record<string, number | { min: number; max: number; default?: number }> },
  ): Promise<Buffer>;
}
