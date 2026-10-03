/**
 * The landing's one persistent WebGL stage (browser only): chapter 1 (evidence layers) and
 * chapter 2 (storm to map). Ported from the design's landing_gl.js (three 0.168.0), with its
 * numbers in lib/motion/scenes/landing.ts and our data in place of the sample archive:
 *   - the storm tiles are the demo photos (StageInput.tiles), keyed by project; they are large and
 *     mostly face the viewer, and keep clear of the headline (StageTargets.avoid);
 *   - the map is the shared India map (components/map/india-map.tsx), a DOM layer under this
 *     canvas: tiles fly to its pins and then to the cells of each project's photo grid
 *     (StageTargets.site / cell, read from the DOM), where the DOM grid takes over;
 *   - layer art comes from lib/scenes/layers.ts (our coordinates, hash, tags, mask).
 * Render on demand: a dirty flag set by texture loads, resize and setHero/setStorm.
 */
import * as THREE from "three";
import { heroKeyOf, stormSlots } from "../landing/storm-slots";
import type { LandingProject, StormPhoto } from "../landing/types";
import { CAMERA, CARD, CH1, DPR_CAP, GAP, HERO_TO_TILE as HT, LABELS, LAYER_FADE, MOBILE_BELOW, SPIN, STORM, TILT } from "../motion/scenes/landing";
import { drawLayers, loadImage, type LayerInput } from "./layers";
import { rng } from "./rng";

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Cubic in-out (GL:7). */
export const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Expo out (GL:8). */
export const eo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** Park–Miller (GL:9): ./rng.ts, re-exported for the stage and its tests. */
export { rng };

/** Screen-space targets read from the DOM (px, centre points). Null until the map has drawn. */
export interface StageTargets {
  /** The centre and size of a project's grid cell on the map. */
  cell(k: string, slot: number): { x: number; y: number; w: number } | null;
  /** A project's pin. */
  site(k: string): { x: number; y: number } | null;
  /** The headline's box: storm photos keep out of it. */
  avoid(): { x: number; y: number; w: number; h: number } | null;
}

export interface StageInput {
  hero: { src: string; w: number; h: number; mask: string | null; layer: LayerInput };
  /** Storm tiles, the hero photo excluded (it is tile 0 of the hero project). */
  tiles: StormPhoto[];
  projects: LandingProject[];
  targets?: StageTargets;
}

export interface StageFrame {
  hero: { labels: Array<{ x: number; y: number; o: number }>; card: { x: number; y: number; w: number; h: number }; recombined: number } | null;
  storm: null;
}

export interface Stage {
  setHero(p: number): void;
  setStorm(p: number): void;
  counts: Record<string, number>;
  /** Layer art canvases (the still stack reuses them). */
  art: HTMLCanvasElement[];
  dispose(): void;
}

