import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MediaProvider } from "@/lib/providers/media";

let dir: string;
let media: MediaProvider;
let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "saakshi-tamper-"));
  process.env.MEDIA_MOCK_DIR = dir;
  ({ GET } = await import("@/app/api/media/mock/[...path]/route"));
  media = (await import("@/lib/providers/media")).getMediaProvider();
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("/api/demo/tamper in mock mode", () => {
  it("the signed URL serves (200); the same URL with blur_faces removed does not (401)", async () => {
    const { tamperDemo } = await import("@/lib/demo-apis");
    const up = await media.upload({ file: await readFile(path.join(__dirname, "fixtures", "scene-a.png")), folder: "saakshi/test", context: { filename: "volunteers-at-cleanup.jpg" } });
    const status = async (u: string) => (await GET(new Request(new URL(u, "http://localhost:3000")))).status;
    const out = await tamperDemo(media, up.publicId, "blur_faces", status);
    expect(out).toMatchObject({ originalStatus: 200, tamperedStatus: 401, removed: "blur_faces" });
    if (!("error" in out)) {
      expect(out.urls.original).toContain("/e_blur_faces/");
      expect(out.urls.tampered).not.toContain("e_blur_faces");
      // Same signature on both: only the transformation changed.
      const sig = (u: string) => /\/s--[^/]+--\//.exec(u)?.[0];
      expect(sig(out.urls.tampered)).toBe(sig(out.urls.original));
    }
    expect(await tamperDemo(media, up.publicId, "sepia", status)).toMatchObject({ error: expect.stringContaining("No \"sepia\" step") });
  });
});

describe("/api/demo/tamper chips (B5.6)", () => {
  it("removing any chip, or several, is refused (401); removing none serves (200)", async () => {
    const { tamperChips } = await import("@/lib/demo-apis");
    const up = await media.upload({ file: await readFile(path.join(__dirname, "fixtures", "scene-a.png")), folder: "saakshi/test", context: { filename: "volunteers-at-cleanup.jpg" } });
    const status = async (u: string) => (await GET(new Request(new URL(u, "http://localhost:3000")))).status;
    for (const k of ["sig", "crop", "blur", "fmt"]) expect(await tamperChips(media, up.publicId, [k], status), k).toMatchObject({ originalStatus: 200, status: 401, removed: [k] });
    expect(await tamperChips(media, up.publicId, ["blur", "fmt"], status)).toMatchObject({ status: 401, removed: ["blur", "fmt"] });
    expect(await tamperChips(media, up.publicId, [], status)).toMatchObject({ status: 200, removed: [], chips: ["sig", "crop", "blur", "fmt", "asset"] });
    // The photo chip and unknown keys are ignored.
    expect(await tamperChips(media, up.publicId, ["asset", "nope"], status)).toMatchObject({ status: 200, removed: [] });
  });
});
