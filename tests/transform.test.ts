import cloudinary from "cloudinary";
import { describe, expect, it } from "vitest";
import {
  buildCloudinaryUrl,
  buildMockUrl,
  compileTransform,
  encodeLayerText,
  parseDeliveryPath,
  parseTransformation,
  Transform,
  verifyMockSignature,
  type Transform as TransformT,
} from "@/lib/media/transform";

const SPEC_EXAMPLE: TransformT = [
  { crop: "fill", gravity: "auto", width: 800, height: 600 },
  { effect: "blur_faces" },
  {
    overlay: { text: "Saakshi · verified", font: "Arial", size: 24, color: "#FFFFFF", background: "#00000080" },
    gravity: "north_west",
    x: 24,
    y: 24,
  },
  { format: "auto", quality: "auto" },
];

describe("compileTransform", () => {
  it("compiles a fill crop in spec order", () => {
    expect(compileTransform([{ crop: "fill", gravity: "auto", width: 800, height: 600 }])).toBe("c_fill,g_auto,w_800,h_600");
  });

  it("compiles blur_faces with and without strength", () => {
    expect(compileTransform([{ effect: "blur_faces" }])).toBe("e_blur_faces");
    expect(compileTransform([{ effect: "blur_faces", strength: 800 }])).toBe("e_blur_faces:800");
    expect(compileTransform([{ effect: "blur", strength: 300 }])).toBe("e_blur:300");
  });

  it("compiles a text overlay with Cloudinary's double-escaped URL encoding", () => {
    const t: TransformT = [
      {
        overlay: { text: "Saakshi, verified / 100% ✓", font: "Open Sans", size: 24, weight: "bold", color: "#ffffff", background: "black" },
        gravity: "north_west",
        x: 24,
        y: 24,
      },
    ];
    expect(compileTransform(t)).toBe(
      "l_text:Open%20Sans_24_bold:Saakshi%252C%20verified%20%252F%20100%25%20%E2%9C%93,co_rgb:FFFFFF,b_black" +
        "/fl_layer_apply,g_north_west,x_24,y_24",
    );
  });

  it("encodes layer text exactly like the Cloudinary SDK", () => {
    const sdk = cloudinary.v2.url("sample", {
      cloud_name: "demo",
      overlay: { font_family: "Arial", font_size: 24, text: "Saakshi, verified / 100%" },
    });
    expect(sdk).toContain(`l_text:Arial_24:${encodeLayerText("Saakshi, verified / 100%")}`);
  });

  it("compiles image layers (folders become colons)", () => {
    const t: TransformT = [
      { crop: "fill", width: 800, height: 600 },
      { overlay: { publicId: "saakshi/after/abc", crop: "fill", width: 400, height: 600, opacity: 90 }, gravity: "east" },
    ];
    expect(compileTransform(t)).toBe("c_fill,w_800,h_600/l_saakshi:after:abc,c_fill,w_400,h_600,o_90/fl_layer_apply,g_east");
  });

  it("compiles f_auto/q_auto and numeric quality", () => {
    expect(compileTransform([{ format: "auto", quality: "auto" }])).toBe("f_auto,q_auto");
    expect(compileTransform([{ format: "webp", quality: 70 }])).toBe("f_webp,q_70");
    expect(compileTransform([{ quality: "auto:eco" }])).toBe("q_auto:eco");
  });

  it("compiles the spec's full chain", () => {
    expect(compileTransform(SPEC_EXAMPLE)).toBe(
      "c_fill,g_auto,w_800,h_600/e_blur_faces/" +
        "l_text:Arial_24:Saakshi%20%C2%B7%20verified,co_rgb:FFFFFF,b_rgb:00000080/fl_layer_apply,g_north_west,x_24,y_24/" +
        "f_auto,q_auto",
    );
  });

  it("compiles extraction masks, rotation, padding and raw steps", () => {
    expect(compileTransform([{ effect: "extract", prompt: "plastic bottles", mode: "mask" }])).toBe(
      "e_extract:prompt_plastic%20bottles;mode_mask",
    );
    expect(compileTransform([{ angle: -90 }])).toBe("a_-90");
    expect(compileTransform([{ crop: "pad", width: 400, height: 400, background: "#FAFAFA" }])).toBe("c_pad,w_400,h_400,b_rgb:FAFAFA");
    expect(compileTransform([{ raw: "e_vectorize:colors:5" }])).toBe("e_vectorize:colors:5");
    expect(compileTransform([])).toBe("");
  });

  it("rejects invalid steps", () => {
    const bad: unknown[] = [
      {},
      { width: -1 },
      { width: 1.5 },
      { effect: "grayscale", strength: 5 },
      { crop: "fill", width: 100, colour: "red" },
      { overlay: { text: "hi", font: "Arial" } },
      { overlay: { publicId: "../etc/passwd" } },
      { effect: "extract", prompt: "x;mode_content" },
      { raw: "a/b" },
    ];
    for (const step of bad) expect(() => compileTransform([step as never]), JSON.stringify(step)).toThrow();
  });
});

