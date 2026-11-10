/* The sculpting kernel + anatomy live inside one self-contained function so the very same code
   can run on the main thread or be handed to a Web Worker (fighters are built off-thread while
   you play, so loading never stalls the game). */
function SculptKernel() {
const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function RNG(seed) { let a = seed >>> 0; const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.range = (lo, hi) => lo + (hi - lo) * f(); return f; }
