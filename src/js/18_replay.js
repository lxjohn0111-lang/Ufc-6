/* ═══════════════════════════ REPLAY ═══════════════════════════
   A real recording, not a canned animation: every simulated frame stores both skeletons
   (root, hips, all bone rotations, expression) in a ring buffer with the impact events. Playback
   interpolates those frames from new camera angles, in slow motion around the decisive strike. */
const Replay = {
  HZ: 60, N: 60 * 14, STR: 4 + 3 + BONES.length * 4 + 1, buf: null, head: 0, count: 0, acc: 0, times: null, events: [], active: false, t: 0, t0: 0, t1: 0, key: 0, angle: 0, onDone: null, faces: Object.keys(EXPR),
  init() { this.buf = new Float32Array(this.N * 2 * this.STR); this.times = new Float64Array(this.N); },
  clear() { this.head = 0; this.count = 0; this.events.length = 0; this.acc = 0; },
  record(M, h) {
    this.acc += h; if (this.acc < 1 / this.HZ) return; this.acc = 0; const i = this.head, S = this.STR; this.times[i] = M.simT;
    for (let f = 0; f < 2; f++) { const F = M.f[f], g = F.model.group, b = F.model.bones; let o = (i * 2 + f) * S; const B = this.buf;
      B[o++] = g.position.x; B[o++] = g.position.y; B[o++] = g.position.z; B[o++] = g.rotation.y; B[o++] = b[0].position.x; B[o++] = b[0].position.y; B[o++] = b[0].position.z;
      for (let k = 0; k < b.length; k++) { const q = b[k].quaternion; B[o++] = q.x; B[o++] = q.y; B[o++] = q.z; B[o++] = q.w; }
      B[o++] = this.faces.indexOf(F.model.face.name) + (F.flash > 0 ? 100 : 0); }
    this.head = (i + 1) % this.N; this.count = Math.min(this.N, this.count + 1);
  },
  mark(type, e) { const M = Game.M; if (!M || this.active) return; this.events.push({ t: M.simT, type, pos: e.pos && e.pos.clone(), dir: e.dir && e.dir.clone(), heavy: e.heavy || 0, lvl: e.m && e.m.lvl, clean: e.clean, kind: e.clean ? (e.counter ? 2 : 0) : 1, kd: e.kd, final: e.final, who: e.def ? e.def.idx : e.f ? e.f.idx : 0 }); if (this.events.length > 400) this.events.shift(); },
  span() { if (!this.count) return [0, 0]; const last = (this.head - 1 + this.N) % this.N, first = (this.head - this.count + this.N) % this.N; return [this.times[first], this.times[last]]; },
  /** play [key - before, key + after] of simulation time; `key` is the decisive moment */
  play(key, before, after, onDone) {
    const [a, b] = this.span(); this.key = key; this.t0 = Math.max(a, key - before); this.t1 = Math.min(b, key + after); this.t = this.t0; this.active = true; this.onDone = onDone; this.pass = 0; this.evI = this.events.findIndex(e => e.t >= this.t0); if (this.evI < 0) this.evI = this.events.length;
    this.victim = (this.events.find(e => e.t >= key - 0.05 && e.kd) || { who: 1 }).who; this.setAngle(0); this.live = Game.M.f.map(F => ({ face: F.model.face.name }));
  },
  setAngle(n) { this.angle = n % 3; this.orbit = 0; },
  stop() { if (!this.active) return; this.active = false; this.apply(this.span()[1]); const M = Game.M; M.f.forEach((F, i) => { F.model.face.set(this.live[i].face, 0); F.model.setFlash(0); }); Gfx.fx.letter = 0; Gfx.fx.desat = 0; const f = this.onDone; this.onDone = null; f && f(); },
  /** write the recorded pose at simulation time t into both fighters */
  apply(t) {
    const M = Game.M, S = this.STR, n = this.count; if (!n) return; const first = (this.head - n + this.N) % this.N; let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.times[(first + m) % this.N] <= t) lo = m; else hi = m; }
    const i0 = (first + lo) % this.N, i1 = (first + hi) % this.N, ta = this.times[i0], tb = this.times[i1], u = tb > ta ? clamp01((t - ta) / (tb - ta)) : 0, B = this.buf, qa = Replay._qa, qb = Replay._qb;
    for (let f = 0; f < 2; f++) { const F = M.f[f], g = F.model.group, b = F.model.bones; let a = (i0 * 2 + f) * S, c = (i1 * 2 + f) * S;
      g.position.set(lerp(B[a], B[c], u), lerp(B[a + 1], B[c + 1], u), lerp(B[a + 2], B[c + 2], u)); g.rotation.y = B[a + 3] + wrapPi(B[c + 3] - B[a + 3]) * u; b[0].position.set(lerp(B[a + 4], B[c + 4], u), lerp(B[a + 5], B[c + 5], u), lerp(B[a + 6], B[c + 6], u)); a += 7; c += 7;
      for (let k = 0; k < b.length; k++) { qa.set(B[a], B[a + 1], B[a + 2], B[a + 3]); qb.set(B[c], B[c + 1], B[c + 2], B[c + 3]); b[k].quaternion.copy(qa).slerp(qb, u); a += 4; c += 4; }
      const fc = B[a], fl = fc >= 100; F.model.face.set(this.faces[fc % 100] || 'neutral', 0); F.model.face.hold = 0; F.model.setFlash(fl ? 0.12 : 0); g.updateMatrixWorld(true); }
  },
  update(dt) {
    if (!this.active) return; const M = Game.M, near = Math.abs(this.t - this.key), speed = this.pass === 0 ? (near < 0.4 ? 0.2 : this.t > this.key ? 0.55 : 1) : (near < 0.55 ? 0.12 : 0.6);
    this.t += dt * speed; this.apply(this.t); for (const F of M.f) F.model.face.update(dt);
    while (this.evI < this.events.length && this.events[this.evI].t <= this.t) { const e = this.events[this.evI++]; if (e.type === 'hit' && e.pos) { Vfx.burst(e.pos, e.kind, e.clean ? [0.5, 0.78, 1.1][e.heavy] * (e.kd ? 1.4 : 1) : 0.45); if (e.clean) { Vfx.spray(e.pos, e.dir, 4 + e.heavy * 5, SWEAT, 2.4 + e.heavy, 0.011); Sfx.impact(e.lvl, e.heavy, 0, 0.8); } else Sfx.block(e.heavy, 0); } }
    // camera: three angles around the decisive moment
    const V = M.f[this.victim], A = M.f[1 - this.victim], vb = V.model.bones, head = vb[BN.head].getWorldPosition(_v1), ab = A.model.bones[BN.chest].getWorldPosition(_v2);
    const mid = _v3.copy(head).lerp(ab, 0.42); mid.y = Math.max(0.55, mid.y * 0.9); this.orbit += dt * (this.pass === 0 ? 0.16 : 0.1);
    const ax = _v4.subVectors(head, ab).setY(0).normalize(), px = -ax.z, pz = ax.x, ang = this.angle;
    const P = Replay._p, sgn = this.victim === 0 ? 1 : -1;
    if (ang === 0) P.set(mid.x + (px * Math.cos(this.orbit + 0.5) + ax.x * Math.sin(this.orbit + 0.5)) * -3.0 * sgn, 1.05, mid.z + (pz * Math.cos(this.orbit + 0.5) + ax.z * Math.sin(this.orbit + 0.5)) * -3.0 * sgn);
    else if (ang === 1) P.set(mid.x + ax.x * 2.3 + px * 1.5 * sgn, 0.42, mid.z + ax.z * 2.3 + pz * 1.5 * sgn);
    else P.set(mid.x - px * 2.2 * sgn + ax.x * 0.6, 3.4, mid.z - pz * 2.2 * sgn + ax.z * 0.6);
    const cam = Gfx.camera; Cam.pos.lerp(P, this.snap ? 1 : 1 - Math.exp(-dt * 5)); Cam.tgt.lerp(mid, this.snap ? 1 : 1 - Math.exp(-dt * 6)); this.snap = false;
    cam.position.copy(Cam.pos); cam.fov = ang === 1 ? 40 : 30; cam.updateProjectionMatrix(); cam.up.set(0, 1, 0); cam.lookAt(Cam.tgt);
    Gfx.fx.letter = damp(Gfx.fx.letter, 0.085, 6, dt); Gfx.fx.desat = damp(Gfx.fx.desat, near < 0.5 ? 0.35 : 0.1, 5, dt);
    // contact shadows from the recorded bones
    M.f.forEach((F, i) => { const b = F.model.bones; b[BN.toeL].getWorldPosition(_v1); Arena.blob(i * 2, _v1.x, _v1.z, 0.15, 0.6 * clamp01(1 - (_v1.y - 0.03) * 5)); b[BN.toeR].getWorldPosition(_v1); Arena.blob(i * 2 + 1, _v1.x, _v1.z, 0.15, 0.6 * clamp01(1 - (_v1.y - 0.03) * 5)); b[BN.hips].getWorldPosition(_v1); const low = _v1.y < 0.5; Arena.blob(4 + i * 2, _v1.x, _v1.z, low ? 0.42 : 0.4, low ? 0.6 : 0.22); b[BN.chest].getWorldPosition(_v1); Arena.blob(5 + i * 2, _v1.x, _v1.z, 0.4, _v1.y < 0.6 ? 0.55 : 0); });
    if (this.t >= this.t1) { if (this.pass === 0) { this.pass = 1; this.t = Math.max(this.t0, this.key - 1.1); this.evI = this.events.findIndex(e => e.t >= this.t); if (this.evI < 0) this.evI = this.events.length; this.setAngle(1); this.snap = true; Bus.emit('replayPass', 1); } else this.stop(); }
  }
};
Replay._qa = new THREE.Quaternion(); Replay._qb = new THREE.Quaternion(); Replay._p = V3();
Bus.on('hit', e => Replay.mark('hit', e));
