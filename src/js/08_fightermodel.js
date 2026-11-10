/* ═══════════════════════════ FIGHTER MODEL ═══════════════════════════
   Turns a sculpt into skinned meshes with illustrated materials, an inked outline shell,
   a hand-painted (canvas) face that changes expression, shorts artwork and a portrait. */
function geoFromSculpt(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
  g.setAttribute('aAO', new THREE.BufferAttribute(m.ao, 3)); g.setAttribute('aReg', new THREE.BufferAttribute(m.reg || new Float32Array(m.nv * 4), 4));
  if (m.si) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(m.sw, 4)); }
  g.setIndex(new THREE.BufferAttribute(m.idx, 1)); return g;
}
const hexMul = (hex, r, g, b) => { const c = new THREE.Color(hex); c.r *= r; c.g *= g; c.b *= b; return c; };
const cssCol = (c, a = 1) => `rgba(${Math.round(clamp01(c.r) * 255)},${Math.round(clamp01(c.g) * 255)},${Math.round(clamp01(c.b) * 255)},${a})`;
const srgb = hex => { const c = new THREE.Color(); c.setStyle(hex, THREE.SRGBColorSpace); return { r: Math.pow(c.r, 1 / 2.2), g: Math.pow(c.g, 1 / 2.2), b: Math.pow(c.b, 1 / 2.2) }; };
function shadeHex(hex, k, a = 1) { const m = /^#(..)(..)(..)$/.exec(hex), r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), f = Array.isArray(k) ? k : [k, k, k]; return `rgba(${Math.round(clamp(r * f[0], 0, 255))},${Math.round(clamp(g * f[1], 0, 255))},${Math.round(clamp(b * f[2], 0, 255))},${a})`; }

/* ── the painted face ─────────────────────────────────────────────────── */
const EXPR = {
  neutral: { brow: -0.15, lid: 0.16, squint: 0.1, mo: 0, mc: 0, mouth: 0 },
  focus:   { brow: -0.55, lid: 0.24, squint: 0.3, mo: 0, mc: -0.15, mouth: 0 },
  strike:  { brow: -0.8, lid: 0.3, squint: 0.5, mo: 0.45, mc: -0.1, mouth: 1 },
  exhale:  { brow: -0.5, lid: 0.25, squint: 0.3, mo: 0.5, mc: 0, mouth: 2 },
  pain:    { brow: 0.35, lid: 0.82, squint: 0.9, mo: 0.6, mc: -0.5, mouth: 1 },
  hurt:    { brow: 0.2, lid: 0.55, squint: 0.7, mo: 0.35, mc: -0.4, mouth: 1 },
  dazed:   { brow: 0.55, lid: 0.6, squint: 0.1, mo: 0.4, mc: -0.2, mouth: 2 },
  out:     { brow: 0.1, lid: 1, squint: 0, mo: 0.3, mc: -0.1, mouth: 2 },
  tired:   { brow: 0.3, lid: 0.42, squint: 0.2, mo: 0.55, mc: -0.15, mouth: 2 },
  smile:   { brow: 0.2, lid: 0.3, squint: 0.55, mo: 0.4, mc: 0.9, mouth: 1 },
  roar:    { brow: -0.7, lid: 0.2, squint: 0.4, mo: 1, mc: 0.1, mouth: 2 },
  guard:   { brow: -0.4, lid: 0.3, squint: 0.4, mo: 0, mc: -0.25, mouth: 0 },
  smirk:   { brow: 0.1, lid: 0.3, squint: 0.3, mo: 0, mc: 0.55, mouth: 0 },
};
class FacePainter {
  constructor(look) {
    this.look = look; this.f = { eye: '#4a3626', browT: 1, browArch: 1, eyeW: 1, eyeH: 1, eyeTilt: 0.05, mouthW: 1, lipCol: null, ...look.facePaint };
    this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = 512; this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.premultiplyAlpha = true; this.tex.anisotropy = 4;
    this.cur = { ...EXPR.neutral }; this.tgt = { ...EXPR.neutral }; this.name = 'neutral'; this.hold = 0;
    this.blink = 0; this.blinkT = 1 + Math.random() * 3; this.gaze = [0, 0]; this.sw = [0, 0]; this.cuts = []; this.dirty = true; this.acc = 0;
    this.draw();
  }
  /** set expression; `hold` seconds before it may be replaced by a lower-priority idle expression */
  set(name, hold = 0) { if (!EXPR[name]) return; this.name = name; this.tgt = EXPR[name]; this.hold = Math.max(this.hold, hold); }
  idle(name) { if (this.hold <= 0 && this.name !== name) { this.name = name; this.tgt = EXPR[name]; } }
  update(dt) {
    this.hold -= dt; let ch = 0; const k = 1 - Math.exp(-dt * 16);
    for (const key of ['brow', 'lid', 'squint', 'mo', 'mc']) { const d = this.tgt[key] - this.cur[key]; if (Math.abs(d) > 0.004) { this.cur[key] += d * k; ch += Math.abs(d); } }
    if (this.cur.mouth !== this.tgt.mouth) { this.cur.mouth = this.tgt.mouth; ch = 1; }
    this.blinkT -= dt; if (this.blinkT < 0) { this.blinkT = 2 + Math.random() * 4; this.blink = 0.14; }
    if (this.blink > 0) { this.blink -= dt; ch = 1; }
    this.acc += dt; if ((ch > 0.01 || this.dirty) && this.acc > 0.04) { this.acc = 0; this.dirty = false; this.draw(); }
  }
  draw() {
    const c = this.ctx, f = this.f, e = this.cur, S = 2.56, X = mm => 256 + mm * S, Y = mm => 256 - (mm - 25) * S, skin = this.look.skin, sp = (this.look.face && this.look.face.eyeSp) || 1;
    c.clearRect(0, 0, 512, 512); c.lineCap = 'round'; c.lineJoin = 'round';
    const line = shadeHex(skin, [0.34, 0.24, 0.24]), soft = (k, a) => shadeHex(skin, k, a), hair = this.look.hairCol || '#1a1412';
    const blink = this.blink > 0 ? Math.sin((1 - this.blink / 0.14) * PI) : 0;
    for (const side of [1, -1]) {
      const sw = this.sw[side > 0 ? 0 : 1], cx = X(side * 31 * sp), cy = Y(65.5), w = 14.2 * S * f.eyeW, lid = clamp(Math.max(e.lid, blink) + sw * 0.75, 0, 1);
      const hT = 6.6 * S * f.eyeH * (1 - lid), hB = 3.6 * S * f.eyeH * (1 - e.squint * 0.55) * (1 - lid * 0.7);
      // socket wash: gives the eye depth even at distance
      let g = c.createRadialGradient(cx, cy - 4, 4, cx, cy - 2, 44); g.addColorStop(0, soft([0.55, 0.42, 0.44], 0.55)); g.addColorStop(1, soft([0.55, 0.42, 0.44], 0)); c.fillStyle = g; c.fillRect(cx - 50, cy - 46, 100, 86);
      if (sw > 0.05) { g = c.createRadialGradient(cx, cy + 6, 4, cx, cy + 4, 46); g.addColorStop(0, `rgba(118,52,86,${0.6 * sw})`); g.addColorStop(1, 'rgba(118,52,86,0)'); c.fillStyle = g; c.fillRect(cx - 52, cy - 44, 104, 96); }
      c.save(); c.translate(cx, cy); c.rotate(-side * f.eyeTilt); c.scale(side, 1);
      const path = () => { c.beginPath(); c.moveTo(-w, 2); c.quadraticCurveTo(-w * 0.15, -hT * 2.05 - 1, w, -2.5); c.quadraticCurveTo(w * 0.1, hB * 2 + 2, -w, 2); c.closePath(); };
      if (lid < 0.94) {
        c.save(); path(); c.clip(); c.fillStyle = '#e9e1d6'; c.fillRect(-w - 2, -30, w * 2 + 4, 60);
        const ix = this.gaze[0] * 4.2 * S * side, iy = -1.2 * S + this.gaze[1] * 2.4 * S, ir = 6.3 * S * f.eyeH;
        g = c.createRadialGradient(ix, iy, 1, ix, iy, ir); g.addColorStop(0, shadeHex(f.eye, 1.5)); g.addColorStop(0.7, f.eye); g.addColorStop(1, shadeHex(f.eye, 0.35)); c.fillStyle = g; c.beginPath(); c.arc(ix, iy, ir, 0, TAU); c.fill();
        c.fillStyle = '#0b0707'; c.beginPath(); c.arc(ix, iy, ir * 0.45, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(ix - 3.4, iy - 4.2, 2.6, 0, TAU); c.fill();
        g = c.createLinearGradient(0, -hT * 1.1 - 2, 0, 4); g.addColorStop(0, 'rgba(40,20,24,.65)'); g.addColorStop(1, 'rgba(40,20,24,0)'); c.fillStyle = g; c.fillRect(-w - 2, -30, w * 2 + 4, 40);
        c.restore();
      }
      // lids and lashes: tapered ink lines
      c.strokeStyle = '#1c0f0d'; c.lineWidth = 4.6; c.beginPath(); c.moveTo(-w - 1, 2.5); c.quadraticCurveTo(-w * 0.15, -hT * 2.05 - 2.5, w + 2.5, -3.5); c.stroke();
      c.lineWidth = 3; c.beginPath(); c.moveTo(w - 2, -3.2); c.lineTo(w + 6.5, -6.2 - (1 - lid) * 2); c.stroke();
      c.strokeStyle = soft([0.4, 0.28, 0.28], 0.75); c.lineWidth = 1.9; c.beginPath(); c.moveTo(w * 0.85, 1.5); c.quadraticCurveTo(w * 0.1, hB * 2 + 2.6, -w * 0.55, hB + 2.5); c.stroke();
      c.strokeStyle = soft([0.42, 0.3, 0.3], 0.55); c.lineWidth = 1.8; c.beginPath(); c.moveTo(-w * 0.85, -6 - hT * 0.5); c.quadraticCurveTo(0, -hT * 2.0 - 11 + lid * 5, w * 1.02, -9); c.stroke();
      c.strokeStyle = soft([0.5, 0.36, 0.38], 0.4 + 0.3 * e.squint); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-w * 0.7, hB * 2 + 8); c.quadraticCurveTo(0, hB * 2 + 13, w * 0.75, hB + 8); c.stroke();
      c.restore();
      // brow: tapered brush shape
      const bi = [side * (9.5 - Math.max(0, -e.brow) * 1.6), 78.5 + e.brow * 3.2 + Math.min(0, e.brow) * 1.2], bm = [side * 30, 84.6 * 1 + f.browArch * 1.2 + Math.max(0, e.brow) * 3.6 - sw * 1.5], bo = [side * 48.5, 80 + Math.max(0, e.brow) * 2 - sw];
      const th = 3.5 * f.browT;
      c.fillStyle = hair; c.beginPath(); c.moveTo(X(bi[0]), Y(bi[1] + th * 0.9)); c.quadraticCurveTo(X(bm[0]), Y(bm[1] + th * 1.15), X(bo[0]), Y(bo[1])); c.quadraticCurveTo(X(bm[0]), Y(bm[1] - th * 0.85), X(bi[0] + side * 1.2), Y(bi[1] - th * 0.95)); c.closePath(); c.fill();
      c.strokeStyle = soft([0.5, 0.36, 0.38], 0.35 * Math.max(0, -e.brow)); c.lineWidth = 2; c.beginPath(); c.moveTo(X(side * 4.5), Y(86)); c.lineTo(X(side * 5.5), Y(74)); c.stroke();
    }
    // nose: one side plane + nostrils
    c.strokeStyle = soft([0.5, 0.36, 0.36], 0.55); c.lineWidth = 2.2; c.beginPath(); c.moveTo(X(-5), Y(62)); c.quadraticCurveTo(X(-8.5), Y(42), X(-12), Y(30)); c.stroke();
    c.fillStyle = soft([0.28, 0.18, 0.18], 0.8); for (const sd of [1, -1]) { c.beginPath(); c.ellipse(X(sd * 7.2), Y(24.2), 4.6, 2.4, sd * 0.35, 0, TAU); c.fill(); }
    c.strokeStyle = soft([0.5, 0.36, 0.36], 0.5); c.lineWidth = 2; for (const sd of [1, -1]) { c.beginPath(); c.arc(X(sd * 9.5), Y(27.5), 8.5, sd > 0 ? -0.6 : PI - 0.5, sd > 0 ? 1.1 : PI + 0.6 + 0.6, false); c.stroke(); }
    // nasolabial folds deepen with effort
    const fold = Math.max(0, e.mo * 0.7, -e.mc * 0.5, e.squint * 0.3); c.strokeStyle = soft([0.5, 0.36, 0.36], 0.1 + 0.5 * fold); c.lineWidth = 2;
    for (const sd of [1, -1]) { c.beginPath(); c.moveTo(X(sd * 15), Y(27)); c.quadraticCurveTo(X(sd * 25), Y(12), X(sd * 27.5), Y(-4)); c.stroke(); }
    // mouth
    const mw = 23.5 * f.mouthW * (1 + 0.08 * e.mo + 0.1 * Math.max(0, e.mc)), my = -4.2, cr = e.mc * 4.2, lip = f.lipCol || shadeHex(skin, [0.86, 0.58, 0.58]);
    const guard = this.look.guardCol || '#e8e2d6';
    if (e.mouth === 0 || e.mo < 0.06) {
      c.fillStyle = shadeHex(skin, [0.8, 0.56, 0.56], 0.9); c.beginPath(); c.moveTo(X(-mw), Y(my + cr)); c.quadraticCurveTo(X(-8), Y(my + 5.6), X(0), Y(my + 3.6)); c.quadraticCurveTo(X(8), Y(my + 5.6), X(mw), Y(my + cr)); c.quadraticCurveTo(X(0), Y(my - 1.2), X(-mw), Y(my + cr)); c.fill();
      c.fillStyle = lip; c.beginPath(); c.moveTo(X(-mw * 0.9), Y(my + cr * 0.8)); c.quadraticCurveTo(X(0), Y(my - 10.5), X(mw * 0.9), Y(my + cr * 0.8)); c.quadraticCurveTo(X(0), Y(my - 1.6), X(-mw * 0.9), Y(my + cr * 0.8)); c.fill();
      c.strokeStyle = '#3a1818'; c.lineWidth = 2.8; c.beginPath(); c.moveTo(X(-mw), Y(my + cr)); c.quadraticCurveTo(X(0), Y(my - 1.4 - cr * 0.25), X(mw), Y(my + cr)); c.stroke();
    } else {
      const oh = (e.mouth === 2 ? 15 : 8.5) * e.mo, top = my + 3.2 + oh * 0.15, bot = my - 2.4 - oh;
      const shape = () => { c.beginPath(); c.moveTo(X(-mw), Y(my + cr)); c.quadraticCurveTo(X(-mw * 0.5), Y(top + 2.2), X(0), Y(top)); c.quadraticCurveTo(X(mw * 0.5), Y(top + 2.2), X(mw), Y(my + cr));
        if (e.mouth === 2) c.quadraticCurveTo(X(mw * 0.72), Y(bot), X(0), Y(bot - 1)), c.quadraticCurveTo(X(-mw * 0.72), Y(bot), X(-mw), Y(my + cr)); else c.quadraticCurveTo(X(mw * 0.6), Y(bot - 1.6), X(0), Y(bot)), c.quadraticCurveTo(X(-mw * 0.6), Y(bot - 1.6), X(-mw), Y(my + cr)); c.closePath(); };
      c.fillStyle = '#2a0e10'; shape(); c.fill(); c.save(); shape(); c.clip();
      c.fillStyle = guard; const gh = e.mouth === 2 ? Math.min(7.5, oh * 0.6) : oh * 0.92; c.fillRect(X(-mw), Y(top + 3), mw * 2 * S, (gh + 3) * S);
      if (e.mouth === 1) { c.strokeStyle = 'rgba(40,20,20,.35)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(-mw), Y(top - gh * 0.55)); c.lineTo(X(mw), Y(top - gh * 0.55)); c.stroke(); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(X(i * 6.2), Y(top + 1)); c.lineTo(X(i * 6.2), Y(top - gh)); c.stroke(); } }
      c.restore();
      c.strokeStyle = '#3a1818'; c.lineWidth = 2.6; shape(); c.stroke();
      c.strokeStyle = lip; c.lineWidth = 4.2; c.beginPath(); c.moveTo(X(-mw * 0.72), Y(bot - 3.2)); c.quadraticCurveTo(X(0), Y(bot - 5.4), X(mw * 0.72), Y(bot - 3.2)); c.stroke();
    }
    c.strokeStyle = soft([0.5, 0.36, 0.36], 0.5); c.lineWidth = 2.2; c.beginPath(); c.moveTo(X(-9), Y(-21)); c.quadraticCurveTo(X(0), Y(-18.5), X(9), Y(-21)); c.stroke();
    // painted facial hair
    const fh = this.look.beard || {}; c.fillStyle = hair; c.strokeStyle = hair;
    if (fh.mustache) { c.beginPath(); c.moveTo(X(0), Y(6.5)); c.quadraticCurveTo(X(-12), Y(9), X(-mw - 3), Y(my - 2 + cr)); c.quadraticCurveTo(X(-12), Y(1.5), X(0), Y(1.8)); c.quadraticCurveTo(X(12), Y(1.5), X(mw + 3), Y(my - 2 + cr)); c.quadraticCurveTo(X(12), Y(9), X(0), Y(6.5)); c.fill(); }
    if (fh.soul) { c.beginPath(); c.ellipse(X(0), Y(-17), 7, 9, 0, 0, TAU); c.fill(); }
    // feature marks: scars / face paint
    for (const m of (f.marks || [])) { c.strokeStyle = m.col || soft([1.25, 0.85, 0.85], 0.8); c.lineWidth = m.w || 2.4; c.beginPath(); c.moveTo(X(m.a[0]), Y(m.a[1])); c.lineTo(X(m.b[0]), Y(m.b[1])); c.stroke(); }
    // fight damage: small stylised marks
    for (const m of this.cuts) { c.strokeStyle = `rgba(150,26,30,${m.a})`; c.lineWidth = 3; c.beginPath(); c.moveTo(X(m.x - m.l), Y(m.y - m.l * m.s)); c.lineTo(X(m.x + m.l), Y(m.y + m.l * m.s)); c.stroke(); c.fillStyle = `rgba(190,60,70,${m.a * 0.35})`; c.beginPath(); c.arc(X(m.x), Y(m.y), 11, 0, TAU); c.fill(); }
    this.tex.needsUpdate = true;
  }
  addCut(sideX) { if (this.cuts.length >= 4) return; const r = RNG(this.cuts.length * 7 + 3 + (sideX > 0 ? 1 : 0)); const spots = [[sideX * 36, 89], [sideX * 44, 48], [sideX * 22, 76], [sideX * 40, 62]]; const s = spots[this.cuts.length]; this.cuts.push({ x: s[0], y: s[1], l: r.range(3, 5.5), s: r.range(-0.6, 0.6), a: 0.85 }); this.dirty = true; }
  reset() { this.cuts = []; this.sw = [0, 0]; this.dirty = true; this.hold = 0; this.set('neutral'); }
}

/* ── shorts artwork + emblem ──────────────────────────────────────────── */
function makeDecal(look) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d'), col = look.shorts.c;
  c.translate(128, 128); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 9; c.lineJoin = 'miter';
  const kind = look.emblem || 'oct';
  if (kind === 'oct') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 92, Math.sin(a) * 92); } c.closePath(); c.stroke(); }
  else if (kind === 'bolt') { c.beginPath(); c.moveTo(20, -100); c.lineTo(-48, 14); c.lineTo(-4, 14); c.lineTo(-26, 100); c.lineTo(52, -24); c.lineTo(6, -24); c.closePath(); c.fill(); }
  else if (kind === 'peak') { c.beginPath(); c.moveTo(-100, 70); c.lineTo(-30, -70); c.lineTo(4, -10); c.lineTo(34, -52); c.lineTo(100, 70); c.closePath(); c.stroke(); }
  else if (kind === 'wing') { for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-90, -40 + i * 34); c.quadraticCurveTo(0, -80 + i * 34, 96, -64 + i * 30); c.lineWidth = 12 - i * 2; c.stroke(); } }
  else if (kind === 'gear') { c.beginPath(); c.arc(0, 0, 58, 0, TAU); c.stroke(); for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * PI / 4); c.fillRect(-11, -96, 22, 30); c.restore(); } }
  else { for (let i = 0; i < 3; i++) { c.save(); c.rotate(i * TAU / 3); c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(60, -96, 8, -100); c.quadraticCurveTo(26, -60, 0, -10); c.fill(); c.restore(); } }
  c.font = '800 54px "Barlow Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (kind === 'oct' || kind === 'gear') c.fillText(look.mono || '', 0, 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; return t;
}

