/* IRON ARENA — an original browser MMA game.
   Single-file build. Sections: core → sculpt → anatomy → roster → shaders → render → arena →
   fighter model → rig → clips → animator → ragdoll → combat → AI → camera → vfx → audio →
   input → replay → UI → tutorial → game flow. */

const THREE_VERSION = '0.160.0';
const THREE_URLS = [
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`,
  `https://unpkg.com/three@${THREE_VERSION}/build/three.module.min.js`,
  `https://cdnjs.cloudflare.com/ajax/libs/three.js/${THREE_VERSION}/three.module.min.js`,
  `https://esm.sh/three@${THREE_VERSION}`
];
async function loadThree() {
  for (const url of THREE_URLS) {
    try { return await import(url); } catch (e) { console.warn('three.js source failed:', url); }
  }
  document.body.insertAdjacentHTML('beforeend',
    '<div style="position:fixed;inset:0;display:grid;place-items:center;background:#0e0f12;color:#efe9dc;font:16px/1.5 sans-serif;text-align:center;padding:24px;z-index:99">' +
    '<div><b style="letter-spacing:.2em;color:#c9a45c">IRON ARENA</b><br><br>Could not load the 3D engine (three.js) from the CDN.<br>Check your connection and reload.</div></div>');
  throw new Error('three.js unavailable');
}
const THREE = await loadThree();

const QS = new URLSearchParams(location.search);
const TAU = Math.PI * 2, PI = Math.PI, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
const remap = (v, a, b, c, d) => c + (d - c) * invLerp(a, b, v);
const smooth = t => t * t * (3 - 2 * t);
const sstep = (a, b, v) => smooth(invLerp(a, b, v));
const sign = v => v < 0 ? -1 : 1;
const wrapPi = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const angLerp = (a, b, t) => a + wrapPi(b - a) * t;
/** frame-rate independent exponential approach */
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const dampAng = (a, b, rate, dt) => a + wrapPi(b - a) * (1 - Math.exp(-rate * dt));

const Ease = {
  lin: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  io: smooth,
  in3: t => t * t * t,
  out3: t => 1 - Math.pow(1 - t, 3),
  out4: t => 1 - Math.pow(1 - t, 4),
  io3: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  snap: t => 1 - Math.pow(1 - t, 5),
};

/** small seeded RNG (mulberry32) — used so procedural art is identical every load */
function RNG(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(f.range(lo, hi + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}
const rand = RNG((Date.now() ^ 0x9e3779b9) >>> 0);   // gameplay randomness

/** critically-damped spring for scalars */
class Spring {
  constructor(freq = 6, zeta = 0.7, x = 0) { this.x = x; this.v = 0; this.t = x; this.f = freq; this.z = zeta; }
  kick(impulse) { this.v += impulse; }
  step(dt) {
    const w = this.f * TAU, k = w * w, c = 2 * this.z * w;
    // semi-implicit with sub-stepping for stability at low fps
    const n = Math.max(1, Math.ceil(dt * this.f * 8)); const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (k * (this.t - this.x) - c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const Bus = {
  map: new Map(),
  on(type, fn) { (this.map.get(type) || this.map.set(type, []).get(type)).push(fn); return fn; },
  off(type, fn) { const a = this.map.get(type); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
  emit(type, data) { const a = this.map.get(type); if (a) for (let i = 0; i < a.length; i++) a[i](data); }
};

const IS_TOUCH = (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer:coarse)').matches || QS.has('touch');
const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900 || QS.has('mobile');

const Store = {
  key: 'iron_arena_v1',
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { this.data = null; }
    this.data = Object.assign({ tutorialDone: false, wins: 0, losses: 0, kos: 0, fights: 0, beaten: {}, binds: null, vol: { master: .9, sfx: 1, crowd: .8, music: .6 }, quality: 'auto', difficulty: 1, lastFighter: 'vale', rounds: 3 }, this.data || {});
    return this.data;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* private mode */ } }
};
Store.load();

/** debug handle for automated tests */
const IA = window.IA = { THREE, QS, dbg: {} };
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
