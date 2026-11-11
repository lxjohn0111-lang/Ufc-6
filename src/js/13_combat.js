/* ═══════════════════════════ COMBAT ═══════════════════════════
   Frame data (seconds at neutral speed), per-fighter scaling, stamina with long-term fatigue,
   four-region condition, guard meter, evades with typed invulnerability, counter windows,
   chains with buffered input, and strike resolution measured on the posed skeletons. */
const MOVES = {}, DMG_K = 0.3;        // global damage scale: tunes fight length without touching the relative frame data
const mv = (id, o) => (MOVES[id] = { id, clip: id, track: 0.62, reach: 1, push: 1, heavy: 0, adv: 0, dz: 0, bs: 0.15, gd: 8, ...o });
//            name                limb  level        kind              startup active recover  dmg  stam  daze  hitstun
mv('jab',       { name: 'Jab',            limb: 'lh', lvl: 'head', kind: 'straight', su: 0.13, ac: 0.07, rc: 0.21, dmg: 4,  st: 4,  dz: 5,  hs: 0.25, bs: 0.12, gd: 5,  push: 0.5, adv: 0.1, lin: 1, high: 1, self: 1 });
mv('cross',     { name: 'Cross',          limb: 'rh', lvl: 'head', kind: 'straight', su: 0.20, ac: 0.07, rc: 0.30, dmg: 9,  st: 8,  dz: 12, hs: 0.31, bs: 0.17, gd: 10, push: 1.1, adv: 0.2, heavy: 1, lin: 1, high: 1 });
mv('hookL',     { name: 'Lead Hook',      limb: 'lh', lvl: 'head', kind: 'hook',     su: 0.22, ac: 0.07, rc: 0.30, dmg: 10, st: 9,  dz: 15, hs: 0.33, bs: 0.18, gd: 12, push: 0.8, adv: 0.12, reach: 0.84, heavy: 1, high: 1 });
mv('hookR',     { name: 'Rear Hook',      limb: 'rh', lvl: 'head', kind: 'hook',     su: 0.26, ac: 0.08, rc: 0.37, dmg: 13, st: 11, dz: 19, hs: 0.36, bs: 0.2,  gd: 15, push: 1.0, adv: 0.16, reach: 0.86, heavy: 2, high: 1 });
mv('upperL',    { name: 'Lead Uppercut',  limb: 'lh', lvl: 'head', kind: 'upper',    su: 0.21, ac: 0.07, rc: 0.32, dmg: 10, st: 9,  dz: 16, hs: 0.34, bs: 0.16, gd: 16, push: 0.5, adv: 0.1, reach: 0.78, heavy: 1, track: 1 });
mv('upperR',    { name: 'Rear Uppercut',  limb: 'rh', lvl: 'head', kind: 'upper',    su: 0.25, ac: 0.08, rc: 0.38, dmg: 14, st: 11, dz: 21, hs: 0.38, bs: 0.18, gd: 20, push: 0.6, adv: 0.14, reach: 0.8, heavy: 2, track: 1 });
mv('bodyJab',   { name: 'Body Jab',       limb: 'lh', lvl: 'body', kind: 'straight', su: 0.15, ac: 0.07, rc: 0.24, dmg: 4,  st: 5,  hs: 0.23, bs: 0.12, gd: 4,  push: 0.6, adv: 0.12, lin: 1 });
mv('bodyCross', { name: 'Body Cross',     limb: 'rh', lvl: 'body', kind: 'straight', su: 0.21, ac: 0.07, rc: 0.32, dmg: 8,  st: 8,  hs: 0.29, bs: 0.16, gd: 8,  push: 1.1, adv: 0.2, heavy: 1, lin: 1 });
mv('bodyHookL', { name: 'Liver Hook',     limb: 'lh', lvl: 'body', kind: 'hook',     su: 0.22, ac: 0.07, rc: 0.32, dmg: 10, st: 9,  hs: 0.34, bs: 0.18, gd: 9,  push: 0.7, adv: 0.12, reach: 0.86, heavy: 1 });
mv('bodyHookR', { name: 'Rear Body Hook', limb: 'rh', lvl: 'body', kind: 'hook',     su: 0.26, ac: 0.08, rc: 0.38, dmg: 11, st: 10, hs: 0.34, bs: 0.2,  gd: 10, push: 0.8, adv: 0.16, reach: 0.88, heavy: 1 });
mv('teepL',     { name: 'Teep',           limb: 'lf', lvl: 'body', kind: 'push',     su: 0.24, ac: 0.08, rc: 0.36, dmg: 6,  st: 8,  hs: 0.3,  bs: 0.2,  gd: 8,  push: 3.2, heavy: 1, lin: 1 });
mv('lowKickL',  { name: 'Calf Kick',      limb: 'lf', lvl: 'leg',  kind: 'round',    su: 0.20, ac: 0.07, rc: 0.30, dmg: 6,  st: 7,  hs: 0.2,  bs: 0.1,  push: 0.3, reach: 0.95, tgt: 'calf' });
mv('lowKickR',  { name: 'Thigh Kick',     limb: 'rf', lvl: 'leg',  kind: 'round',    su: 0.27, ac: 0.08, rc: 0.38, dmg: 10, st: 10, hs: 0.28, bs: 0.12, push: 0.6, heavy: 1, tgt: 'thigh' });
mv('bodyKickR', { name: 'Body Kick',      limb: 'rf', lvl: 'body', kind: 'round',    su: 0.30, ac: 0.08, rc: 0.42, dmg: 13, st: 13, hs: 0.36, bs: 0.22, gd: 14, push: 1.6, heavy: 2 });
mv('bodyKickL', { name: 'Switch Kick',    limb: 'lf', lvl: 'body', kind: 'round',    su: 0.27, ac: 0.08, rc: 0.4,  dmg: 11, st: 11, hs: 0.34, bs: 0.2,  gd: 12, push: 1.4, heavy: 1 });
mv('headKickR', { name: 'Head Kick',      limb: 'rf', lvl: 'head', kind: 'round',    su: 0.36, ac: 0.08, rc: 0.50, dmg: 20, st: 17, dz: 34, hs: 0.45, bs: 0.24, gd: 20, push: 1.2, heavy: 2, high: 1 });
mv('headKickL', { name: 'Lead High Kick', limb: 'lf', lvl: 'head', kind: 'round',    su: 0.30, ac: 0.08, rc: 0.44, dmg: 13, st: 13, dz: 22, hs: 0.36, bs: 0.2,  gd: 14, push: 0.9, heavy: 1, high: 1 });
// signature moves
mv('superman',  { name: 'Superman Punch', limb: 'rh', lvl: 'head', kind: 'straight', su: 0.34, ac: 0.08, rc: 0.44, dmg: 16, st: 15, dz: 25, hs: 0.4,  bs: 0.2,  gd: 16, push: 1.6, adv: 0.9, reach: 1.04, heavy: 2, lin: 1, high: 1, sig: 1 });
mv('overhand',  { name: 'Overhand',       limb: 'rh', lvl: 'head', kind: 'hook',     su: 0.30, ac: 0.08, rc: 0.46, dmg: 18, st: 14, dz: 28, hs: 0.42, bs: 0.22, gd: 22, push: 1.3, adv: 0.3, reach: 0.96, heavy: 2, high: 1, sig: 1 });
mv('spinFist',  { name: 'Spinning Backfist', limb: 'rh', lvl: 'head', kind: 'spin',  su: 0.30, ac: 0.08, rc: 0.42, dmg: 16, st: 14, dz: 26, hs: 0.4,  bs: 0.2,  gd: 16, push: 1.1, adv: 0.15, reach: 1.0, heavy: 2, high: 1, sig: 1 });
mv('spinKick',  { name: 'Spinning Back Kick', limb: 'rf', lvl: 'body', kind: 'spin', su: 0.33, ac: 0.08, rc: 0.46, dmg: 18, st: 16, hs: 0.42, bs: 0.24, gd: 18, push: 3.0, reach: 1.04, heavy: 2, lin: 1, sig: 1 });
mv('flyKnee',   { name: 'Flying Knee',    limb: 'rf', lvl: 'head', kind: 'knee',     su: 0.34, ac: 0.09, rc: 0.50, dmg: 17, st: 16, dz: 27, hs: 0.42, bs: 0.22, gd: 18, push: 1.4, adv: 0.85, reach: 0.72, heavy: 2, track: 1, sig: 1 });
mv('stepKnee',  { name: 'Step Knee',      limb: 'rf', lvl: 'body', kind: 'knee',     su: 0.26, ac: 0.08, rc: 0.40, dmg: 13, st: 11, hs: 0.36, bs: 0.2,  gd: 12, push: 1.2, adv: 0.4, reach: 0.66, heavy: 1, sig: 1 });
mv('qKick',     { name: 'Question Mark Kick', limb: 'lf', lvl: 'head', kind: 'round', su: 0.31, ac: 0.08, rc: 0.44, dmg: 15, st: 13, dz: 25, hs: 0.4, bs: 0.2,  gd: 14, push: 0.9, heavy: 2, high: 1, sig: 1, fake: 'leg' });
mv('sideKick',  { name: 'Side Kick',      limb: 'lf', lvl: 'body', kind: 'push',     su: 0.25, ac: 0.08, rc: 0.4, dmg: 11, st: 10, hs: 0.34, bs: 0.22, gd: 12, push: 3.4, reach: 1.06, heavy: 2, lin: 1, sig: 1 });
mv('pullCross', { name: 'Pull Counter',   limb: 'rh', lvl: 'head', kind: 'straight', su: 0.34, ac: 0.07, rc: 0.34, dmg: 13, st: 11, dz: 20, hs: 0.36, bs: 0.18, gd: 10, push: 1.2, adv: 0.12, heavy: 2, lin: 1, high: 1, sig: 1, dodge: [0.03, 0.2, 'sway'] });
mv('shovel',    { name: 'Shovel Hook',    limb: 'rh', lvl: 'body', kind: 'upper',    su: 0.25, ac: 0.08, rc: 0.38, dmg: 12, st: 11, hs: 0.38, bs: 0.2,  gd: 12, push: 0.8, adv: 0.16, reach: 0.84, heavy: 2, sig: 1, drain: 14 });

