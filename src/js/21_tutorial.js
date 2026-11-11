/* ═══════════════════════════ TUTORIAL ═══════════════════════════
   The first thing a new player does is play. Nine short, hands-on steps in the cage with a
   sparring partner: move, strike, strike types, heights, guard, evade, chain, pace yourself,
   then a free exchange. One line of text per step, prompts that follow your fighter (or pulse
   the touch button), and a skip button that is always there. */
const Tutorial = {
  active: false, i: 0, count: 0, M: null, doneT: 0, el: null, fl: null, tset: null, phase: 0, moved: 0, last: V3(),
  K: a => `<kbd>${esc(Input.label(a))}</kbd>`,
  get touch() { return IS_TOUCH && !Input.kbUsed; },
  steps() { const K = this.K, T = this.touch; return [
    { id: 'move', title: 'Footwork', need: 3.2, text: T ? 'Drag anywhere on the <b>left side</b> to move around your partner.' : `Move with ${K('up')}${K('left')}${K('down')}${K('right')}. Circle your partner.`, float: T ? 'DRAG TO MOVE' : `${K('up')}${K('left')}${K('down')}${K('right')}`, partner: 'stand' },
    { id: 'jab', title: 'Quick punch', need: 3, text: T ? 'Tap <b>JAB</b>. Your fastest strike — land three.' : `Press ${K('qp_mid')} to jab. Your fastest strike — land three.`, float: T ? 'TAP JAB' : K('qp_mid'), btn: ['.b-qp'], partner: 'stand', range: 1 },
    { id: 'types', title: 'Power and kicks', need: 3, text: T ? 'Now <b>POWER</b> punch, <b>KICK</b> and <b>POWER</b> kick. Heavier means slower. Land one of each.' : `${K('pp_mid')} power punch · ${K('qk_mid')} quick kick · ${K('pk_mid')} power kick. Heavier means slower. Land one of each.`, float: T ? 'POWER · KICK · POWER KICK' : `${K('pp_mid')} ${K('qk_mid')} ${K('pk_mid')}`, btn: ['.b-pp', '.b-qk', '.b-pk'], partner: 'stand', range: 1 },
    { id: 'levels', title: 'High and low', need: 2, text: T ? '<b>Flick up</b> on a button to strike high, <b>flick down</b> to go low. Land one of each.' : `The row above strikes <b>high</b>, the row below <b>low</b>: try ${K('qp_high')} and ${K('qp_low')}. Land one of each.`, float: T ? 'FLICK ▲ / ▼' : `${K('qp_high')} high · ${K('qp_low')} low`, btn: ['.b-qp', '.b-pk'], partner: 'stand', range: 1, grid: 1 },
    { id: 'guard', title: 'Guard', need: 3, text: T ? 'Hold <b>GUARD</b> to block — push the stick up or down for a high or low guard. Block three strikes.' : `Hold ${K('guard')} to block — add ${K('up')} or ${K('down')} for a high or low guard. Block three strikes.`, float: T ? 'HOLD GUARD' : `hold ${K('guard')}`, btn: ['.b-guard'], partner: 'feed', feed: ['jab', 'cross', 'jab', 'hookL'], slow: 1.35 },
    { id: 'evade', title: 'Evade', need: 2, text: T ? 'Tap <b>EVADE</b> with a direction just before a strike lands: back to sway, sideways to slip. Evade two.' : `Tap ${K('evade')} with a direction just before a strike lands: back to sway, sideways to slip. Evade two.`, float: T ? 'EVADE' : `${K('evade')} + direction`, btn: ['.b-ev'], partner: 'feed', feed: ['cross'], slow: 1.9, cue: 1 },
    { id: 'combo', title: 'Combinations', need: 1, text: T ? 'Different limbs chain together: <b>JAB → POWER → flick-up JAB</b>. Land a three-hit combination.' : `Different limbs chain together: ${K('qp_mid')} → ${K('pp_mid')} → ${K('qp_high')}. Land a three-hit combination.`, float: T ? 'JAB → POWER → ▲JAB' : `${K('qp_mid')} → ${K('pp_mid')} → ${K('qp_high')}`, btn: ['.b-qp', '.b-pp'], partner: 'stand', range: 1 },
    { id: 'stamina', title: 'Stamina', need: 2, text: 'Every action spends the <b>gold bar</b>. Empty it and you get slow and weak. Throw strikes until it is half gone…', text2: '…now back off and breathe until it refills. Pace yourself.', float: 'WATCH THE GOLD BAR', partner: 'stand', range: 1, real: 1 },
    { id: 'spar', title: 'Open sparring', need: 5, text: 'Your partner fights back now. Land five clean strikes.', float: '', partner: 'spar' } ]; },
  start(M) {
    this.M = M; this.active = true; this.tset = this.steps(); this.i = -1; const t = UI.el.tut; t.classList.remove('hide'); t.innerHTML = `<div class="tcard"><button class="tskip">${this.touch ? 'Skip' : 'Skip <kbd>T</kbd>'}</button><div class="k"></div><h4></h4><p></p><div class="tprog"></div></div><div class="tfloat"></div>`; t.querySelector('.tskip').onclick = () => this.finish(true);
    this.el = t.querySelector('.tcard'); this.fl = t.querySelector('.tfloat'); this.h = [['hit', e => this.onHit(e)], ['evaded', e => this.onEvade(e)], ['skip', () => this.active && this.finish(true)]].map(([n, f]) => [n, Bus.on(n, f)]);
    this.next();
  },
  stop() { if (!this.active && !this.h) return; this.active = false; UI.el.tut.classList.add('hide'); UI.el.tut.innerHTML = ''; UI.skipBtn(null); for (const [n, f] of this.h || []) Bus.off(n, f); this.h = null; document.querySelectorAll('.tc-b.pulse').forEach(b => b.classList.remove('pulse')); },
  next() {
    this.i++; if (this.i >= this.tset.length) { this.finish(false); return; } const s = this.tset[this.i], M = this.M, [me, pa] = M.f, ai = pa.ctrl;
    this.count = 0; this.phase = 0; this.doneT = 0; this.seen = {}; this.last.copy(me.pos); this.cueT = 0;
    ai.passive = s.partner !== 'spar'; ai.passiveGuard = null; ai.script = s.partner === 'feed' ? (a, dt) => this.feed(a, dt, s) : s.partner === 'stand' && s.range ? (a, dt) => this.hold(a, dt) : null; ai.feedT = 1.2; ai.feedI = 0; pa.k.time = pa.k.time0 * (s.slow || 1);
    M.rules.infSt = !s.real; M.rules.noRegen = false; if (s.real) { me.st = me.stCap = 100; }
    this.el.querySelector('.k').textContent = `Tutorial · ${this.i + 1} of ${this.tset.length}`; this.el.querySelector('h4').textContent = s.title; this.el.querySelector('p').innerHTML = s.text + (s.grid && !this.touch ? this.gridHtml() : '');
    this.el.querySelector('.tprog').innerHTML = Array.from({ length: Math.ceil(s.need) }, () => '<i></i>').join(''); this.fl.innerHTML = s.float; this.fl.style.opacity = s.float ? 1 : 0;
    document.querySelectorAll('.tc-b.pulse').forEach(b => b.classList.remove('pulse')); for (const b of s.btn || []) { const e = document.querySelector(b); e && e.classList.add('pulse'); }
  },
  gridHtml() { const r = lv => ['qp', 'pp', 'qk', 'pk'].map(c => `<kbd class="${lv !== 'mid' ? 'hi' : ''}">${esc(Input.label(c + '_' + lv))}</kbd>`).join(''); return `<br><span class="tgrid">${r('high')}${r('mid')}${r('low')}<span>jab</span><span>power</span><span>kick</span><span>p.kick</span></span>`; },
  /** partner keeps a comfortable range so strikes can land */
  hold(a, dt) { const f = a.f, o = f.opp, dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1, want = 0.92; if (d > want + 0.5) f.wish.set(dx / d * 0.5, 0, dz / d * 0.5); else if (ARENA.wallDist(f.pos) < 0.7) f.wish.set(-f.pos.x * 0.2, 0, -f.pos.z * 0.2); },
  /** partner walks into range and throws a telegraphed strike every couple of seconds */
  feed(a, dt, s) { const f = a.f, o = f.opp, dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1, m = MOVES[s.feed[a.feedI % s.feed.length]], r = f.rangeOf(m) * 0.93;
    if (d > r) f.wish.set(dx / d * 0.75, 0, dz / d * 0.75); else if (d < r - 0.35) f.wish.set(-dx / d * 0.4, 0, -dz / d * 0.4);
    a.feedT -= dt; if (a.feedT <= 0 && f.free && d <= r + 0.05 && o.state !== 'hit') { f.pressMove(m.id); a.feedI++; a.feedT = 1.9 + rand() * 0.5; } },
  bump(n = 1) { const s = this.tset[this.i]; if (this.doneT > 0) return; this.count = Math.min(s.need, this.count + n); Sfx.ui('good'); },
  onHit(e) { if (!this.active || this.doneT > 0) return; const s = this.tset[this.i], me = this.M.f[0];
    if (e.att === me && e.clean) {
      if (s.id === 'jab' && e.m.id === 'jab') this.bump(); else if (s.id === 'jab') this.bump();
      else if (s.id === 'types') { const k = e.m.limb[1] === 'f' ? (e.m.heavy > 1 || e.m.limb[0] === 'r' ? 'pk' : 'qk') : (e.m.limb[0] === 'r' ? 'pp' : null); if (k && !this.seen[k]) { this.seen[k] = 1; this.bump(); } }
      else if (s.id === 'levels') { const k = me.atkLvl; if ((k === 'high' || k === 'low') && !this.seen[k]) { this.seen[k] = 1; this.bump(); } }
      else if (s.id === 'combo' && e.hits >= 3) this.bump(); else if (s.id === 'spar') this.bump();
    } else if (e.def === me && s.id === 'guard' && (e.type === 'blocked' || e.type === 'check')) this.bump();
  },
  onEvade(e) { if (this.active && this.tset[this.i].id === 'evade' && e.f === this.M.f[0]) this.bump(); },
  update(dt) {
    if (!this.active) return; const s = this.tset[this.i], M = this.M, me = M.f[0], pa = M.f[1];
    if (s.id === 'move') { const d = me.pos.distanceTo(this.last); this.last.copy(me.pos); if (this.doneT <= 0) this.count = Math.min(s.need, this.count + d); }
    if (s.id === 'stamina' && this.doneT <= 0) { if (this.phase === 0 && me.st < 55) { this.phase = 1; this.count = 1; this.el.querySelector('p').innerHTML = s.text2; Sfx.ui('good'); } else if (this.phase === 1 && me.st > 86) this.count = 2; }
    // floating prompt follows the player; on the evade step it calls the moment
    let fl = s.float; if (s.cue) { const inc = pa.state === 'attack' && !pa.hitDone, left = inc ? pa.ph[0] - pa.stateT : 9; fl = inc && left < 0.26 ? '<b style="color:#e8c987">NOW</b>' : s.float; }
    if (s.range && s.id !== 'stamina') { const d = me.pos.distanceTo(pa.pos); if (d > 1.25) fl = 'STEP CLOSER'; }
    if (fl !== this.flNow) { this.fl.innerHTML = fl; this.flNow = fl; this.fl.style.opacity = fl ? 1 : 0; }
    me.anim.pt('chest', _v1); _v1.addScaledVector(Cam.right, -0.42); Cam.toScreen(_v1, _v2); this.fl.style.left = Math.max(this.fl.offsetWidth + 8, _v2.x) + 'px'; this.fl.style.top = clamp(_v2.y, Gfx.viewport.h * 0.24, Gfx.viewport.h * 0.72) + 'px';
    const pr = this.el.querySelectorAll('.tprog i'), n = Math.floor(this.count + 1e-3); pr.forEach((e, k) => e.classList.toggle('on', k < n || (s.id === 'move' && k < Math.ceil(this.count))));
    if (this.count >= s.need - 1e-3) { if (this.doneT <= 0) { this.doneT = 0.001; this.el.classList.remove('done'); void this.el.offsetWidth; this.el.classList.add('done'); } this.doneT += dt; if (this.doneT > 0.85) this.next(); }
  },
  finish(skipped) { if (!this.active) return; const pa = this.M.f[1]; pa.k.time = pa.k.time0; this.stop(); Game.endTutorial(skipped); }
};