describe("parseTransformation", () => {
  const cases: TransformT[] = [
    SPEC_EXAMPLE,
    [{ width: 400, crop: "scale" }, { effect: "blur", strength: 300 }],
    [{ overlay: { text: "a,b/c: 50% — ok?", font: "Open Sans", size: 18, weight: "bold" }, gravity: "south", y: -10 }],
    [{ overlay: { publicId: "saakshi/x/y", width: 200 }, gravity: "north_east", x: 5 }, { angle: 180 }],
    [{ effect: "extract", prompt: "litter", mode: "mask" }, { effect: "grayscale" }, { quality: 55 }],
    [{ crop: "pad", width: 10, height: 20, background: "#ABCDEF", gravity: "west" }],
  ];

  it("round-trips compile → parse", () => {
    for (const t of cases) expect(parseTransformation(compileTransform(t))).toEqual(Transform.parse(t));
  });

  it("round-trips parse → compile for canonical strings", () => {
    for (const t of cases) {
      const s = compileTransform(t);
      expect(compileTransform(parseTransformation(s))).toBe(s);
    }
  });

  it("keeps unmodelled components as raw steps", () => {
    expect(parseTransformation("w_100/e_vectorize:colors:5/zz_top/w_1,e_blur")).toEqual([
      { width: 100 },
      { raw: "e_vectorize:colors:5" },
      { raw: "zz_top" },
      { raw: "w_1,e_blur" },
    ]);
    // A layer without its fl_layer_apply is not an overlay.
    expect(parseTransformation("l_text:Arial_10:hi")).toEqual([{ raw: "l_text:Arial_10:hi" }]);
    expect(parseTransformation("")).toEqual([]);
  });
});

describe("buildCloudinaryUrl", () => {
  const sdkBase = { cloud_name: "demo", api_key: "123", api_secret: "abcd", secure: true, urlAnalytics: false };
  const strip = (u: string) => u.replace(/\?_a=.*$/, "");

  it("builds unsigned delivery URLs with a v1 version segment", () => {
    expect(buildCloudinaryUrl({ cloudName: "demo", publicId: "saakshi/dev/abc", transforms: [{ width: 400 }] })).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_400/v1/saakshi/dev/abc",
    );
  });

  it("produces the same signed URL as the official SDK", () => {
    for (const [publicId, transforms] of [
      ["saakshi/dev/abc", SPEC_EXAMPLE],
      ["sample", [{ width: 300 }]],
      ["saakshi/a", []],
    ] as const) {
      const ours = buildCloudinaryUrl({ cloudName: "demo", publicId, transforms: [...transforms], apiSecret: "abcd" });
      const sdk = cloudinary.v2.url(publicId, {
        ...sdkBase,
        raw_transformation: compileTransform([...transforms]),
        sign_url: true,
        version: 1,
      });
      expect(ours).toBe(strip(sdk));
    }
  });
});

describe("authenticated delivery", () => {
  it("matches the SDK for signed authenticated URLs", () => {
    const ours = buildCloudinaryUrl({ cloudName: "demo", publicId: "saakshi/evidence/abc", transforms: [{ width: 1024, crop: "limit" }], apiSecret: "abcd", deliveryType: "authenticated" });
    const sdk = cloudinary.v2.url("saakshi/evidence/abc", { cloud_name: "demo", api_key: "1", api_secret: "abcd", secure: true, urlAnalytics: false, type: "authenticated", raw_transformation: "c_limit,w_1024", sign_url: true, version: 1 });
    expect(ours).toBe(sdk.replace(/\?_a=.*$/, ""));
    expect(ours).toContain("/image/authenticated/s--");
  });
});

describe("mock URLs", () => {
  const key = "test-key";
  const base = "http://localhost:3000/";
  const signed = buildMockUrl({ baseUrl: base, publicId: "saakshi/dev/abc", transforms: SPEC_EXAMPLE, signingKey: key });
  const pathOf = (u: string) => new URL(u).pathname.replace("/api/media/mock/", "");

  it("builds and parses signed and unsigned paths", () => {
    expect(signed).toMatch(/^http:\/\/localhost:3000\/api\/media\/mock\/image\/upload\/s--[A-Za-z0-9_-]{32}--\/c_fill/);
    const p = parseDeliveryPath(pathOf(signed))!;
    expect(p.publicId).toBe("saakshi/dev/abc");
    expect(parseTransformation(p.transformation)).toEqual(Transform.parse(SPEC_EXAMPLE));
    expect(verifyMockSignature(p, key)).toBe(true);

    const unsigned = parseDeliveryPath(pathOf(buildMockUrl({ baseUrl: base, publicId: "p", transforms: [] })))!;
    expect(unsigned).toEqual({ signature: null, transformation: "", publicId: "p", tail: "v1/p" });
    expect(verifyMockSignature(unsigned, key)).toBe(false);
  });

  it("rejects every kind of tampering", () => {
    const path = pathOf(signed);
    const tampered = [
      path.replace("e_blur_faces/", ""), // drop the face blur
      path.replace("w_800", "w_801"), // change a parameter
      path.replace("saakshi/dev/abc", "saakshi/dev/abd"), // swap the asset
      path.replace("/v1/", "/v2/"), // change the version
      path.replace(/s--(.)/, (_m, c: string) => `s--${c === "A" ? "B" : "A"}`), // edit the signature
    ];
    for (const t of tampered) {
      expect(t).not.toBe(path);
      const parsed = parseDeliveryPath(t);
      expect(parsed && verifyMockSignature(parsed, key), t).toBeFalsy();
    }
    expect(verifyMockSignature(parseDeliveryPath(path)!, "other-key")).toBe(false);
  });

  it("rejects paths that are not delivery paths", () => {
    expect(parseDeliveryPath("image/upload/w_100/abc")).toBeNull(); // no version segment
    expect(parseDeliveryPath("video/upload/v1/abc")).toBeNull();
    expect(parseDeliveryPath("image/upload/v1/../secret")).toBeNull();
  });
});
