/* ═══════════════════════════ INPUT ═══════════════════════════
   One strike grid on every device: four columns (quick punch, power punch, quick kick, power
   kick) × three heights. Keyboard: U I O P / J K L ; / M , . /   — touch: four buttons, tap for
   the middle height and flick up / down for the others — gamepad: face buttons + triggers.
   Bindings are stored by physical key position (event.code) and can be remapped. */
const BIND0 = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', guard: 'Space', evade: 'ShiftLeft',
  qp_high: 'KeyU', pp_high: 'KeyI', qk_high: 'KeyO', pk_high: 'KeyP', qp_mid: 'KeyJ', pp_mid: 'KeyK', qk_mid: 'KeyL', pk_mid: 'Semicolon', qp_low: 'KeyM', pp_low: 'Comma', qk_low: 'Period', pk_low: 'Slash', sig1: 'KeyH', sig2: 'KeyN', pause: 'Escape' };
const BIND_LABEL = { up: 'Move away', down: 'Move toward camera', left: 'Move left', right: 'Move right', guard: 'Guard (hold)', evade: 'Evade', qp_high: 'Quick punch · high', pp_high: 'Power punch · high', qk_high: 'Quick kick · high', pk_high: 'Power kick · high',
  qp_mid: 'Quick punch', pp_mid: 'Power punch', qk_mid: 'Quick kick', pk_mid: 'Power kick', qp_low: 'Quick punch · low', pp_low: 'Power punch · low', qk_low: 'Quick kick · low', pk_low: 'Power kick · low', sig1: 'Signature strike 1', sig2: 'Signature strike 2', pause: 'Pause' };
