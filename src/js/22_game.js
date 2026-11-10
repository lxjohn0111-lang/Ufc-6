/* ═══════════════════════════ BOOT (temporary viewer) ═══════════════════════════ */
Gfx.init();
IA.Gfx = Gfx;
{
  const def = ROSTER.find(r => r.id === (QS.get('f') || 'vale')) || ROSTER[0];
  const t0 = performance.now(); const fm = new FighterModel(def); IA.fm = fm; IA.buildMs = performance.now() - t0;
  Gfx.scene.add(fm.group);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.ShadowMaterial({ opacity: 0.5 })); floor.rotation.x = -PI / 2; floor.receiveShadow = true; Gfx.scene.add(floor);
  const bg = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshBasicMaterial({ color: 0x3a3c42 })); bg.rotation.x = -PI / 2; bg.position.y = -0.002; Gfx.scene.add(bg);
  Gfx.renderer.setClearColor(0x24262b, 1);
  IA.dbg.sheet = (views, cols, cw, ch) => {
    let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:50'; document.body.appendChild(cv); }
    const rows = Math.ceil(views.length / cols); cv.width = cols * cw; cv.height = rows * ch; const c = cv.getContext('2d');
    views.forEach((v, i) => { fm.group.rotation.y = v.rot || 0; Gfx.camera.fov = v.fov || 30; Gfx.camera.aspect = cw / ch; Gfx.camera.updateProjectionMatrix(); Gfx.camera.position.set(...v.pos); Gfx.camera.lookAt(...v.at);
      if (v.key) Gfx.L.uKeyDir.value.set(...v.key).normalize();
      Gfx.render(0); c.drawImage(Gfx.renderer.domElement, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); });
    return [cv.width, cv.height];
  };
  IA.ready = true;
}
