// robertursua.com scene: one continuous descent driven by page scroll.
// Sky (plane) -> cloud deck -> data core (Ericsson) -> shoreline (UTSA) -> underwater (Navy EOD) -> sea floor.
// The page text never depends on this file: if WebGL is missing, the CSS gradient stays and everything reads the same.

import * as THREE from './vendor/three.module.min.js';

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// "?snap" makes the camera jump straight to the scroll position (no glide); handy for checking one frame.
const snap = reduce || location.search.includes('snap');
root.classList.add('js');

/* ---------- page behaviour (works with or without WebGL) ---------- */

const chapters = [...document.querySelectorAll('[data-chapter]')];
const CHAPTER_NAMES = ['NOW', 'ERICSSON', 'EDUCATION', 'U.S. NAVY', 'CONTACT'];
const altEl = document.getElementById('alt');
const chapEl = document.getElementById('chap');
const hintEl = document.getElementById('hint');
const navLinks = [...document.querySelectorAll('[data-nav]')];

function scramble(el) {
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  el.setAttribute('aria-label', final);
  if (reduce) return;
  const glyphs = '/\\_-+=<>01';
  let start = 0;
  const step = (ts) => {
    start = start || ts;
    const p = Math.min(1, (ts - start) / 800);
    const done = Math.floor(final.length * p);
    let s = final.slice(0, done);
    for (let i = done; i < final.length; i++) s += final[i] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
    el.textContent = p < 1 && !settled ? s : final;
    if (p < 1 && !settled) requestAnimationFrame(step);
  };
  // If frames are being throttled (background tab), settle on the real text anyway.
  let settled = false;
  setTimeout(() => { settled = true; el.textContent = final; }, 1400);
  requestAnimationFrame(step);
}

// Each block of text fades in as it rises from the bottom of the view and fades out before it
// reaches the fixed readouts at the top, so scrolling text never runs under the name in the corner.
const blocks = [...document.querySelectorAll('.panel > *')];
const hudTop = document.querySelector('.hud-tl');
let fadeKey = '';
function updateFades() {
  const key = `${scrollY}|${innerWidth}|${innerHeight}`;
  if (key === fadeKey) return;
  fadeKey = key;
  const top = hudTop.getBoundingClientRect().bottom + 6, vh = innerHeight;
  const tops = blocks.map((b) => b.getBoundingClientRect().top); // read first, then write
  blocks.forEach((b, i) => {
    const o = Math.min(smooth(top - 14, top + 44, tops[i]), smooth(vh - 16, vh - 110, tops[i]));
    b.style.opacity = o.toFixed(3);
    if (o > 0.5 && b.dataset.scramble !== undefined && !b.dataset.done) { b.dataset.done = '1'; scramble(b); }
  });
}

// Scroll position as a fractional chapter index: 0 = hero, 4 = contact.
let centers = [];
function measure() {
  centers = chapters.map((c, i) => (i === 0 ? innerHeight / 2 : c.offsetTop + c.offsetHeight / 2));
  const last = document.documentElement.scrollHeight - innerHeight / 2;
  centers[centers.length - 1] = Math.max(centers[centers.length - 2] + 1, Math.min(centers[centers.length - 1], last));
}
function progress() {
  const y = scrollY + innerHeight / 2;
  if (y <= centers[0]) return 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
  }
  return centers.length - 1;
}
measure();
addEventListener('resize', measure);
addEventListener('load', measure);

// Feet per chapter, chosen so the readout crosses zero as the camera crosses the water surface.
const ALT = [3500, 1800, 35, -105, -155];
let lastAlt = '', lastChap = -1;
function updateHud(f) {
  const i = Math.min(ALT.length - 2, Math.floor(f));
  const feet = Math.round((ALT[i] + (ALT[i + 1] - ALT[i]) * smooth(0, 1, f - i)) / 5) * 5;
  const text = feet >= 0 ? `ALT ${feet.toLocaleString('en-US')} FT` : `DEPTH ${(-feet).toLocaleString('en-US')} FT`;
  if (text !== lastAlt) altEl.textContent = lastAlt = text;
  const c = Math.round(f);
  if (c !== lastChap) {
    lastChap = c;
    chapEl.textContent = `0${c} / ${CHAPTER_NAMES[c]}`;
    navLinks.forEach((a) => a.classList.toggle('on', +a.dataset.nav === c));
  }
  hintEl.classList.toggle('gone', f > 0.12);
  updateFades();
}

/* ---------- helpers ---------- */

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
// smoothstep that also works when a > b
function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return a + (b - a) * t; }

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s / 0.96875; }

// Land for z < SHORE (flat field near FIELD, mountains inland), sea bed sloping to -34 for z > SHORE.
const SHORE = 3, FIELD = { x: 5, z: -9 }, SEABED = -34;
function height(x, z) {
  const n = fbm(x * 0.03 + 7.3, z * 0.03 + 2.1);
  if (z < SHORE) {
    const inland = smooth(-24, -125, z); // the mountains start well behind the field, leaving a coastal plain
    // mountains: broad swells plus sharp ridgelines, with crags and small bumps on top
    const r = 1 - Math.abs(2 * fbm(x * 0.022 + 1.7, z * 0.022 + 5.2) - 1), ridge = r * r;
    const crag = fbm(x * 0.12 + 4.4, z * 0.12 + 9.1) - 0.5, fine = fbm(x * 0.45 + 2.2, z * 0.45 + 6.6) - 0.5;
    const h = 0.5 + n * 2.4 * smooth(SHORE, -6, z) + inland * inland * (n * 16 + ridge * 25) + inland * 5
      + inland * (crag * 4.5 + fine * 0.9) + fine * 0.25 * smooth(SHORE, -3, z)
      + smooth(-12, -48, z) * (crag + 0.5) * 3.2; // low rolling foothills across the plain
    // a level shelf for the football field: flat inside a box, easing back into the hills around it
    const dx = Math.max(0, Math.abs(x - FIELD.x) - 17), dz = Math.max(0, Math.abs(z + 4.8) - 8.6);
    return mix(h, 1.3, smooth(9, 0, Math.hypot(dx, dz)));
  }
  const t = smooth(SHORE, 32, z);
  // sea bed: a slope down to the deep, with gentle dunes
  return 0.5 + (SEABED - 0.5) * t + (n - 0.5) * 5 * t + (fbm(x * 0.12 + 4.4, z * 0.12 + 9.1) - 0.5) * 1.2 * t;
}

/* ---------- scene ---------- */