class FighterModel {
  constructor(def) {
    this.def = def; const look = this.look = def.look, sculpt = Anatomy.build(look); this.sk = sculpt.sk; const sk = this.sk, s = sk.s;
    this.group = new THREE.Group(); this.group.name = def.id;
    // bones: identity rotations at bind, explicit inverses
    this.bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    const inv = BONES.map((n, i) => { const p = sk.bind[i], par = BONE_PARENT[i]; const b = this.bones[i];
      if (par < 0) { b.position.set(p[0], p[1], p[2]); this.group.add(b); } else { const q = sk.bind[par]; b.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); this.bones[par].add(b); }
      return new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]); });
    this.skeleton = new THREE.Skeleton(this.bones, inv);
    this.face = new FacePainter(look);
    this.marks = Array.from({ length: 6 }, () => new THREE.Vector4(0, -9, 0, 0)); this.markI = 0;
    this.dmg = new THREE.Vector4(0, 0, 0, 0);
    const L = Gfx.L, dark = look.dark || 0, shadeMul = look.shade ? new THREE.Vector3(...look.shade) : new THREE.Vector3(lerp(0.52, 0.44, dark), lerp(0.36, 0.34, dark), lerp(0.4, 0.44, dark));
    const sharedU = { uSkin: { value: new THREE.Color(look.skin) }, uSkinShade: { value: shadeMul }, uHairCol: { value: new THREE.Color(look.hairCol || '#1a1412') }, uSweat: { value: 0.12 }, uCrease: { value: 0.35 + 0.5 * sk.b.def }, uHatch: { value: 0.55 },
      uDirt: { value: 0 }, uFlash: { value: 0 }, uDmg: { value: this.dmg }, uZone: { value: new THREE.Vector4(sk.hipY + 0.02, sk.J.uarmL[0] + 0.03 * s, sk.ankY, s) }, uMarks: { value: this.marks }, uHideOn: { value: 1 } };
    this.u = sharedU; this.mats = []; this.meshes = {};
    const ink = new THREE.Color(look.ink || '#1d0f0c');
    const add = (name, define, uniforms, inkCol) => {
      const m = sculpt.meshes[name]; if (!m || !m.nv) return;
      const geo = geoFromSculpt(m), U = THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
      Object.assign(U, L, sharedU, { uColA: { value: new THREE.Color(0x222222) }, uColB: { value: new THREE.Color(0x888888) }, uColC: { value: new THREE.Color(0xffffff) }, uColD: { value: new THREE.Vector4(1, 0, 1, 0) }, uStubble: { value: 0 } }, uniforms);
      const mat = new THREE.ShaderMaterial({ vertexShader: GLSL.charVert, fragmentShader: GLSL.charFrag, uniforms: U, lights: true, defines: { [define]: 1, ...(uniforms.uFace ? { FACE: 1 } : {}), ...(uniforms.uPaint ? { PAINT: 1 } : {}) }, extensions: { derivatives: true } });
      const mesh = new THREE.SkinnedMesh(geo, mat); mesh.bind(this.skeleton, new THREE.Matrix4()); mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh);
      const omat = new THREE.ShaderMaterial({ vertexShader: GLSL.charVert, fragmentShader: GLSL.outlineFrag, side: THREE.BackSide, defines: { OUTLINE: 1, [define]: 1 },
        uniforms: { uInk: { value: inkCol || ink }, uLine: { value: 0.0042 * s * (name === 'head' || name === 'hair' || name === 'beard' ? 0.8 : 1) }, uProj: L.uProj, uRes: L.uRes, uHideOn: sharedU.uHideOn } });
      const ol = new THREE.SkinnedMesh(geo, omat); ol.bind(this.skeleton, new THREE.Matrix4()); ol.frustumCulled = false; this.group.add(ol);
      this.meshes[name] = mesh; this.mats.push(mat); mesh.userData.outline = ol; return mat;
    };
    const Hd = sk.J.head, hs = s * sk.b.head, g = look.gloves, sh = look.shorts;
    add('body', 'BODY', {});
    add('head', 'HEAD', { uFace: { value: this.face.tex }, uFaceRect: { value: new THREE.Vector4(Hd[0], Hd[1] + 0.025 * hs, 1 / (0.2 * hs), 1 / (0.2 * hs)) }, uColD: { value: new THREE.Vector4(look.hair && look.hair.scalp != null ? look.hair.scalp : 1, 0, 1, 0) }, uStubble: { value: (look.beard && look.beard.stubble) || 0 } });
    const gu = { uColA: { value: new THREE.Color(g.a) }, uColB: { value: new THREE.Color(g.b) }, uColC: { value: new THREE.Color(g.c) } };
    add('handL', 'HAND', gu); add('handR', 'HAND', gu);
    const fu = { uColB: { value: new THREE.Color(look.wrap || '#1c1c1e') }, uColD: { value: new THREE.Vector4(1, look.wrap ? 1 : 0, 1, 0) } };
    add('footL', 'FOOT', fu); add('footR', 'FOOT', fu);
    const thX = sk.J.thighL[0];
    add('shorts', 'SHORTS', { uColA: { value: new THREE.Color(sh.a) }, uColB: { value: new THREE.Color(sh.b) }, uColC: { value: new THREE.Color(sh.c) }, uPattern: { value: sh.pattern || 0 }, uThighX: { value: thX },
      uDecal: { value: makeDecal(look) }, uDecalRect: { value: new THREE.Vector4((def.stance === 'southpaw' ? -1 : 1) * (thX + 0.012 * s), sk.hipY - 0.165 * s, (def.stance === 'southpaw' ? -1 : 1) / (0.105 * s), 1 / (0.105 * s)) } }, new THREE.Color(sh.ink || '#0c0c10'));
    const hairInk = hexMul(look.hairCol || '#1a1412', 0.25, 0.25, 0.3);
    add('hair', 'HAIR', { uColD: { value: new THREE.Vector4(1, 0, look.hair && look.hair.gloss != null ? look.hair.gloss : 1, 0) } }, hairInk);
    add('beard', 'HAIR', { uColD: { value: new THREE.Vector4(1, 0, 0.3, 0) } }, hairInk);
    this.stats = { ms: sk.buildMs, verts: Object.values(sculpt.meshes).reduce((a, m) => a + m.nv, 0), tris: Object.values(sculpt.meshes).reduce((a, m) => a + m.nt, 0) };
    if (def.stance === 'southpaw') this.group.scale.x = -1;
  }
  /** stylised impact mark at a world-space point (converted into bind space through the nearest bone) */
  addMark(world, boneIdx, strength = 1) {
    const b = this.bones[boneIdx], bp = this.sk.bind[boneIdx]; b.updateWorldMatrix(true, false);
    const l = b.worldToLocal(_v1.copy(world)); const m = this.marks[this.markI = (this.markI + 1) % 6]; m.set(bp[0] + l.x, bp[1] + l.y, bp[2] + l.z, clamp01(strength));
  }
  setFlash(v) { this.u.uFlash.value = v; }
  resetCondition() { for (const m of this.marks) m.set(0, -9, 0, 0); this.dmg.set(0, 0, 0, 0); this.u.uSweat.value = 0.12; this.u.uDirt.value = 0; this.face.reset(); }
  setVisible(v) { this.group.visible = v; }
  dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.face.tex.dispose(); this.group.removeFromParent(); }
}
