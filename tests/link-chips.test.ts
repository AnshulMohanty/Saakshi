import { describe, expect, it } from "vitest";
import { PREVIEW } from "@/lib/media/derivatives";
import { linkChips, withoutChips } from "@/lib/media/link-chips";
import { buildCloudinaryUrl, buildMockUrl } from "@/lib/media/transform";

describe("address-bar chips of a signed link (chapter 6, B5.6)", () => {
  const cld = buildCloudinaryUrl({ cloudName: "demo", publicId: "saakshi/archive/abc", transforms: PREVIEW, apiSecret: "x", deliveryType: "authenticated" });
  const mock = buildMockUrl({ baseUrl: "http://localhost:3000", publicId: "saakshi/archive/abc", transforms: PREVIEW, signingKey: "k" });

  it("splits a Cloudinary URL into signature, crop, blur, format and photo", () => {
    const p = linkChips(cld)!;
    expect(p.base).toBe("https://res.cloudinary.com/demo/image/authenticated/");
    expect(p.chips.map((c) => [c.k, c.label])).toEqual([
      ["sig", "signature"],
      ["crop", "crop"],
      ["blur", "blur faces"],
      ["fmt", "format"],
      ["asset", "photo"],
    ]);
    expect(p.chips[2].text).toBe("e_blur_faces");
    expect(p.chips.at(-1)).toMatchObject({ text: "v1/saakshi/archive/abc", removable: false });
  });

  it("reads the mock URL the same way", () => {
    const p = linkChips(mock)!;
    expect(p.base).toBe("http://localhost:3000/api/media/mock/image/upload/");
    expect(p.chips.map((c) => c.k)).toEqual(["sig", "crop", "blur", "fmt", "asset"]);
  });

  it("rebuilds the link with chips removed and the signature kept", () => {
    const edited = withoutChips(cld, ["blur"]);
    expect(edited).not.toContain("e_blur_faces");
    expect(edited).toContain(linkChips(cld)!.chips[0].text);
    expect(withoutChips(cld, ["sig"])).toBe(cld.replace(/s--[^/]+--\//, ""));
    expect(withoutChips(cld, ["asset"])).toBe(cld);
    expect(withoutChips(cld, [])).toBe(cld);
  });

  it("returns null for anything that isn't a delivery URL", () => {
    expect(linkChips("https://example.com/photo.jpg")).toBeNull();
  });
});
