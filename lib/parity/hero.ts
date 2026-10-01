import "server-only";
/**
 * The prototype's hero photo as layer-art input (SK.drawLayers' where / fingerprint / AI /
 * measured), shared by the /dev/parity fixtures that show its layers (evidence page, app drawer).
 * The AI boxes are the prototype's hand-placed ones on its 1920 × 1440 photo.
 */
import { fullDateTime } from "../charts/time-axis";
import type { LayerInput } from "../scenes/layers";
import type { Archive } from "./archive";

const BOXES: Array<[string, number, number, number, number]> = [
  ["tractor", 140, 510, 510, 750],
  ["debris", 580, 470, 880, 680],
  ["horse cart", 700, 500, 1300, 960],
  ["horse", 1265, 575, 1490, 765],
  ["person, face blurred", 1462, 555, 1565, 772],
];

export const heroWhen = (D: Archive) => fullDateTime(Date.parse(D.hero.taken), "second", 330, { seconds: true });

export function heroLayer(D: Archive): LayerInput {
  return {
    bits: D.hero.hash,
    lat: D.hero.lat,
    lng: D.hero.lng,
    when: heroWhen(D),
    extra: `altitude ${D.hero.alt} m`,
    aiBoxes: BOXES.map(([label, a, b, c, d]) => ({ label, x0: a / 1920, y0: b / 1440, x1: c / 1920, y1: d / 1440 })),
    aiTags: [],
  };
}