export async function createStage(canvas: HTMLCanvasElement, D: StageInput, onFrame?: (o: StageFrame) => void): Promise<Stage> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  cam.position.set(0, 0, CAMERA.z);
  // project() reads matrixWorldInverse, which render() would set only after the first frame.
  cam.updateMatrixWorld();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  let dirty = true;
  const tex = (src: string) => {
    const t = loader.load(src, () => {
      dirty = true;
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const ctex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  const maskImg = await loadImage(D.hero.mask);
  const art = await drawLayers(D.hero.layer, maskImg);

  // Chapter 1: evidence layers
  const A = D.hero.w / D.hero.h;
  const heroOuter = new THREE.Group();
  const heroTilt = new THREE.Group();
  const heroSpin = new THREE.Group();
  heroOuter.add(heroTilt);
  heroTilt.add(heroSpin);
  scene.add(heroOuter);
  const geo = new THREE.PlaneGeometry(A, 1);
  const layerMats = [tex(D.hero.src), ...art.map(ctex)].map((map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const layers = layerMats.map((m, i) => {
    const me = new THREE.Mesh(geo, m);
    me.renderOrder = i;
    heroSpin.add(me);
    return me;
  });
  const corners = [
    [-A / 2, -0.5],
    [A / 2, -0.5],
    [A / 2, 0.5],
    [-A / 2, 0.5],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));

  // Chapter 2: storm to map (the map itself is the DOM India map under this canvas)
  const heroKey = heroKeyOf(D.projects);
  const { slots, counts } = stormSlots(D.tiles, D.projects);
  const r = rng(STORM.seed);
  const tileGeo = new THREE.PlaneGeometry(1, 1);
  const tiles = D.tiles.map((p, i) => {
    const m = new THREE.MeshBasicMaterial({ map: tex(p.src), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false });
    const me = new THREE.Mesh(tileGeo, m);
    me.renderOrder = 10 + i;
    scene.add(me);
    return { p, me, m, k: slots[i].k, slot: slots[i].slot, asp: (p.w || 4) / (p.h || 3), sx: r() - 0.5, sy: r() - 0.5, sz: r(), rx: (r() - 0.5) * STORM.spin.x, ry: (r() - 0.5) * STORM.spin.y, rz: (r() - 0.5) * STORM.spin.z, d: r() };
  });
  const T = D.targets;

  let vw = 1;
  let vh = 1;
  let mobile = false;
  let W = 1;
  let H = 1;
  let pHero = 0;
  let pStorm = 0;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    mobile = W < MOBILE_BELOW;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    vh = 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    vw = vh * cam.aspect;
    dirty = true;
  }
  resize();
  window.addEventListener("resize", resize);

  const v = new THREE.Vector3();
  const toPx = (vec: THREE.Vector3) => {
    v.copy(vec).project(cam);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  };
  const qTmp = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  /** Screen px → world at depth z (camera at CAMERA.z looking down −z). */
  const toWorld = (x: number, y: number, z: number) => {
    const k = (CAMERA.z - z) / CAMERA.z;
    return new THREE.Vector3((x / W - 0.5) * vw * k, (0.5 - y / H) * vh * k, z);
  };
  /** World → screen px for a point at its own depth. */
  const pxOf = (p: THREE.Vector3) => {
    const k = (CAMERA.z - p.z) / CAMERA.z;
    return { x: (p.x / (vw * k) + 0.5) * W, y: (0.5 - p.y / (vh * k)) * H };
  };

  function update(): StageFrame {
    const out: StageFrame = { hero: null, storm: null };
    // ---------- Chapter 1
    const p = pHero;
    const a = eio(seg(p, CH1.a[0], CH1.a[1]));
    const b = eio(seg(p, CH1.b[0], CH1.b[1]));
    const c = eio(seg(p, CH1.c[0], CH1.c[1]));
    const s0 = Math.max(vw / A, vh) * 1.001;
    const card = mobile ? CARD.mobile : CARD.desktop;
    const hc = Math.min(vh * card.heightOfView, (vw * card.maxWidthOfView) / A);
    const cardX = vw * card.x;
    const cardY = vh * card.y;
    const tilt = a * (1 - c);
    const sep = b * (1 - c);
    let sc = lerp(s0, hc, a);
    // Recombined, the card moves aside (desktop) so the seal's ledger has the left half.
    let px = lerp(0, cardX, a) + vw * card.sealShiftX * c;
    let py = lerp(0, cardY, a) + vh * card.sealY * c;
    const th = TILT * tilt;
    const ph = SPIN * tilt;
    heroTilt.rotation.x = -th;
    heroSpin.rotation.z = ph;
    const gap = mobile ? GAP.mobile : GAP.desktop;
    layers.forEach((l, i) => {
      l.position.z = i * gap * sep;
      if (i > 0) (l.material as THREE.MeshBasicMaterial).opacity = clamp(b * LAYER_FADE.gain - (i - 1) * LAYER_FADE.step) * (1 - c);
    });
    py -= 4 * gap * sep * Math.sin(th) * sc * 0.5;
    // ---------- Chapter 2: the hero card flies to the hero project's pin, then into cell 0 of its grid
    const q = pStorm;
    const site = (k: string) => T?.site(k) ?? null;
    const cell = (k: string, slot: number) => T?.cell(k, slot) ?? null;
    const hand = seg(q, STORM.handoff[0], STORM.handoff[1]);
    if (q > 0) {
      const h1 = eio(seg(q, HT.h1[0], HT.h1[1]));
      const h2 = eio(seg(q, HT.h2[0], HT.h2[1]));
      const h3 = eio(seg(q, HT.h3[0], HT.h3[1]));
      const stormP = new THREE.Vector3(vw * HT.storm.x, vh * HT.storm.y, HT.storm.z);
      const pin = site(heroKey);
      const c0 = cell(heroKey, 0);
      const onMap = pin ? toWorld(pin.x, pin.y, 0.02) : stormP.clone();
      const inCell = c0 ? toWorld(c0.x, c0.y, 0.02) : onMap.clone();
      const pos = new THREE.Vector3(px, py, 0).lerp(stormP, h1).lerp(onMap.lerp(inCell, h3), h2);
      const cw = c0 ? (c0.w / W) * vw : vh * 0.05;
      const stormH = vh * (mobile ? STORM.size.stormMobile : STORM.size.storm);
      sc = lerp(lerp(hc, stormH, h1), lerp(cw * HT.size.site, cw, h3), h2);
      px = pos.x;
      py = pos.y;
      heroOuter.position.z = pos.z;
      heroTilt.rotation.x = lerp(lerp(0, HT.tiltX, h1), 0, h2);
      heroSpin.rotation.z = lerp(lerp(0, HT.spinZ, h1), 0, h2);
      // In the grid every cell is square: squeeze the card's width to its height.
      heroOuter.scale.set(sc * lerp(1, 1 / A, h3), sc, sc);
      (layers[0].material as THREE.MeshBasicMaterial).opacity = 1 - hand;
    } else {
      heroOuter.position.z = 0;
      heroOuter.scale.setScalar(sc);
      (layers[0].material as THREE.MeshBasicMaterial).opacity = 1;
    }
    heroOuter.quaternion.identity();
    heroOuter.position.x = px;
    heroOuter.position.y = py;
    if (q <= 0) heroOuter.scale.setScalar(sc);
    heroOuter.updateMatrixWorld(true);

    if (q <= 0) {
      const labels = layers.map((l, i) => {
        let best: { x: number; y: number } | null = null;
        for (const cn of corners) {
          const w = toPx(l.localToWorld(cn.clone()));
          if (!best || w.x > best.x) best = w;
        }
        const o = seg(b, LABELS.start + i * LABELS.stagger, LABELS.end + i * LABELS.stagger) * (1 - seg(c, 0, LABELS.fadeOutOfC));
        return { x: best!.x, y: best!.y, o };
      });
      const pts = corners.map((cn) => toPx(layers[0].localToWorld(cn.clone())));
      const xs = pts.map((t) => t.x);
      const ys = pts.map((t) => t.y);
      out.hero = { labels, card: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, recombined: c };
    }

    // ---------- storm tiles: large, mostly facing the viewer, clear of the headline
    const vis = q > 0 && q < 1.0001 && hand < 1;
    const avoid = vis ? (T?.avoid() ?? null) : null;
    const stormH = vh * (mobile ? STORM.size.stormMobile : STORM.size.storm);
    for (const t of tiles) {
      const m = t.me;
      m.visible = vis;
      if (!vis) continue;
      const stg = t.d * STORM.stagger;
      const e1 = eo(seg(q, STORM.e1.from + stg * STORM.e1.staggerFrom, STORM.e1.to + stg));
      const e2 = eio(seg(q, STORM.e2.from + stg * STORM.e2.staggerFrom, STORM.e2.to + stg * STORM.e2.staggerTo));
      const e3 = eio(seg(q, STORM.e3.from + stg * STORM.e3.staggerFrom, STORM.e3.to + stg * STORM.e3.staggerTo));
      const start = new THREE.Vector3(t.sx * vw * STORM.start.spread, t.sy * vh * STORM.start.spread, STORM.start.z - t.sz * STORM.start.zRandom);
      const R = mobile ? STORM.ring.mobile : STORM.ring.desktop;
      const ringZ = STORM.ring.z + t.sz * STORM.ring.zRandom;
      let ring = new THREE.Vector3(t.sx * vw * R * STORM.ring.xStretch, t.sy * vh * R, ringZ);
      if (avoid) {
        // Keep the headline readable: a photo whose spot falls on it moves beside it (desktop) or below it (phone).
        const half = (stormH * 0.62 * H) / vh;
        const at = pxOf(ring);
        const m0 = STORM.avoidMarginPx;
        if (at.x > avoid.x - half - m0 && at.x < avoid.x + avoid.w + half + m0 && at.y > avoid.y - half - m0 && at.y < avoid.y + avoid.h + half + m0) {
          const wide = avoid.w > W * 0.6;
          const nx = wide ? at.x : avoid.x + avoid.w + half + m0 + t.d * Math.max(0, W - (avoid.x + avoid.w + half * 2 + m0 * 2));
          const ny = wide ? avoid.y + avoid.h + half + m0 + t.d * Math.max(0, H - (avoid.y + avoid.h + half * 2 + m0 * 2)) : at.y;
          ring = toWorld(nx, ny, ringZ);
        }
      }
      const swirl = q * STORM.swirl.speed + t.d * STORM.swirl.phase;
      const stormPos = ring.add(new THREE.Vector3(Math.cos(swirl) * STORM.swirl.radius, Math.sin(swirl) * STORM.swirl.radius, 0));
      const pin = site(t.k);
      const cl = cell(t.k, t.slot);
      // On the way to the grid each photo first gathers at its project's pin.
      const atPin = pin ? toWorld(pin.x + t.sx * (cl?.w ?? 20) * 2, pin.y + t.sy * (cl?.w ?? 20) * 2, 0.02) : stormPos.clone();
      const inCell = cl ? toWorld(cl.x, cl.y, 0.02) : atPin.clone();
      const pos = start.lerp(stormPos, e1).lerp(atPin.lerp(inCell, e3), e2);
      m.position.copy(pos);
      const tumble = 1 - e2;
      eTmp.set(t.rx * tumble + q * t.rx * STORM.spin.tumble * tumble, t.ry * tumble, t.rz * tumble);
      qTmp.setFromEuler(eTmp);
      m.quaternion.copy(qTmp);
      const cw = cl ? (cl.w / W) * vw : vh * 0.04;
      // Storm: aspect kept, height stormH. Gathering: smaller. In the grid: the square cell.
      const hStorm = stormH;
      const hPin = cw * STORM.size.pin;
      const hh = lerp(hStorm, lerp(hPin, cw, e3), e2);
      const w = lerp(hh * t.asp, cw, e3 * e2);
      const h = lerp(hh, cw, e3 * e2);
      m.scale.set(w, h, 1);
      t.m.opacity = e1 * (1 - hand);
    }
    heroOuter.visible = !(q >= 1);
    return out;
  }

  let raf = 0;
  let alive = true;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!dirty) return;
    dirty = false;
    const o = update();
    renderer.render(scene, cam);
    onFrame?.(o);
  }
  // Warm-up, so the first frame is not one long task that compiles every shader and uploads every
  // texture (it was 0.5 s, Lighthouse TBT): shaders compile in parallel where the driver allows,
  // then the textures that already have pixels (the layer art) upload a few per frame. Photo
  // textures upload as each image arrives.
  await renderer.compileAsync(scene, cam);
  const ready = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m && !Array.isArray(m) && "map" in m && m.map instanceof THREE.Texture && m.map.image) ready.add(m.map);
  });
  let uploaded = 0;
  for (const t of ready) {
    if (!alive) break;
    renderer.initTexture(t);
    if (++uploaded % 2 === 0) await new Promise((r) => requestAnimationFrame(r));
  }
  loop();
  return {
    setHero(p) {
      if (p !== pHero) {
        pHero = p;
        dirty = true;
      }
    },
    setStorm(p) {
      if (p !== pStorm) {
        pStorm = p;
        dirty = true;
      }
    },
    counts,
    art,
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      for (const m of [...layerMats, ...tiles.map((t) => t.m)]) {
        m.map?.dispose();
        m.dispose();
      }
      for (const g of [geo, tileGeo]) g.dispose();
      renderer.dispose();
    },
  };
}
