/* ═══════════════════════════ CONTROL RIG ═══════════════════════════
   Animation is authored on a control rig, not on raw joint angles: hips, spine, head, and
   hand / foot targets with elbow-knee poles. Two-bone IK resolves the limbs, so fists land
   where they are aimed and feet stay planted on the canvas. All maths runs in the fighter's
   root space with lead = left; southpaws are the same solve mirrored by the model group. */
const CHANNELS = { hp: 3, hr: 3, sp: 3, hd: 3, lh: 3, rh: 3, lha: 4, rha: 4, lhr: 1, rhr: 1, le: 1, re: 1, lf: 3, rf: 3, lfa: 4, rfa: 4, lfr: 3, rfr: 3, lfo: 1, rfo: 1, lk: 3, rk: 3, look: 1, sh: 2 };
const CH_NAMES = Object.keys(CHANNELS);
function newPose() { const p = {}; for (const c of CH_NAMES) p[c] = new Float32Array(CHANNELS[c]); p.look[0] = 1; return p; }
function copyPose(dst, src) { for (const c of CH_NAMES) dst[c].set(src[c]); return dst; }
function lerpPose(dst, a, b, t) { for (const c of CH_NAMES) { const d = dst[c], x = a[c], y = b[c]; for (let i = 0; i < d.length; i++) d[i] = x[i] + (y[i] - x[i]) * t; } return dst; }
function setPose(p, o) { for (const k in o) { const v = o[k]; if (typeof v === 'number') p[k][0] = v; else p[k].set(v); } return p; }

