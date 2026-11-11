/* ═══════════════════════════ CAMERA ═══════════════════════════
   Broadcast side-on framing that orbits with the fighters so the player always stays screen-left,
   zooms with the gap, takes small directional knocks on impact, and hands over to scripted shots
   for introductions, knockouts and replays. */
const Cam = {
  pos: V3(0, 1.5, 6), tgt: V3(0, 1.05, 0), fov: 34, yaw: 0, dist: 5, mode: 'fight', right: V3(1, 0, 0), fwd: V3(0, 0, -1), kickV: V3(), kickP: V3(), roll: 0, rollV: 0, fovKick: 0, shot: null, t: 0, focus: null, orbit: 0,
  init() { this.cam = Gfx.camera; },
  snap(M) { this.update(1, M, true); },
  /** scripted shot: from/to {pos,tgt,fov} in world, or a function(u) → {pos,tgt,fov} */
  play(shot) { this.shot = { t: 0, ...shot }; this.mode = 'shot'; },
  kick(dir, mag) { this.kickV.addScaledVector(dir, mag * 2.2); this.rollV += (rand() - 0.5) * mag * 1.4; this.fovKick = Math.max(this.fovKick, mag * 2.6); },
  update(dt, M, snap) {
    this.t += dt; const cam = this.cam, asp = cam.aspect, wide = Math.max(1, 1.62 / asp);
    let P = _v1, T = _v2, fov = this.fov;
    if (this.mode === 'shot' && this.shot) {
      const s = this.shot; s.t += dt; const u = clamp01(s.t / s.dur), e = (s.ease || Ease.io)(u);
      if (s.fn) { const r = s.fn(e, s.t); P.copy(r.pos); T.copy(r.tgt); fov = r.fov || 34; } else { P.lerpVectors(s.from.pos, s.to.pos, e); T.lerpVectors(s.from.tgt, s.to.tgt, e); fov = lerp(s.from.fov || 34, s.to.fov || 34, e); }
      if (asp < 1.2) { P.sub(T).multiplyScalar(1 + (1.2 - asp) * 0.8).add(T); }
      this.pos.copy(P); this.tgt.copy(T); this.fovNow = fov; if (u >= 1 && s.then) { const f = s.then; s.then = null; f(); }
    } else if (M && M.f) {
      const a = M.f[0], b = M.f[1], ax = b.pos.x - a.pos.x, az = b.pos.z - a.pos.z, sep = Math.hypot(ax, az) || 1e-3;
      // perpendicular to the fight line, on the side that keeps fighter 0 on the left
      const want = Math.atan2(-az, ax);                                // camera offset direction (sin, cos)
      this.yaw = snap ? want : dampAng(this.yaw, want, 2.6, dt);
      const ha = a.down ? 0.45 : 1.05, hb = b.down ? 0.45 : 1.05, hy = (ha * a.sk.s + hb * b.sk.s) / 2;
      const focus = this.mode === 'ko' && this.focus ? this.focus : null;
      const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
      let d = clamp(3.0 + sep * 1.3, 4.15, 6.8) * wide, h = 1.36 + (d / wide - 4.15) * 0.14, ty = hy - 0.03;
      if (focus) { T.set(lerp(mx, focus.pos.x, 0.55), focus.down ? 0.74 : 1.02, lerp(mz, focus.pos.z, 0.55)); d = Math.max(4.2, d * 0.92) * wide; h = 1.22; this.yaw += dt * 0.1; }   // stay side-on so the fallen fighter and the one standing both read
      else T.set(mx, ty, mz);
      const ox = Math.sin(this.yaw), oz = Math.cos(this.yaw);
      P.set(T.x + ox * d, h, T.z + oz * d);
      const k = snap ? 1 : 1 - Math.exp(-dt * 5.5); this.pos.lerp(P, k); this.tgt.lerp(T, snap ? 1 : 1 - Math.exp(-dt * 7)); this.fovNow = damp(this.fovNow || 34, focus ? 30 : 34, 4, dt);
    }
    // impact response: a short spring, never a rumble
    this.kickV.addScaledVector(this.kickP, -180 * dt).multiplyScalar(Math.exp(-dt * 16)); this.kickP.addScaledVector(this.kickV, dt);
    this.rollV += -this.roll * 260 * dt; this.rollV *= Math.exp(-dt * 14); this.roll += this.rollV * dt; this.fovKick = damp(this.fovKick, 0, 9, dt);
    cam.position.copy(this.pos).add(this.kickP); cam.fov = (this.fovNow || 34) - this.fovKick; cam.updateProjectionMatrix(); cam.up.set(Math.sin(this.roll * 0.02), 1, 0); cam.lookAt(this.tgt.x + this.kickP.x * 0.5, this.tgt.y + this.kickP.y * 0.5, this.tgt.z + this.kickP.z * 0.5);
    // screen-space basis for player movement
    this.fwd.set(this.tgt.x - this.pos.x, 0, this.tgt.z - this.pos.z).normalize(); this.right.set(-this.fwd.z, 0, this.fwd.x);
  },
  /** project a world point to CSS pixels inside the game viewport */
  toScreen(p, out) { _v4.copy(p).project(this.cam); out.x = (_v4.x * 0.5 + 0.5) * Gfx.viewport.w; out.y = (1 - (_v4.y * 0.5 + 0.5)) * Gfx.viewport.h; out.z = _v4.z; return out; }
};

