// ─────────────────────────────────────────────────────────────
// Procedural PCB in Three.js.
//   • four physical layers: FR-4 core, copper, solder mask (+pads, silkscreen), parts
//   • signal pulses running along the traces
//   • setExplode(0..1) separates the layers (driven by GSAP ScrollTrigger)
//   • mouse parallax, idle drift, render-on-demand when off-screen
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = {
  ink: 0x0b0b14, cobalt: 0x0000c4, signal: 0xff220f, hazard: 0xfeea4d, mint: 0x00d8a7,
  fr4: 0xd9cfb3, metal: 0xc6c6cf, gold: 0xd6a945, tan: 0xc9a27a, module: 0x15153a,
};

type Pt = [number, number]; // board coords: x ∈ [-3, 3], z ∈ [-2, 2]

export interface PcbOptions { reducedMotion: boolean; onReady?: () => void }

const yieldToMain = () => new Promise<void>((res) => { const s = (globalThis as any).scheduler; if (s?.yield) s.yield().then(res); else setTimeout(res, 0); });

export async function initPcb(container: HTMLElement, labels: Record<string, HTMLElement>, opts: PcbOptions) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'absolute inset-0 h-full w-full';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  // ── lights ──
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d5c9, 1.55));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(4, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6);
  fill.position.set(-6, 4, -3);
  scene.add(fill);

  // ── materials ──
  const mat = {
    fr4: new THREE.MeshStandardMaterial({ color: C.fr4, roughness: 0.85 }),
    fr4Edge: new THREE.MeshStandardMaterial({ color: 0xb9ad8c, roughness: 0.9 }),
    copper: new THREE.MeshStandardMaterial({ color: C.cobalt, roughness: 0.45, metalness: 0.1 }),
    mask: new THREE.MeshStandardMaterial({ color: C.mint, roughness: 0.35, transparent: true, opacity: 0.8, depthWrite: false }),
    pad: new THREE.MeshStandardMaterial({ color: C.hazard, roughness: 0.3, metalness: 0.35 }),
    ink: new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.32, metalness: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.3, metalness: 0.8 }),
    tan: new THREE.MeshStandardMaterial({ color: C.tan, roughness: 0.6 }),
    module: new THREE.MeshStandardMaterial({ color: C.module, roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: C.signal, roughness: 0.4 }),
    cobalt: new THREE.MeshStandardMaterial({ color: C.cobalt, roughness: 0.45 }),
    led: new THREE.MeshStandardMaterial({ color: C.signal, emissive: C.signal, emissiveIntensity: 1.2, roughness: 0.2 }),
    pulse: new THREE.MeshBasicMaterial({ color: C.signal, transparent: true, depthTest: false }),
    pulse2: new THREE.MeshBasicMaterial({ color: C.hazard, transparent: true, depthTest: false }),
  };

  await yieldToMain();
  const board = new THREE.Group();
  scene.add(board);
  const L = {
    core: new THREE.Group(),
    copper: new THREE.Group(),
    mask: new THREE.Group(),
    parts: new THREE.Group(),
  };
  const base = { core: 0, copper: 0.086, mask: 0.1, parts: 0.111 };
  const spread = { core: -1.45, copper: -0.45, mask: 0.55, parts: 1.6 };
  Object.values(L).forEach((g) => board.add(g));

  const shadowable = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w: number, h: number, d: number, m: THREE.Material, r = 0) =>
    shadowable(new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m));

  // ── L0: FR-4 core ──
  const core = box(6, 0.16, 4, [mat.fr4Edge, mat.fr4Edge, mat.fr4, mat.fr4, mat.fr4Edge, mat.fr4Edge] as unknown as THREE.Material);
  L.core.add(core);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.13 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.085;
  floor.receiveShadow = true;
  L.core.add(floor);

  // ── L1: copper traces ──
  const W = 0.055, H = 0.014;
  const traces: Pt[][] = [
    [[-0.58, -0.25], [0.05, -0.25], [0.45, -0.65], [0.45, -0.95]],          // I2C SCL → ADXL345
    [[-0.58, -0.1], [0.12, -0.1], [0.6, -0.58], [0.6, -0.95]],             // I2C SDA
    [[-0.58, 0.3], [0.35, 0.3], [0.62, 0.57], [0.85, 0.57]],                // UART TX → ESP32
    [[-0.58, 0.45], [0.3, 0.45], [0.55, 0.7], [0.85, 0.7]],                 // UART RX
    [[-2.7, -0.55], [-2.05, -0.55], [-1.85, -0.35], [-1.82, -0.35]],        // USB D+
    [[-2.7, -0.68], [-2.0, -0.68], [-1.82, -0.5]],                          // USB D-
    [[-1.2, -1.05], [-1.2, -0.62]],                                         // crystal
    [[-0.2, -0.62], [-0.2, -1.55], [2.2, -1.55], [2.45, -1.55]],            // GPIO → LED
    [[-1.55, 0.82], [-1.55, 1.45]], [[-1.35, 0.82], [-1.35, 1.45]], [[-1.15, 0.82], [-1.15, 1.45]],
    [[-0.95, 0.82], [-0.95, 1.2], [-0.75, 1.45]], [[-0.75, 0.82], [-0.75, 1.0], [-0.35, 1.45]],
    [[-0.58, 0.62], [0.2, 0.62], [0.2, 1.2], [0.3, 1.3]],                   // button
    [[0.9, -1.0], [1.6, -1.0], [1.95, -0.65], [1.95, -0.05]],               // ADXL INT1 → ESP32 (shared)
    [[-2.1, 0.2], [-2.6, 0.2], [-2.6, 1.6], [-2.2, 1.6]],
  ];
  const segs: THREE.BufferGeometry[] = [];
  for (const path of traces) {
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, z1] = path[i], [x2, z2] = path[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const g = new THREE.BoxGeometry(len, H, W);
      g.rotateY(-Math.atan2(z2 - z1, x2 - x1));
      g.translate((x1 + x2) / 2, 0, (z1 + z2) / 2);
      segs.push(g.toNonIndexed());
    }
    for (const [x, z] of path) {
      const g = new THREE.CylinderGeometry(W / 2, W / 2, H, 12);
      g.translate(x, 0, z);
      segs.push(g.toNonIndexed());
    }
  }
  const copperMesh = new THREE.Mesh(mergeGeometries(segs), mat.copper);
  copperMesh.receiveShadow = true;
  L.copper.add(copperMesh);

  // signal pulses travelling along selected traces
  const pulseGeo = new THREE.SphereGeometry(0.05, 12, 8);
  const pulses: { mesh: THREE.Mesh; path: Pt[]; len: number[]; total: number; speed: number; t: number }[] = [];
  [0, 1, 2, 3, 4, 7, 14].forEach((ti, i) => {
    const path = traces[ti];
    const len: number[] = [];
    let total = 0;
    for (let k = 0; k < path.length - 1; k++) { const l = Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]); len.push(l); total += l; }
    const mesh = new THREE.Mesh(pulseGeo, i % 3 === 2 ? mat.pulse2 : mat.pulse);
    mesh.renderOrder = 10;
    L.copper.add(mesh);
    pulses.push({ mesh, path, len, total, speed: 0.9 + (i % 3) * 0.35, t: Math.random() * total });
  });
  const placePulse = (p: (typeof pulses)[number]) => {
    let d = p.t % p.total;
    for (let k = 0; k < p.len.length; k++) {
      if (d <= p.len[k]) {
        const a = p.path[k], b = p.path[k + 1], f = d / p.len[k];
        p.mesh.position.set(a[0] + (b[0] - a[0]) * f, 0.03, a[1] + (b[1] - a[1]) * f);
        return;
      }
      d -= p.len[k];
    }
  };
  pulses.forEach(placePulse);

  await yieldToMain();
  // ── L2: solder mask + exposed pads + silkscreen ──
  const mask = new THREE.Mesh(new RoundedBoxGeometry(6, 0.02, 4, 2, 0.008), mat.mask);
  mask.renderOrder = 5;
  L.mask.add(mask);

  const padGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16);
  const vias: Pt[] = [[0.45, -0.65], [0.6, -0.58], [0.62, 0.57], [-2.05, -0.55], [-0.2, -1.55], [1.95, -0.65], [-2.6, 0.2], [0.2, 1.2]];
  vias.forEach(([x, z]) => { const m = new THREE.Mesh(padGeo, mat.pad); m.position.set(x, 0.012, z); L.mask.add(m); });
  const holeGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.014, 24);
  ([[-2.75, -1.75], [2.75, -1.75], [-2.75, 1.75], [2.75, 1.75]] as Pt[]).forEach(([x, z]) => {
    const m = new THREE.Mesh(holeGeo, mat.pad); m.position.set(x, 0.012, z); L.mask.add(m);
  });

  const silk = makeSilkscreen();
  const silkPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ map: silk, transparent: true, depthWrite: false }));
  silkPlane.rotation.x = -Math.PI / 2;
  silkPlane.position.y = 0.0115;
  silkPlane.renderOrder = 6;
  L.mask.add(silkPlane);

  await yieldToMain();
  // ── L3: components ──
  const drops: THREE.Object3D[] = [];
  const place = (o: THREE.Object3D, x: number, z: number) => { o.position.set(x, 0, z); L.parts.add(o); drops.push(o); return o; };

  place(qfp(1.2, 0.16, 16, 'STM32', 'F401RE', C.cobalt, '#FEEA4D'), -1.15, 0.1);
  place(qfp(0.38, 0.08, 0, 'ADXL', '345', C.signal, '#FFFFFF', true), 0.53, -1.12);
  place(esp32(), 1.75, 0.55);
  place(box(0.52, 0.12, 0.22, mat.metal, 0.04), -1.2, -1.2);
  [[-0.35, -0.45], [-0.35, 0.78], [-2.0, -0.95], [-2.0, 0.95], [1.1, -1.35]].forEach(([x, z]) => place(passive(mat.tan), x, z));
  [[2.0, -1.2], [-0.1, 1.05]].forEach(([x, z]) => place(passive(mat.ink), x, z));
  const led = place(new THREE.Group(), 2.6, -1.55);
  const ledBody = box(0.2, 0.09, 0.14, mat.led, 0.02); ledBody.position.y = 0.07;
  led.add(box(0.26, 0.06, 0.18, mat.metal), ledBody);
  place(header(10), -1.15, 1.6);
  place(usb(), -2.82, -0.6);
  place(button(), 0.45, 1.42);

  const ledLight = new THREE.PointLight(C.signal, 0, 1.6, 2);
  ledLight.position.set(2.6, 0.45, -1.55);
  L.parts.add(ledLight);

  // ── helpers that build parts ──
  function textTexture(lines: string[], fg: string, bg: string | null, w = 256, h = 256, sizes = [64, 36]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      x.font = `700 ${sizes[i] ?? sizes[sizes.length - 1]}px "JetBrains Mono", monospace`;
      x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (sizes[0] * 1.05));
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  function qfp(size: number, h: number, pinsPerSide: number, l1: string, l2: string, color: number, fg: string, lga = false) {
    const g = new THREE.Group();
    const top = new THREE.MeshStandardMaterial({ map: textTexture([l1, l2], fg, '#' + color.toString(16).padStart(6, '0')), roughness: 0.5 });
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.6 });
    const body = shadowable(new THREE.Mesh(new THREE.BoxGeometry(size, h, size), [side, side, top, side, side, side]));
    body.position.y = h / 2 + 0.01;
    g.add(body);
    // pin-1 dot
    const dot = new THREE.Mesh(new THREE.CircleGeometry(size * 0.05, 16), new THREE.MeshBasicMaterial({ color: fg }));
    dot.rotation.x = -Math.PI / 2; dot.position.set(-size * 0.38, h + 0.012, -size * 0.38); g.add(dot);
    if (!lga && pinsPerSide > 0) {
      const pinGeo = new THREE.BoxGeometry(0.035, 0.025, 0.16);
      const pitch = (size * 0.86) / (pinsPerSide - 1);
      const pinsGeo: THREE.BufferGeometry[] = [];
      for (let s = 0; s < 4; s++) for (let i = 0; i < pinsPerSide; i++) {
        const gg = pinGeo.clone();
        const o = -size * 0.43 + i * pitch;
        gg.translate(o, 0.0125, size / 2 + 0.06);
        gg.rotateY((s * Math.PI) / 2);
        pinsGeo.push(gg);
      }
      g.add(shadowable(new THREE.Mesh(mergeGeometries(pinsGeo), mat.metal)));
    }
    return g;
  }

  function esp32() {
    const g = new THREE.Group();
    const sub = box(1.75, 0.06, 1.25, mat.module, 0.02); sub.position.y = 0.03; g.add(sub);
    const canTop = new THREE.MeshStandardMaterial({ map: textTexture(['ESP32', 'WROOM'], '#0B0B14', '#DAD9DE', 256, 200, [54, 34]), roughness: 0.3, metalness: 0.55 });
    const can = shadowable(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.95), [mat.metal, mat.metal, canTop, mat.metal, mat.metal, mat.metal]));
    can.position.set(-0.24, 0.12, 0.05);
    g.add(can);
    // meander antenna on the module
    const ant: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const v = new THREE.BoxGeometry(0.03, 0.01, 0.9); v.translate(0.45 + i * 0.055, 0.065, 0.05); ant.push(v);
    }
    g.add(new THREE.Mesh(mergeGeometries(ant), mat.gold));
    return g;
  }

  function passive(m: THREE.Material) {
    const g = new THREE.Group();
    const b = box(0.18, 0.08, 0.1, m); b.position.y = 0.04; g.add(b);
    [-0.1, 0.1].forEach((x) => { const e = box(0.04, 0.085, 0.105, mat.metal); e.position.set(x, 0.042, 0); g.add(e); });
    return g;
  }

  function header(n: number) {
    const g = new THREE.Group();
    const b = box(n * 0.254 + 0.06, 0.12, 0.26, mat.ink, 0.02); b.position.y = 0.06; g.add(b);
    const pins: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) { const p = new THREE.BoxGeometry(0.064, 0.42, 0.064); p.translate(-((n - 1) * 0.254) / 2 + i * 0.254, 0.21, 0); pins.push(p); }
    g.add(shadowable(new THREE.Mesh(mergeGeometries(pins), mat.gold)));
    return g;
  }

  function usb() {
    const g = new THREE.Group();
    const b = box(0.5, 0.17, 0.42, mat.metal, 0.06); b.position.y = 0.085; g.add(b);
    const slot = box(0.04, 0.07, 0.3, mat.ink, 0.02); slot.position.set(-0.25, 0.085, 0); g.add(slot);
    return g;
  }

  function button() {
    const g = new THREE.Group();
    const b = box(0.34, 0.1, 0.34, mat.metal, 0.02); b.position.y = 0.05; g.add(b);
    const cap = shadowable(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 20), mat.ink)); cap.position.y = 0.14; g.add(cap);
    return g;
  }

  function makeSilkscreen() {
    const Wp = 1200, Hp = 800, c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
    const x = c.getContext('2d')!;
    const X = (v: number) => ((v + 3) / 6) * Wp, Z = (v: number) => ((v + 2) / 4) * Hp, S = Wp / 6;
    x.strokeStyle = '#FFFFFF'; x.fillStyle = '#FFFFFF'; x.lineWidth = 3;
    const rect = (cx: number, cz: number, w: number, d: number) => x.strokeRect(X(cx - w / 2), Z(cz - d / 2), w * S, d * S);
    rect(-1.15, 0.1, 1.62, 1.62); rect(0.53, -1.12, 0.62, 0.62); rect(1.75, 0.55, 1.95, 1.45); rect(-1.15, 1.6, 2.75, 0.45);
    x.font = '700 27px "JetBrains Mono", monospace';
    const t = (s: string, cx: number, cz: number) => x.fillText(s, X(cx), Z(cz));
    t('U1', -1.95, -0.78); t('U2', 0.05, -1.5); t('U3', 0.78, -0.27); t('J1', -2.62, 1.55); t('D1', 2.45, -1.82); t('Y1', -1.62, -1.48); t('SW1', 0.1, 1.85);
    t('SCL', 0.12, -0.36); t('SDA', 0.72, -0.4); t('TX', 0.28, 0.2); t('RX', 0.28, 0.86);
    x.font = '700 33px "JetBrains Mono", monospace';
    t('RAYFOLD · KV-01 · REV A', 0.75, 1.82);
    x.font = '700 24px "JetBrains Mono", monospace';
    t('3V3', -2.5, -1.2); t('GND', -2.5, -1.0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  // ── camera framing ──
  let explode = 0, w = 1, h = 1;
  const view = { az: 0.72, el: 0.62, mx: 0, my: 0, tx: 0, ty: 0 };
  const target = new THREE.Vector3(0, 0, 0);
  function frame() {
    const aspect = w / h;
    camera.aspect = aspect;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const needW = 4.25 + explode * 0.4, needH = 2.7 + explode * 1.9;
    const dist = Math.max(needW / Math.tan(hf / 2), needH / Math.tan(vf / 2));
    const az = view.az + view.mx * 0.14 + explode * 0.35;
    const el = view.el + view.my * 0.08 - explode * 0.18;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    target.set(0, explode * 0.05, 0);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function applyExplode() {
    const e = easeInOut(explode);
    (Object.keys(L) as (keyof typeof L)[]).forEach((k) => { L[k].position.y = base[k] + spread[k] * e; });
    mat.mask.opacity = 0.8 - 0.12 * e;
  }

  // HTML labels follow 3D anchors on the right edge of each layer
  const anchor = new THREE.Vector3();
  const anchorOf: Record<string, () => number> = {
    parts: () => L.parts.position.y + 0.25, mask: () => L.mask.position.y, copper: () => L.copper.position.y, core: () => L.core.position.y,
  };
  function placeLabels() {
    const show = THREE.MathUtils.smoothstep(explode, 0.25, 0.6);
    for (const [k, el] of Object.entries(labels)) {
      anchor.set(3.05, anchorOf[k](), 2.0).project(camera);
      const sx = (anchor.x * 0.5 + 0.5) * w, sy = (-anchor.y * 0.5 + 0.5) * h;
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(12px, -50%)`;
      el.style.opacity = String(show);
    }
  }

  // ── loop ──
  let running = false, visible = true, raf = 0, last = performance.now(), dirty = true, t0 = performance.now();
  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    view.mx += (view.tx - view.mx) * 0.06;
    view.my += (view.ty - view.my) * 0.06;
    if (!opts.reducedMotion) {
      const s = (now - t0) / 1000;
      board.position.y = Math.sin(s * 0.9) * 0.05;
      view.az = 0.72 + Math.sin(s * 0.18) * 0.06;
      for (const p of pulses) { p.t += dt * p.speed; placePulse(p); }
      const blink = 0.5 + 0.5 * Math.sin(s * 3.2);
      mat.led.emissiveIntensity = 0.3 + blink * 1.6;
      ledLight.intensity = blink * 2.2;
    }
    frame(); applyExplode(); placeLabels();
    renderer.render(scene, camera);
    dirty = false;
    if (running && visible) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function resize() {
    const r = container.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    dirty = true; kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: '100px' });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) kick(); });

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    view.tx = (e.clientX / window.innerWidth) * 2 - 1;
    view.ty = (e.clientY / window.innerHeight) * 2 - 1;
    kick();
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  // intro: parts drop onto the board
  const intro = () => {
    if (opts.reducedMotion) { kick(); return; }
    drops.forEach((o, i) => {
      const y0 = o.position.y; o.position.y = y0 + 2.2; const d0 = performance.now() + 250 + i * 70;
      const step = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - d0) / 650));
        o.position.y = y0 + 2.2 * (1 - easeOutBack(k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  running = !opts.reducedMotion;
  frame(); applyExplode();
  await yieldToMain();
  try { await renderer.compileAsync(scene, camera); } catch { /* falls back to sync compile on first render */ }
  await yieldToMain();
  renderer.render(scene, camera);
  intro();
  kick();
  opts.onReady?.();

  return {
    setExplode(p: number) { explode = THREE.MathUtils.clamp(p, 0, 1); kick(); },
    dispose() {
      cancelAnimationFrame(raf); running = false; ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onMove); renderer.dispose();
    },
    get dirty() { return dirty; },
  };
}

function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutBack(t: number) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
