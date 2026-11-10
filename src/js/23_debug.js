/* ═══════════════════════════ DEBUG VIEWS (?view=model|clip|arena) ═══════════════════════════ */
function debugView() {
  const def = ROSTER.find(r => r.id === (QS.get('f') || 'vale')) || ROSTER[0];
  const t0 = performance.now(); const fm = new FighterModel(def); IA.fm = fm; IA.buildMs = performance.now() - t0;
  Gfx.scene.add(fm.group);
  const an = IA.an = new Animator(fm, def.style);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.ShadowMaterial({ opacity: 0.5 })); floor.rotation.x = -PI / 2; floor.receiveShadow = true; Gfx.scene.add(floor);
  const bg = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshBasicMaterial({ color: 0x3a3c42 })); bg.rotation.x = -PI / 2; bg.position.y = -0.002; Gfx.scene.add(bg);
  const dummy = new THREE.Group(); const dm = new THREE.MeshBasicMaterial({ color: 0x6a7388, transparent: true, opacity: 0.45 });
  const dh = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), dm), dbody = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 12), dm), dl = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 6, 12), dm);
  dummy.add(dh, dbody, dl); dummy.visible = false; Gfx.scene.add(dummy);
  Gfx.renderer.setClearColor(0x24262b, 1);
  const cell = (cv, c, i, cols, cw, ch, v) => { Gfx.camera.fov = v.fov || 30; Gfx.camera.aspect = cw / ch; Gfx.camera.updateProjectionMatrix(); Gfx.camera.position.set(...v.pos); Gfx.camera.lookAt(...v.at);
    Gfx.render(0); c.drawImage(Gfx.renderer.domElement, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); };
  const sheetCv = (w, h) => { let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:50'; document.body.appendChild(cv); } cv.width = w; cv.height = h; return cv; };
  IA.dbg.sheet = (views, cols, cw, ch, posed) => {
    const cv = sheetCv(cols * cw, Math.ceil(views.length / cols) * ch), c = cv.getContext('2d');
    if (posed) for (let i = 0; i < 60; i++) an.update(1 / 60);
    views.forEach((v, i) => { if (posed) { an.yaw = v.rot || 0; an.placeFeet(); an.update(0.001); } else fm.group.rotation.y = v.rot || 0; cell(cv, c, i, cols, cw, ch, v); });
  };
  /** filmstrip of a clip at the given phase times */
  IA.dbg.film = (name, tps, o = {}) => {
    const D = o.dist || 0.98, s = fm.sk.s, tgt = { head: [0, 1.6 * s, D], body: [0, 1.14 * s, D], leg: [0.1, 0.52 * s, D - 0.05], calf: [0.1, 0.3 * s, D - 0.05] }[o.aim || 'head'];
    dummy.visible = true; dh.position.set(0, 1.6 * s, D + 0.1); dbody.position.set(0, 1.15 * s, D + 0.14); dl.position.set(0.1, 0.45 * s, D + 0.02);
    an.root.set(0, 0, 0); an.yaw = 0; an.vel.set(0, 0, 0); an.stop(0); an.placeFeet(); an.resetSprings();
    for (const k of ['lh', 'rh', 'lf', 'rf']) an.aimW[k].set(...tgt); an.aimW.look.set(0, 1.6 * s, D);
    for (let i = 0; i < 90; i++) an.update(1 / 60);
    const views = o.views || [{ pos: [-4.6, 1.25, 0.4], at: [0, 1.0, 0.4], fov: 26 }], cw = o.cw || 250, ch = o.ch || 400;
    const cv = sheetCv(tps.length * cw, views.length * ch), c = cv.getContext('2d'); let started = false;
    tps.forEach((tp, i) => {
      if (tp >= 0 && !started) { an.play(name, { phases: o.phases || [0.2, 0.08, 0.3], dur: o.dur }); started = true; }
      let guard = 0; while (started && an.layer.clip && an.layer.tp < tp && guard++ < 2000) an.update(1 / 240);
      if (!an.layer.clip && started) for (let k = 0; k < 30; k++) an.update(1 / 60);
      an.update(1e-5);
      views.forEach((v, j) => cell(cv, c, i + j * tps.length, tps.length, cw, ch, v));
    });
  };
  if (QS.get('view') === 'arena') {
    floor.visible = bg.visible = false; Gfx.renderer.setClearColor(0x050506, 1); Arena.build();
    const fm2 = new FighterModel({ ...def, id: 'b' }); Gfx.scene.add(fm2.group); const an2 = IA.an2 = new Animator(fm2, def.style);
    an.root.set(-0.75, 0, 0); an.yaw = PI / 2; an.placeFeet(); an2.root.set(0.75, 0, 0); an2.yaw = -PI / 2; an2.placeFeet();
    an.aimW.look.set(0.75, 1.6, 0); an2.aimW.look.set(-0.75, 1.6, 0);
    IA.dbg.arena = (pos, at, fov, t = 1, mood) => { if (mood) Arena.setMood(mood, true); Gfx.camera.fov = fov || 36; Gfx.camera.aspect = innerWidth / innerHeight; Gfx.camera.updateProjectionMatrix(); Gfx.camera.position.set(...pos); Gfx.camera.lookAt(...at);
      for (let i = 0; i < Math.round(t * 60); i++) { an.update(1 / 60); an2.update(1 / 60); Arena.update(1 / 60, Gfx.camera); Gfx.L.uTime.value += 1 / 60; }
      for (let i = 0; i < 2; i++) { const a = i ? an2 : an; a.pt('ballL', _v1); Arena.blob(i * 2, _v1.x, _v1.z, 0.16, 0.5); a.pt('ballR', _v1); Arena.blob(i * 2 + 1, _v1.x, _v1.z, 0.16, 0.5); }
      Gfx.render(0); return Gfx.stats; };
  }
  IA.ready = true;
}