const Input = {
  mx: 0, my: 0, guard: false, queue: [], down: new Set(), binds: null, byCode: {}, lastAtk: null, joy: { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }, tGuard: false, pad: { prev: [] }, labels: {}, any: false, capture: null, kbUsed: false, touchUsed: false,
  init() {
    this.binds = { ...BIND0, ...(Store.data.binds || {}) }; this.index();
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { m.forEach((v, k) => this.labels[k] = v.toUpperCase()); Bus.emit('labels'); }).catch(() => {});
    addEventListener('keydown', e => this.key(e, true), { passive: false }); addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => { this.down.clear(); this.joy.on = false; this.tGuard = false; });
    const cv = document.getElementById('gl');
    cv.addEventListener('mousedown', e => { if (IS_TOUCH && this.touchUsed) return; this.any = true; Bus.emit('anykey', e); if (e.button === 0) this.push({ t: 'atk', slot: 'qp', lvl: 'mid' }); else if (e.button === 2) this.push({ t: 'atk', slot: 'pp', lvl: 'mid' }); });
    addEventListener('contextmenu', e => e.preventDefault());
    for (const ev of ['touchmove', 'gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if (!e.target.closest || !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    addEventListener('gamepadconnected', () => Bus.emit('pad', true));
  },
  index() { this.byCode = {}; for (const a in this.binds) this.byCode[this.binds[a]] = a; this.byCode.ArrowUp = 'up'; this.byCode.ArrowDown = 'down'; this.byCode.ArrowLeft = 'left'; this.byCode.ArrowRight = 'right'; if (!this.byCode.ShiftRight) this.byCode.ShiftRight = 'evade'; },
  label(action) { const c = this.binds[action]; return this.codeLabel(c); },
  codeLabel(c) { if (!c) return '—'; if (this.labels[c]) return this.labels[c]; const m = { Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Escape: 'ESC', Enter: 'ENTER', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Tab: 'TAB', ControlLeft: 'CTRL', AltLeft: 'ALT', CapsLock: 'CAPS', Backquote: '`' };
    return m[c] || c.replace(/^Key|^Digit/, '').replace(/^Arrow/, '').toUpperCase(); },
  rebind(action, code) { for (const a in this.binds) if (this.binds[a] === code && a !== action) this.binds[a] = this.binds[action]; this.binds[action] = code; Store.data.binds = this.binds; Store.save(); this.index(); },
  resetBinds() { this.binds = { ...BIND0 }; Store.data.binds = null; Store.save(); this.index(); },
  push(e) { e.at = performance.now(); if (this.queue.length > 6) this.queue.shift(); this.queue.push(e); },
  key(e, dn) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (dn && this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
    const a = this.byCode[e.code]; if (dn && !e.repeat) { this.any = true; this.kbUsed = true; Bus.emit('anykey', e); }
    if (!a) { if (dn && e.code === 'Enter') Bus.emit('confirm'); if (dn && e.code === 'KeyT') Bus.emit('skip'); if (dn && e.code === 'KeyR') Bus.emit('keyR'); return; }
    if (e.code !== 'Escape' && !e.metaKey && !e.ctrlKey) e.preventDefault();
    if (!dn) { this.down.delete(a); return; } if (e.repeat) return; this.down.add(a);
    if (a === 'pause') Bus.emit('pause'); else if (a === 'evade') this.push({ t: 'evade' }); else if (a === 'sig1' || a === 'sig2') this.push({ t: 'sig', i: a === 'sig1' ? 0 : 1 });
    else if (a.includes('_')) { const [slot, lvl] = a.split('_'), now = performance.now(), L = this.lastAtk;
      // pressing both punch (or both kick) buttons of the middle row together throws a signature strike
      if (lvl === 'mid' && L && now - L.at < 75 && L.lvl === 'mid' && L.slot !== slot && L.slot[1] === slot[1]) { const i = this.queue.indexOf(L.ev); if (i >= 0) this.queue.splice(i, 1); this.push({ t: 'sig', i: slot[1] === 'p' ? 0 : 1 }); this.lastAtk = null; }
      else { const ev = { t: 'atk', slot, lvl }; this.push(ev); this.lastAtk = { slot, lvl, at: now, ev }; } }
  },
  /** touch controls: built once, shown on touch devices */
  buildTouch(root) {
    const el = (cls, html, par = root) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html || ''; par.appendChild(d); return d; };
    const T = this.tc = el('tc'); const zone = el('tc-zone', '', T), base = el('tc-joy', '<i></i>', T), knob = base.firstChild; this.joyEl = base;
    const R = 46, J = this.joy;
    zone.addEventListener('pointerdown', e => { if (J.on) return; this.touchUsed = true; this.any = true; Bus.emit('anykey', e); J.on = true; J.id = e.pointerId; J.ox = e.clientX; J.oy = e.clientY; J.x = J.y = 0; base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('on'); knob.style.transform = ''; zone.setPointerCapture(e.pointerId); });
    const mv = e => { if (!J.on || e.pointerId !== J.id) return; let dx = e.clientX - J.ox, dy = e.clientY - J.oy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } J.x = dx / R; J.y = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
    const up = e => { if (e.pointerId !== J.id) return; J.on = false; J.x = J.y = 0; base.classList.remove('on'); };
    zone.addEventListener('pointermove', mv); zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    const pad = el('tc-pad', '', T);
    const atk = (slot, cls, name, sub) => { const b = el('tc-b ' + cls, `<em>▲</em><b>${name}</b><s>${sub}</s><em>▼</em>`, pad); let st = null;
      b.addEventListener('pointerdown', e => { e.preventDefault(); this.touchUsed = true; this.any = true; Bus.emit('anykey', e); b.setPointerCapture(e.pointerId); st = { y: e.clientY, t: performance.now(), lvl: 'mid' }; b.classList.add('on'); this.push({ t: 'atk', slot, lvl: 'mid' }); });
      b.addEventListener('pointermove', e => { if (!st || st.lvl !== 'mid') return; const dy = e.clientY - st.y; if (Math.abs(dy) > 20 && performance.now() - st.t < 260) { st.lvl = dy < 0 ? 'high' : 'low'; b.classList.add(st.lvl); this.push({ t: 'atk', slot, lvl: st.lvl, upgrade: true }); } });
      const end = () => { st = null; b.classList.remove('on', 'high', 'low'); }; b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); return b; };
    atk('pp', 'b-pp', 'POWER', 'punch'); atk('qp', 'b-qp', 'JAB', 'punch'); atk('pk', 'b-pk', 'POWER', 'kick'); atk('qk', 'b-qk', 'KICK', 'quick');
    const g = el('tc-b b-guard', '<b>GUARD</b><s>hold · ↑ high ↓ low</s>', pad); g.addEventListener('pointerdown', e => { e.preventDefault(); this.touchUsed = true; g.setPointerCapture(e.pointerId); this.tGuard = true; g.classList.add('on'); }); const gu = () => { this.tGuard = false; g.classList.remove('on'); }; g.addEventListener('pointerup', gu); g.addEventListener('pointercancel', gu);
    const tap = (cls, html, fn) => { const b = el('tc-b ' + cls, html, pad); b.addEventListener('pointerdown', e => { e.preventDefault(); this.touchUsed = true; b.classList.add('on'); fn(); setTimeout(() => b.classList.remove('on'), 120); }); return b; };
    tap('b-ev', '<b>EVADE</b><s>+ direction</s>', () => this.push({ t: 'evade' })); tap('b-s1', '<b>★</b><s>sig 1</s>', () => this.push({ t: 'sig', i: 0 })); tap('b-s2', '<b>★</b><s>sig 2</s>', () => this.push({ t: 'sig', i: 1 }));
  },
  update() {
    const D = this.down; let x = (D.has('right') ? 1 : 0) - (D.has('left') ? 1 : 0), y = (D.has('up') ? 1 : 0) - (D.has('down') ? 1 : 0); let guard = D.has('guard') || this.tGuard;
    if (this.joy.on) { x = this.joy.x; y = this.joy.y; }
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected && p.mapping === 'standard') : null;
    if (gp) { const ax = gp.axes[0], ay = gp.axes[1]; if (Math.hypot(ax, ay) > 0.22) { x = ax; y = -ay; } const B = i => gp.buttons[i] && gp.buttons[i].pressed, P = this.pad.prev, hit = i => B(i) && !P[i];
      if (B(12)) y = 1; if (B(13)) y = -1; if (B(14)) x = -1; if (B(15)) x = 1; guard = guard || B(5);
      const lvl = B(7) ? 'high' : B(6) ? 'low' : 'mid'; if (hit(2) && hit(3)) this.push({ t: 'sig', i: 0 }); else if (hit(0) && hit(1)) this.push({ t: 'sig', i: 1 }); else { if (hit(2)) this.push({ t: 'atk', slot: 'qp', lvl }); if (hit(3)) this.push({ t: 'atk', slot: 'pp', lvl }); if (hit(0)) this.push({ t: 'atk', slot: 'qk', lvl }); if (hit(1)) this.push({ t: 'atk', slot: 'pk', lvl }); }
      if (hit(4)) this.push({ t: 'evade' }); if (hit(9)) Bus.emit('pause'); if (hit(0) || hit(9)) { this.any = true; Bus.emit('anykey', {}); Bus.emit('confirm'); }
      for (let i = 0; i < 16; i++) P[i] = B(i); }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } this.mx = x; this.my = y; this.guard = guard;
  }
};