const EVADES = { sway: { clip: 'sway', dur: 0.46, iv: [0.04, 0.3], mv: [0, -0.34] }, slipL: { clip: 'slipL', dur: 0.44, iv: [0.04, 0.3], mv: [0.42, 0.05] }, slipR: { clip: 'slipR', dur: 0.44, iv: [0.04, 0.3], mv: [-0.42, 0.05] }, duck: { clip: 'duck', dur: 0.5, iv: [0.05, 0.34], mv: [0, 0.1] } };
/** does this evade type beat this move? */
const evadeBeats = (type, m) => type === 'sway' ? (m.lvl === 'head' && (m.limb === 'lh' || m.limb === 'rh') && !m.sig) || (m.lvl === 'head' && m.kind !== 'knee' && m.adv < 0.5) : type === 'duck' ? !!m.high : !!m.lin;   // slip beats linear strikes

const _a = V3(), _b = V3(), _c = V3(), _d = V3();
class Fighter {
  constructor(def, idx, model) {
    this.def = def; this.idx = idx; this.model = model || new FighterModel(def); this.model.group.visible = true; this.anim = new Animator(this.model, def.style); this.sk = this.model.sk; const s = this.sk.s, st = def.stats;
    // ratings → gameplay values
    this.k = { dmg: lerp(0.8, 1.2, st.power / 100), time: lerp(1.3, 0.8, st.speed / 100), move: lerp(0.84, 1.18, st.speed / 100), stCost: lerp(1.5, 0.7, st.stamina / 100), stRegen: lerp(0.7, 1.4, st.stamina / 100), fatigue: lerp(1.9, 0.4, st.stamina / 100),
      guardMax: 100 * lerp(0.75, 1.3, st.defense / 100), chip: lerp(1.35, 0.6, st.defense / 100), evadeWin: lerp(-0.03, 0.05, st.defense / 100) + lerp(-0.02, 0.04, st.speed / 100), perfect: lerp(0.1, 0.2, st.defense / 100),
      hpMax: 100 * lerp(0.9, 1.12, st.endurance / 100), dazeMax: lerp(30, 54, st.endurance / 100), recover: lerp(0.7, 1.3, st.endurance / 100), counter: def.counterK || 1 };
    this.k.time0 = this.k.time; this.armLen = this.sk.ua + this.sk.fa + 0.07 * s; this.legLen = this.sk.thigh + this.sk.shin + 0.1 * s;
    this.pos = V3(); this.vel = V3(); this.yaw = 0; this.wish = V3(); this.in = { guard: false, glv: 0 }; this.buf = null; this.opp = null; this.ctrl = null;
    this.anim.onStep = (i, h) => Bus.emit('step', { f: this, i, h });
    this.rag = null; this.reset();
  }
  reset(full = true) {
    if (full) { this.hp = this.k.hpMax; this.cond = { head: 100, body: 100, arms: 100, legs: 100 }; this.cap = { head: 100, body: 100, arms: 100, legs: 100 }; this.stCap = 100; this.dazeMaxK = 1; this.kdTotal = 0; this.model.resetCondition(); this.sweat = 0.12; this.dirt = 0;
      this.stats = { thrown: 0, landed: 0, sig: 0, head: 0, body: 0, legs: 0, dmg: 0, blocked: 0, evaded: 0, counters: 0, kd: 0, best: 0, combos: 0 }; }
    this.st = this.stCap; this.guard = this.k.guardMax; this.daze = 0; this.state = 'idle'; this.stateT = 0; this.move = null; this.chain = []; this.chainT = 0; this.comboDmg = 0; this.kdRound = 0; this.counterT = 0; this.rocked = 0; this.sinceSpend = 9; this.sinceHit = 9; this.guardT = 9;
    this.comboHits = 0; this.comboT = 0; this.guarding = false; this.gbreak = 0; this.exhaust = 0; this.invuln = 0; this.buf = null; this.macro = null; this.evade = null; this.hitstunK = 1; this.vel.set(0, 0, 0); this.regT = { head: 9, body: 9, arms: 9, legs: 9 }; this.lastMove = null; this.blockT = 0;
    this.anim.stop(0); this.anim.resetSprings(); this.anim.guardW = 0; this.anim.wobble = 0; this.anim.fatigue = 0; this.rag = null; this.ragBlend = 0;
  }
  place(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.vel.set(0, 0, 0); this.anim.root.copy(this.pos); this.anim.yaw = yaw; this.anim.placeFeet(); }
  get free() { return this.state === 'idle'; }
  get down() { return this.state === 'down' || this.state === 'getup' || this.state === 'ko'; }
  get stPct() { return this.st / 100; }
  fwd(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  /** where a strike at this level lands on me (world) */
  target(lvl, tgt, out) {
    const A = this.anim;
    if (lvl === 'head') return A.pt('headC', out);
    if (lvl === 'body') { A.pt('chest', out); A.pt('spine', _d); return out.lerp(_d, 0.5).addScaledVector(this.fwd(_d), 0.07 * this.sk.s); }
    A.pt(tgt === 'calf' ? 'ankL' : 'hipL', out); A.pt('knL', _d); return out.lerp(_d, tgt === 'calf' ? 0.45 : 0.55);
  }
  /** estimated root-to-root distance at which a move connects (AI + assist) */
  rangeOf(m) { const kick = m.limb[1] === 'f'; let r = kick ? this.legLen * m.reach + 0.22 : this.armLen * m.reach + (m.lvl === 'body' ? 0.3 : 0.26); if (kick && m.lvl === 'head') r *= 0.84; if (m.kind === 'knee') r = (m.lvl === 'head' ? 0.5 : 0.66) * this.sk.s; return r + m.adv * 0.75; }
  // ── input ──────────────────────────────────────────────────────────────
  pressAttack(slot, lvl, upgrade) {
    // a flick on a touch button arrives just after the tap: re-aim the strike that has only just begun
    if (upgrade) { if (this.buf && this.buf.type === 'atk' && this.buf.slot === slot) { this.buf.lvl = lvl; return; }
      if (this.state === 'attack' && this.atkSlot === slot && !this.hitDone && this.stateT < Math.min(0.14, this.ph[0] * 0.8)) { const id = this.def.moves[slot][lvl]; this.st = Math.min(this.stCap, this.st + this.move.st * this.k.stCost); this.chain.pop(); this.stats.thrown--; this.startAttack(id, this.chain.length > 0, null); return; } }
    this.buf = { type: 'atk', slot, lvl, t: 0.22 }; }
  pressSig(i) { this.buf = { type: 'sig', i, t: 0.22 }; }
  pressEvade(type) { this.buf = { type: 'evade', ev: type, t: 0.18 }; }
  pressMove(id) { this.buf = { type: 'move', id, t: 0.22 }; }
  resolveSlot(b) {
    if (b.type === 'move') return b.id;
    if (b.type === 'sig') { const sg = this.def.sig[b.i]; if (!sg) return null; if (sg.macro) { this.macro = { seq: sg.macro.slice(1), name: sg.name }; return sg.macro[0]; } return sg.id; }
    let id = this.def.moves[b.slot][b.lvl]; const last = this.chain[this.chain.length - 1];
    if (last === id && this.state === 'attack') { const alt = ALT0[id]; const sc = this.def.selfChain && this.def.selfChain[id]; if (alt && !(alt === id && !sc && !MOVES[id].self)) id = alt; }
    return id;
  }
  // ── per-frame logic ────────────────────────────────────────────────────
  step(dt, M) {
    const o = this.opp, A = this.anim, k = this.k; this.stateT += dt; this.sinceSpend += dt; this.sinceHit += dt; this.counterT -= dt; this.invuln -= dt; this.exhaust -= dt; this.chainT -= dt; this.guardT += dt; this.comboT -= dt; this.rules = M.rules;
    if (this.buf && (this.buf.t -= dt) < 0) this.buf = null;
    const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
    // recovery
    this.daze = Math.max(0, this.daze - (this.rocked > 0 ? 4 : 8) * dt * k.recover);
    if (this.rocked > 0) { this.rocked -= dt; }
    for (const r in this.cond) { this.regT[r] += dt; if (this.regT[r] > 3 && this.cond[r] < this.cap[r]) this.cond[r] = Math.min(this.cap[r], this.cond[r] + 1.6 * k.recover * dt); }
    const bodyK = 0.45 + 0.55 * this.cond.body / 100, legK = 0.6 + 0.4 * this.cond.legs / 100;
    if (this.state !== 'attack' && this.state !== 'evade' && this.sinceSpend > 0.55 && !M.rules.noRegen) {
      const sp2 = this.vel.lengthSq(), moving = sp2 > 0.3; if (sp2 > 1.2 && !this.rules.infSt) this.stCap = Math.max(34, this.stCap - 0.07 * k.fatigue * dt);      // footwork tires you too, slowly
      this.st = Math.min(this.stCap, this.st + 17 * k.stRegen * bodyK * (this.guarding ? 0.45 : 1) * (moving ? (sp2 > 1.2 ? 0.55 : 0.8) : 1) * (this.exhaust > 0 ? 0.45 : 1) * (this.down ? 1.5 : 1) * dt); }
    if (!this.guarding && this.blockT > 1 && this.gbreak <= 0) this.guard = Math.min(k.guardMax, this.guard + 20 * dt); this.blockT += dt; this.gbreak -= dt;
    if (M.rules.infSt) { this.st = this.stCap = 100; } if (M.rules.infHp) { this.hp = k.hpMax; this.daze = 0; for (const r in this.cond) this.cond[r] = this.cap[r] = 100; }
    const fat = clamp01(1 - this.st / 100), speedK = k.move * legK * (1 - 0.3 * fat * fat) * (this.rocked > 0 ? 0.5 : 1) * (this.exhaust > 0 ? 0.65 : 1);
    A.fatigue = damp(A.fatigue, clamp01((1 - this.st / 100) * 0.9 + (1 - this.stCap / 100) * 0.9), 3, dt); A.wobble = damp(A.wobble, this.rocked > 0 ? 1 : 0, 5, dt);
    let turn = 0, accel = 16; const tv = _a.set(0, 0, 0);
    switch (this.state) {
      case 'idle': {
        turn = 9; this.guarding = this.in.guard && this.gbreak <= 0; if (this.guarding && !this.wasGuard) this.guardT = 0; this.wasGuard = this.guarding;
        A.guardW = this.guarding ? 1 : 0; A.guardLvl = this.in.glv;
        const gs = this.guarding ? (this.in.glv ? 0.32 : 0.5) : 1; tv.copy(this.wish).multiplyScalar(speedK * gs);
        // slower backwards and sideways than forwards
        const f = this.fwd(_b), fd = tv.x * f.x + tv.z * f.z; tv.multiplyScalar(fd > 0 ? 2.0 : 1.65); if (fd > 0 && dist < 0.62) tv.addScaledVector(f, -fd * 2.0);
        if (this.chainT < 0 && this.chain.length) { this.chain.length = 0; this.comboDmg = 0; }
        const b = this.buf;
        if (b && this.gbreak <= 0) { if (b.type === 'evade') { this.buf = null; this.startEvade(b.ev); } else { const id = this.resolveSlot(b); this.buf = null; this.atkSlot = b.slot; this.atkLvl = b.lvl; if (id && MOVES[id]) this.startAttack(id, false, M); } }
        break; }
      case 'attack': {
        const m = this.move, ph = this.ph, t = this.stateT; turn = t < ph[0] * m.track ? 3.2 : 0.4; A.guardW = 0; this.guarding = false;
        if (t < ph[0] && m.adv) { const gap = clamp01((dist - (this.rangeOf(m) - m.adv * 0.8) * 0.82) / 0.25); tv.copy(this.fwd(_b)).multiplyScalar(m.adv / ph[0] * gap); accel = 60; }
        // aim follows the target until the strike commits; a correctly-read evade leaves it behind
        const ev = o.evade && o.state === 'evade' && evadeBeats(o.evade.type, m) || (o.state === 'attack' && o.move.dodge && o.stateT < o.ph[0] * 0.8 && evadeBeats(o.move.dodge[2], m));
        if (!this.aimLock && !ev) { this.aimAt(m, o); if (t > ph[0] * m.track && !this.willHit) this.aimLock = true; } else if (ev) this.aimLock = true;
        // chaining: a connected strike can cancel its recovery into a different limb
        const b = this.buf || (this.macro && this.hitDone && { type: 'move', id: this.macro.seq[0], macro: 1 });
        if (b && b.type !== 'evade' && this.hitDone) {
          const can = this.connected ? t >= ph[0] + ph[1] * 0.4 : t >= ph[0] + ph[1] + ph[2] * 0.62;
          if (can) { const id = b.macro ? b.id : this.resolveSlot(b), n = MOVES[id]; const sc = this.def.selfChain && this.def.selfChain[m.id] || 0, same = n && n.limb === m.limb, rep = this.chain.filter(c => c === m.id).length;
            if (n && this.chain.length < (this.def.maxChain || 5) && (!same || (n.id === m.id && (m.self || sc) && rep < Math.max(2, sc + 1)) || !this.connected || b.macro)) { if (b.macro) this.macro.seq.shift(); else { this.buf = null; this.macro = null; this.atkSlot = b.slot; this.atkLvl = b.lvl; } if (this.macro && !this.macro.seq.length) this.macro = null; this.startAttack(id, this.connected, M); break; } } }
        if (b && b.type === 'evade' && this.hitDone && t >= ph[0] + ph[1] + ph[2] * 0.5) { this.buf = null; this.startEvade(b.ev); break; }
        if (t >= ph[0] + ph[1] + ph[2]) { this.setState('idle'); this.chainT = 0.28; this.macro = null; }
        break; }
      case 'evade': {
        const e = this.evade, t = this.stateT; A.guardW = 0; this.guarding = false; const u = clamp01(t / (e.dur * 0.55));
        if (t < e.dur * 0.55) { const sp = (1 - u) * 2.2 / (e.dur * 0.55); A.dir(e.mv[0], 0, e.mv[1], tv).multiplyScalar(sp * (0.8 + 0.2 * speedK)); accel = 80; }
        if (this.buf && this.buf.type !== 'evade' && t > (e.success ? e.iv[1] - 0.06 : e.dur * 0.8)) { const id = this.resolveSlot(this.buf); this.buf = null; if (id) { this.startAttack(id, false, M); break; } }
        if (t >= e.dur) { this.evade = null; this.setState('idle'); }
        break; }
      case 'hit': case 'block': {
        accel = 9; if (this.state === 'block') { A.guardW = 1; this.guarding = true; A.guardLvl = this.in.glv; }
        if (this.stateT >= this.stunT) { this.setState('idle'); if (this.state === 'idle') this.hitstunK = 1; }
        break; }
      case 'stagger': { accel = 8; turn = 3; tv.copy(this.wish).multiplyScalar(speedK * 0.45); A.guardW = 0; this.guarding = false; if (this.stateT >= this.stunT) this.setState('idle'); break; }
      case 'down': this.vel.set(0, 0, 0); if (this.rag) { this.rag.update(dt); this.rag.settleT += dt; this.pos.x = this.rag.p[RAG.pelvis].x; this.pos.z = this.rag.p[RAG.pelvis].z; }
        if (this.stateT > this.downT && !this.final && !M.over) this.startGetup(); break;
      case 'getup': this.vel.set(0, 0, 0); this.ragBlend = clamp01(this.stateT / 0.55); if (this.stateT >= this.stunT) { this.rag = null; this.setState('idle'); this.invuln = 0.6; Bus.emit('getup', { f: this }); } break;
      case 'ko': this.vel.set(0, 0, 0); if (this.rag) { this.rag.update(dt); this.pos.x = this.rag.p[RAG.pelvis].x; this.pos.z = this.rag.p[RAG.pelvis].z; } break;
      case 'cine': tv.copy(this.wish); turn = this.cineTurn || 0; break;
    }
    if (turn && !this.down) this.yaw = dampAng(this.yaw, want, turn, dt);
    if (this.state !== 'down' && this.state !== 'ko' && this.state !== 'getup') { this.vel.x = damp(this.vel.x, tv.x, accel, dt); this.vel.z = damp(this.vel.z, tv.z, accel, dt); this.pos.addScaledVector(this.vel, dt); }
    // face: idle expressions follow condition
    const F = this.model.face; if (this.state === 'ko' || (this.state === 'down' && this.final)) F.idle('out'); else if (this.down) F.idle('dazed'); else if (this.rocked > 0) F.idle('dazed'); else if (this.guarding) F.idle('guard'); else if (this.st < 28) F.idle('tired'); else F.idle(this.state === 'cine' ? (this.cineFace || 'neutral') : 'focus');
    F.gaze[0] = 0; this.model.u.uSweat.value = damp(this.model.u.uSweat.value, this.sweat, 1, dt); this.model.u.uDirt.value = this.dirt;
    this.model.dmg.set(1 - this.cond.head / 100, 1 - this.cond.body / 100, 1 - this.cond.arms / 100, 1 - this.cond.legs / 100);
    if (this.flash > 0) { this.flash -= dt * 8; this.model.setFlash(Math.max(0, this.flash) * 0.11); }
  }
  setState(s) { this.state = s; this.stateT = 0; if (s === 'idle') { this.move = null; this.evade = null; } }
  spend(cost) { if (this.rules && this.rules.infSt) return; this.st = Math.max(0, this.st - cost); this.stCap = Math.max(34, this.stCap - cost * 0.052 * this.k.fatigue); this.sinceSpend = 0; this.sweat = Math.min(1, this.sweat + cost * 0.0016); if (this.st <= 0.5 && this.exhaust <= 0) { this.exhaust = 2.2; Bus.emit('exhaust', { f: this }); } }
  startAttack(id, chained, M) {
    const m = MOVES[id], k = this.k, n = chained ? this.chain.length : 0; if (!chained) { this.chain.length = 0; this.comboDmg = 0; }
    const cost = m.st * k.stCost * (1 + 0.13 * n); this.gassed = this.st < cost * 0.6 || this.exhaust > 0; this.spend(cost);
    const kick = m.limb[1] === 'f', limbK = kick ? 1 + 0.22 * (1 - this.cond.legs / 100) : 1 + 0.2 * (1 - this.cond.arms / 100), fat = 1 + 0.3 * Math.pow(1 - this.st / 100, 2) + (this.gassed ? 0.22 : 0) + (this.rocked > 0 ? 0.15 : 0);
    const T = k.time * fat; this.ph = [m.su * T * (chained ? 0.9 : 1) * (this.counterT > 0 ? 0.82 : 1), m.ac, m.rc * T * limbK];
    this.move = m; this.hitDone = false; this.connected = false; this.aimLock = false; this.willHit = false; this.chain.push(id); this.chainScale = Math.max(0.6, 1 - 0.1 * n); this.setState('attack'); this.state = 'attack'; this.move = m;
    this.wasCounter = this.counterT > 0; this.anim.play(m.clip, { phases: this.ph, blendIn: Math.min(0.07, this.ph[0] * 0.4) });
    this.aimAt(m, this.opp); this.model.face.set(m.heavy ? 'strike' : 'exhale', this.ph[0] + 0.2); this.stats.thrown++; this.lastMove = id;
    Bus.emit('strike', { f: this, m, chained });
  }
  aimAt(m, o) {
    const A = this.anim, tp = A.aimW[m.limb];
    // if the defender is covering this level, the strike lands on the guard instead
    const blocking = o.guarding && (o.state === 'idle' || o.state === 'block') && o.covers(m);
    if (blocking && m.lvl === 'head') { o.anim.pt('fistL', tp); o.anim.pt('fistR', _d); tp.lerp(_d, m.limb[0] === 'l' ? 0.65 : 0.35); }
    else if (blocking && m.lvl === 'body') { o.anim.pt('elL', tp); o.anim.pt('fistL', _d); tp.lerp(_d, 0.4); }
    else o.target(m.fake && this.stateT < this.ph[0] * 0.55 ? m.fake : m.lvl, m.tgt || 'thigh', tp);
  }
  /** guard level vs strike level: 2 = full block, 1 = partial, 0 = open */
  covers(m) { const g = this.in.glv; if (m.lvl === 'leg') return g < 0 ? 2 : 0; if (m.lvl === 'head') return g > 0 ? 2 : g === 0 ? 1 : 0; return g < 0 ? 2 : g === 0 ? 1 : 0; }
  startEvade(type) {
    const e = EVADES[type]; if (!e) return; const ok = this.st >= 6 && this.exhaust <= 0; this.spend(7 * this.k.stCost);
    this.evade = { type: type.startsWith('slip') ? 'slip' : type, dur: e.dur, iv: ok ? [e.iv[0], e.iv[1] + this.k.evadeWin] : [9, 9], mv: e.mv, success: false };
    this.setState('evade'); this.evade = this.evade || null; this.state = 'evade'; this.anim.play(e.clip, { dur: e.dur, blendIn: 0.05 }); Bus.emit('evadeStart', { f: this, type });
  }
  /** called once both skeletons are posed: does my active strike connect this frame? */
  checkStrike() {
    if (this.state !== 'attack' || this.hitDone) return null; const m = this.move, t = this.stateT, ph = this.ph, o = this.opp;
    // predict a little ahead so the aim knows whether to lock on
    if (t < ph[0]) { this.willHit = this.reaches(m, o, 0.05); return null; }
    if (o.down || o.state === 'cine' || o.invuln > 0) { if (t > ph[0] + ph[1]) return { type: 'whiff' }; return null; }
    if (this.reaches(m, o, 0)) {
      const dodged = (o.state === 'evade' && o.stateT >= o.evade.iv[0] && o.stateT <= o.evade.iv[1] && evadeBeats(o.evade.type, m)) || (o.state === 'attack' && o.move.dodge && o.stateT >= o.move.dodge[0] && o.stateT <= o.move.dodge[1] && evadeBeats(o.move.dodge[2], m));
      if (dodged) return { type: 'evaded' };
      const cov = o.guarding && (o.state === 'idle' || o.state === 'block') ? o.covers(m) : 0;
      if (cov) return { type: m.lvl === 'leg' ? 'check' : 'blocked', cov, perfect: o.guardT < o.k.perfect && o.state === 'idle' };
      return { type: 'hit' };
    }
    if (t > ph[0] + ph[1]) return { type: 'whiff' };
    return null;
  }
  reaches(m, o, slack) {
    const kick = m.limb[1] === 'f', A = this.anim, org = A.pt(kick ? (m.limb[0] === 'l' ? 'hipL' : 'hipR') : (m.limb[0] === 'l' ? 'shL' : 'shR'), _a), tp = o.target(m.lvl, m.tgt || 'thigh', _b);
    const L = (kick ? this.legLen : this.armLen) * m.reach + (m.lvl === 'head' ? 0.13 : m.lvl === 'body' ? 0.17 : 0.11) * o.sk.s + 0.04 + slack;
    return org.distanceToSquared(tp) <= L * L;
  }
  /** apply the result of my strike (called by the match after both checks, so trades are possible) */
  applyStrike(r, M) {
    const m = this.move, o = this.opp, k = this.k; this.hitDone = true; const A = this.anim, kick = m.limb[1] === 'f';
    const cp = A.pt(kick ? (m.limb[0] === 'l' ? 'ballL' : 'ballR') : (m.limb[0] === 'l' ? 'fistL' : 'fistR'), V3());
    // travel direction of the strike in world space
    const f = this.fwd(_a), lat = A.dir(m.limb[0] === 'l' ? -1 : 1, 0, 0, _b), dir = V3();
    if (m.kind === 'hook' || m.kind === 'round') dir.copy(lat).multiplyScalar(0.9).addScaledVector(f, 0.4); else if (m.kind === 'spin') dir.copy(lat).multiplyScalar(-0.8).addScaledVector(f, 0.6); else if (m.kind === 'upper') dir.copy(f).multiplyScalar(0.35).setY(0.9); else if (m.kind === 'knee') dir.copy(f).multiplyScalar(0.7).setY(0.6); else dir.copy(f);
    dir.normalize();
    if (r.type === 'whiff' && o.state === 'evade' && o.evade && o.stateT < o.evade.dur * 0.8) r = { type: 'evaded' };      // made to miss by movement alone
    if (r.type === 'whiff') { this.ph[2] *= 1.28; A.setPhases(this.ph); this.spend(m.st * 0.3 * k.stCost); this.macro = null; Bus.emit('whiff', { f: this, m, pos: cp }); return; }
    if (r.type === 'evaded') { this.ph[2] *= 1.2; A.setPhases(this.ph); this.macro = null; o.stats.evaded++; if (o.evade) o.evade.success = true; o.counterT = 0.85; Bus.emit('evaded', { f: o, att: this, m, pos: cp }); return; }
    this.connected = true; this.chainT = 0.5;
    const stK = this.gassed ? 0.5 : 0.62 + 0.38 * this.st / 100, legK = kick ? 0.75 + 0.25 * this.cond.legs / 100 : 1;
    let mult = k.dmg * stK * legK * this.chainScale * (this.rules.dmgK ? this.rules.dmgK[this.idx] : 1), dmg = m.dmg * DMG_K * mult;
    const info = { att: this, def: o, m, pos: cp, dir, heavy: m.heavy, type: r.type };
    if (r.type === 'blocked' || r.type === 'check') {
      if (r.perfect) { this.ph[2] += 0.16; A.setPhases(this.ph); o.counterT = 0.7; o.stats.blocked++; o.blockReact(m, dir, 0.3); info.perfect = true; info.dmg = 0; this.macro = null; Bus.emit('hit', info); return; }
      const full = r.cov === 2, armK = 1 + 0.6 * (1 - o.cond.arms / 100);
      if (r.type === 'check') { const self = dmg * 0.45; this.hurt('legs', self, 0.5); o.hurt('legs', dmg * 0.15, 0.2); info.dmg = dmg * 0.15; info.check = true; }
      else { const chip = dmg * (full ? 0.06 : 0.2) * o.k.chip * armK; o.hurt(m.lvl === 'head' ? 'head' : 'body', chip, 0.5); o.hurt('arms', dmg * 0.22, 0.25); info.dmg = chip;
        o.guard -= m.gd * (full ? 1 : 1.5) * (m.kind === 'upper' && m.lvl === 'head' ? 1.6 : 1) * (k.dmg * 0.5 + 0.5); if (m.lvl === 'head' && !full) o.daze += m.dz * 0.25; }
      this.ph[2] *= 1.12; A.setPhases(this.ph); o.stats.blocked++; o.blockT = 0; o.blockReact(m, dir, 1 + m.heavy * 0.5);
      if (o.guard <= 0) { o.guard = 0; o.gbreak = 1.6; o.stunT = 0.95; o.setState('stagger'); o.anim.guardW = 0; o.guarding = false; o.guard = o.k.guardMax * 0.55; info.gbreak = true; o.model.face.set('hurt', 1); }
      else if (o.state === 'idle' || o.state === 'block') { o.stunT = m.bs; o.setState('block'); }
      o.vel.addScaledVector(dir, m.push * 0.45).setY(0); if (o.hp <= 0) o.hp = 1;
      Bus.emit('hit', info); return;
    }
    // ── clean hit ──
    const counterHit = o.state === 'attack' && !o.hitDone, counter = this.wasCounter; let bonus = 1;
    if (counterHit) bonus *= 1.25; if (counter) { bonus *= 1.35 * k.counter; this.stats.counters++; this.counterT = 0; }
    if (o.rocked > 0) bonus *= 1.12; if (o.state === 'evade' && o.evade && o.evade.type === 'duck' && (m.kind === 'upper' || m.kind === 'knee' || (kick && m.lvl === 'body'))) bonus *= 1.3;
    if (o.guarding && !o.covers(m)) bonus *= 1.1;
    // named combination finisher
    let combo = null; for (const c of this.def.combos) { const n = c.seq.length; if (this.chain.length >= n && c.seq.every((id, i) => this.chain[this.chain.length - n + i] === id)) if (!combo || n > combo.seq.length) combo = c; }
    if (combo && this.comboHits >= combo.seq.length - 1) { bonus *= 1.15; info.combo = combo.name; this.stats.combos++; }
    dmg *= bonus; mult *= bonus; info.dmg = dmg; info.mult = mult; info.counter = counter || counterHit; info.clean = true;
    this.comboHits = (this.comboT > 0 ? this.comboHits : 0) + 1; this.comboT = 1; this.comboDmg += dmg; info.hits = this.comboHits;
    this.stats.landed++; this.stats.dmg += dmg; this.stats[m.lvl === 'leg' ? 'legs' : m.lvl]++; if (m.heavy) this.stats.sig++; this.stats.best = Math.max(this.stats.best, this.comboHits);
    const region = m.lvl === 'head' ? 'head' : m.lvl === 'body' ? 'body' : 'legs';
    o.takeHit(info, region, dmg, M);
    Bus.emit('hit', info);
  }
  hurt(region, amount, capK = 0.45) { this.cond[region] = Math.max(0, this.cond[region] - amount * (region === 'legs' ? 1.5 : region === 'arms' ? 1 : 1.15)); this.cap[region] = Math.max(15, this.cap[region] - amount * capK); this.regT[region] = 0;
    this.hp -= amount * (region === 'head' ? 1 : region === 'body' ? 0.85 : region === 'legs' ? 0.55 : 0.2); }
  blockReact(m, dir, k) { const A = this.anim, l = this.localDir(dir, _c); A.impulse({ spine: [l.x * 1.2 * k, -l.z * 1.6 * k, 0], hips: [l.x * 0.25 * k, 0, l.z * 0.5 * k], head: [0, -l.z * 1.5 * k, 0] }); A.shake = 0.004 * k; this.flash = 0.25 * k; }
  localDir(d, out) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return out.set((d.x * c - d.z * s) * this.anim.side, d.y, d.x * s + d.z * c); }
  takeHit(info, region, dmg, M) {
    const m = info.m, att = info.att, A = this.anim, k = this.k; this.sinceHit = 0; this.guarding = false; A.guardW = 0; this.macro = null; this.buf = null;
    const hp0 = this.hp; this.hurt(region, dmg); if (region === 'body') { this.stCap = Math.max(34, this.stCap - dmg * 0.7 * (att.def.bodyDrain || 1)); this.st = Math.max(0, this.st - (dmg * 1.6 * (att.def.bodyDrain || 1) + (m.drain || 0))); }
    this.sweat = Math.min(1, this.sweat + 0.008); this.flash = 0.6 + m.heavy * 0.2;
    // direction-sensitive procedural reaction: the head / torso are driven by where the strike came from
    const l = this.localDir(info.dir, _c), w = (0.55 + m.heavy * 0.55) * clamp(info.mult, 0.7, 1.6);
    if (region === 'head') A.impulse({ head: [l.x * 13 * w, -l.z * 11 * w - l.y * 14 * w, -l.x * 8 * w], spine: [l.x * 3.2 * w, -l.z * 3.4 * w - l.y * 2 * w, l.x * 1.4 * w], hips: [l.x * 0.5 * w, 0, l.z * 0.8 * w] });
    else if (region === 'body') A.impulse({ spine: [l.x * 3.5 * w, 5.5 * w * (l.z > 0.3 ? 1 : 0.5), -l.x * 3.2 * w], head: [0, 4 * w, 0], hips: [l.x * 0.9 * w, -0.5 * w, l.z * 1.3 * w] });
    else A.impulse({ hips: [l.x * 1.3 * w, -1.1 * w, l.z * 0.5 * w], spine: [0, 1.6 * w, -l.x * 2.2 * w], head: [0, 2 * w, 0] });
    A.shake = 0.006 + 0.004 * m.heavy;
    this.model.addMark(info.pos, region === 'head' ? BN.head : region === 'body' ? BN.chest : BN.thighL, 0.35 + 0.3 * m.heavy);
    if (region === 'head') { if (this.cond.head < 62 && m.heavy && rand() < 0.4) this.model.face.addCut(l.x > 0 ? -1 : 1); const sw = this.model.face.sw, sd = l.x > 0 ? 1 : 0; sw[sd] = Math.min(clamp01((100 - this.cap.head) / 55), sw[sd] + dmg * 0.02 * (m.heavy ? 1.3 : 0.6)); this.model.face.dirty = true; this.daze += m.dz * info.mult * (0.75 + 0.5 * (1 - this.cond.head / 100)); }
    this.model.face.set(m.heavy > 1 ? 'pain' : 'hurt', 0.35 + m.heavy * 0.15);
    this.vel.addScaledVector(info.dir, m.push * (0.7 + 0.3 * m.heavy)).setY(0);
    // ── outcomes ──
    const dazeMax = k.dazeMax * this.dazeMaxK * (0.55 + 0.45 * this.cond.head / 100);
    let kd = false, final = false, why = '';
    if (M.rules.noKO) { this.hp = Math.max(this.hp, 6); this.daze = Math.min(this.daze, dazeMax * 0.6); }
    else if (this.hp <= 0) { kd = true; final = true; why = region === 'head' ? 'KO' : 'TKO'; }
    else if (region === 'head' && this.daze >= dazeMax) { kd = true; why = 'KD'; const pKO = clamp((0.45 - this.hp / k.hpMax) * 1.6, 0, 0.9) + (m.heavy > 1 ? 0.1 : 0) + (info.counter ? 0.12 : 0) + (this.cond.head < 14 ? 0.5 : 0); if (rand() < pKO) { final = true; why = 'KO'; } }
    else if (region === 'body' && this.cond.body <= 0) { kd = true; why = 'KD'; this.cond.body = this.cap.body = Math.max(this.cap.body, 30); }
    else if (region === 'legs' && this.cond.legs <= 0) { kd = true; why = 'KD'; this.cond.legs = this.cap.legs = Math.max(this.cap.legs, 28); }
    if (kd && !final && this.kdRound >= 2) { final = true; why = 'TKO'; }
    if (kd && !final && this.hp < 5) { final = true; why = region === 'head' ? 'KO' : 'TKO'; }
    if (kd) { info.kd = true; info.final = final; info.why = why; this.knockdown(info, final, region, M); return; }
    const rock = region === 'head' && this.daze >= dazeMax * 0.68; if (rock && this.rocked <= 0) { this.rocked = 2.6; info.rocked = true; }
    const interrupt = this.state !== 'attack' || !this.hitDone || m.heavy > 0 || true;
    if (interrupt) { if (this.state === 'attack' || this.state === 'evade') { A.stop(0.1); } this.stunT = m.hs * this.hitstunK * (info.counter ? 1.2 : 1) * (rock ? 1.5 : 1); this.hitstunK = Math.max(0.62, this.hitstunK * 0.87); this.setState('hit'); this.evade = null; }
  }
  knockdown(info, final, region, M) {
    this.final = final; this.kdRound++; this.kdTotal++; info.att.stats.kd++; this.daze = 0; this.rocked = 0; this.dazeMaxK *= 0.86; if (!final) this.hp = Math.max(5, this.hp - 4);
    this.anim.stop(0); this.setState(final ? 'ko' : 'down'); this.downT = 1.9 + rand() * 0.5 + (1 - this.hp / this.k.hpMax) * 0.9; this.dirt = Math.min(0.6, this.dirt + 0.2);
    this.rag = new Ragdoll(this); this.rag.activate(info, region, final); this.ragBlend = 0;
    Bus.emit('knockdown', { f: this, att: info.att, final, why: info.why, info });
  }
  startGetup() {
    const R = this.rag; if (!R) { this.setState('idle'); return; }
    const up = R.faceUp(), hd = R.headDir(_a); this.yaw = up ? Math.atan2(-hd.x, -hd.z) : Math.atan2(hd.x, hd.z);
    R.capture(); this.anim.root.copy(this.pos); this.anim.yaw = this.yaw; this.anim.placeFeet(); this.anim.resetSprings();
    this.setState('getup'); this.stunT = 1.55; this.anim.play(up ? 'getupBack' : 'getupFront', { dur: 1.55, blendIn: 0.01 }); this.anim.layer.s = 1; this.ragBlend = 0; this.model.face.set('hurt', 1.2);
  }
  /** after the animator: ragdoll overrides or blends out of the skeleton */
  post() { if (this.rag && (this.state === 'down' || this.state === 'ko')) this.rag.applyToBones(); else if (this.rag && this.state === 'getup') this.rag.blendToRig(this.ragBlend); }
  newRound() { const k = this.k.recover; this.hp = Math.min(this.k.hpMax, this.hp + 10 * k); this.stCap = Math.min(100, this.stCap + 22 * k); this.st = this.stCap; for (const r in this.cond) { this.cap[r] = Math.min(100, this.cap[r] + 12 * k); this.cond[r] = Math.min(this.cap[r], this.cond[r] + 22 * k); }
    this.kdRound = 0; this.daze = 0; this.rocked = 0; this.guard = this.k.guardMax; this.state = 'idle'; this.stateT = 0; this.move = null; this.evade = null; this.buf = null; this.macro = null; this.chain.length = 0; this.rag = null; this.sweat = Math.max(0.2, this.sweat * 0.8); this.anim.stop(0); this.anim.resetSprings(); this.vel.set(0, 0, 0); this.exhaust = 0; this.gbreak = 0; }
}