class Rig {
  constructor(model) {
    this.model = model; const sk = this.sk = model.sk, B = sk.bind; this.bones = model.bones;
    const v = i => V3(B[i][0], B[i][1], B[i][2]), off = (i, j) => v(i).sub(v(j));
    this.o = { spine: off(BN.spine, BN.hips), chest: off(BN.chest, BN.spine), neck: off(BN.neck, BN.chest), head: off(BN.head, BN.neck), clavL: off(BN.clavL, BN.chest), clavR: off(BN.clavR, BN.chest),
      shL: off(BN.uarmL, BN.clavL), shR: off(BN.uarmR, BN.clavR), hipL: off(BN.thighL, BN.hips), hipR: off(BN.thighR, BN.hips), ankL: off(BN.footL, BN.toeL), ankR: off(BN.footR, BN.toeR) };
    this.fist = 0.062 * sk.s; this.len = { ua: sk.ua, fa: sk.fa + this.fist, th: sk.thigh, sn: sk.shin };
    // bind frames (d0, h0, d0×h0) for each limb segment → inverse quaternions
    const frameInv = (d, pole) => { const h = pole.clone().cross(d).normalize(), n = d.clone().cross(h); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, h, n)).invert(); };
    const dn = (a, b) => v(b).sub(v(a)).normalize(), back = V3(0, 0, -1), fwd = V3(0, 0, 1);
    this.fi = { uaL: frameInv(dn(BN.uarmL, BN.farmL), back), faL: frameInv(dn(BN.farmL, BN.handL), back), uaR: frameInv(dn(BN.uarmR, BN.farmR), back), faR: frameInv(dn(BN.farmR, BN.handR), back),
      thL: frameInv(dn(BN.thighL, BN.shinL), fwd), snL: frameInv(dn(BN.shinL, BN.footL), fwd), thR: frameInv(dn(BN.thighR, BN.shinR), fwd), snR: frameInv(dn(BN.shinR, BN.footR), fwd) };
    this.Q = BONES.map(() => new THREE.Quaternion());            // world (root-space) rotations
    this.P = {}; for (const n of ['hips', 'chest', 'neck', 'head', 'headC', 'shL', 'shR', 'elL', 'elR', 'fistL', 'fistR', 'hipL', 'hipR', 'knL', 'knR', 'ankL', 'ankR', 'ballL', 'ballR', 'spine', 'wrL', 'wrR', 'toeL', 'toeR']) this.P[n] = V3();
    this.foot = [{ ball: V3(0.14, 0, 0.2), yaw: 0 }, { ball: V3(-0.14, 0, -0.2), yaw: 0 }];   // root-space plants, set by locomotion
    this.aim = { lh: V3(), rh: V3(), lf: V3(), rf: V3(), look: V3(0, 1.6, 2) };              // root-space aim points
    this.hipsStand = B[BN.hips][1]; this.ballH = B[BN.toeL][1];
    this.ragBlend = 0;
  }
  _ik(S, T, l1, l2, pole, outE, outH) {       // returns reach ratio; outE elbow/knee, outH hinge axis
    const d = _v1.copy(T).sub(S); let dist = d.length(); const maxL = (l1 + l2) * 0.999, minL = Math.abs(l1 - l2) + 0.02; const ratio = dist / (l1 + l2);
    dist = clamp(dist, minL, maxL); d.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pp = _v2.copy(pole).addScaledVector(d, -pole.dot(d)); if (pp.lengthSq() < 1e-6) pp.set(0, -1, 0).addScaledVector(d, d.y); pp.normalize();
    outE.copy(S).addScaledVector(d, a).addScaledVector(pp, hgt); outH.copy(pp).cross(d).normalize();
    T.copy(S).addScaledVector(d, dist);        // clamp target to reachable
    return ratio;
  }
  _frame(u, h, inv, out) { const n = _v3.copy(u).cross(h); _m1.makeBasis(u, _v4.copy(h), n); return out.setFromRotationMatrix(_m1).multiply(inv); }
  /** pose → bone transforms */
  solve(p) {
    const Q = this.Q, P = this.P, o = this.o, e = Rig._e, q = Rig._q, sk = this.sk, s = sk.s;
    // feet first (they constrain the hips)
    const foot = [{}, {}];
    for (let i = 0; i < 2; i++) {
      const f = this.foot[i], L = i === 0, off = p[L ? 'lf' : 'rf'], rot = p[L ? 'lfr' : 'rfr'], own = p[L ? 'lfo' : 'rfo'][0], a = p[L ? 'lfa' : 'rfa'];
      const ball = P[L ? 'ballL' : 'ballR'];
      ball.set(lerp(f.ball.x + off[0], off[0], own), lerp(this.ballH + f.ball.y + off[1], off[1], own), lerp(f.ball.z + off[2], off[2], own));
      if (a[0] > 0.001) { const t = this.aim[L ? 'lf' : 'rf']; ball.x = lerp(ball.x, t.x + a[1], a[0]); ball.y = lerp(ball.y, t.y + a[2], a[0]); ball.z = lerp(ball.z, t.z + a[3], a[0]); }
      foot[i].yaw = lerp(f.yaw, 0, own) + rot[0]; foot[i].pitch = rot[1]; foot[i].roll = rot[2];
    }
    // hips
    const hips = P.hips.set(p.hp[0], this.hipsStand + p.hp[1], p.hp[2]);
    Q[BN.hips].setFromEuler(e.set(p.hr[1], p.hr[0], -p.hr[2], 'YXZ'));
    // legs may not over-extend: lift the heel, then drop the hips
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 2; i++) {
      const L = i === 0, ball = P[L ? 'ballL' : 'ballR'], hj = _v1.copy(L ? o.hipL : o.hipR).applyQuaternion(Q[BN.hips]).add(hips), f = foot[i];
      q.setFromEuler(e.set(f.pitch, f.yaw, f.roll, 'YXZ')); const ank = _v2.copy(L ? o.ankL : o.ankR).applyQuaternion(q).add(ball);
      const over = hj.distanceTo(ank) - (this.len.th + this.len.sn) * 0.985;
      if (over > 0) { const w = 1 - p[L ? 'lfo' : 'rfo'][0]; if (pass === 0) f.pitch += Math.min(0.75, over * 5) * w; else hips.y -= over * 1.05 * w; }   // a kicking leg never drags the hips down
    }
    // spine
    Q[BN.spine].setFromEuler(e.set(p.sp[1] * 0.45, p.sp[0] * 0.4, -p.sp[2] * 0.45, 'YXZ')).premultiply(Q[BN.hips]);
    Q[BN.chest].setFromEuler(e.set(p.sp[1] * 0.55, p.sp[0] * 0.6, -p.sp[2] * 0.55, 'YXZ')).premultiply(Q[BN.spine]);
    P.spine.copy(o.spine).applyQuaternion(Q[BN.hips]).add(hips);
    P.chest.copy(o.chest).applyQuaternion(Q[BN.spine]).add(P.spine);
    P.neck.copy(o.neck).applyQuaternion(Q[BN.chest]).add(P.chest);
    // head: look at target within neck limits
    const qci = _q1.copy(Q[BN.chest]).invert(), hl = _v1.copy(this.aim.look).sub(_v2.copy(o.head).applyQuaternion(Q[BN.chest]).add(P.neck)).applyQuaternion(qci);
    const lw = p.look[0], yaw = clamp(Math.atan2(hl.x, hl.z), -1.25, 1.25) * lw + p.hd[0], pitch = clamp(-Math.atan2(hl.y, Math.hypot(hl.x, hl.z)), -0.6, 0.6) * lw + p.hd[1];
    Q[BN.neck].setFromEuler(e.set(pitch * 0.4, yaw * 0.4, -p.hd[2] * 0.4, 'YXZ')).premultiply(Q[BN.chest]);
    Q[BN.head].setFromEuler(e.set(pitch * 0.6, yaw * 0.6, -p.hd[2] * 0.6, 'YXZ')).premultiply(Q[BN.neck]);
    P.head.copy(o.head).applyQuaternion(Q[BN.neck]).add(P.neck);
    P.headC.set(0, 0.075 * s, 0.02 * s).applyQuaternion(Q[BN.head]).add(P.head);
    // arms
    for (let i = 0; i < 2; i++) {
      const L = i === 0, sx = L ? 1 : -1, hp = p[L ? 'lh' : 'rh'], a = p[L ? 'lha' : 'rha'], fl = p[L ? 'le' : 're'][0];
      const T = P[L ? 'fistL' : 'fistR'].set(hp[0], hp[1], hp[2]).applyQuaternion(Q[BN.chest]).add(P.chest);
      if (a[0] > 0.001) { const t = this.aim[L ? 'lh' : 'rh']; T.x = lerp(T.x, t.x + a[1], a[0]); T.y = lerp(T.y, t.y + a[2], a[0]); T.z = lerp(T.z, t.z + a[3], a[0]); }
      // shoulder girdle follows the reach: protract when punching, elevate when the hand is high
      const sh0 = _v2.copy(L ? o.clavL : o.clavR).add(L ? o.shL : o.shR).applyQuaternion(Q[BN.chest]).add(P.chest);
      const rel = _v3.copy(T).sub(sh0).applyQuaternion(qci), ext = clamp01(rel.length() / (this.len.ua + this.len.fa)), ext2 = ext * ext;
      const prot = clamp(rel.z / (this.len.ua + this.len.fa), -0.3, 1) * 0.42 * ext2, elev = clamp(rel.y / (this.len.ua + this.len.fa) * 0.5 * ext2 + 0.08 * (1 - ext) + p.sh[i], -0.15, 0.4);
      const ci = L ? BN.clavL : BN.clavR; Q[ci].setFromEuler(e.set(0, -sx * prot, sx * elev, 'YXZ')).premultiply(Q[BN.chest]);
      const S = P[L ? 'shL' : 'shR'].copy(L ? o.shL : o.shR).applyQuaternion(Q[ci]).add(_v2.copy(L ? o.clavL : o.clavR).applyQuaternion(Q[BN.chest])).add(P.chest);
      const pole = Rig._pole.set(sx * lerp(0.32, 1, fl), lerp(-1, 0.18, fl), lerp(-0.22, -0.4, fl)).applyQuaternion(Q[BN.chest]);
      const E = P[L ? 'elL' : 'elR'], H = Rig._h; this._ik(S, T, this.len.ua, this.len.fa, pole, E, H);
      const u = Rig._u.copy(E).sub(S).normalize(), f = Rig._f.copy(T).sub(E).normalize();
      this._frame(u, H, this.fi[L ? 'uaL' : 'uaR'], Q[L ? BN.uarmL : BN.uarmR]);
      const fq = this._frame(f, H, this.fi[L ? 'faL' : 'faR'], Q[L ? BN.farmL : BN.farmR]);
      const tw = p[L ? 'lhr' : 'rhr'][0]; if (tw) fq.premultiply(q.setFromAxisAngle(f, sx * tw));
      Q[L ? BN.handL : BN.handR].copy(fq);
      P[L ? 'wrL' : 'wrR'].copy(T).addScaledVector(f, -this.fist);
    }
    // legs
    for (let i = 0; i < 2; i++) {
      const L = i === 0, f = foot[i], ball = P[L ? 'ballL' : 'ballR'], kp = p[L ? 'lk' : 'rk'];
      const fq = Q[L ? BN.footL : BN.footR].setFromEuler(e.set(f.pitch, f.yaw, f.roll, 'YXZ'));
      const ank = P[L ? 'ankL' : 'ankR'].copy(L ? o.ankL : o.ankR).applyQuaternion(fq).add(ball);
      const hj = P[L ? 'hipL' : 'hipR'].copy(L ? o.hipL : o.hipR).applyQuaternion(Q[BN.hips]).add(hips);
      const pole = Rig._pole.set(Math.sin(f.yaw) * 0.8 + (L ? 0.12 : -0.12) + kp[0], kp[1], Math.cos(f.yaw) * 0.8 + 0.4 + kp[2]);
      const K = P[L ? 'knL' : 'knR'], H = Rig._h, T = Rig._t.copy(ank); this._ik(hj, T, this.len.th, this.len.sn, pole, K, H);
      const u = Rig._u.copy(K).sub(hj).normalize(), sv = Rig._f.copy(T).sub(K).normalize();
      this._frame(u, H, this.fi[L ? 'thL' : 'thR'], Q[L ? BN.thighL : BN.thighR]); this._frame(sv, H, this.fi[L ? 'snL' : 'snR'], Q[L ? BN.shinL : BN.shinR]);
      // toes stay flat on the canvas when the heel lifts; point with the foot in the air
      const grounded = clamp01(1 - (ball.y - this.ballH) / 0.06);
      Q[L ? BN.toeL : BN.toeR].setFromEuler(e.set(f.pitch * (1 - grounded), f.yaw, f.roll * (1 - grounded), 'YXZ'));
      P[L ? 'toeL' : 'toeR'].set(0, 0, 0.06 * s).applyQuaternion(fq).add(ball);
    }
    this.apply();
  }
  /** write world rotations into the bone hierarchy as local rotations */
  apply() {
    const Q = this.Q, b = this.bones;
    b[0].position.copy(this.P.hips); b[0].quaternion.copy(Q[0]);
    for (let i = 1; i < BONES.length; i++) b[i].quaternion.copy(Rig._q.copy(Q[BONE_PARENT[i]]).invert()).multiply(Q[i]);
  }
  /** root-space point → world */
  world(p, out) { return out.copy(p).applyMatrix4(this.model.group.matrixWorld); }
}
Rig._t = V3(); Rig._e = new THREE.Euler(); Rig._q = new THREE.Quaternion(); Rig._pole = V3(); Rig._h = V3(); Rig._u = V3(); Rig._f = V3();