function start() {
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x77808b);
  scene.fog = new THREE.FogExp2(0x77808b, 0.01);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 420);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x4c5662, 1.15);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-30, 80, 45);
  scene.add(hemi, sun);

  // a thin round bar from point a to point b
  const UP = new THREE.Vector3(0, 1, 0);
  const rod = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  };

  // a texture painted on a canvas
  const canvasTex = (w, h, draw, srgb = true) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  // a box lx wide, ly tall, lz deep with rounded edges, centred on the origin
  const roundedBox = (lx, ly, lz, r) => {
    const b = Math.min(r, ly / 2) * 0.7, w = lx / 2 - b, d = lz / 2 - b, rr = Math.max(0.001, r - b), s = new THREE.Shape();
    s.moveTo(-w + rr, -d); s.lineTo(w - rr, -d); s.quadraticCurveTo(w, -d, w, -d + rr); s.lineTo(w, d - rr); s.quadraticCurveTo(w, d, w - rr, d);
    s.lineTo(-w + rr, d); s.quadraticCurveTo(-w, d, -w, d - rr); s.lineTo(-w, -d + rr); s.quadraticCurveTo(-w, -d, -w + rr, -d);
    const g = new THREE.ExtrudeGeometry(s, { depth: ly - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.center();
    return g;
  };
  /* 00: the plane */
  const plane = new THREE.Group();
  let prop;
    // The Cessna 172 Skyhawk N18LW the owner trained in. Nose along +x, +z is the right wing; about 0.78 units per metre.
    // Unlike the other objects this one is smooth-shaded and painted, with a soft sky reflection, so it reads as a real aircraft.
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // a small grey sky for the paint and glass to reflect
    const envTex = (() => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 256;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#c6ccd3'); gr.addColorStop(0.56, '#8a929b'); gr.addColorStop(1, '#474f58');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Scene();
      s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
      const pm = new THREE.PMREMGenerator(renderer), out = pm.fromScene(s, 0.03).texture;
      pm.dispose();
      return out;
    })();
    const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: envTex, envMapIntensity: 0.85, ...o });
    const white = std({ color: 0xeef0f3, roughness: 0.4 });
    const metal = std({ color: 0xb4bac1, roughness: 0.3, metalness: 0.85 });
    const rubber = std({ color: 0x1b1d21, roughness: 0.9, envMapIntensity: 0.2 });
    const black = new THREE.MeshBasicMaterial({ color: 0x0d0f12 });

    // a smooth surface through a list of rings; each ring is an array of { p, u, v } with the same point count
    const skinGeo = (rings) => {
      const pos = [], uv = [], idx = [], n = rings[0].length;
      for (const r of rings) for (const q of r) { pos.push(q.p.x, q.p.y, q.p.z); uv.push(q.u || 0, q.v || 0); }
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n - 1; j++) {
        const a = i * n + j;
        idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
      }
      for (const i of [0, rings.length - 1]) { // close both ends
        const centre = pos.length / 3, mid = new THREE.Vector3();
        for (const q of rings[i]) mid.add(q.p);
        mid.multiplyScalar(1 / n);
        pos.push(mid.x, mid.y, mid.z); uv.push(rings[i][0].u || 0, 0.5);
        for (let j = 0; j < n - 1; j++) idx.push(centre, i * n + j, i * n + j + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    // an aerofoil outline (NACA 4-digit): trailing edge, over the top to the leading edge, back along the bottom
    const foil = (camber, thick, N = 12) => {
      const p = 0.4, out = [];
      const yt = (x) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
      const yc = (x) => (x < p ? (camber / (p * p)) * (2 * p * x - x * x) : (camber / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x));
      for (let i = 0; i <= N; i++) { const x = 0.5 * (1 + Math.cos((Math.PI * i) / N)); out.push([x, yc(x) + yt(x)]); }
      for (let i = 1; i <= N; i++) { const x = 0.5 * (1 - Math.cos((Math.PI * i) / N)); out.push([x, yc(x) - yt(x)]); }
      return out;
    };
    // a wing through stations [z, leading-edge x, chord, y, thickness scale]
    const wingGeo = (stations, camber, thick) => skinGeo(stations.map(([z, xle, chord, y, ts = 1]) =>
      foil(camber, thick * ts).map(([xc, yc]) => ({ p: V(xle - xc * chord, y + yc * chord, z) }))));
    // a streamlined bar from a to b: w along the airflow, t across it
    const bar = (a, b, w, t, mat) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, d.length(), 14), mat);
      m.scale.set(w, 1, t);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
      return m;
    };
    const ball = (r, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); m.position.set(x, y, z); return m; };

    /* fuselage: cross-sections [x, half width, top, bottom, roundness], nose to tail */
    const X0 = 2.62, XL = 5.97, NR = 36;
    const bodyKeys = [
      [2.62, 0.3, 0.2, -0.36, 1], [2.56, 0.37, 0.28, -0.43, 0.9], [2.4, 0.42, 0.33, -0.48, 0.8], [2.1, 0.45, 0.37, -0.51, 0.7],
      [1.45, 0.47, 0.4, -0.53, 0.6], [0.8, 0.47, 0.82, -0.53, 0.55], [0.6, 0.47, 0.86, -0.53, 0.55], [-0.5, 0.46, 0.86, -0.51, 0.55],
      [-1.2, 0.37, 0.54, -0.38, 0.65], [-2.3, 0.21, 0.37, -0.12, 0.8], [-3.1, 0.09, 0.3, 0.06, 0.9], [-3.35, 0.04, 0.27, 0.14, 1],
    ];
    const bodyRings = bodyKeys.map(([x, w, top, bot, pw]) => {
      const cy = (top + bot) / 2, h = (top - bot) / 2, ring = [];
      for (let j = 0; j <= NR; j++) { // starts and ends on the belly, so the texture seam is out of sight
        const a = -Math.PI / 2 + (j / NR) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        ring.push({ p: V(x, cy + h * Math.sign(s) * Math.abs(s) ** pw, w * Math.sign(c) * Math.abs(c) ** pw), u: (X0 - x) / XL, v: j / NR });
      }
      return ring;
    });

    /* paint scheme, drawn flat: across = nose to tail, up = around the body (0.25 right side, 0.5 top, 0.75 left side) */
    const livery = (() => {
      const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), px = (x) => ((X0 - x) / XL) * W, py = (v) => (1 - v) * H;
      const poly = (pts, fill, stroke) => {
        g.beginPath(); pts.forEach(([x, v], i) => (i ? g.lineTo(px(x), py(v)) : g.moveTo(px(x), py(v)))); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
      };
      // Where around the body (right side) a given height sits at station x. The body's shape changes along its
      // length, so a stripe at a constant height is not a straight line in this flat drawing.
      const vOf = (x, y) => {
        let i = 0; while (i < bodyKeys.length - 2 && x < bodyKeys[i + 1][0]) i++;
        const A = bodyKeys[i], B = bodyKeys[i + 1], t = clamp01((A[0] - x) / (A[0] - B[0]));
        const yAt = ([, , top, bot, pw], a) => { const s = Math.sin(a); return (top + bot) / 2 + ((top - bot) / 2) * Math.sign(s) * Math.abs(s) ** pw; };
        let lo = -Math.PI / 2, hi = Math.PI / 2;
        for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (mix(yAt(A, mid), yAt(B, mid), t) < y) lo = mid; else hi = mid; }
        return 0.25 + (lo + hi) / 2 / (Math.PI * 2);
      };
      // a band between two heights, from station xa back to xb
      const band = (yTop, yBot, xa, xb) => {
        const top = [], bottom = [];
        for (let x = xa; x > xb - 1e-6; x -= 0.05) { top.push([x, vOf(x, yTop)]); bottom.unshift([x, vOf(x, yBot)]); }
        return top.concat(bottom);
      };
      g.fillStyle = '#eceef1'; g.fillRect(0, 0, W, H);
      const glassTint = g.createLinearGradient(0, 0, 0, H);
      glassTint.addColorStop(0, '#1a2026'); glassTint.addColorStop(0.5, '#3a444e'); glassTint.addColorStop(1, '#1a2026');
      const seam = '#b3b8be';
      for (const side of [(v) => v, (v) => 1 - v]) {
        const P = (pts) => pts.map(([x, v]) => [x, side(v)]);
        poly(P(band(-0.03, -0.1, 2.25, -1.25)), '#6f1f2d');                                      // maroon stripe
        poly(P(band(-0.135, -0.165, 2.15, -1.15)), '#20242a');                                   // thin dark stripe
        poly(P([[0.74, 0.19], [0.74, 0.43], [0.02, 0.43], [0.02, 0.19]]), null, seam);           // cabin door
        poly(P([[0.69, 0.272], [0.07, 0.272], [0.07, 0.415], [0.6, 0.415], [0.69, 0.385]]), glassTint); // door window
        poly(P([[-0.03, 0.272], [-0.5, 0.272], [-0.5, 0.415], [-0.03, 0.415]]), glassTint);      // rear seat window
        poly(P([[-0.57, 0.272], [-1.08, 0.272], [-1.08, 0.35], [-0.57, 0.408]]), glassTint);     // rear quarter window
        poly(P([[1.45, 0.06], [1.45, 0.47]]), null, seam);                                       // cowling joint
        poly(P([[2.1, 0.06], [2.1, 0.47]]), null, seam);
        poly(P([[-1.2, 0.08], [-1.2, 0.42]]), null, seam);                                       // tailcone joint
      }
      poly([[1.4, 0.365], [1.4, 0.635], [0.8, 0.708], [0.8, 0.292]], glassTint);                 // windscreen, wrapping over the top
      poly([[-0.56, 0.43], [-0.56, 0.57], [-1.14, 0.555], [-1.14, 0.445]], glassTint);           // rear window
      g.font = 'italic 800 84px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#15171a';
      // each side's registration is flipped in the drawing so it reads correctly on the aircraft
      g.save(); g.translate(px(-1.88), py(0.25)); g.scale(-1, 1); g.fillText('N18LW', 0, 0); g.restore();
      g.save(); g.translate(px(-1.88), py(0.75)); g.scale(1, -1); g.fillText('N18LW', 0, 0); g.restore();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    })();
    const body = new THREE.Mesh(skinGeo(bodyRings), std({ map: livery, roughness: 0.38 }));

    /* flying surfaces */
    const wingY = (z) => 0.9 + Math.abs(z) * 0.027;
    const wing = new THREE.Mesh(wingGeo([
      [-4.32, 0.9, 0.62, wingY(4.32), 0.5], [-4.15, 1.0, 0.92, wingY(4.15)], [-1.95, 1.07, 1.3, wingY(1.95)], [0, 1.07, 1.3, 0.9],
      [1.95, 1.07, 1.3, wingY(1.95)], [4.15, 1.0, 0.92, wingY(4.15)], [4.32, 0.9, 0.62, wingY(4.32), 0.5],
    ], 0.02, 0.12), white);
    const tailplane = new THREE.Mesh(wingGeo([
      [-1.42, -2.74, 0.48, 0.3, 0.6], [-1.3, -2.68, 0.62, 0.3], [0, -2.5, 0.95, 0.3], [1.3, -2.68, 0.62, 0.3], [1.42, -2.74, 0.48, 0.3, 0.6],
    ], 0, 0.09), white);
    const finGeo = wingGeo([[0.25, -2.64, 0.82, 0], [1.55, -3.02, 0.48, 0], [1.63, -3.1, 0.36, 0, 0.5]], 0, 0.09);
    finGeo.rotateX(-Math.PI / 2); // built lying flat, then stood up
    const fin = new THREE.Mesh(finGeo, white);
    const filletShape = new THREE.Shape([[-1.75, 0.41], [-2.78, 0.72], [-2.78, 0.3], [-1.75, 0.38]].map(([x, y]) => new THREE.Vector2(x, y)));
    const filletGeo = new THREE.ExtrudeGeometry(filletShape, { depth: 0.04, bevelEnabled: false }); filletGeo.translate(0, 0, -0.02);
    const fillet = new THREE.Mesh(filletGeo, white);

    // flap and aileron outlines on both wing surfaces
    {
      const tk = (xc) => 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
      const cm = (xc) => (0.02 / 0.36) * (0.2 + 0.8 * xc - xc * xc);
      const at = (z, xc, upper) => {
        const o = clamp01((Math.abs(z) - 1.95) / 2.2), chord = mix(1.3, 0.92, o), xle = mix(1.07, 1.0, o);
        return V(xle - xc * chord, wingY(z) + (cm(xc) + (upper ? tk(xc) + 0.004 : -tk(xc) - 0.004)) * chord, z);
      };
      const pts = [];
      for (const sgn of [1, -1]) for (const upper of [true, false]) {
        pts.push(at(sgn * 0.52, 0.7, upper), at(sgn * 1.95, 0.7, upper), at(sgn * 1.95, 0.7, upper), at(sgn * 4.1, 0.7, upper));
        for (const z of [0.52, 2.3, 4.1]) pts.push(at(sgn * z, 0.7, upper), at(sgn * z, 0.995, upper));
      }
      wing.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x7f868d })));
    }

    /* nose: spinner, propeller, cooling inlets, landing light, exhaust */
    const spinnerGeo = new THREE.LatheGeometry([[0.158, 0], [0.145, 0.14], [0.11, 0.28], [0.06, 0.37], [0.001, 0.41]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
    spinnerGeo.rotateZ(-Math.PI / 2);
    const spinner = new THREE.Mesh(spinnerGeo, white);
    spinner.position.set(2.62, -0.07, 0);
    const bladeGeo = new THREE.BoxGeometry(0.035, 0.72, 0.15, 1, 10, 1);
    bladeGeo.translate(0, 0.42, 0);
    {
      const p = bladeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = clamp01((p.getY(i) - 0.06) / 0.72);
        const wide = mix(0.6, 1, Math.sin(Math.min(1, f * 1.8) * Math.PI / 2)) * mix(1, 0.5, f * f), twist = mix(1.0, 0.3, f);
        const x = p.getX(i), z = p.getZ(i) * wide;
        p.setX(i, x * Math.cos(twist) + z * Math.sin(twist));
        p.setZ(i, -x * Math.sin(twist) + z * Math.cos(twist));
      }
      bladeGeo.computeVertexNormals();
    }
    const bladeMat = std({ color: 0x24272c, roughness: 0.45, metalness: 0.3 });
    prop = new THREE.Group();
    prop.position.set(2.7, -0.07, 0);
    const blade2 = new THREE.Mesh(bladeGeo, bladeMat); blade2.rotation.x = Math.PI;
    prop.add(new THREE.Mesh(bladeGeo, bladeMat), blade2);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.y = Math.PI / 2; // the blur of the spinning blades
    disc.position.copy(prop.position);
    const facing = (r, mat, x, y, z, sx = 1) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat); m.rotation.y = Math.PI / 2; m.scale.x = sx; m.position.set(x, y, z); return m; };

    /* undercarriage */
    const wheelAt = (x, y, z, R) => {
      const g = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.42, R * 0.5, 18), metal); hub.rotation.x = Math.PI / 2;
      g.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.66, R * 0.34, 12, 28), rubber), hub);
      g.position.set(x, y, z);
      return g;
    };

    plane.add(
      body, wing, tailplane, fin, fillet, spinner, prop, disc,
      facing(0.062, black, 2.624, 0.0, 0.2, 1.25), facing(0.062, black, 2.624, 0.0, -0.2, 1.25),   // cooling inlets
      facing(0.045, new THREE.MeshBasicMaterial({ color: 0xf6fbff }), 2.624, -0.27, 0),              // landing light
      rod(V(1.85, -0.5, 0.14), V(1.74, -0.68, 0.14), 0.028, metal),                                  // exhaust
      bar(V(0.5, -0.44, 0.45), V(0.52, 0.87, 2.1), 0.06, 0.022, white),                              // wing struts
      bar(V(0.5, -0.44, -0.45), V(0.52, 0.87, -2.1), 0.06, 0.022, white),
      bar(V(0.05, -0.48, 0.3), V(0.0, -1.1, 0.96), 0.075, 0.028, white),                             // spring-steel main gear
      bar(V(0.05, -0.48, -0.3), V(0.0, -1.1, -0.96), 0.075, 0.028, white),
      wheelAt(0.0, -1.12, 1.04, 0.2), wheelAt(0.0, -1.12, -1.04, 0.2),
      bar(V(2.02, -0.45, 0), V(2.1, -0.93, 0), 0.036, 0.036, metal),                                  // nose gear strut and fork
      rod(V(2.1, -0.9, 0.075), V(2.1, -1.13, 0.075), 0.018, white), rod(V(2.1, -0.9, -0.075), V(2.1, -1.13, -0.075), 0.018, white),
      wheelAt(2.1, -1.13, 0, 0.165),
      rod(V(0.2, 0.98, 0.2), V(-0.06, 1.44, 0.2), 0.011, metal), rod(V(0.2, 0.98, -0.2), V(-0.06, 1.44, -0.2), 0.011, metal), // antennas
      rod(V(0.95, wingY(2.6) - 0.06, -2.6), V(1.25, wingY(2.6) - 0.1, -2.6), 0.012, metal),          // pitot tube, left wing
      ball(0.04, new THREE.MeshBasicMaterial({ color: 0xd8363a }), -3.27, 1.67, 0),                   // beacon
      ball(0.034, new THREE.MeshBasicMaterial({ color: 0xd8363a }), 0.62, wingY(4.32) + 0.01, -4.34), // nav lights: red left, green right
      ball(0.034, new THREE.MeshBasicMaterial({ color: 0x3ecf7a }), 0.62, wingY(4.32) + 0.01, 4.34)
    );
    plane.scale.setScalar(0.95);
    plane.position.set(4.2, 59.2, 0);
    plane.rotation.y = -0.6;
    scene.add(plane);

  /* terrain and water */
  let waterNormal;
  {
    const lite = innerWidth < 700; // phones get a lighter mesh
    const geo = new THREE.PlaneGeometry(280, 290, lite ? 200 : 360, lite ? 206 : 372); // x -140..140, z -200..90
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -55);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();

    // Colour every point by what it would be: snow on gentle ground, scree then bare rock as it steepens,
    // gravel near sea level, a dark wet band at the waterline, sand and then silt under water.
    const nrm = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const snow = new THREE.Color(0xf2f5f8), scree = new THREE.Color(0x8f959b), rock = new THREE.Color(0x6b727a), gravel = new THREE.Color(0x9c9f9c);
    const verge = new THREE.Color(0x8d968f), wet = new THREE.Color(0x676d72), sand = new THREE.Color(0x8c918e), silt = new THREE.Color(0x5e666c);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), steep = 1 - nrm.getY(i);
      const n = fbm(x * 0.21 + 3.1, z * 0.21 + 8.7);
      if (y < 0.05) {
        c.copy(sand).lerp(silt, smooth(-2, -40, y)).multiplyScalar(0.9 + n * 0.2);
      } else {
        c.copy(snow).lerp(scree, smooth(0.1, 0.22, steep + (n - 0.5) * 0.08)).lerp(rock, smooth(0.26, 0.5, steep + (n - 0.5) * 0.1));
        const low = smooth(5, 1.2, y);
        const dx = Math.max(0, Math.abs(x - FIELD.x) - 17), dz = Math.max(0, Math.abs(z + 4.8) - 8.6);
        c.lerp(gravel, low * 0.85).lerp(verge, low * smooth(9, 0, Math.hypot(dx, dz))).lerp(wet, smooth(0.7, 0.05, y));
        c.multiplyScalar(0.92 + n * 0.16);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // fine grain for the surface: the same noise breaks up the colour and roughens the lighting
    const grain = canvasTex(512, 512, (g, W, H) => {
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = fbm(x * 0.045, y * 0.045) * 0.55 + fbm(x * 0.19 + 9.3, y * 0.19 + 4.1) * 0.45;
        const s = 150 + v * 105, k = (y * W + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = s; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
    grain.wrapS = grain.wrapT = THREE.MirroredRepeatWrapping; grain.repeat.set(56, 58);
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, bumpMap: grain, bumpScale: 4, roughness: 0.94, metalness: 0 })));

    // water: ripples from a repeating normal map that drifts, and a reflection of the sky
    const P = 16;
    const ph = (x, y, q) => hash(((x % q) + q) % q, ((y % q) + q) % q);
    const pnoise = (x, y, q) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = ph(xi, yi, q), b = ph(xi + 1, yi, q), d = ph(xi, yi + 1, q), e = ph(xi + 1, yi + 1, q);
      return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
    };
    const wave = (x, y) => pnoise(x, y, P) * 0.5 + pnoise(x * 2, y * 2, P * 2) * 0.3 + pnoise(x * 4, y * 4, P * 4) * 0.2;
    waterNormal = canvasTex(256, 256, (g, W, H) => {
      const img = g.createImageData(W, H), e = P / W;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x / W) * P, v = (y / H) * P, h0 = wave(u, v);
        let nx = (h0 - wave(u + e, v)) * 9, ny = (h0 - wave(u, v + e)) * 9, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const k = (y * W + x) * 4;
        img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * 0.5 + 0.5) * 255; img.data[k + 2] = (nz * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
    waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping; waterNormal.repeat.set(34, 35);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 290),
      new THREE.MeshStandardMaterial({ color: 0x5f6c78, roughness: 0.16, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.55, 0.55),
        envMap: envTex, envMapIntensity: 0.9, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0, -55);
    scene.add(water);
  }
  /* cloud deck between the plane and the data core */
  const clouds = [];
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 80; i++) {
      const far = i < 22; // a few distant ones at the plane's level, the rest form the deck below it
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: far ? 0.3 : 0.25 + hash(i, 3) * 0.3 }));
      const size = far ? 30 + hash(i, 1) * 30 : 14 + hash(i, 1) * 22;
      s.scale.set(size, size * 0.55, 1);
      s.position.set((hash(i, 5) - 0.5) * 150, far ? 52 + hash(i, 7) * 22 : 36 + hash(i, 7) * 13, far ? -30 - hash(i, 9) * 70 : -40 + hash(i, 9) * 50);
      s.userData.v = 1.2 + hash(i, 11) * 2.2;
      clouds.push(s); scene.add(s);
    }
  }

  /* 01: the data core. Seven pipelines feed one warehouse: a stack of storage platters in a frame, with a lit conduit from each source. */
  const core = new THREE.Group();
  const flows = [], sources = [];
  let coreBox;
  {
    core.position.set(4.4, 30, 0);
    const alu = std({ color: 0xc3c9cf, roughness: 0.32, metalness: 0.9 });
    const darkMetal = std({ color: 0x2a2f35, roughness: 0.45, metalness: 0.7 });
    const light = new THREE.MeshBasicMaterial({ color: 0xeaf4ff });
    const glowTex = canvasTex(64, 64, (g) => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(235,245,255,0.45)'); grad.addColorStop(1, 'rgba(235,245,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    });
    const glow = (size, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.scale.setScalar(size);
      return s;
    };

    // The side of a platter, drawn flat: brushed metal, trim lines, vent slots and a row of status lights.
    const statusLights = (g) => {
      for (let k = 0; k < 64; k++) if (k % 8 <= 1 || hash(k, 113) < 0.5) { g.fillStyle = hash(k, 115) < 0.12 ? '#ffb347' : '#e8f6ff'; g.fillRect(k * 16 + 5, 30, 6, 14); }
    };
    const sideMap = canvasTex(1024, 128, (g, W, H) => {
      g.fillStyle = '#3a4047'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(255,255,255,${(0.02 + hash(y, 111) * 0.05).toFixed(3)})`; g.fillRect(0, y, W, 1); }
      g.fillStyle = '#1c2024'; for (let k = 0; k < 64; k++) if (k % 8 > 1) g.fillRect(k * 16 + 4, 70, 8, 34);
      g.fillStyle = '#aab2ba'; g.fillRect(0, 8, W, 3); g.fillRect(0, H - 11, W, 3);
      statusLights(g);
    });
    const sideGlow = canvasTex(1024, 128, (g, W, H) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); statusLights(g); }); // only the lights shine
    // The top of a platter: machined rings, a hub and a circle of screws.
    const capMap = canvasTex(512, 512, (g, W) => {
      const c = W / 2;
      g.fillStyle = '#b6bdc4'; g.fillRect(0, 0, W, W);
      for (let r = 6; r < c; r += 2) { g.strokeStyle = hash(r, 117) < 0.5 ? `rgba(255,255,255,${(hash(r, 119) * 0.16).toFixed(3)})` : `rgba(20,24,28,${(hash(r, 121) * 0.14).toFixed(3)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
      g.fillStyle = '#7f878f'; g.beginPath(); g.arc(c, c, 46, 0, 7); g.fill();
      g.fillStyle = '#2c3137'; g.beginPath(); g.arc(c, c, 20, 0, 7); g.fill();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * 200, c + Math.sin(a) * 200, 7, 0, 7); g.fill(); }
    });
    const sideMat = std({ map: sideMap, emissive: 0xffffff, emissiveMap: sideGlow, emissiveIntensity: 1.7, roughness: 0.42, metalness: 0.7 });
    const capMat = std({ map: capMap, roughness: 0.3, metalness: 0.9 });

    // the rig leans toward the camera so the tops of the platters show; the stack inside it turns
    const rig = new THREE.Group();
    rig.rotation.set(0.34, 0, -0.1);
    const RIG = 1.3; // overall size of the stack and its frame
    rig.scale.setScalar(RIG);
    coreBox = new THREE.Group();
    const platterGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.36, 96), rimGeo = new THREE.TorusGeometry(0.8, 0.016, 8, 96), gapGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.14, 64);
    for (const y of [-0.5, 0, 0.5]) {
      const platter = new THREE.Mesh(platterGeo, [sideMat, capMat, capMat]);
      platter.position.y = y; platter.rotation.y = y * 2.1; // so the three do not line up
      coreBox.add(platter);
      for (const dy of [-0.18, 0.18]) { const rim = new THREE.Mesh(rimGeo, alu); rim.rotation.x = Math.PI / 2; rim.position.y = y + dy; coreBox.add(rim); }
    }
    for (const y of [-0.25, 0.25]) { const gap = new THREE.Mesh(gapGeo, light); gap.position.y = y; coreBox.add(gap); } // light between the platters
    rig.add(coreBox);
    // the frame around the stack
    const hx = 1.12, hy = 1.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      rig.add(rod(V(sx * hx, -hy, sz * hx), V(sx * hx, hy, sz * hx), 0.02, alu));
      for (const sy of [-1, 1]) rig.add(ball(0.045, alu, sx * hx, sy * hy, sz * hx));
    }
    for (const sy of [-1, 1]) for (const s of [-1, 1]) {
      rig.add(rod(V(-hx, sy * hy, s * hx), V(hx, sy * hy, s * hx), 0.02, alu), rod(V(s * hx, sy * hy, -hx), V(s * hx, sy * hy, hx), 0.02, alu));
    }
    core.add(rig, glow(6.5, 0.2));
    const lamp = new THREE.PointLight(0xdcecff, 12, 14, 1.8);
    lamp.position.set(0, 0.6, 2.4);
    core.add(lamp);

    // conduits: a clear tube with a bright fibre inside, a plug where it meets the stack, and pulses running along it
    const conduit = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.26, envMap: envTex, envMapIntensity: 1, depthWrite: false });
    const fibre = new THREE.MeshBasicMaterial({ color: 0xf4faff });
    const pulseGeo = new THREE.SphereGeometry(0.045, 12, 10);
    const hexGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.14, 6); hexGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.16, 0.018, 8, 32);
    for (let k = 0; k < 7; k++) {
      // sources fan out to the right of and behind the core, so the lines stay clear of the text on the left
      const a = (k / 6 - 0.5) * 3.5;
      const from = new THREE.Vector3(Math.cos(a) * 9.5 + 1, (k / 6 - 0.5) * 8.5 + (k % 2 ? 1.1 : -1.1), -Math.abs(Math.sin(a)) * 8 - 1.5);
      // each line plugs into the rim of one of the three platters, on the side it arrives from
      const out = new THREE.Vector3(from.x, 0, from.z).normalize();
      const port = out.clone().multiplyScalar(0.84).setY((k % 3 - 1) * 0.5).applyEuler(rig.rotation).multiplyScalar(RIG);
      const lead = out.clone().multiplyScalar(1.7).setY((k % 3 - 1) * 0.5).applyEuler(rig.rotation).multiplyScalar(RIG);
      const curve = new THREE.CatmullRomCurve3([
        from,
        new THREE.Vector3(from.x * 0.62, from.y * 0.2 + Math.sin(k * 1.7) * 1.4, from.z * 0.7),
        new THREE.Vector3(from.x * 0.3, from.y * 0.4, from.z * 0.28),
        lead, port,
      ]);
      core.add(
        new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.034, 10), conduit),
        new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.011, 6), fibre),
        rod(curve.getPointAt(0.975), port, 0.062, darkMetal)
      );
      // the source: a hexagonal unit facing the camera with a lit ring and lens
      const node = new THREE.Group();
      node.position.copy(from);
      const ring = new THREE.Mesh(ringGeo, light); ring.position.z = 0.075;
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), darkMetal); eye.position.z = 0.072;
      node.add(new THREE.Mesh(hexGeo, alu), ring, eye, ball(0.035, light, 0, 0, 0.08), glow(1.0, 0.3));
      core.add(node);
      sources.push(from.clone().add(core.position));
      for (let j = 0; j < 3; j++) {
        const m = new THREE.Group();
        m.add(new THREE.Mesh(pulseGeo, light), glow(0.5, 0.75));
        core.add(m);
        flows.push({ m, curve, off: j / 3 + k * 0.13, speed: 0.16 + (k % 3) * 0.03 });
      }
    }
    scene.add(core);
  }
  /* 02: the end zone and goalpost on the field by the shore */
  const POST = { x: FIELD.x, y: 1.3, z: -12 };
  const postTop = new THREE.Vector3(POST.x + 1.8, POST.y + 6.3, POST.z);
  const flags = [];
  {
    // Turf: the end zone and the first yards of the field, drawn flat. One yard is 0.585 units, to match the goalpost.
    const YD = 0.585, FW = 53.33 * YD, zBack = POST.z, zFront = 2.4, FD = zFront - zBack;
    const turf = canvasTex(2048, 1024, (g, W, H) => {
      const X = (yd) => (yd / 53.33) * W;        // across the field, yards from the left sideline
      const Z = (yd) => ((yd * YD) / FD) * H;    // down the field, yards from the back line
      g.fillStyle = '#8b978d'; g.fillRect(0, 0, W, H);
      for (let yd = 10, k = 0; Z(yd) < H; yd += 5, k++) { g.fillStyle = k % 2 ? '#929e94' : '#869288'; g.fillRect(0, Z(yd), W, Z(5)); } // mowing bands
      g.fillStyle = '#79857c'; g.fillRect(0, 0, W, Z(10));                                                                              // end zone
      for (let i = 0; i < 9000; i++) { const s = i % 2 ? 255 : 0; g.fillStyle = `rgba(${s},${s},${s},0.035)`; g.fillRect(hash(i, 61) * W, hash(i, 63) * H, 3, 2 + hash(i, 65) * 6); } // grass mottling
      g.fillStyle = 'rgba(240,243,244,0.82)';
      const lw = 6;
      g.fillRect(0, 0, W, lw); g.fillRect(0, 0, lw, H); g.fillRect(W - lw, 0, lw, H);                      // back line and sidelines
      g.fillRect(0, Z(10) - lw, W, lw * 2);                                                                // goal line
      for (let yd = 15; Z(yd) < H; yd += 5) g.fillRect(0, Z(yd) - lw / 2, W, lw);                          // 5-yard lines
      for (let yd = 11; Z(yd) < H; yd++) if (yd % 5) for (const x of [0.5, 20, 33.33, 52.83]) g.fillRect(X(x) - 9, Z(yd) - 2, 18, 4); // hash marks
      g.font = '700 150px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [x, rot] of [[9, Math.PI / 2], [44.33, -Math.PI / 2]]) { g.save(); g.translate(X(x), Z(20)); g.rotate(rot); g.fillText('1 0', 0, 0); g.restore(); } // 10-yard numbers
    });
    const fieldGeo = new THREE.PlaneGeometry(FW, FD); fieldGeo.rotateX(-Math.PI / 2);
    const field = new THREE.Mesh(fieldGeo, new THREE.MeshStandardMaterial({ map: turf, roughness: 0.96, metalness: 0 }));
    field.position.set(POST.x, POST.y + 0.04, (zBack + zFront) / 2);
    scene.add(field);

    // a gooseneck goalpost: one curved support behind the end line, crossbar, two uprights
    const yellow = std({ color: 0xcdb04a, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.6 });
    const pad = std({ color: 0x353e46, roughness: 0.88, envMapIntensity: 0.2 });
    const cyl = (r, len, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 22), mat); m.position.set(x, y, z); m.rotation.z = rz; return m; };
    const post = new THREE.Group();
    post.position.set(POST.x, POST.y, POST.z);
    const neck = new THREE.CatmullRomCurve3([V(0, 0, -1.15), V(0, 1.0, -1.15), V(0, 1.6, -1.04), V(0, 1.9, -0.55), V(0, 1.95, 0)]);
    post.add(
      new THREE.Mesh(new THREE.TubeGeometry(neck, 48, 0.085, 20), yellow),
      cyl(0.075, 3.62, yellow, 0, 1.95, 0, Math.PI / 2),                                  // crossbar
      cyl(0.055, 4.6, yellow, -1.8, 4.25, 0), cyl(0.055, 4.6, yellow, 1.8, 4.25, 0),      // uprights
      ball(0.075, yellow, -1.8, 1.95, 0), ball(0.075, yellow, 1.8, 1.95, 0), ball(0.075, yellow, 0, 1.95, 0),
      ball(0.055, yellow, -1.8, 6.55, 0), ball(0.055, yellow, 1.8, 6.55, 0),
      cyl(0.21, 1.2, pad, 0, 0.6, -1.15)                                                  // padding round the base
    );
    // wind ribbons on top of the uprights
    const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xd8563a, side: THREE.DoubleSide });
    for (const sx of [-1.8, 1.8]) {
      const geo = new THREE.PlaneGeometry(0.36, 0.06, 6, 1); geo.translate(0.18, 0, 0);
      const f = new THREE.Mesh(geo, ribbonMat);
      f.position.set(sx, 6.52, 0);
      post.add(f); flags.push(f);
    }
    scene.add(post);

    // pylons at the corners of the end zone
    const pylonMat = std({ color: 0xd2733a, roughness: 0.7, envMapIntensity: 0.3 });
    for (const sx of [-FW / 2, FW / 2]) for (const z of [zBack, zBack + 10 * YD]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.27, 0.07), pylonMat);
      m.position.set(POST.x + sx, POST.y + 0.17, z);
      scene.add(m);
    }
  }
  /* 03: a moored sea mine, and 04: its sinker on the sea floor */
  const MINE = { x: 4.2, y: -22, z: 40 };
  const tether = new THREE.Group();
  const mineLight = new THREE.PointLight(0xd6ecff, 60, 34, 1.6);
  {
    const floorY = height(MINE.x, MINE.z);
    const anchorTop = floorY + 1.0;
    const len = MINE.y - anchorTop;
    tether.position.set(MINE.x, anchorTop, MINE.z);
    const wet = { envMapIntensity: 0.3 }; // very little sky to reflect down here

    // weathered steel, drawn flat: plate seams, the band round the middle, rust and silt running down
    const hullMap = canvasTex(1024, 512, (g, W, H) => {
      g.fillStyle = '#58616a'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = hash(i, 71) < 0.5 ? 'rgba(18,22,26,0.10)' : 'rgba(190,200,205,0.07)';
        const r = 2 + hash(i, 73) * 9;
        g.beginPath(); g.ellipse(hash(i, 75) * W, hash(i, 77) * H, r, r * (0.6 + hash(i, 79)), 0, 0, 7); g.fill();
      }
      for (let i = 0; i < 80; i++) {
        const x = hash(i, 81) * W, y0 = hash(i, 83) * H * 0.62, l = 30 + hash(i, 85) * 170, grd = g.createLinearGradient(0, y0, 0, y0 + l);
        grd.addColorStop(0, i % 3 ? 'rgba(112,74,52,0.36)' : 'rgba(150,160,150,0.22)'); grd.addColorStop(1, 'rgba(112,74,52,0)');
        g.fillStyle = grd; g.fillRect(x, y0, 3 + hash(i, 87) * 9, l);
      }
      g.fillStyle = 'rgba(20,24,28,0.5)';
      g.fillRect(0, H / 2 - 30, W, 3); g.fillRect(0, H / 2 + 27, W, 3);
      for (let k = 0; k < 8; k++) g.fillRect((k / 8) * W - 1, 0, 3, H);
    });
    // the same layout as height: raised band, sunk seams, rivets, pitting
    const hullBump = canvasTex(1024, 512, (g, W, H) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#a2a2a2'; g.fillRect(0, H / 2 - 28, W, 56);
      g.fillStyle = '#4c4c4c'; for (let k = 0; k < 8; k++) g.fillRect((k / 8) * W - 1, 0, 3, H);
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 48; k++) for (const dy of [-18, 18]) { g.beginPath(); g.arc(((k + 0.5) / 48) * W, H / 2 + dy, 4.2, 0, 7); g.fill(); }
      for (let i = 0; i < 1500; i++) { g.fillStyle = hash(i, 91) < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'; g.fillRect(hash(i, 93) * W, hash(i, 95) * H, 2 + hash(i, 97) * 5, 2 + hash(i, 99) * 5); }
    }, false);
    const hull = std({ map: hullMap, bumpMap: hullBump, bumpScale: 1.4, roughness: 0.72, metalness: 0.45, ...wet });
    const steel = std({ color: 0x4d555d, roughness: 0.6, metalness: 0.6, ...wet });
    const lead = std({ color: 0x9c9a90, roughness: 0.5, metalness: 0.55, ...wet });

    const mine = new THREE.Group();
    mine.position.y = len;
    mine.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 72, 44), hull));
    // contact horns: a bolted flange, the soft lead horn, a rounded tip
    const flangeGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.07, 28), nutGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.07, 6);
    const hornGeo = new THREE.CylinderGeometry(0.072, 0.095, 0.5, 22), tipGeo = new THREE.SphereGeometry(0.072, 18, 12);
    const phi = (1 + Math.sqrt(5)) / 2;
    for (const [a, b, c] of [[0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]]) {
      const dir = new THREE.Vector3(a, b, c).normalize();
      if (dir.y < -0.7) continue; // leave the underside clear for the mooring
      const h = new THREE.Group();
      const nut = new THREE.Mesh(nutGeo, steel); nut.position.y = 0.065;
      const horn = new THREE.Mesh(hornGeo, lead); horn.position.y = 0.34;
      const tip = new THREE.Mesh(tipGeo, lead); tip.position.y = 0.59;
      h.add(new THREE.Mesh(flangeGeo, steel), nut, horn, tip);
      h.position.copy(dir).multiplyScalar(1.49);
      h.quaternion.setFromUnitVectors(UP, dir);
      mine.add(h);
    }
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 10, 24), steel); eye.position.y = 1.6;            // lifting eye
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.22, 28), steel); boss.position.y = -1.52;     // mooring fitting
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 10, 24), steel); shackle.position.y = -1.74;
    mine.add(eye, boss, shackle);
    tether.add(mine);

    // chain of oval links, each turned a quarter from the last
    const linkCurve = new THREE.CatmullRomCurve3([[0.07, 0.11], [0.07, -0.11], [0.036, -0.17], [-0.036, -0.17], [-0.07, -0.11], [-0.07, 0.11], [-0.036, 0.17], [0.036, 0.17]].map(([x, y]) => V(x, y, 0)), true);
    const linkGeo = new THREE.TubeGeometry(linkCurve, 36, 0.028, 8, true);
    const pitch = 0.27, links = Math.floor((len - 1.9) / pitch);
    for (let i = 0; i <= links; i++) {
      const l = new THREE.Mesh(linkGeo, steel);
      l.position.y = 0.2 + i * pitch;
      l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      tether.add(l);
    }
    scene.add(tether);

    // the sinker: a cast block with a top plate, mooring eye and lifting lugs, settled into the silt
    const stone = canvasTex(512, 512, (g, W, H) => {
      g.fillStyle = '#5b6269'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 5000; i++) { g.fillStyle = hash(i, 101) < 0.5 ? 'rgba(15,18,22,0.12)' : 'rgba(205,210,214,0.09)'; const r = 1 + hash(i, 103) * 5; g.beginPath(); g.arc(hash(i, 105) * W, hash(i, 107) * H, r, 0, 7); g.fill(); }
    });
    stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(0.6, 0.6);
    const concrete = std({ map: stone, roughness: 0.95, metalness: 0.05, ...wet });
    const sinker = new THREE.Group();
    sinker.position.set(MINE.x, floorY - 0.08, MINE.z);
    const block = new THREE.Mesh(roundedBox(2.0, 1.0, 2.0, 0.14), concrete); block.position.y = 0.5;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 32), steel); plate.position.y = 1.02;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 10, 24), steel); ring.position.y = 1.2;
    sinker.add(block, plate, ring);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lug = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 18), steel);
      lug.position.set(sx * 0.72, 1.06, sz * 0.72); lug.rotation.y = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
      sinker.add(lug);
    }
    scene.add(sinker);

    // boulders: lumpy, rounded, half sunk
    const rockMat = std({ color: 0x4b5258, roughness: 0.96, metalness: 0, envMapIntensity: 0.15 });
    for (let i = 0; i < 9; i++) {
      const geo = new THREE.SphereGeometry(1, 28, 18), p = geo.attributes.position;
      for (let n = 0; n < p.count; n++) {
        const x = p.getX(n), y = p.getY(n), z = p.getZ(n);
        const k = 1 + (fbm(x * 1.4 + i * 7.1 + z * 0.9, y * 1.4 + z * 1.1 + i * 3.3) - 0.5) * 0.7;
        p.setXYZ(n, x * k, y * k, z * k);
      }
      geo.computeVertexNormals();
      const x = MINE.x + (hash(i, 21) - 0.5) * 16, z = MINE.z + (hash(i, 23) - 0.3) * 12, r = 0.4 + hash(i, 25) * 0.9;
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(x, height(x, z) + r * 0.12, z);
      rock.rotation.y = hash(i, 27) * 6;
      rock.scale.set(r, r * 0.6, r * (0.8 + hash(i, 29) * 0.4));
      scene.add(rock);
    }
    mineLight.position.set(MINE.x - 4, MINE.y + 3, MINE.z + 7);
    scene.add(mineLight);
  }
  // a soft round dot, so particles are not drawn as squares
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();

  /* marine snow */
  let snow;
  {
    const N = 1500, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = -30 + hash(i, 31) * 72;
      pos[i * 3 + 1] = -36 + hash(i, 33) * 35.5;
      pos[i * 3 + 2] = 12 + hash(i, 35) * 64;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfeaf2, map: dot, size: 0.11, transparent: true, opacity: 0.7, depthWrite: false }));
    scene.add(snow);
  }

  /* shafts of daylight coming down through the water */
  const shafts = new THREE.Group();
  {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, 'rgba(255,255,255,1)'); down.addColorStop(0.55, 'rgba(255,255,255,0.35)'); down.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = down; g.fillRect(0, 0, 64, 256);
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,1)'); across.addColorStop(0.5, 'rgba(0,0,0,0)'); across.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = across; g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const w = 2.2 + hash(i, 41) * 3.5, h = 30;
      const s = new THREE.Group();
      for (const ry of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = ry; s.add(m); }
      s.position.set(-12 + hash(i, 43) * 30, -h / 2 + 0.2, 26 + hash(i, 45) * 26);
      s.rotation.z = 0.16 + hash(i, 47) * 0.08; // all leaning the same way, like real sun rays
      s.userData = { mat, phase: hash(i, 49) * 6.28 };
      shafts.add(s);
    }
    scene.add(shafts);
  }

  /* bubbles rising past the mine */
  let bubbles;
  {
    const N = 70, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = MINE.x - 3 + hash(i, 51) * 9;
      pos[i * 3 + 1] = -34 + hash(i, 53) * 33;
      pos[i * 3 + 2] = MINE.z - 3 + hash(i, 55) * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, map: dot, size: 0.14, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(bubbles);
  }

  /* 04: a small remotely operated vehicle working by the sinker (its front faces -x) */
  const rov = new THREE.Group();
  const ROV_HOME = new THREE.Vector3(MINE.x + 2.5, height(MINE.x, MINE.z) + 2.3, MINE.z - 1.2);
  const rovProps = [];
  {
    const wet = { envMapIntensity: 0.35 };
    const foam = std({ color: 0xc3a13c, roughness: 0.72, ...wet });                       // buoyancy block
    const frameMat = std({ color: 0x23272c, roughness: 0.6, metalness: 0.25, ...wet });   // plastic side plates
    const alu = std({ color: 0xaeb5bc, roughness: 0.35, metalness: 0.8, ...wet });
    const lens = std({ color: 0x0b0f13, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.3 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xf2f8ff });
    const along = (geo) => { geo.rotateZ(Math.PI / 2); return geo; }; // turn a part built upright so it lies along x
    const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

    // buoyancy block with the two vertical thruster tunnels showing on top
    rov.add(at(new THREE.Mesh(roundedBox(1.3, 0.26, 0.92, 0.1), foam), 0, 0.31, 0));
    for (const z of [0.24, -0.24]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), black); hole.rotation.x = -Math.PI / 2;
      rov.add(at(hole, 0.08, 0.442, z));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 28), frameMat); rim.rotation.x = Math.PI / 2;
      rov.add(at(rim, 0.08, 0.442, z));
    }
    // side plates, skids and the cross tubes that tie them together
    for (const z of [0.45, -0.45]) {
      const plate = new THREE.Mesh(roundedBox(1.24, 0.036, 0.52, 0.09), frameMat); plate.rotation.x = Math.PI / 2;
      rov.add(at(plate, 0, -0.04, z), rod(V(-0.62, -0.31, z), V(0.62, -0.31, z), 0.03, frameMat));
    }
    for (const [x, y] of [[-0.52, 0.14], [0.52, 0.14], [-0.52, -0.24], [0.52, -0.24]]) rov.add(rod(V(x, y, -0.45), V(x, y, 0.45), 0.022, alu));

    // electronics pod with the camera dome at the front
    rov.add(
      at(new THREE.Mesh(along(new THREE.CylinderGeometry(0.125, 0.125, 0.78, 28)), alu), 0.06, -0.02, 0),
      at(new THREE.Mesh(along(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 28)), frameMat), -0.31, -0.02, 0),
      at(new THREE.Mesh(along(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 28)), frameMat), 0.45, -0.02, 0)
    );
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 16), lens); dome.scale.x = 0.8;
    rov.add(at(dome, -0.34, -0.02, 0));

    // two rear thrusters: a shaped nozzle, a motor, a three-bladed propeller that spins
    const nozzleGeo = along(new THREE.LatheGeometry([[0.105, -0.09], [0.125, -0.07], [0.135, 0], [0.125, 0.08], [0.108, 0.1], [0.1, 0.06], [0.098, 0], [0.1, -0.06], [0.105, -0.09]].map(([r, y]) => new THREE.Vector2(r, y)), 32));
    const motorGeo = along(new THREE.CylinderGeometry(0.042, 0.042, 0.24, 18));
    for (const z of [0.27, -0.27]) {
      const spin = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.085, 0.045), alu);
        const arm = new THREE.Group(); arm.rotation.x = (b / 3) * Math.PI * 2;
        blade.position.y = 0.052; blade.rotation.y = 0.6;
        arm.add(blade); spin.add(arm);
      }
      rovProps.push(spin);
      rov.add(at(new THREE.Mesh(nozzleGeo, frameMat), 0.56, -0.02, z), at(new THREE.Mesh(motorGeo, alu), 0.5, -0.02, z), at(spin, 0.6, -0.02, z),
        rod(V(0.5, -0.02, z), V(0.5, -0.02, z > 0 ? 0.45 : -0.45), 0.014, frameMat));
    }

    // lamps
    for (const z of [0.31, -0.31]) {
      rov.add(at(new THREE.Mesh(along(new THREE.CylinderGeometry(0.062, 0.05, 0.13, 22)), alu), -0.6, 0.12, z));
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.054, 22), glow); face.rotation.y = -Math.PI / 2;
      rov.add(at(face, -0.667, 0.12, z), rod(V(-0.6, 0.12, z), V(-0.52, 0.14, z), 0.016, frameMat));
    }

    // manipulator arm reaching for the sinker, with an open two-finger gripper
    rov.add(
      ball(0.045, alu, -0.48, -0.22, 0.2),
      rod(V(-0.48, -0.22, 0.2), V(-0.86, -0.36, 0.2), 0.028, alu),
      ball(0.04, alu, -0.86, -0.36, 0.2),
      rod(V(-0.86, -0.36, 0.2), V(-1.14, -0.52, 0.14), 0.024, alu),
      rod(V(-1.14, -0.52, 0.14), V(-1.3, -0.56, 0.21), 0.013, frameMat),
      rod(V(-1.14, -0.52, 0.14), V(-1.3, -0.64, 0.09), 0.013, frameMat)
    );

    // the tether back to the surface
    const cable = new THREE.CatmullRomCurve3([V(0.5, 0.44, 0), V(1.0, 1.1, 0.25), V(2.6, 2.8, 0.2), V(6, 8, -2.5), V(13, 22, -7)]);
    rov.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 80, 0.02, 8), std({ color: 0xb7953a, roughness: 0.7, ...wet })));
    rov.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 16), frameMat), 0.5, 0.47, 0));

    const beam = new THREE.SpotLight(0xe8f4ff, 90, 16, 0.5, 0.6, 1.4);
    beam.position.set(-0.6, 0.05, 0);
    beam.target.position.set(-2.6, -1.9, 0);
    rov.add(beam, beam.target);
    rov.position.copy(ROV_HOME);
    rov.rotation.y = 0.42;
    scene.add(rov);
  }
  /* camera path: one keyframe per chapter */
  const KEYS = [
    { cam: [0, 60.0, 14.5], look: [0, 59.2, 0], ox: 4.2 },
    { cam: [0, 30.7, 17], look: [0, 30, 0], ox: 4.4 },
    { cam: [0, 6.0, 27], look: [0, 4.3, -11], ox: 5 },
    { cam: [0, -21.1, 55], look: [0, -22, 40], ox: 4.2 },
    { cam: [0, -30.9, 50.5], look: [1.2, -33.2, 40], ox: 3 },
  ];
  // sky colour and fog density by camera height
  const ENV = [
    [60, 0x77808b, 0.0072], [44, 0x8a929c, 0.024], [30, 0x7b848e, 0.011], [5, 0x7f8790, 0.0092],
    [0.35, 0x7f8790, 0.0092], [-0.35, 0x334852, 0.036], [-22, 0x15222b, 0.044], [-34, 0x0a1117, 0.058],
  ].map(([y, c, d]) => ({ y, c: new THREE.Color(c), d }));

  const tags = [
    { el: document.querySelector('[data-tag="plane"]'), pos: new THREE.Vector3(3.2, 61.0, 0), ch: 0 },
    { el: document.querySelector('[data-tag="core"]'), pos: new THREE.Vector3(4.9, 32.0, 0), ch: 1 },
    { el: document.querySelector('[data-tag="post"]'), pos: postTop, ch: 2 },
    { el: document.querySelector('[data-tag="mine"]'), pos: new THREE.Vector3(MINE.x, MINE.y + 2.2, MINE.z), ch: 3 },
    { el: document.querySelector('[data-tag="rov"]'), pos: ROV_HOME.clone().add(new THREE.Vector3(0, 0.9, 0)), ch: 4 },
  ];
  // a number on each of the seven pipeline sources
  const tagLayer = document.querySelector('.tags');
  sources.forEach((pos, n) => {
    const el = document.createElement('div');
    el.className = 'tag num';
    el.textContent = `0${n + 1}`;
    tagLayer.appendChild(el);
    tags.push({ el, pos, ch: 1 });
  });

  let W = 0, H = 0, narrow = false;
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    narrow = camera.aspect < 1;
    camera.fov = narrow ? 52 : 40;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduce) addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; });

  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
  let fs = progress(), last = performance.now();
  let intro = snap || fs > 0.05 ? 0 : 1;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = reduce ? 0 : now / 1000;

    const f = progress();
    fs = snap ? f : fs + (f - fs) * (1 - Math.exp(-dt * 4.5));
    updateHud(f);

    // camera along the keyframes, easing so it lingers at each chapter
    const i = Math.min(KEYS.length - 2, Math.floor(fs)), k = smooth(0, 1, fs - i), A = KEYS[i], B = KEYS[i + 1];
    for (let n = 0; n < 3; n++) { camPos.setComponent(n, mix(A.cam[n], B.cam[n], k)); look.setComponent(n, mix(A.look[n], B.look[n], k)); }
    // Objects sit to the right of the text. How far right depends on how wide the view is;
    // on phones the object goes to the middle and the camera stands further back.
    const ox = mix(A.ox, B.ox, k);
    if (narrow) {
      camPos.x += ox; look.x += ox;
      camPos.sub(look).multiplyScalar(1.5).add(look);
      // at the top of the page the text sits low, so lift the plane into the open sky above it
      const lift = (1 - smooth(0, 0.6, fs)) * 3.6;
      camPos.y -= lift; look.y -= lift;
    } else {
      const halfW = camPos.distanceTo(look) * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
      const shift = ox - Math.min(ox, halfW * 0.4);
      camPos.x += shift; look.x += shift;
    }
    // opening move: the camera starts further back and higher, then settles in
    if (intro > 0.001) {
      intro *= Math.exp(-dt * 1.6);
      camPos.sub(look).multiplyScalar(1 + intro * 0.9).add(look);
      camPos.y += intro * 4;
    }
    mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
    camPos.x += mouse.sx * 1.1; camPos.y -= mouse.sy * 0.6;
    camera.position.copy(camPos);
    camera.lookAt(look);

    // atmosphere
    const y = camera.position.y;
    let e = 0; while (e < ENV.length - 2 && y < ENV[e + 1].y) e++;
    const u = clamp01((ENV[e].y - y) / (ENV[e].y - ENV[e + 1].y));
    col.copy(ENV[e].c).lerp(ENV[e + 1].c, u);
    scene.background.copy(col); scene.fog.color.copy(col);
    scene.fog.density = mix(ENV[e].d, ENV[e + 1].d, u);
    const deep = y < 0 ? 0.45 + 0.55 * smooth(0, -30, y) : 0;
    hemi.intensity = mix(1.15, 0.42, deep);
    sun.intensity = mix(1.9, 0.3, deep);

    // motion
    plane.position.y = 59.2 + Math.sin(t * 0.8) * 0.14;
    plane.rotation.x = Math.sin(t * 0.55) * 0.07;
    prop.rotation.x = t * 22;
    for (const c of clouds) { c.position.x -= c.userData.v * dt * (reduce ? 0 : 1); if (c.position.x < -78) c.position.x = 78; }
    coreBox.rotation.y = t * 0.3;
    waterNormal.offset.set(t * 0.012, t * 0.02);
    for (const fl of flows) fl.m.position.copy(fl.curve.getPointAt((t * fl.speed + fl.off) % 1));
    tether.rotation.z = Math.sin(t * 0.4) * 0.03; tether.rotation.x = Math.cos(t * 0.31) * 0.02;
    rov.position.y = ROV_HOME.y + Math.sin(t * 0.7) * 0.12;
    rov.rotation.z = Math.sin(t * 0.5) * 0.03;
    for (const p of rovProps) p.rotation.x = t * 9;
    flags.forEach((f, n) => { f.rotation.y = -0.35 + Math.sin(t * 3.1 + n * 1.7) * 0.45; });
    shafts.visible = bubbles.visible = y < 2;
    if (shafts.visible) {
      for (const s of shafts.children) s.userData.mat.opacity = 0.05 + 0.035 * Math.sin(t * 0.5 + s.userData.phase);
      if (!reduce) {
        const p = bubbles.geometry.attributes.position;
        for (let n = 0; n < p.count; n++) { let py = p.getY(n) + dt * (0.9 + (n % 5) * 0.2); if (py > -0.6) py = -34; p.setY(n, py); }
        p.needsUpdate = true;
      }
    }
    if (!reduce && y < 4) {
      const p = snow.geometry.attributes.position;
      for (let n = 0; n < p.count; n++) { let py = p.getY(n) - dt * 0.18; if (py < -36) py = -0.5; p.setY(n, py); }
      p.needsUpdate = true;
    }

    renderer.render(scene, camera);

    // labels pinned to objects
    if (!narrow) {
      for (const tg of tags) {
        const o = 1 - smooth(0.22, 0.46, Math.abs(fs - tg.ch));
        v.copy(tg.pos).project(camera);
        if (o <= 0.01 || v.z > 1) { tg.el.style.opacity = 0; continue; }
        tg.el.style.opacity = o;
        // keep the whole label on screen when its object sits near the right edge
        const x = Math.min((v.x * 0.5 + 0.5) * W, W - tg.el.offsetWidth - 24);
        tg.el.style.transform = `translate(${x.toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px)`;
      }
    }
  }
  root.classList.add('gl');
  requestAnimationFrame(frame);
}

try {
  start();
} catch (err) {
  // No WebGL: keep the gradient page and still drive the readouts from scroll.
  console.warn('3D scene unavailable:', err);
  const tick = () => { updateHud(progress()); requestAnimationFrame(tick); };
  tick();
}
