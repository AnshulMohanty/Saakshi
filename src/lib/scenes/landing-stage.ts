/**
 * The landing's one persistent WebGL stage (browser only): chapter 1 (evidence layers) and
 * chapter 2 (storm to map). A near-verbatim port of the design's landing_gl.js (three 0.168.0),
 * with its numbers in lib/motion/scenes/landing.ts and our data in place of the sample archive:
 *   - the storm tiles are the demo photos (StageInput.tiles), keyed by project;
 *   - project stacks follow LandingProject.stackDir/stackBelow (the prototype hard-coded
 *     Mumbai left, Pune below);
 *   - the dot field and its frame are B5.10's (the fixture passes the prototype's own);
 *   - layer art comes from lib/scenes/layers.ts (our coordinates, hash, tags, mask).
 * Render on demand: a dirty flag set by texture loads, resize and setHero/setStorm.
 */
import * as THREE from "three";
import type { Frame, LandingProject, StormPhoto } from "../landing/types";
import { CAMERA, CARD, CH1, DPR_CAP, GAP, HERO_TO_TILE as HT, LABELS, LAYER_FADE, MAP, MOBILE_BELOW, SPIN, STORM, TILT, COLORS } from "../motion/scenes/landing";
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

export interface StageInput {
  hero: { src: string; w: number; h: number; mask: string | null; layer: LayerInput };
  /** Storm tiles, the hero photo excluded (it is tile 0 of the hero project). */
  tiles: StormPhoto[];
  projects: LandingProject[];
  land: Array<[number, number]>;
  frame: Frame;
}

export interface StageFrame {
  hero: { labels: Array<{ x: number; y: number; o: number }>; card: { x: number; y: number; w: number; h: number }; recombined: number } | null;
  storm: { projects: Array<{ k: string; x: number; y: number; below: boolean; pin: { x: number; y: number }; o: number; count: number }> } | null;
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