/* ═══════════════════════════ IMPACT EFFECTS ═══════════════════════════ */
GLSL.burstFrag = /* glsl */`uniform vec3 uCol; uniform float uT, uSeed, uKind; varying vec2 vUv;
${GLSL.noise}
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
  float rays = pow(abs(sin(a * (5.0 + uKind * 2.0) + uSeed * 6.0)), 6.0) * (0.6 + 0.4 * vnoise(vec2(a * 9.0, uSeed)));
  float front = uT * 1.25, band = smoothstep(front - 0.5, front - 0.08, r) * (1.0 - smoothstep(front - 0.04, front + 0.02, r));
  float core = (1.0 - smoothstep(0.0, 0.34 * (1.0 - uT), r)) * (1.0 - uT);
  float ring = (1.0 - smoothstep(0.0, 0.05, abs(r - front * 0.8))) * (1.0 - uT) * (0.4 + 0.6 * uKind);
  float v = band * rays * (1.0 - uT) * 1.6 + core * 1.5 + ring;
  if (v < 0.004) discard; gl_FragColor = vec4(uCol * v, 1.0); }`;
const Vfx = {
  init() {
    const G = this.group = new THREE.Group(); Gfx.scene.add(G);
    const quad = new THREE.PlaneGeometry(1, 1); this.bursts = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: GLSL.burstFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      uniforms: { uCol: { value: new THREE.Color() }, uT: { value: 1 }, uSeed: { value: 0 }, uKind: { value: 0 } } })); m.visible = false; m.renderOrder = 20; m.frustumCulled = false; G.add(m); this.bursts.push({ m, t: 1, dur: 0.2 }); }
    // droplets / dust: CPU particles in one Points
    const N = this.N = 220; this.pp = new Float32Array(N * 3); this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N); this.pc = new Float32Array(N * 3); this.pi = 0; this.ps = new Float32Array(N);
    const g = this.pgeo = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, blending: THREE.NormalBlending, depthWrite: false, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * 620.0 / -mv.z; }',
      fragmentShader: 'varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.25, r); if (a < 0.02) discard; gl_FragColor = vec4(vC, a * 0.85); }' })); this.points.frustumCulled = false; G.add(this.points);
    for (let i = 0; i < N; i++) this.pp[i * 3 + 1] = -9;
    // strike trails (one ribbon per limb per fighter)
    this.trails = [];
    return this;
  },
  burst(pos, kind, size) {
    const b = this.bursts.reduce((a, c) => c.t > a.t ? c : a); b.t = 0; b.dur = kind === 2 ? 0.26 : 0.19; b.m.visible = true; b.m.position.copy(pos); b.m.scale.setScalar(size);
    const u = b.m.material.uniforms; u.uSeed.value = rand() * 10; u.uKind.value = kind; u.uCol.value.set(kind === 1 ? '#aebfda' : kind === 2 ? '#ffd58a' : '#fff2d8').multiplyScalar(kind === 1 ? 1.1 : 2.2);
  },
  spray(pos, dir, n, col, speed = 3, size = 0.012, up = 1.2) {
    for (let k = 0; k < n; k++) { const i = this.pi = (this.pi + 1) % this.N; this.pp[i * 3] = pos.x; this.pp[i * 3 + 1] = pos.y; this.pp[i * 3 + 2] = pos.z;
      this.pv[i * 3] = (dir.x + (rand() - 0.5) * 1.1) * speed * (0.4 + rand()); this.pv[i * 3 + 1] = (dir.y + rand() * up) * speed * 0.6; this.pv[i * 3 + 2] = (dir.z + (rand() - 0.5) * 1.1) * speed * (0.4 + rand());
      this.pl[i] = 0.35 + rand() * 0.35; this.pc[i * 3] = col[0]; this.pc[i * 3 + 1] = col[1]; this.pc[i * 3 + 2] = col[2]; this.ps[i] = size * (0.6 + rand() * 0.9); }
  },
  trail(f, limb) {
    let t = this.trails.find(t => !t.live); if (!t) { if (this.trails.length >= 6) return; const n = 12, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4), 2));
      const idx = []; for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 uCol; uniform float uA; varying vec2 vUv; void main(){ float e = 1.0 - abs(vUv.y * 2.0 - 1.0); float a = e * e * (1.0 - vUv.x) * (1.0 - vUv.x) * uA; gl_FragColor = vec4(uCol * a, 1.0); }' }));
      m.frustumCulled = false; m.renderOrder = 15; this.group.add(m); t = { m, n, pts: [] }; this.trails.push(t); }
    t.live = true; t.f = f; t.limb = limb; t.pts.length = 0; t.age = 0; t.fade = 1; t.m.visible = true; t.m.material.uniforms.uCol.value.set(f.def.accent).lerp(new THREE.Color('#fff4dc'), 0.6).multiplyScalar(0.55);
  },
  update(dt, cam) {
    for (const b of this.bursts) { if (b.t >= 1) continue; b.t = Math.min(1, b.t + dt / b.dur); b.m.material.uniforms.uT.value = b.t; b.m.quaternion.copy(cam.quaternion); if (b.t >= 1) b.m.visible = false; }
    const pp = this.pp, pv = this.pv;
    for (let i = 0; i < this.N; i++) { if (this.pl[i] <= 0) continue; this.pl[i] -= dt; pv[i * 3 + 1] -= 9.8 * dt; pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
      if (pp[i * 3 + 1] < 0.01) { pp[i * 3 + 1] = 0.01; pv[i * 3] *= 0.5; pv[i * 3 + 2] *= 0.5; pv[i * 3 + 1] = 0; } if (this.pl[i] <= 0) pp[i * 3 + 1] = -9; }
    this.pgeo.attributes.position.needsUpdate = true; this.pgeo.attributes.color.needsUpdate = true; this.pgeo.attributes.size.needsUpdate = true;
    for (const t of this.trails) { if (!t.live) continue; const f = t.f, on = f.state === 'attack' && f.move && f.move.limb === t.limb && f.stateT < f.ph[0] + f.ph[1] + 0.05 && f.stateT > f.ph[0] * 0.35;
      t.fade = on ? 1 : t.fade - dt * 7; if (t.fade <= 0) { t.live = false; t.m.visible = false; continue; }
      if (on) { const p = f.anim.pt(t.limb === 'lh' ? 'fistL' : t.limb === 'rh' ? 'fistR' : t.limb === 'lf' ? 'ballL' : 'ballR', V3()); t.pts.unshift(p); if (t.pts.length > t.n) t.pts.pop(); }
      const pos = t.m.geometry.attributes.position, uv = t.m.geometry.attributes.uv, w = (t.limb[1] === 'f' ? 0.075 : 0.055) * f.sk.s;
      for (let i = 0; i < t.n; i++) { const p = t.pts[Math.min(i, t.pts.length - 1)] || _v1.set(0, -9, 0), q = t.pts[Math.min(i + 1, t.pts.length - 1)] || p;
        _v2.subVectors(p, q); _v3.subVectors(cam.position, p); _v2.cross(_v3).normalize().multiplyScalar(w * (1 - i / t.n * 0.5)); if (_v2.lengthSq() < 1e-8) _v2.set(0, w, 0);
        pos.setXYZ(i * 2, p.x + _v2.x, p.y + _v2.y, p.z + _v2.z); pos.setXYZ(i * 2 + 1, p.x - _v2.x, p.y - _v2.y, p.z - _v2.z); uv.setXY(i * 2, i / (t.n - 1), 0); uv.setXY(i * 2 + 1, i / (t.n - 1), 1); }
      pos.needsUpdate = true; uv.needsUpdate = true; t.m.material.uniforms.uA.value = t.fade * (t.pts.length > 2 ? 1 : 0); }
  }
};
