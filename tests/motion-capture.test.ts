/** Capture motion constants pinned against the design source (lib/motion/scenes/capture.ts). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEED_DRIFT, HUD_TWEEN, SAMPLE_MS, SHUTTER, SIM, simSample, VIBRATE } from "@/lib/motion/scenes/capture";

const src = (() => {
  try {
    return readFileSync(path.join(__dirname, "..", "design", "unpacked", "capture", "template.html"), "utf8");
  } catch {
    return null;
  }
})();

describe("capture motion constants", () => {
  it.skipIf(!src)("match the prototype's shutter timeline (CA:470-485)", () => {
    expect(src).toContain(`tl.fromTo('#flash', { opacity: ${SHUTTER.flash.from} }, { opacity: 0, duration: ${SHUTTER.flash.duration} })`);
    expect(src).toContain(`.set('#glyph', { opacity: 1 }, ${SHUTTER.glyphIn})`);
    expect(src).toContain(`{ opacity: 1, duration: ${SHUTTER.cells.duration}, stagger: { each: ${SHUTTER.cells.each}, from: 'start' } }, ${SHUTTER.cells.at})`);
    expect(src).toContain(`borderRadius: ${SHUTTER.fly.radius}, duration: ${SHUTTER.fly.duration}, ease: '${SHUTTER.fly.ease}' }, ${SHUTTER.fly.at})`);
    expect(src).toContain(`.to('#sheet', { transform: '${SHUTTER.sheet.shown}', duration: ${SHUTTER.sheet.duration}, ease: '${SHUTTER.sheet.ease}' }, ${SHUTTER.sheet.at})`);
    expect(src).toContain(`null, ${SHUTTER.steps.from} + i * ${SHUTTER.steps.every})`);
    expect(src).toContain(`duration: ${SHUTTER.score.duration}, ease: '${SHUTTER.score.ease}'`);
    expect(src).toContain(`}, null, ${SHUTTER.doneAt});`);
    expect(src).toContain(`null, ${SHUTTER.offlineDoneAt});`);
    expect(src).toContain(`tl.timeScale(${SHUTTER.instantScale})`);
    expect(src).toContain(`navigator.vibrate(${VIBRATE.shutter})`);
    expect(src).toContain(`navigator.vibrate([${VIBRATE.scored.join(", ")}])`);
  });

  it.skipIf(!src)("match the prototype's HUD and drift (CA:438-448)", () => {
    expect(src).toContain(`}, ${SAMPLE_MS});`);
    expect(src).toContain(`duration: ${HUD_TWEEN.duration}, ease: '${HUD_TWEEN.ease}', overwrite: true`);
    expect(src).toContain(`{ x: ${FEED_DRIFT.x}, y: ${FEED_DRIFT.y}, rotate: ${FEED_DRIFT.rotate}, duration: ${FEED_DRIFT.duration}, ease: '${FEED_DRIFT.ease}', yoyo: true, repeat: -1 }`);
    expect(src).toContain(`s.acc * ${SIM.decay} + (Math.random() - 0.5) * ${SIM.noise}`);
    expect(src).toContain(`const floor = this.state.mode === 'low' ? ${SIM.floor.low} : ${SIM.floor.live};`);
    expect(src).toContain(`state = { mode: 'live', acc: ${SIM.start.acc}, level: ${SIM.start.level}`);
  });

  it("simulates the prototype's GPS: decay to the floor, level settles", () => {
    let s = { acc: 30, level: 0 };
    const mid = () => 0.5;
    const seen: number[] = [];
    for (let i = 0; i < 16; i++) seen.push((s = simSample(s, false, mid)).acc);
    expect(seen.slice(0, 4)).toEqual([26, 22, 19, 16]);
    expect(seen.at(-1)).toBe(SIM.floor.live);
    expect(simSample({ acc: 48, level: 0 }, true, mid).acc).toBe(41);
    expect(simSample({ acc: 37, level: 0 }, true, mid).acc).toBe(SIM.floor.low);
    expect(simSample({ acc: 30, level: 6 }, false, () => 1).level).toBe(4);
    expect(simSample({ acc: 30, level: 1 }, false, () => 1).level).toBe(2);
    expect(Object.is(simSample({ acc: 30, level: 1 }, false, mid).level, 0)).toBe(true);
  });
});
