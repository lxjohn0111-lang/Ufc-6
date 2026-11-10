/* ═══════════════════════════ ANIMATOR ═══════════════════════════
   Layers, bottom to top:
     stance (per-fighter posture, guard blend, fatigue)  →  locomotion (procedural footwork: feet
     plant in world space and step to catch the body, so there is no skating)  →  action clip
     (blended in from whatever the body was doing; hands back to the stance on release)  →
     additive springs (hit reactions, breathing, sway)  →  IK solve. */
const STYLE0 = { stanceW: 0.14, stanceL: 0.23, leadYaw: -0.15, rearYaw: -0.85, crouch: 0.07, blade: -0.48, twist: -0.14, lean: 0.13,
  lh: [0.24, 0.27, 0.25], rh: [0.05, 0.25, 0.17], le: 0.05, re: 0.1, bounce: 0.006, bounceHz: 2.0, sway: 0.008, swayHz: 0.55, headMove: 0.02, stepDur: 0.2, stepThr: 0.1, guardTight: 0 };
const POS_CH = { lh: 1, rh: 1, hp: 1, lf: 1, rf: 1 }, AIM_CH = { lha: 1, rha: 1, lfa: 1, rfa: 1 };

class Animator {
  constructor(model, styleIn) {
    this.model = model; this.rig = new Rig(model); const st = this.style = { ...STYLE0, ...styleIn }, s = this.s = model.sk.s;
    this.side = model.def.stance === 'southpaw' ? -1 : 1;
    this.base = newPose(); this.pose = newPose(); this.from = newPose(); this.tgt = newPose(); this.gp = newPose();
    const mk = o => { const p = newPose(); setPose(p, o); for (const c in POS_CH) for (let i = 0; i < 3; i++) p[c][i] *= s; return p; };
    const idle = { hp: [0, -st.crouch, 0], hr: [st.blade, 0.04, 0], sp: [st.twist, st.lean, 0], hd: [0, 0.05, 0], lh: st.lh, rh: st.rh, le: st.le, re: st.re };
    const g = st.guardTight;
    this.stance = { idle: mk(idle),
      mid: mk({ ...idle, hp: [0, -st.crouch - 0.03, 0], sp: [st.twist, st.lean + 0.06, 0], hd: [0, 0.12, 0], lh: [0.2 - g * 0.03, 0.31, 0.19], rh: [0.03, 0.3, 0.15], le: 0, re: 0.05, sh: [0.06, 0.06] }),
      high: mk({ ...idle, hp: [0, -st.crouch - 0.04, 0], sp: [st.twist * 0.6, st.lean + 0.1, 0], hd: [0, 0.2, 0], lh: [0.13, 0.42, 0.15], rh: [-0.03, 0.42, 0.13], le: 0, re: 0, sh: [0.15, 0.15] }),
      low: mk({ ...idle, hp: [0, -st.crouch - 0.1, 0], sp: [st.twist, st.lean + 0.2, 0], hd: [0, -0.04, 0], lh: [0.14, 0.04, 0.2], rh: [-0.02, 0.2, 0.17], le: 0.1, re: 0.05 }) };
    this.home = [V3(st.stanceW * s, 0, st.stanceL * s), V3(-st.stanceW * s, 0, -st.stanceL * s)]; this.homeYaw = [st.leadYaw, st.rearYaw];
    this.feet = [0, 1].map(() => ({ pos: V3(), yaw: 0, stepping: false, t: 0, dur: 0.2, from: V3(), fromYaw: 0, h: 0, lift: 0, off: V3(), forced: 0 }));
    this.root = V3(); this.yaw = 0; this.vel = V3(); this.guardW = 0; this.guardLvl = 0; this.gW = 0; this.gL = 0; this.fatigue = 0; this.wobble = 0; this.noStep = 0; this.stepCool = 0; this.settle = 0;
    this.layer = { clip: null, time: 0, tp: 0, s: 1, blendIn: 0.06, phases: null, speed: 1, hold: false, evI: 0 };
    this.sp = { hy: new Spring(4.2, 0.42), hp: new Spring(4.2, 0.42), hr: new Spring(4, 0.42), st: new Spring(3.4, 0.5), sb: new Spring(3.4, 0.5), ss: new Spring(3.4, 0.5), px: new Spring(3, 0.62), py: new Spring(3.2, 0.55), pz: new Spring(3, 0.62) };
    this.aimW = { lh: V3(), rh: V3(), lf: V3(), rf: V3(), look: V3(0, 1.6, 3) };
    this.t = Math.random() * 10; this.bph = Math.random() * TAU; this.bnc = Math.random() * TAU; this.shake = 0; this.height = 1; this.onStep = null; this.onEvent = null;
    this.tmp = new Float32Array(4); this.placeFeet();
  }
  placeFeet() { const g = this.model.group; g.position.copy(this.root); g.rotation.y = this.yaw; g.updateMatrix(); g.matrixWorld.copy(g.matrix);
    for (let i = 0; i < 2; i++) { const f = this.feet[i]; f.pos.copy(this.home[i]).applyMatrix4(g.matrixWorld); f.pos.y = 0; f.yaw = this.yaw + this.side * this.homeYaw[i]; f.stepping = false; f.lift = 0; } }
  /** start a clip. opt.phases = [startup, active, recovery] seconds for strike clips */
  play(name, opt = {}) {
    const c = typeof name === 'string' ? CLIPS[name] : name, L = this.layer; if (!c) { console.warn('missing clip', name); return; }
    copyPose(this.from, this.pose); L.clip = c; L.time = 0; L.tp = 0; L.s = 0; L.blendIn = opt.blendIn ?? 0.07; L.phases = opt.phases || null; L.speed = opt.speed || 1; L.hold = !!opt.hold; L.evI = 0; L.dur = opt.dur || c.dur || c.end;
    this.noStep = (c.ch.lfo || c.ch.rfo || c.lockFeet) ? 1 : 0;
  }
  stop(blend = 0.16) { const L = this.layer; if (!L.clip) return; copyPose(this.from, this.pose); L.clip = null; L.s = 0; L.blendIn = blend; this.noStep = 0; }
  get playing() { return this.layer.clip; }
  get tp() { return this.layer.tp; }
  /** stretch the current phase (used when a strike whiffs or is blocked) */
  setPhases(ph) { this.layer.phases = ph; }
  impulse(o) { const S = this.sp; if (o.head) { S.hy.kick(o.head[0]); S.hp.kick(o.head[1]); S.hr.kick(o.head[2]); } if (o.spine) { S.st.kick(o.spine[0]); S.sb.kick(o.spine[1]); S.ss.kick(o.spine[2]); } if (o.hips) { S.px.kick(o.hips[0]); S.py.kick(o.hips[1]); S.pz.kick(o.hips[2]); } }
  /** force a step: foot i lands at home + (dx,dz) in root space */
  step(i, dx = 0, dz = 0, dur = 0.16, h = 0.04) { const f = this.feet[i]; f.stepping = true; f.t = 0; f.dur = dur; f.from.copy(f.pos); f.fromYaw = f.yaw; f.h = h; f.off.set(dx, 0, dz); f.forced = 1; }
  update(dt) {
    const st = this.style, g = this.model.group, s = this.s, rig = this.rig, L = this.layer, P = this.pose; this.t += dt;
    g.position.copy(this.root); g.rotation.y = this.yaw; g.updateMatrix(); g.matrixWorld.copy(g.matrix);
    // ── footwork ──────────────────────────────────────────────────────────
    const vx = this.vel.x, vz = this.vel.z, spd = Math.hypot(vx, vz); this.settle = spd < 0.12 ? this.settle + dt : 0; this.stepCool -= dt;
    const F = this.feet, hw = Animator._hw, err = [0, 0], yerr = [0, 0];
    for (let i = 0; i < 2; i++) { hw[i].copy(this.home[i]).add(F[i].off).applyMatrix4(g.matrixWorld); hw[i].y = 0; hw[i].x += vx * 0.09; hw[i].z += vz * 0.09;
      err[i] = Math.hypot(hw[i].x - F[i].pos.x, hw[i].z - F[i].pos.z); yerr[i] = Math.abs(wrapPi(this.yaw + this.side * this.homeYaw[i] - F[i].yaw)); }
    if (!F[0].stepping && !F[1].stepping && this.stepCool <= 0 && !this.noStep) {
      const thr = (spd > 0.15 || this.settle < 0.3 ? st.stepThr : 0.035) * s, c0 = err[0] > thr || yerr[0] > 0.4, c1 = err[1] > thr || yerr[1] > 0.4; let pick = -1;
      if (c0 && c1) pick = spd > 0.1 ? ((vx * (hw[0].x - hw[1].x) + vz * (hw[0].z - hw[1].z)) > 0 ? 0 : 1) : (err[0] + yerr[0] * 0.2 > err[1] + yerr[1] * 0.2 ? 0 : 1); else if (c0) pick = 0; else if (c1) pick = 1;
      if (pick >= 0) { const f = F[pick]; f.stepping = true; f.t = 0; f.from.copy(f.pos); f.fromYaw = f.yaw; f.dur = st.stepDur * clamp(1.15 - spd * 0.22, 0.62, 1.1) * (0.9 + 0.2 * this.fatigue); f.h = (0.022 + 0.05 * clamp01(err[pick] / (0.3 * s))) * s; }
    }
    for (let i = 0; i < 2; i++) { const f = F[i]; if (!f.stepping) { f.lift = 0; continue; }
      f.t += dt / f.dur; const u = Ease.io(Math.min(1, f.t)), lead = (1 - u) * f.dur * 0.5;
      f.pos.x = lerp(f.from.x, hw[i].x + vx * lead, u); f.pos.z = lerp(f.from.z, hw[i].z + vz * lead, u); f.lift = Math.sin(PI * Math.min(1, f.t)) * f.h;
      f.yaw = f.fromYaw + wrapPi(this.yaw + this.side * this.homeYaw[i] - f.fromYaw) * u;
      if (f.t >= 1) { f.stepping = false; f.lift = 0; f.forced = 0; this.stepCool = 0.015; if (this.onStep) this.onStep(i, f.h); } }
    // feet → root space
    const inv = Animator._inv.copy(g.matrixWorld).invert(), c = Animator._c.set(0, 0, 0);
    for (let i = 0; i < 2; i++) { const rf = rig.foot[i]; rf.ball.copy(F[i].pos).applyMatrix4(inv); rf.ball.y = F[i].lift; rf.yaw = this.side * wrapPi(F[i].yaw - this.yaw); c.x += rf.ball.x * 0.5; c.z += rf.ball.z * 0.5; }
    // ── stance layer ──────────────────────────────────────────────────────
    this.gW = damp(this.gW, this.guardW, 22, dt); this.gL = damp(this.gL, this.guardLvl, 16, dt);
    const B = this.base, S = this.stance, fat = this.fatigue, wob = this.wobble;
    if (this.gW > 0.002) { lerpPose(this.gp, S.mid, this.gL >= 0 ? S.high : S.low, Math.abs(this.gL)); lerpPose(B, S.idle, this.gp, this.gW); } else copyPose(B, S.idle);
    const stepU = F[0].stepping ? Math.sin(PI * Math.min(1, F[0].t)) : F[1].stepping ? Math.sin(PI * Math.min(1, F[1].t)) : 0, sup = F[0].stepping ? 1 : 0;
    this.bnc += dt * TAU * st.bounceHz * (1 - 0.4 * fat); this.bph += dt * TAU * (0.3 + 0.55 * fat);
    const bn = st.bounce * (1 - 0.75 * fat) * (1 - this.gW * 0.5), bs = Math.sin(this.bnc), br = Math.sin(this.bph), ba = 0.012 + 0.03 * fat;
    const sw = Math.sin(this.t * TAU * st.swayHz), sw2 = Math.sin(this.t * TAU * st.swayHz * 0.63 + 1.3);
    B.hp[0] += c.x * 0.45 + (rig.foot[sup].ball.x - c.x) * 0.22 * stepU + st.sway * s * sw;
    B.hp[2] += c.z * 0.45 + (rig.foot[sup].ball.z - c.z) * 0.22 * stepU + st.sway * 0.6 * s * sw2;
    B.hp[1] += (bn * bs - 0.012 * stepU + 0.02 * fat - 0.035 * wob) * s + br * ba * 0.25 * s;
    const lvx = (vx * Math.cos(this.yaw) - vz * Math.sin(this.yaw)) * this.side, lvz = vx * Math.sin(this.yaw) + vz * Math.cos(this.yaw);
    B.sp[1] += clamp(lvz * 0.04, -0.07, 0.09) + br * ba + 0.1 * fat + 0.1 * wob; B.sp[2] += clamp(lvx * 0.05, -0.08, 0.08) - st.sway * 2.5 * sw + 0.13 * wob * Math.sin(this.t * 4.3);
    B.sp[0] += st.sway * 2 * sw2;
    B.sh[0] += Math.max(0, br) * ba * 1.6; B.sh[1] += Math.max(0, br) * ba * 1.6;
    B.hd[1] += 0.1 * fat + 0.12 * wob; B.hd[0] += st.headMove * Math.sin(this.t * 1.9) * (1 - this.gW); B.hd[2] += st.headMove * 0.8 * sw + 0.16 * wob * Math.sin(this.t * 3.1);
    B.lh[1] -= (0.07 * fat + 0.12 * wob) * s * (1 - this.gW * 0.6) - bn * bs * 0.5 * s; B.rh[1] -= (0.05 * fat + 0.1 * wob) * s * (1 - this.gW * 0.6) - bn * bs * 0.5 * s;
    B.hp[0] += 0.05 * wob * s * Math.sin(this.t * 5.1); B.hp[2] += 0.04 * wob * s * Math.sin(this.t * 3.7 + 1);
    const heel = clamp01(bn * 60) * (0.5 + 0.5 * bs) * 0.16; B.lfr[1] += heel; B.rfr[1] += heel + 0.1;
    // ── action layer ──────────────────────────────────────────────────────
    if (L.clip) {
      L.time += dt * L.speed; const cl = L.clip;
      if (cl.phased && L.phases) { const [a, b, r] = L.phases, t = L.time; L.tp = t < a ? t / a : t < a + b ? 1 + (t - a) / b : 2 + (t - a - b) / r; } else L.tp = cl.phased ? L.time / L.dur * cl.end : L.time;
      if (cl.events) while (L.evI < cl.events.length && cl.events[L.evI].t <= L.tp) { const ev = cl.events[L.evI++]; if (ev.step) this.step(ev.step[0], ev.step[1] * s, ev.step[2] * s, ev.step[3], (ev.step[4] || 0.04) * s); if (this.onEvent) this.onEvent(ev); }
      if (L.tp >= cl.end) { if (L.hold) L.tp = cl.end; else { L.clip = null; this.noStep = 0; } }
    }
    L.s = Math.min(1, L.s + dt / Math.max(0.001, L.blendIn));
    if (L.clip || L.s < 1) {
      const sm = smooth(L.s), cl = L.clip, rel = cl && !L.hold ? sstep(cl.rel, cl.end, L.tp) : 0, T = this.tgt;
      for (const ch of CH_NAMES) { const out = P[ch], b = B[ch], fr = this.from[ch], list = cl && cl.ch[ch];
        if (list) { const t = T[ch]; sampleChannel(list, L.tp, t, SPLINE[ch]);
          if (POS_CH[ch]) { t[0] *= s; t[1] *= s; t[2] *= s; } else if (AIM_CH[ch]) { t[1] *= s; t[2] *= s; t[3] *= s; }
          if (ADDITIVE[ch]) for (let i = 0; i < t.length; i++) t[i] += b[i];
          if (L.tp < list[0].t) { const u = list[0].e(L.tp / list[0].t); for (let i = 0; i < t.length; i++) t[i] = lerp(b[i], t[i], u); }   // ease in from the stance to the first key
          for (let i = 0; i < out.length; i++) out[i] = lerp(fr[i], lerp(t[i], b[i], rel), sm);
        } else for (let i = 0; i < out.length; i++) out[i] = lerp(fr[i], b[i], sm); }
    } else copyPose(P, B);
    // ── additive reactions ────────────────────────────────────────────────
    const Sp = this.sp; for (const k in Sp) Sp[k].step(dt);
    const sh = this.shake > 0 ? Math.sin(this.t * 190) * this.shake : 0;
    this.out = this.out || newPose(); const O = copyPose(this.out, P);
    O.hd[0] += Sp.hy.x; O.hd[1] += Sp.hp.x; O.hd[2] += Sp.hr.x; O.sp[0] += Sp.st.x; O.sp[1] += Sp.sb.x; O.sp[2] += Sp.ss.x; O.hp[0] += Sp.px.x * s + sh; O.hp[1] += Sp.py.x * s; O.hp[2] += Sp.pz.x * s;
    // aim points → root space
    for (const k in this.aimW) rig.aim[k].copy(this.aimW[k]).applyMatrix4(inv);
    rig.solve(O);
  }
  /** rig landmark → world space */
  pt(name, out) { return out.copy(this.rig.P[name]).applyMatrix4(this.model.group.matrixWorld); }
  /** root-space direction → world */
  dir(x, y, z, out) { return out.set(x * this.side, y, z).applyAxisAngle(UP, this.yaw); }
  resetSprings() { for (const k in this.sp) { this.sp[k].x = 0; this.sp[k].v = 0; } }
}
Animator._hw = [V3(), V3()]; Animator._inv = new THREE.Matrix4(); Animator._c = V3();