  // Chapter 2: storm to map
  const spots = Object.fromEntries(D.projects.map((p) => [p.key, p]));
  const heroKey = D.projects.find((p) => p.isHero)?.key ?? D.projects[0]?.key ?? "";
  const projKey = (p: StormPhoto) => (spots[p.project] ? p.project : heroKey);
  // Slot 0 of the hero project is the hero photo.
  const slotCount: Record<string, number> = Object.fromEntries(D.projects.map((p) => [p.key, p.key === heroKey ? 1 : 0]));
  const r = rng(STORM.seed);
  const tileGeo = new THREE.PlaneGeometry(1, 1);
  const tiles = D.tiles.map((p, i) => {
    const m = new THREE.MeshBasicMaterial({ map: tex(p.src), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false });
    const me = new THREE.Mesh(tileGeo, m);
    me.renderOrder = 10 + i;
    scene.add(me);
    const k = projKey(p);
    return { p, me, m, k, slot: slotCount[k]++, asp: (p.w || 4) / (p.h || 3), sx: r() - 0.5, sy: r() - 0.5, sz: r(), rx: (r() - 0.5) * STORM.spin.x, ry: (r() - 0.5) * STORM.spin.y, rz: (r() - 0.5) * STORM.spin.z, d: r() };
  });
  const counts = { ...slotCount };
  const { lng0: LNG0, lng1: LNG1, lat0: LAT0, lat1: LAT1 } = D.frame;
  const rd = rng(MAP.dots.seed);
  const land = D.land.filter(([lng, lat]) => {
    const e = Math.min((LAT1 - lat) / MAP.dots.edge.lat, (lng - LNG0) / MAP.dots.edge.lng, (LNG1 - lng) / MAP.dots.edge.lng, 1);
    return rd() < e;
  });
  const dotPos = new Float32Array(land.length * 3);
  land.forEach(([lng, lat], i) => {
    dotPos[i * 3] = (lng - LNG0) / (LNG1 - LNG0) - 0.5;
    dotPos[i * 3 + 1] = (lat - LAT0) / (LAT1 - LAT0) - 0.5;
  });
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({ size: MAP.dots.size * renderer.getPixelRatio(), sizeAttenuation: false, color: new THREE.Color(COLORS.dotDay), transparent: true, opacity: 0, depthWrite: false });
  const mapGroup = new THREE.Group();
  scene.add(mapGroup);
  const dots = new THREE.Points(dotGeo, dotMat);
  mapGroup.add(dots);
  const pinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.pin), transparent: true, opacity: 0, depthWrite: false });
  const pinGeo = new THREE.CircleGeometry(1, 32);
  const pins = D.projects.map((s) => {
    const me = new THREE.Mesh(pinGeo, pinMat);
    mapGroup.add(me);
    return { k: s.key, s, me };
  });
  const dayColor = new THREE.Color(COLORS.dotDay);
  const nightColor = new THREE.Color(COLORS.dotNight);

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
  const mapDims = () => {
    const aspect = ((LNG1 - LNG0) / (LAT1 - LAT0)) * MAP.aspectSquash;
    const m = mobile ? MAP.mobile : MAP.desktop;
    const mw = Math.min(vw * m.widthOfView, vh * m.heightOfView * aspect);
    return { mw, mh: mw / aspect, cx: vw * m.x, cy: vh * m.y };
  };
  type M = ReturnType<typeof mapDims>;
  const geo2map = (lat: number, lng: number, M: M) => new THREE.Vector3(((lng - LNG0) / (LNG1 - LNG0) - 0.5) * M.mw, ((lat - LAT0) / (LAT1 - LAT0) - 0.5) * M.mh, 0);
  const qMap = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const qId = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  const st = STORM.stack;

  function stackPos(k: string, slot: number, M: M, ts: number) {
    const s = spots[k];
    const base = geo2map(s.lat, s.lng, M);
    const g = ts * st.gap;
    const c = slot % st.cols;
    const rw = Math.floor(slot / st.cols);
    const dir = s.stackDir;
    const x = base.x + dir * (ts * st.offsetX + c * g);
    const y = base.y + (s.stackBelow ? ts * st.below : ts * st.above) - rw * g;
    return new THREE.Vector3(x, y, 0.01);
  }

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
    let px = lerp(0, cardX, a);
    let py = lerp(0, cardY, a);
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
    // ---------- Chapter 2 (hero card becomes the hero project's tile 0)
    const q = pStorm;
    const M = mapDims();
    mapGroup.position.set(M.cx, M.cy, 0);
    dots.scale.set(M.mw, M.mh, 1);
    mapGroup.rotation.x = -MAP.tilt * eio(seg(q, MAP.tiltWindow[0], MAP.tiltWindow[1]));
    mapGroup.updateMatrixWorld();
    mapGroup.getWorldQuaternion(qMap);
    const ts = M.mw * (mobile ? STORM.tileSize.mobile : STORM.tileSize.desktop);
    if (q > 0 && spots[heroKey]) {
      const h1 = eio(seg(q, HT.h1[0], HT.h1[1]));
      const h2 = eio(seg(q, HT.h2[0], HT.h2[1]));
      const h3 = eio(seg(q, HT.h3[0], HT.h3[1]));
      const stormP = new THREE.Vector3(vw * HT.storm.x, vh * HT.storm.y, HT.storm.z);
      const hs = spots[heroKey];
      const onMap = mapGroup.localToWorld(geo2map(hs.lat, hs.lng, M));
      const inStack = mapGroup.localToWorld(stackPos(heroKey, 0, M, ts));
      const target = onMap.clone().lerp(inStack, h3);
      const pos = new THREE.Vector3(px, py, 0).lerp(stormP, h1).lerp(target, h2);
      sc = lerp(lerp(hc, ts * HT.size.storm, h1), ts * (HT.size.stack + HT.size.stackGrow * h3), h2);
      px = pos.x;
      py = pos.y;
      heroOuter.position.z = pos.z;
      heroTilt.rotation.x = lerp(lerp(0, HT.tiltX, h1), 0, h2);
      heroSpin.rotation.z = lerp(lerp(0, HT.spinZ, h1), 0, h2);
      if (h2 > 0) heroOuter.quaternion.slerpQuaternions(qId, qMap, h2);
      else heroOuter.quaternion.identity();
    } else {
      heroOuter.position.z = 0;
      heroOuter.quaternion.identity();
    }
    heroOuter.position.x = px;
    heroOuter.position.y = py;
    heroOuter.scale.setScalar(sc);
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

    // storm tiles
    const vis = q > 0 && q < 1.0001;
    dotMat.opacity = MAP.dots.opacity * eio(seg(q, MAP.dots.fade[0], MAP.dots.fade[1]));
    dotMat.color.copy(dayColor).lerp(nightColor, seg(q, MAP.dots.recolour[0], MAP.dots.recolour[1]));
    pinMat.opacity = eio(seg(q, MAP.pins.fade[0], MAP.pins.fade[1]));
    pins.forEach((pn) => {
      pn.me.position.copy(geo2map(pn.s.lat, pn.s.lng, M));
      pn.me.position.z = 0.005;
      pn.me.scale.setScalar(ts * MAP.pins.size);
    });
    for (const t of tiles) {
      const m = t.me;
      m.visible = vis;
      if (!vis) continue;
      const stg = t.d * STORM.stagger;
      const e1 = eo(seg(q, STORM.e1.from + stg * STORM.e1.staggerFrom, STORM.e1.to + stg));
      const e2 = eio(seg(q, STORM.e2.from + stg * STORM.e2.staggerFrom, STORM.e2.to + stg * STORM.e2.staggerTo));
      const e3 = eio(seg(q, STORM.e3.from + stg * STORM.e3.staggerFrom, STORM.e3.to + stg * STORM.e3.staggerTo));
      const start = new THREE.Vector3(t.sx * vw * STORM.start.spread, t.sy * vh * STORM.start.spread, STORM.start.z - t.sz * STORM.start.zRandom);
      const swirl = q * STORM.swirl.speed + t.d * STORM.swirl.phase;
      const R = mobile ? STORM.ring.mobile : STORM.ring.desktop;
      const stormPos = new THREE.Vector3(t.sx * vw * R * STORM.ring.xStretch + Math.cos(swirl) * STORM.swirl.radius, t.sy * vh * R + Math.sin(swirl) * STORM.swirl.radius, STORM.ring.z + t.sz * STORM.ring.zRandom);
      const lat = t.p.lat ?? spots[t.k].lat;
      const lng = t.p.lng ?? spots[t.k].lng;
      const onMapL = geo2map(clamp(lat, LAT0, LAT1), clamp(lng, LNG0, LNG1), M);
      onMapL.z = 0.02;
      const target = mapGroup.localToWorld(onMapL.lerp(stackPos(t.k, t.slot, M, ts), e3));
      const pos = start.lerp(stormPos, e1).lerp(target, e2);
      m.position.copy(pos);
      const tumble = 1 - e2;
      eTmp.set(t.rx * tumble + q * t.rx * STORM.spin.tumble * tumble, t.ry * tumble, t.rz * tumble);
      qTmp.setFromEuler(eTmp);
      m.quaternion.copy(qTmp).slerp(qMap, e2);
      const size = lerp(ts * STORM.size.storm, lerp(ts * STORM.size.map, ts, e3), e2);
      const w = t.asp >= 1 ? size : size * t.asp;
      const h = t.asp >= 1 ? size / t.asp : size;
      const fit = e3; // tiles become squares in stacks
      m.scale.set(lerp(w, ts, fit), lerp(h, ts, fit), 1);
      t.m.opacity = e1;
    }
    if (q > 0.5) {
      out.storm = {
        projects: D.projects.map((s) => {
          const k = s.key;
          const rows = Math.ceil(counts[k] / st.cols);
          const corner = s.labelBelow ? stackPos(k, (rows - 1) * st.cols + (st.cols - 1), M, ts).add(new THREE.Vector3(-ts / 2, -ts / 2, 0)) : stackPos(k, 0, M, ts).add(new THREE.Vector3(-ts / 2, ts / 2, 0));
          const at = toPx(mapGroup.localToWorld(corner));
          const pin = toPx(mapGroup.localToWorld(geo2map(s.lat, s.lng, M)));
          return { k, x: at.x, y: at.y, below: s.labelBelow, pin, o: eio(seg(q, MAP.labels.fade[0], MAP.labels.fade[1])), count: counts[k] };
        }),
      };
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
      for (const m of [...layerMats, ...tiles.map((t) => t.m), dotMat, pinMat]) {
        m.map?.dispose();
        m.dispose();
      }
      for (const g of [geo, tileGeo, dotGeo, pinGeo]) g.dispose();
      renderer.dispose();
    },
  };
}
