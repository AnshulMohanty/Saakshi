import { describe, expect, it } from "vitest";
import * as W from "@/lib/motion/scenes/witness-wall";
import { spotPx } from "@/lib/scenes/witness-wall";

describe("Witness Wall constants match the design source (WW:411-620)", () => {
  it("stage, plane and drift", () => {
    expect(W.STAGE).toEqual({ width: 1920, height: 1080, mapWidth: 1300, asideWidth: 620 });
    expect(W.PLANE).toMatchObject({ width: 1400, height: 1067, rotateX: 54, rotateZ: -10, perspective: 1500 });
    expect(W.DRIFT).toMatchObject({ move: 7, hold: 3, spot: { rotateZ: -14, scale: 1.7 }, overview: { x: 60, y: -40, rotateZ: -8 } });
  });
  it("arrival sequence and ripples", () => {
    expect(W.ARRIVAL.steps).toEqual([2.3, 2.9, 3.6, 4.4]);
    expect(W.ARRIVAL.drop).toEqual({ at: 0.1, dur: 0.8, from: { x: 450, y: -420, rotate: -4 }, to: { y: 250, rotate: 0 } });
    expect(W.ARRIVAL.toPin).toEqual({ at: 1.5, dur: 0.9, dx: 24, dy: -150, scale: 0.62 });
    expect(W.ARRIVAL.toList.at).toBe(7.4);
    expect(W.RIPPLE).toMatchObject({ count: 3, gap: 0.25, dur: 1.8, from: 0.3, to: 7 });
    expect(W.QUEUE.maxWaiting).toBe(3);
  });
  it("places spots on the plane as the prototype does (WW:518)", () => {
    const f = { lng0: 68, lng1: 89, lat0: 7, lat1: 23 };
    expect(spotPx({ lat: 23, lng: 68 }, f)).toEqual({ px: 0, py: 0 });
    expect(spotPx({ lat: 7, lng: 89 }, f)).toEqual({ px: 1400, py: 1067 });
  });
});

describe("the Wall's plane keeps equal pixels per degree", () => {
  it("is 1400×1067 on the prototype's frame and square on B5.10's", async () => {
    const { planeHeight } = await import("@/lib/scenes/witness-wall");
    expect(planeHeight({ lng0: 68, lng1: 89, lat0: 7, lat1: 23 })).toBe(1067);
    expect(planeHeight({ lng0: 68, lng1: 92, lat0: 6, lat1: 30 })).toBe(1400);
  });
});
