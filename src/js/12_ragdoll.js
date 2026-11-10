/* ═══════════════════════════ PHYSICS-ASSISTED FALLS ═══════════════════════════
   A constrained particle body (position-based dynamics): 18 joints, rigid limb links, soft torso
   braces, joint-limit distances, knee direction, floor friction, cage walls. It starts from the
   exact animated pose with the body's own momentum plus the strike impulse, the legs hold for a
   beat and then give, and the result is mapped back onto the skeleton. Getting up blends the
   settled pose into an authored recovery. Verlet + projection cannot explode. */
const RAG = { head: 0, neck: 1, chest: 2, pelvis: 3, shL: 4, shR: 5, elL: 6, elR: 7, haL: 8, haR: 9, hipL: 10, hipR: 11, knL: 12, knR: 13, anL: 14, anR: 15, toL: 16, toR: 17 };
const RAG_SRC = ['headC', 'neck', 'chest', 'hips', 'shL', 'shR', 'elL', 'elR', 'fistL', 'fistR', 'hipL', 'hipR', 'knL', 'knR', 'ankL', 'ankR', 'toeL', 'toeR'];
const RAG_RAD = [0.105, 0.06, 0.135, 0.12, 0.07, 0.07, 0.045, 0.045, 0.05, 0.05, 0.085, 0.085, 0.058, 0.058, 0.045, 0.045, 0.03, 0.03];
const RAG_W = [1, 1, 0.4, 0.4, 0.8, 0.8, 1.3, 1.3, 1.6, 1.6, 0.6, 0.6, 1, 1, 1.3, 1.3, 1.8, 1.8];   // inverse mass
class Ragdoll {
  constructor(f) {
    this.f = f; const rig = this.rig = f.anim.rig, sk = f.sk, s = this.s = sk.s, J = sk.J, R = RAG;
    const B = this.bind = [[J.head[0], J.head[1] + 0.075 * s, J.head[2] + 0.02 * s], J.neck, J.chest, J.hips, J.uarmL, J.uarmR, J.farmL, J.farmR, null, null, J.thighL, J.thighR, J.shinL, J.shinR, J.footL, J.footR, null, null].map(p => p && V3(p[0], p[1], p[2]));
    const d = V3(sk.d[0], sk.d[1], sk.d[2]); B[R.haL] = V3(...J.handL).addScaledVector(d, rig.fist); B[R.haR] = B[R.haL].clone(); B[R.haR].x *= -1;
    B[R.toL] = V3(J.toeL[0], J.toeL[1], J.toeL[2] + 0.06 * s); B[R.toR] = B[R.toL].clone(); B[R.toR].x *= -1;
    this.p = B.map(() => V3()); this.q = B.map(() => V3()); this.rad = RAG_RAD.map(r => r * s);
    const L = (a, b) => B[a].distanceTo(B[b]), C = this.cons = [], rigid = (a, b, k = 1) => C.push([a, b, L(a, b), k, 0]), min = (a, b, dmin) => C.push([a, b, dmin * s, 1, 1]);
    rigid(R.head, R.neck); rigid(R.neck, R.chest); rigid(R.chest, R.shL); rigid(R.chest, R.shR); rigid(R.shL, R.shR); rigid(R.neck, R.shL); rigid(R.neck, R.shR); rigid(R.chest, R.pelvis); rigid(R.pelvis, R.hipL); rigid(R.pelvis, R.hipR); rigid(R.hipL, R.hipR);
    for (const sd of ['L', 'R']) { rigid(R['sh' + sd], R['el' + sd]); rigid(R['el' + sd], R['ha' + sd]); rigid(R['hip' + sd], R['kn' + sd]); rigid(R['kn' + sd], R['an' + sd]); rigid(R['an' + sd], R['to' + sd]);
      rigid(R['sh' + sd], R['hip' + sd], 0.55); rigid(R.chest, R['hip' + sd], 0.6); rigid(R.pelvis, R['sh' + sd], 0.5); rigid(R.head, R['sh' + sd], 0.3);
      min(R['ha' + sd], R.chest, 0.17); min(R['ha' + sd], R.pelvis, 0.16); min(R['el' + sd], R.chest, 0.15); min(R['ha' + sd], R.head, 0.13); min(R['ha' + sd], R['sh' + sd], 0.14); min(R['kn' + sd], R.chest, 0.27); min(R['an' + sd], R['hip' + sd], 0.24); min(R['to' + sd], R['kn' + sd], 0.36); min(R['an' + sd], R.pelvis, 0.22); }
    rigid(R.shL, R.hipR, 0.5); rigid(R.shR, R.hipL, 0.5); rigid(R.head, R.chest, 0.7); min(R.knL, R.knR, 0.14); min(R.anL, R.anR, 0.12); min(R.haL, R.haR, 0.1); min(R.elL, R.elR, 0.2);
    // bind frames for the torso / head / feet
    const frame = (x, yRaw, out) => { const z = _v1.copy(x).cross(yRaw).normalize(), y = _v2.copy(z).cross(x).normalize(); return out.setFromRotationMatrix(_m1.makeBasis(_v3.copy(x).normalize(), y, z)); };
    this.frame = frame; this.bq = { hips: frame(V3().subVectors(B[R.hipL], B[R.hipR]), V3().subVectors(B[R.chest], B[R.pelvis]), new THREE.Quaternion()).invert(),
      chest: frame(V3().subVectors(B[R.shL], B[R.shR]), V3().subVectors(B[R.neck], B[R.chest]), new THREE.Quaternion()).invert(), head: frame(V3(1, 0, 0), V3().subVectors(B[R.head], B[R.neck]), new THREE.Quaternion()).invert() };
    const footInv = (an, to) => { const z = V3().subVectors(B[to], B[an]).normalize(), x = V3(1, 0, 0), y = z.clone().cross(x).normalize(); x.copy(y).cross(z); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).invert(); };
    this.bq.footL = footInv(R.anL, R.toL); this.bq.footR = footInv(R.anR, R.toR);
    this.hingeArm = [V3(0, 0, -1).cross(V3(sk.d[0], sk.d[1], 0)).normalize(), V3(0, 0, -1).cross(V3(-sk.d[0], sk.d[1], 0)).normalize()];
    this.capQ = BONES.map(() => new THREE.Quaternion()); this.capH = V3(); this.lp = B.map(() => V3()); this.inv = new THREE.Matrix4(); this.hold = [0, 0]; this.holdT = 0; this.t = 0; this.settleT = 0; this.still = 0;
  }
  activate(info, region, final) {
    const f = this.f, A = f.anim, g = f.model.group, P = this.p, Q = this.q, R = RAG, h = 1 / 120, s = this.s;
    for (let i = 0; i < 18; i++) P[i].copy(A.rig.P[RAG_SRC[i]]).applyMatrix4(g.matrixWorld);
    const v = P.map(() => V3(f.vel.x * 0.6, 0, f.vel.z * 0.6)), d = info.dir, J = (final ? 3.4 : 2.7) + info.m.heavy * 0.7, add = (i, k, y = 0) => { v[i].addScaledVector(d, J * k); v[i].y += y; };
    const lat = _v4.set(-d.z, 0, d.x).multiplyScalar((rand() - 0.5) * 1.6);
    if (region === 'head') { add(R.head, 1.5, 0.3); add(R.neck, 1.05); add(R.chest, 0.6); add(R.shL, 0.6); add(R.shR, 0.6); add(R.pelvis, 0.2); v[R.shL].add(lat); v[R.shR].sub(lat); add(R.haL, 0.3, 0.6); add(R.haR, 0.3, 0.6); }
    else if (region === 'body') { add(R.chest, 0.7); add(R.pelvis, 0.95); add(R.hipL, 0.9); add(R.hipR, 0.9); add(R.head, -0.25, -0.8); add(R.shL, 0.2, -0.5); add(R.shR, 0.2, -0.5); }
    else { add(R.knL, 1.5, 0.4); add(R.anL, 1.9, 0.5); add(R.toL, 1.9, 0.5); add(R.pelvis, 0.3); add(R.head, -0.2); v[R.chest].add(lat); }
    for (let i = 0; i < 18; i++) Q[i].copy(P[i]).addScaledVector(v[i], -h);
    // legs resist for a moment, then give way — a stiff backward fall or a crumple
    this.stiff = region === 'head' && rand() < 0.45; this.holdT = this.stiff ? 0.5 : region === 'head' ? 0.16 + rand() * 0.12 : 0.05;
    this.hold = [P[R.pelvis].distanceTo(P[R.anL]), P[R.pelvis].distanceTo(P[R.anR])]; this.t = 0; this.settleT = 0; this.still = 0;
  }
  update(dt) {
    const P = this.p, Q = this.q, R = RAG, h = 1 / 120, n = clamp(Math.round(dt / h), 1, 6), opp = this.f.opp, g = -9.8 * h * h;
    for (let st = 0; st < n; st++) {
      this.t += h; let maxV = 0;
      for (let i = 0; i < 18; i++) { const p = P[i], q = Q[i], vx = (p.x - q.x) * 0.992, vy = (p.y - q.y) * 0.996, vz = (p.z - q.z) * 0.992; q.copy(p); p.x += vx; p.y += vy + g; p.z += vz; maxV = Math.max(maxV, Math.abs(vx) + Math.abs(vz) + Math.abs(vy)); }
      this.still = maxV / h < 0.35 ? this.still + h : 0;
      const holdK = this.t < this.holdT ? 0.85 : Math.max(0, 0.85 - (this.t - this.holdT) * 5);
      for (let it = 0; it < 7; it++) {
        for (const c of this.cons) { const a = P[c[0]], b = P[c[1]], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6; if (c[4] && d >= c[2]) continue;
          const wa = RAG_W[c[0]], wb = RAG_W[c[1]], k = (d - c[2]) / d * c[3] / (wa + wb); a.x += dx * k * wa; a.y += dy * k * wa; a.z += dz * k * wa; b.x -= dx * k * wb; b.y -= dy * k * wb; b.z -= dz * k * wb; }
        if (holdK > 0) for (let l = 0; l < 2; l++) { const a = P[R.pelvis], b = P[R.anL + l], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6; if (d < this.hold[l]) { const k = (d - this.hold[l]) / d * holdK * 0.8; a.x += dx * k; a.y += dy * k; a.z += dz * k; } }
        // knees only bend forward
        const fx = _v1.subVectors(P[R.hipL], P[R.hipR]), fy = _v2.subVectors(P[R.chest], P[R.pelvis]), fw = _v3.copy(fx).cross(fy).normalize();
        for (let l = 0; l < 2; l++) { const hp = P[R.hipL + l], kn = P[R.knL + l], an = P[R.anL + l]; const kd = (kn.x - (hp.x + an.x) / 2) * fw.x + (kn.y - (hp.y + an.y) / 2) * fw.y + (kn.z - (hp.z + an.z) / 2) * fw.z; if (kd < 0.015) { const k = (0.015 - kd) * 0.5; kn.addScaledVector(fw, k); hp.addScaledVector(fw, -k * 0.3); an.addScaledVector(fw, -k * 0.5); } }
        for (let i = 0; i < 18; i++) { const p = P[i], r = this.rad[i];
          if (p.y < r) { p.y = r; const q = Q[i], fr = 0.22; q.x += (p.x - q.x) * fr; q.z += (p.z - q.z) * fr; if (q.y < p.y) q.y += (p.y - q.y) * 0.6; }
          for (let w = 0; w < 8; w++) { const a = w * PI / 4, nx = Math.cos(a), nz = Math.sin(a), pen = p.x * nx + p.z * nz - (ARENA.R - r - 0.03); if (pen > 0) { p.x -= nx * pen; p.z -= nz * pen; } }
          if (opp && !opp.down) { const ox = p.x - opp.pos.x, oz = p.z - opp.pos.z, od = Math.hypot(ox, oz), rr = 0.24 + r; if (od < rr && p.y < 1.5) { const k = (rr - od) / (od || 1) * 0.5; p.x += ox * k; p.z += oz * k; } }
        }
      }
    }
  }
  faceUp() { const P = this.p, R = RAG; const x = _v1.subVectors(P[R.shL], P[R.shR]), y = _v2.subVectors(P[R.chest], P[R.pelvis]); return x.cross(y).y * this.f.anim.side > 0; }
  headDir(out) { return out.subVectors(this.p[RAG.head], this.p[RAG.pelvis]).setY(0).normalize(); }
  /** particles → bone rotations in the model's local space (written into the rig buffers) */
  solve() {
    const g = this.f.model.group, rig = this.rig, Q = rig.Q, R = RAG, L = this.lp, fr = this.frame, q = Ragdoll._q;
    g.updateMatrix(); g.matrixWorld.copy(g.matrix); this.inv.copy(g.matrixWorld).invert(); for (let i = 0; i < 18; i++) L[i].copy(this.p[i]).applyMatrix4(this.inv);
    fr(_v4.subVectors(L[R.hipL], L[R.hipR]), Ragdoll._a.subVectors(L[R.chest], L[R.pelvis]), Q[BN.hips]).multiply(this.bq.hips);
    fr(_v4.subVectors(L[R.shL], L[R.shR]), Ragdoll._a.subVectors(L[R.neck], L[R.chest]), Q[BN.chest]).multiply(this.bq.chest);
    Q[BN.spine].copy(Q[BN.hips]).slerp(Q[BN.chest], 0.5);
    const cx = Ragdoll._b.set(1, 0, 0).applyQuaternion(Q[BN.chest]), hy = Ragdoll._a.subVectors(L[R.head], L[R.neck]).normalize(); cx.addScaledVector(hy, -cx.dot(hy)).normalize();
    fr(cx, hy, Q[BN.head]).multiply(this.bq.head); Q[BN.neck].copy(Q[BN.chest]).slerp(Q[BN.head], 0.5); Q[BN.clavL].copy(Q[BN.chest]); Q[BN.clavR].copy(Q[BN.chest]);
    for (let i = 0; i < 2; i++) { const lft = i === 0, u = Rig._u.subVectors(L[R.elL + i], L[R.shL + i]).normalize(), f = Rig._f.subVectors(L[R.haL + i], L[R.elL + i]).normalize(), H = Rig._h.copy(u).cross(f);
      if (H.lengthSq() < 0.01) H.copy(this.hingeArm[i]).applyQuaternion(Q[BN.chest]); H.addScaledVector(u, -H.dot(u)).normalize();
      rig._frame(u, H, rig.fi[lft ? 'uaL' : 'uaR'], Q[lft ? BN.uarmL : BN.uarmR]); const H2 = Rig._pole.copy(H).addScaledVector(f, -H.dot(f)).normalize(); rig._frame(f, H2, rig.fi[lft ? 'faL' : 'faR'], Q[lft ? BN.farmL : BN.farmR]); Q[lft ? BN.handL : BN.handR].copy(Q[lft ? BN.farmL : BN.farmR]); }
    for (let i = 0; i < 2; i++) { const lft = i === 0, u = Rig._u.subVectors(L[R.knL + i], L[R.hipL + i]).normalize(), sv = Rig._f.subVectors(L[R.anL + i], L[R.knL + i]).normalize(), H = Rig._h.copy(u).cross(sv);
      if (H.lengthSq() < 0.006) H.set(1, 0, 0).applyQuaternion(Q[BN.hips]); H.addScaledVector(u, -H.dot(u)).normalize();
      rig._frame(u, H, rig.fi[lft ? 'thL' : 'thR'], Q[lft ? BN.thighL : BN.thighR]); const H2 = Rig._pole.copy(H).addScaledVector(sv, -H.dot(sv)).normalize(); rig._frame(sv, H2, rig.fi[lft ? 'snL' : 'snR'], Q[lft ? BN.shinL : BN.shinR]);
      const z = Ragdoll._a.subVectors(L[R.toL + i], L[R.anL + i]).normalize(), y = Ragdoll._b.copy(z).cross(H2).normalize(), x = _v4.copy(y).cross(z);
      Q[lft ? BN.footL : BN.footR].setFromRotationMatrix(_m1.makeBasis(x, y, z)).multiply(lft ? this.bq.footL : this.bq.footR); Q[lft ? BN.toeL : BN.toeR].copy(Q[lft ? BN.footL : BN.footR]); }
    rig.P.hips.copy(L[R.pelvis]);
  }
  applyToBones() { this.solve(); this.rig.apply(); }
  capture() { this.solve(); for (let i = 0; i < BONES.length; i++) this.capQ[i].copy(this.rig.Q[i]); this.capH.copy(this.rig.P.hips); }
  blendToRig(w) { const k = smooth(w), Q = this.rig.Q; for (let i = 0; i < BONES.length; i++) Q[i].copy(Ragdoll._q.copy(this.capQ[i]).slerp(Q[i], k)); this.rig.P.hips.lerpVectors(this.capH, this.rig.P.hips, k); this.rig.apply(); }
}
Ragdoll._q = new THREE.Quaternion(); Ragdoll._a = V3(); Ragdoll._b = V3();
