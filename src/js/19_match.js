/* ═══════════════════════════ MATCH ═══════════════════════════
   Owns two fighters and the rules: rounds, clock, knockdowns, finishes, judges' scoring.
   Simulation is sub-stepped so it behaves the same at 30 or 144 fps; hit-stop and selective
   slow motion are just time-scale. Strikes for both fighters are checked before either is
   applied, so genuine trades happen. */
class Match {
  constructor(o) {
    this.o = o; this.rules = { rounds: 3, roundTime: 75, ...o.rules }; this.mode = o.mode || 'fight';
    this.f = [new Fighter(o.a, 0, o.models && o.models[0]), new Fighter(o.b, 1, o.models && o.models[1])]; this.f[0].opp = this.f[1]; this.f[1].opp = this.f[0];
    for (const f of this.f) { if (!f.model.group.parent) Gfx.scene.add(f.model.group); f.model.resetCondition(); f.rules = this.rules; }
    this.f[0].ctrl = o.p1ai != null ? new AICtrl(this.f[0], o.p1ai, this) : new PlayerCtrl(this.f[0], this); this.f[1].ctrl = new AICtrl(this.f[1], o.level ?? 1, this);
    this.state = 'idle'; this.round = 1; this.time = this.rules.roundTime; this.stop = 0; this.slow = 0; this.slowK = 1; this.simT = 0; this.over = false; this.result = null; this.scores = []; this.rstat = [this.snap(0), this.snap(1)]; this.lockInput = false; this.events = [];
    Arena.setCorners(o.a.accent, o.b.accent); this.resetPositions();
  }
  snap(i) { const s = this.f[i].stats; return { dmg: s.dmg, landed: s.landed, kd: s.kd }; }
  resetPositions() { this.f[0].place(-1.45, 0, PI / 2); this.f[1].place(1.45, 0, -PI / 2); for (const f of this.f) f.anim.aimW.look.copy(f.opp.pos).setY(1.6); }
  dispose() { for (const f of this.f) { f.model.group.visible = false; f.model.setDim(1); f.model.setFlash(0); } }
  start() { this.state = 'fight'; Bus.emit('roundStart', { M: this, round: this.round }); }
  hitstop(t) { this.stop = Math.max(this.stop, t); }
  slowmo(t, k = 0.3) { this.slow = Math.max(this.slow, t); this.slowTo = k; }
  update(dt) {
    this.stop = Math.max(0, this.stop - dt); if (this.slow > 0) this.slow -= dt;
    this.slowK = damp(this.slowK, this.slow > 0 ? this.slowTo : 1, this.slow > 0 ? 30 : 5, dt);
    const h = dt * this.slowK * (this.stop > 0 ? 0.03 : 1) * (this.rules.speed || 1), n = Math.max(1, Math.ceil(h / (1 / 80)));
    for (let i = 0; i < n; i++) this.tick(h / n);
    this.shadows();
    return h;
  }
  tick(h) {
    const [a, b] = this.f; this.simT += h;
    a.ctrl.think(h); b.ctrl.think(h); a.step(h, this); b.step(h, this); this.collide();
    for (const f of this.f) { const A = f.anim; A.root.copy(f.pos); A.yaw = f.yaw; A.vel.copy(f.vel); if (!f.down) f.opp.anim.pt('headC', A.aimW.look); A.update(h); f.post(); f.model.face.update(h); }
    const ra = a.checkStrike(), rb = b.checkStrike();
    // both results were decided before either lands; apply in random order so neither corner is favoured
    const first = rand() < 0.5 ? 0 : 1, rs = [ra, rb]; for (const i of [first, 1 - first]) { const f = this.f[i], r = rs[i]; if (r && !(f.down && r.type !== 'whiff')) f.applyStrike(r, this); }
    if (this.state === 'fight' && !this.over) {
      if (!this.rules.noClock && !a.down && !b.down) this.time -= h;
      if (this.time <= 0) { this.time = 0; this.endRound(); }
    }
    if (this.onTick) this.onTick(h);
  }
  collide() {
    const [a, b] = this.f; for (const f of this.f) if (!f.down) { const hit = ARENA.clampInside(f.pos, 0.42); if (hit) { const vn = f.vel.x * hit.nx + f.vel.z * hit.nz; if (vn > 0) { f.vel.x -= hit.nx * vn; f.vel.z -= hit.nz * vn; if (vn > 1.6 && f.state === 'hit') Bus.emit('cage', { f, hit, v: vn }); } f.atCage = 0.2; } else f.atCage = Math.max(0, (f.atCage || 0) - 0.016); }
    if (a.down || b.down) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1e-3, min = 0.27 * (a.sk.s * a.sk.b.mass + b.sk.s * b.sk.b.mass);
    if (d < min) { const push = (min - d), wa = a.atCage > 0 ? 0.1 : 0.5, wb = b.atCage > 0 ? 0.1 : 0.5, t = wa + wb; a.pos.x -= dx / d * push * wa / t; a.pos.z -= dz / d * push * wa / t; b.pos.x += dx / d * push * wb / t; b.pos.z += dz / d * push * wb / t; }
  }
  shadows() {
    this.f.forEach((f, i) => { const A = f.anim, s = f.sk.s;
      if (f.down && f.rag) { const P = f.rag.p; Arena.blob(i * 2, P[RAG.pelvis].x, P[RAG.pelvis].z, 0.42 * s, 0.6); Arena.blob(i * 2 + 1, P[RAG.chest].x, P[RAG.chest].z, 0.42 * s, 0.6); Arena.blob(4 + i * 2, P[RAG.head].x, P[RAG.head].z, 0.2 * s, 0.5); Arena.blob(5 + i * 2, (P[RAG.knL].x + P[RAG.knR].x) / 2, (P[RAG.knL].z + P[RAG.knR].z) / 2, 0.36 * s, 0.45); }
      else { A.pt('ballL', _v1); Arena.blob(i * 2, _v1.x, _v1.z - 0, 0.15 * s, 0.62 * clamp01(1 - (_v1.y - 0.02) * 5)); A.pt('ballR', _v2); Arena.blob(i * 2 + 1, _v2.x, _v2.z, 0.15 * s, 0.62 * clamp01(1 - (_v2.y - 0.02) * 5));
        A.pt('ankL', _v3); Arena.blob(4 + i * 2, _v3.x, _v3.z, 0.13 * s, 0.4 * clamp01(1 - (_v3.y - 0.08) * 5)); A.pt('hips', _v3); Arena.blob(5 + i * 2, _v3.x, _v3.z, 0.42 * s, 0.22); } });
  }
  endRound() {
    if (this.state !== 'fight') return; const [a, b] = this.f, s0 = this.rstat, n0 = this.snap(0), n1 = this.snap(1);
    const p = i => { const n = i ? n1 : n0, o = s0[i]; return (n.dmg - o.dmg) + (n.kd - o.kd) * 28 + (n.landed - o.landed) * 0.6; }, pa = p(0), pb = p(1), kdA = n0.kd - s0[0].kd, kdB = n1.kd - s0[1].kd;
    const sc = Math.abs(pa - pb) < 2 ? [10, 10] : pa > pb ? [10, kdA >= 2 ? 7 : kdA >= 1 || pa > pb * 2.4 + 12 ? 8 : 9] : [kdB >= 2 ? 7 : kdB >= 1 || pb > pa * 2.4 + 12 ? 8 : 9, 10];
    this.scores.push(sc); this.rstat = [n0, n1]; this.state = 'roundEnd'; for (const f of this.f) { f.buf = null; f.wish.set(0, 0, 0); f.in.guard = false; }
    const last = this.round >= this.rules.rounds; Bus.emit('roundEnd', { M: this, round: this.round, last, score: sc });
    if (last) { const ta = this.scores.reduce((s, r) => s + r[0], 0), tb = this.scores.reduce((s, r) => s + r[1], 0); this.finish(ta === tb ? -1 : ta > tb ? 0 : 1, 'Decision', { ta, tb }); }
  }
  restart() { for (const f of this.f) { f.reset(true); } this.round = 1; this.time = this.rules.roundTime; this.over = false; this.result = null; this.scores = []; this.rstat = [this.snap(0), this.snap(1)]; this.stop = 0; this.slow = 0; this.slowK = 1; this.state = 'idle'; this.resetPositions(); for (const f of this.f) if (f.ctrl.queue) { f.ctrl.queue.length = 0; f.ctrl.rest = 0; } }
  nextRound() { this.round++; this.time = this.rules.roundTime; for (const f of this.f) f.newRound(); this.resetPositions(); this.state = 'ready'; }
  finish(winner, how, extra = {}) { if (this.over) return; this.over = true; this.result = { winner, how, round: this.round, time: this.rules.roundTime - this.time, ...extra }; Bus.emit('matchEnd', { M: this, ...this.result }); }
  clock() { const t = Math.ceil(this.time); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
}

/* ── impact feel: what a landed strike does to time, camera, light, crowd ── */
const SWEAT = [0.86, 0.9, 0.95], DUST = [0.62, 0.58, 0.5];
Bus.on('strike', e => { if (e.m.heavy || e.m.sig) Vfx.trail(e.f, e.m.limb); else if (rand() < 0.5) Vfx.trail(e.f, e.m.limb); });
Bus.on('hit', e => {
  const M = Game.M; if (!M) return; const h = e.heavy, cinematic = Game.cine;
  if (e.clean) {
    M.hitstop(e.kd ? 0.17 : [0.045, 0.075, 0.115][h] * (e.counter ? 1.25 : 1)); Cam.kick(e.dir, [0.02, 0.045, 0.085][h] * (e.counter ? 1.3 : 1));
    Vfx.burst(e.pos, e.counter || e.combo ? 2 : 0, [0.5, 0.78, 1.1][h] * (e.kd ? 1.4 : 1)); Vfx.spray(e.pos, e.dir, 3 + h * 5 + Math.round(e.def.sweat * 6), SWEAT, 2.4 + h, 0.011);
    Gfx.fx.radial = Math.max(Gfx.fx.radial, [0, 0.01, 0.024][h] * (e.kd ? 1.8 : 1)); Gfx.fx.chroma = Math.max(Gfx.fx.chroma, [0, 0.0012, 0.003][h]); if (e.kd) Gfx.fx.flash = 0.16;
    Arena.cheer(e.kd ? 1 : [0.12, 0.3, 0.55][h] + (e.counter ? 0.15 : 0) + (e.combo ? 0.2 : 0), e.kd ? 3.5 : 0.8 + h * 0.5); if (h > 1 || e.kd) Arena.flashBurst(e.kd ? 1 : 0.4);
  } else if (e.perfect) { M.hitstop(0.09); Vfx.burst(e.pos, 1, 0.8); Cam.kick(e.dir, 0.02); Arena.cheer(0.3, 0.8); }
  else { M.hitstop(0.03 + h * 0.012); Vfx.burst(e.pos, 1, 0.42 + h * 0.14); Cam.kick(e.dir, 0.008 + h * 0.008); if (e.gbreak) { Arena.cheer(0.5, 1.2); Gfx.fx.chroma = 0.003; } }
});
Bus.on('evaded', e => { const M = Game.M; if (!M) return; if (e.f.idx === 0 || M.o.p1ai != null) M.slowmo(0.16, 0.45); Arena.cheer(0.22, 0.6); });
Bus.on('knockdown', e => { const M = Game.M; if (!M) return; M.slowmo(e.final ? 1.25 : 0.7, e.final ? 0.22 : 0.35); Arena.doWave(); e.f.rag && Vfx.spray(e.info.pos, e.info.dir, 14, SWEAT, 4, 0.013);
  if (e.final) { M.finish(e.att.idx, e.why, { ko: true }); } });
Bus.on('step', e => { if (e.h > 0.05 && e.f.vel.lengthSq() > 2) Vfx.spray(e.f.anim.feet[e.i].pos, UP, 2, DUST, 0.6, 0.02, 0.3); });
