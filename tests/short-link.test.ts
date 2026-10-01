/** Poster short links (pure: lib/short-link.ts). */
import { describe, expect, it } from "vitest";
import { SHORT_CODE, shortLink, spotCode } from "@/lib/short-link";

describe("short links", () => {
  it("is the first 8 hex digits of the spot id", () => {
    expect(spotCode("94388BD9-1c2d-5e6f-8a9b-0c1d2e3f4a5b")).toBe("94388bd9");
    expect(SHORT_CODE.test(spotCode("94388bd9-1c2d-5e6f-8a9b-0c1d2e3f4a5b"))).toBe(true);
    expect(SHORT_CODE.test("94388bd")).toBe(false);
    expect(SHORT_CODE.test("94388bdz")).toBe(false);
  });

  it("prints without the scheme and links with it", () => {
    expect(shortLink("https://saakshi.example/", "94388bd9-1c2d-5e6f-8a9b-0c1d2e3f4a5b")).toEqual({ url: "https://saakshi.example/s/94388bd9", text: "saakshi.example/s/94388bd9" });
    expect(shortLink("http://localhost:3000", "94388bd9-0000-0000-0000-000000000000").text).toBe("localhost:3000/s/94388bd9");
  });
});
