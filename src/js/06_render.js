/* ═══════════════════════════ RENDERER + POST ═══════════════════════════
   Scene → MSAA HDR target → soft bloom → grade / filmic curve / vignette / paper grain.
   Impact feedback (radial smear, colour fringe, flash) lives in the final pass. */
const Gfx = {
  q: null, fx: { radial: 0, chroma: 0, desat: 0, flash: 0, fade: 1, letter: 0, exposure: 1.0, bloom: 0.55, vig: 0.42, tint: null, center: null },
  scale: 1, frames: 0, slow: 0, fpsAvg: 60,
  init() {
    const canvas = document.getElementById('gl');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace; r.toneMapping = THREE.NoToneMapping; r.setClearColor(0x050506, 1);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = true; r.info.autoReset = false;
    const pref = QS.get('q') || Store.data.quality;
    const tier = pref !== 'auto' ? pref : (IS_MOBILE ? 'medium' : 'high');
    this.setQuality(tier, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.08, 220);
    this.fx.tint = new THREE.Vector3(1, 1, 1); this.fx.center = new THREE.Vector2(0.5, 0.5);
    // shared light rig uniforms (every illustrated material references these objects)
    this.L = { uKeyDir: { value: V3(0.3, 0.85, 0.42).normalize() }, uKeyCol: { value: new THREE.Color(1.5, 1.34, 1.1) }, uFillDir: { value: V3(-0.6, 0.2, 0.5).normalize() }, uFillCol: { value: new THREE.Color(0.10, 0.13, 0.2) },
      uRimDir: { value: V3(-0.4, 0.35, -0.85).normalize() }, uRimCol: { value: new THREE.Color(0.75, 0.9, 1.25) }, uAmbTop: { value: new THREE.Color(0.52, 0.5, 0.56) }, uAmbBot: { value: new THREE.Color(0.3, 0.27, 0.3) },
      uTime: { value: 0 }, uShadowAmt: { value: 0.75 }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: 1000 } };
    this.sun = new THREE.DirectionalLight(0xffffff, 1); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -6.2; sc.right = 6.2; sc.top = 6.2; sc.bottom = -6.2; sc.near = 1; sc.far = 30;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.018; this.sun.shadow.radius = 2.5;
    this.sun.position.set(2.2, 14, 3.2); this.scene.add(this.sun, this.sun.target);
    // fullscreen triangle + passes
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.fsMesh = new THREE.Mesh(tri, null); this.fsMesh.frustumCulled = false; this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsMesh); this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: GLSL.fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mPre = pass(GLSL.bloomPre, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } });
    this.mDown = pass(GLSL.bloomDown, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = pass(GLSL.bloomUp, { tMap: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.mFinal = pass(GLSL.final, { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uCenter: { value: this.fx.center }, uBloom: { value: 0.5 }, uExposure: { value: 1 }, uVig: { value: 0.4 }, uGrain: { value: 0.035 },
      uTime: this.L.uTime, uChroma: { value: 0 }, uRadial: { value: 0 }, uDesat: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uLetter: { value: 0 }, uTint: { value: this.fx.tint } });
    this.resize(); addEventListener('resize', () => this.resize()); if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    return this;
  },
  setQuality(tier, rebuild = true) {
    const T = { high: { dpr: 2, msaa: 4, shadow: 2048, bloom: 5, crowd: 1 }, medium: { dpr: 1.5, msaa: 4, shadow: 1536, bloom: 4, crowd: 0.7 }, low: { dpr: 1, msaa: 0, shadow: 1024, bloom: 3, crowd: 0.45 } };
    this.tier = T[tier] ? tier : 'high'; this.q = T[this.tier];
    if (this.sun) { this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    if (rebuild) this.resize();
  },
  viewport: { x: 0, y: 0, w: 1, h: 1 },      // CSS-pixel rectangle the game view occupies (portrait phones use the top part)
  resize() {
    const W = Math.max(2, innerWidth), Hh = Math.max(2, innerHeight);
    const portrait = IS_TOUCH && Hh > W * 1.15, vh = portrait ? Math.round(Hh * 0.56) : Hh;
    this.viewport = { x: 0, y: 0, w: W, h: vh, portrait };
    document.body.classList.toggle('portrait', !!portrait);
    const canvas = this.renderer.domElement; canvas.style.height = vh + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr) * this.scale;
    this.renderer.setPixelRatio(1); this.renderer.setSize(Math.round(W * dpr), Math.round(vh * dpr), false);
    const w = Math.round(W * dpr), h = Math.round(vh * dpr); this.w = w; this.h = h;
    if (this.rtScene) { this.rtScene.dispose(); this.rtB.forEach(t => t.dispose()); this.rtU.forEach(t => t.dispose()); }
    const ft = THREE.HalfFloatType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: ft, samples: this.q.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtB = []; this.rtU = []; let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < this.q.bloom; i++) { const o = { type: ft, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }; this.rtB.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), o)); this.rtU.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), o)); bw >>= 1; bh >>= 1; }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.L.uRes.value.set(w, h); this.mFinal.uniforms.uRes.value.set(w, h);
    Bus.emit('resize', this.viewport);
  },
  blit(mat, target) { this.fsMesh.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.fsScene, this.fsCam); },
  render(dt) {
    const r = this.renderer, fx = this.fx; r.info.reset();
    this.L.uTime.value += dt;
    this.L.uProj.value = this.h / (2 * Math.tan(this.camera.fov * DEG / 2));
    r.setRenderTarget(this.rtScene); r.clear(); r.render(this.scene, this.camera);
    this.stats = { calls: r.info.render.calls, tris: r.info.render.triangles };
    // bloom chain
    const B = this.rtB, U = this.rtU, n = B.length;
    this.mPre.uniforms.tMap.value = this.rtScene.texture; this.mPre.uniforms.uTexel.value.set(1 / this.w, 1 / this.h); this.blit(this.mPre, B[0]);
    for (let i = 1; i < n; i++) { this.mDown.uniforms.tMap.value = B[i - 1].texture; this.mDown.uniforms.uTexel.value.set(1 / B[i - 1].width, 1 / B[i - 1].height); this.blit(this.mDown, B[i]); }
    let src = B[n - 1];
    for (let i = n - 2; i >= 0; i--) { this.mUp.uniforms.tMap.value = src.texture; this.mUp.uniforms.tAdd.value = B[i].texture; this.mUp.uniforms.uTexel.value.set(1.5 / src.width, 1.5 / src.height); this.mUp.uniforms.uMix.value = 1.0; this.blit(this.mUp, U[i]); src = U[i]; }
    const u = this.mFinal.uniforms; u.tScene.value = this.rtScene.texture; u.tBloom.value = src.texture; u.uBloom.value = fx.bloom / n * 1.6; u.uExposure.value = fx.exposure; u.uVig.value = fx.vig;
    u.uChroma.value = fx.chroma; u.uRadial.value = fx.radial; u.uDesat.value = fx.desat; u.uFade.value = fx.fade; u.uFlash.value = fx.flash; u.uLetter.value = fx.letter;
    this.blit(this.mFinal, null);
    // decay transient impact effects
    fx.radial = damp(fx.radial, 0, 9, dt); fx.chroma = damp(fx.chroma, 0, 8, dt); fx.flash = damp(fx.flash, 0, 12, dt);
    // adaptive resolution governor: hold frame rate on weaker GPUs
    this.fpsAvg = lerp(this.fpsAvg, 1 / Math.max(dt, 1e-3), 0.04); this.frames++;
    if (!QS.has('noadapt') && this.frames > 180 && this.frames % 90 === 0) {
      if (this.fpsAvg < 44 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.1); this.resize(); }
      else if (this.fpsAvg > 58 && this.scale < 1 && ++this.slow > 6) { this.slow = 0; this.scale = Math.min(1, this.scale + 0.1); this.resize(); }
    }
  },
  /** render the current scene with a given camera into a canvas (used for fighter portraits) */
  snapshot(camera, w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true, type: THREE.HalfFloatType });
    const r = this.renderer, old = r.getRenderTarget();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, camera);
    const px = new Uint16Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px); r.setRenderTarget(old); r.setClearColor(0x050506, 1); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), hf = THREE.DataUtils.fromHalfFloat;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, a = clamp01(hf(px[s + 3]));
      for (let c = 0; c < 3; c++) { let v = hf(px[s + c]) / Math.max(a, 1e-3); v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); img.data[d + c] = Math.pow(clamp01(v), 1 / 2.2) * 255; } img.data[d + 3] = a * 255; }
    ctx.putImageData(img, 0, 0); return cv;
  }
};
