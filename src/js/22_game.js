/* ═══════════════════════════ GAME FLOW ═══════════════════════════
   Boot → (first session) interactive tutorial → first fight; returning players land in a
   playable warm-up instead of a menu. Presentation sequences are generator coroutines driven
   by the frame loop, so they pause, skip and replay deterministically. */
const Game = {
  M: null, co: null, coWait: 0, coSkip: false, coP: null, skipReq: false, skipAll: false, cues: [], paused: false, cine: false, mode: 'boot', last: 0, t: 0, anyKey: false, pv: null, lastFight: null, sel: { me: Store.data.lastFighter || 'vale', opp: 'random' }, screenSec: -1, firstHint: true,
  run(gen) { this.co = gen; this.coWait = 0; this.coP = null; this.cues.length = 0; this.skipAll = false; this.skipReq = false; },
  cue(t, fn) { this.cues.push({ t, fn }); },
  advance(dt) {
    if (this.coP) return;
    if (this.coWait > 0) { this.coWait -= dt; if (this.skipReq && this.coSkip) { this.coWait = 0; this.skipAll = true; } if (this.coWait > 0) return; }
    for (let guard = 0; guard < 50 && this.co; guard++) { const co = this.co, r = co.next(); if (this.co !== co) return; if (r.done) { this.co = null; return; } const v = r.value;
      if (v == null) return; if (typeof v === 'number') { this.coWait = v; this.coSkip = false; return; } if (v.then) { this.coP = v; v.then(() => { if (this.co === co) this.coP = null; }, e => { console.error(e); if (this.co === co) this.coP = null; }); return; } this.coWait = v.t; this.coSkip = !!v.skip; return; }
  },
  frame(now) { const dt = clamp((now - this.last) / 1000, 0.001, 1 / 20); this.last = now; this.step(dt, true); requestAnimationFrame(t => this.frame(t)); },
  step(dt, render) {
    Input.update(); this.t += dt;
    if (!this.paused) { if (this.co) this.advance(dt); for (let i = this.cues.length - 1; i >= 0; i--) if ((this.cues[i].t -= dt) <= 0) { const c = this.cues.splice(i, 1)[0]; c.fn(); } }
    this.skipReq = false; const M = this.M; let h = dt;
    if (Replay.active) { Replay.update(dt); h = dt * 0.3; }
    else { if (M && !this.paused) { h = M.update(dt); if (this.mode === 'tutorial') Tutorial.update(dt); if (M.state === 'fight' && !M.rules.noClock) { const s = Math.ceil(M.time); if (s !== this.screenSec) { this.screenSec = s; Arena.drawScreen({ mode: 'fight', time: M.clock(), round: M.round, a: M.f[0].def.name.split(' ').pop().toUpperCase(), b: M.f[1].def.name.split(' ').pop().toUpperCase() }); } } }
      else if (this.paused) h = 0;
      if (this.pv && this.pv.anim && !M) { const p = this.pv; p.anim.update(dt); p.model.face.update(dt); p.anim.pt('ballL', _v1); Arena.blob(0, _v1.x, _v1.z, 0.15, 0.6); p.anim.pt('ballR', _v1); Arena.blob(1, _v1.x, _v1.z, 0.15, 0.6); }
      Cam.update(this.paused ? 0.0001 : dt, M); }
    Arena.update(dt, Gfx.camera); Vfx.update(h, Gfx.camera); Sfx.update(dt, this.paused ? null : M); Gfx.tick(dt); UI.tick(dt); if (M && UI.el.hud) UI.hudUpdate(M);
    if (render) Gfx.render(dt);
  },
  // ── loading ────────────────────────────────────────────────────────────
  loadPair(a, b) { return Promise.all([Models.get(a), Models.get(b, a.id === b.id)]).then(m => Promise.all([Portraits.ensure(a), Portraits.ensure(b)]).then(() => m)); },
  newMatch(o) {
    if (this.M) this.M.dispose(); Models.hideAll(); this.clearPreview(); for (let i = 0; i < 8; i++) Arena.blob(i, 0, 0, 0.2, 0);
    const M = this.M = new Match(o); for (const f of M.f) f.k.time0 = f.k.time; Replay.clear(); M.onTick = h => { if (M.mode === 'fight' && (M.state === 'fight' || M.over)) Replay.record(M, h); };
    UI.hudBind(M); UI.readout(null); UI.hint(null); this.screenSec = -1; this.paused = false; Cam.mode = 'fight'; Cam.focus = null; M.tick(1 / 60); Cam.snap(M); return M;
  },
  // ── boot ───────────────────────────────────────────────────────────────
  *bootFlow() {
    const sp = UI.splash(), first = !Store.data.tutorialDone || QS.has('tutorial'), a = fighterDef(first ? 'vale' : this.sel.me), b = fighterDef(first ? 'okafor' : 'duarte' === a.id ? 'vale' : 'duarte'); let n = 0;
    const bump = () => { sp.bar.style.transform = `scaleX(${++n / 4})`; }; Models.get(a).then(bump); Models.get(b).then(bump);
    yield this.loadPair(a, b).then(() => { n = 3; bump(); });
    sp.go.textContent = IS_TOUCH ? 'Tap to begin' : 'Press any key'; sp.go.classList.add('blink'); this.anyKey = false;
    while (!this.anyKey && !QS.has('autostart')) yield null;
    Sfx.unlock(); Sfx.ui('ok'); UI.fade(1); yield 0.32; UI.closeScreen();
    const go = QS.get('go'); if (go === 'fight') yield* this.fightFlow({ me: QS.get('p1') || 'vale', opp: QS.get('p2') || 'koval', level: +(QS.get('lvl') || 1), rounds: +(QS.get('rounds') || 3), auto: QS.has('auto') ? +(QS.get('auto') || 1) : null, quick: QS.has('quick') });
    else if (go === 'hub') yield* this.hubFlow(); else if (go === 'practice') yield* this.practiceFlow(false);
    else if (first) yield* this.tutorialFlow(); else yield* this.practiceFlow(true);
  },
  // ── tutorial → first fight ─────────────────────────────────────────────
  *tutorialFlow() {
    const a = fighterDef('vale'), b = fighterDef('okafor'); let models; UI.fade(1); yield this.loadPair(a, b).then(m => models = m);
    this.mode = 'tutorial'; UI.closeScreen(); const M = this.newMatch({ a, b, models, mode: 'tutorial', level: 0, rules: { noKO: true, noClock: true, infSt: true, rounds: 1 } });
    Arena.setMood('gym', true); Arena.drawScreen({ mode: 'text', text: 'OPEN WORKOUT', size: 130, sub: 'IRON ARENA' }); UI.hudShow(true); UI.fade(0); M.start(); Tutorial.start(M); Models.get(fighterDef('koval'));
  },
  endTutorial(skipped) { Store.data.tutorialDone = true; Store.save(); if (!skipped) { UI.stamp('Ready', 'Your first fight', 'gold', 1.2); Sfx.ui('good'); } this.run(this.firstFight(skipped)); },
  *firstFight(skipped) { if (!skipped) yield 1.1; yield* this.fightFlow({ me: 'vale', opp: 'koval', level: 0, rounds: Store.data.rounds }); },
  // ── a fight ────────────────────────────────────────────────────────────
  *fightFlow(o) {
    const a = fighterDef(o.me), b = fighterDef(o.opp); let models; this.lastFight = o; this.mode = 'fight'; this.cine = true; UI.fade(1); UI.hudShow(false); Tutorial.stop(); yield 0.32; UI.closeScreen(); UI.clearCard();
    yield this.loadPair(a, b).then(m => models = m);
    const M = this.newMatch({ a, b, models, mode: 'fight', level: o.level, p1ai: o.auto, rules: { rounds: o.rounds, roundTime: o.rounds === 1 ? 120 : 75 } });
    if (!o.quick) yield* this.introFlow(); else { Arena.setMood('fight', true); UI.fade(0); }
    yield* this.roundStart();
  },
  *introFlow() {
    const M = this.M; M.state = 'intro'; Arena.setMood('intro', true); for (const f of M.f) { f.setState('cine'); f.cineFace = 'focus'; f.model.setDim(0.3); }
    Arena.drawScreen({ mode: 'vs', a: M.f[0].def.name.split(' ').pop().toUpperCase(), b: M.f[1].def.name.split(' ').pop().toUpperCase(), colA: M.f[0].def.accent, colB: M.f[1].def.accent });
    UI.fade(0); UI.vsCard(M); Sfx.sting('intro'); Arena.cheer(0.55, 3); UI.skipBtn(IS_TOUCH && !Input.kbUsed ? 'Skip' : 'Skip <kbd>Enter</kbd>', () => { this.skipReq = true; });
    Cam.play({ dur: 3, ease: Ease.out, fn: u => ({ pos: _v1.set(Math.sin(0.5 + u * 0.7) * lerp(13, 8.5, u), lerp(7.5, 3.4, u), Math.cos(0.5 + u * 0.7) * lerp(13, 8.5, u)), tgt: _v2.set(0, lerp(2.2, 1.3, u), 0), fov: 40 }) });
    yield { t: 2.9, skip: true };
    for (const i of [1, 0]) { if (this.skipAll) break; const f = M.f[i], o = M.f[1 - i], sd = i ? -1 : 1, fw = f.fwd(V3()), sx = V3(-fw.z, 0, fw.x).multiplyScalar(sd), s = f.sk.s;
      UI.clearCard(); UI.lower(f, i === 1); f.model.setDim(1); o.model.setDim(0.18); Arena.spot(0, f.pos.x, f.pos.z, 1.9, 1.6); Arena.cheer(0.5, 2); Arena.flashBurst(0.5);
      const p0 = f.pos.clone().addScaledVector(fw, 2.7).addScaledVector(sx, 1.5).setY(0.75), p1 = f.pos.clone().addScaledVector(fw, 2.25).addScaledVector(sx, -0.5).setY(1.3 * s), t0 = f.pos.clone().setY(1.2 * s), t1 = f.pos.clone().setY(1.34 * s).addScaledVector(sx, 0.15);
      Cam.play({ dur: 2.6, ease: Ease.out, from: { pos: p0, tgt: t0, fov: 31 }, to: { pos: p1, tgt: t1, fov: 28 } }); this.introAnim(f);
      yield { t: 2.5, skip: true }; }
    this.cues.length = 0; UI.clearCard(); UI.skipBtn(null); Arena.spot(0, 0, 0, 1, 0); for (const f of M.f) { f.model.setDim(1); f.anim.stop(0.2); f.anim.style.bounce = f.def.style.bounce ?? STYLE0.bounce; } Arena.setMood('fight'); Cam.mode = 'fight';
  },
  introAnim(f) {
    const A = f.anim, fw = f.fwd(_v1), s = f.sk.s, T = k => f.k.time * k, aim = () => { for (const k of ['lh', 'rh', 'lf', 'rf']) A.aimW[k].set(f.pos.x + Math.sin(f.yaw) * 0.95, 1.56 * s, f.pos.z + Math.cos(f.yaw) * 0.95); A.aimW.look.set(f.pos.x + Math.sin(f.yaw) * 4, 1.5, f.pos.z + Math.cos(f.yaw) * 4); };
    const hit = (t, id) => this.cue(t, () => { aim(); const m = MOVES[id]; A.play(m.clip, { phases: [m.su * T(1), m.ac, m.rc * T(1)] }); f.model.face.set('strike', 0.3); Sfx.whoosh(m.heavy, m.limb[1] === 'f', i2p(f)); }), i2p = g => g.idx ? 0.4 : -0.4; aim();
    const k = f.def.intro;
    if (k === 'introShadow') { hit(0.35, 'jab'); hit(0.62, 'cross'); hit(1.0, 'hookL'); hit(1.5, f.def.id === 'okafor' ? 'bodyHookR' : 'upperR'); }
    else if (k === 'introBounce') { A.style.bounce = 0.035; hit(0.4, 'jab'); hit(0.62, 'jab'); hit(0.9, 'cross'); hit(1.35, 'headKickL'); }
    else { A.play(k, { hold: true, blendIn: 0.3 }); if (k === 'introPound') { this.cue(0.5, () => Sfx.block(1, i2p(f))); this.cue(0.9, () => Sfx.block(1, i2p(f))); this.cue(1.4, () => { f.model.face.set('roar', 1.2); Arena.cheer(0.8, 1.5); }); } else if (k === 'introCalm') this.cue(1.6, () => f.model.face.set('smirk', 1.2)); else this.cue(1.75, () => { A.stop(0.15); }), hit(1.8, 'spinFist'); }
  },
  *roundStart() {
    const M = this.M; M.state = 'ready'; this.cine = false; for (const f of M.f) { if (f.state === 'cine') f.setState('idle'); f.anim.stop(0.2); } UI.hudShow(true); UI.fade(0);
    UI.stamp('Round ' + M.round, M.rules.rounds > 1 && M.round === M.rules.rounds ? 'Final round' : M.f[0].def.name.split(' ').pop() + ' vs ' + M.f[1].def.name.split(' ').pop(), '', 1.0); Sfx.sting('round'); yield 1.15;
    UI.stamp('Fight', null, 'gold', 0.7); Sfx.bell(1); Sfx.sting('fight'); Arena.cheer(0.5, 1.5); M.start();
    if (this.firstHint && !IS_TOUCH && M.o.p1ai == null) { this.firstHint = false; const L = a => `<kbd>${esc(Input.label(a))}</kbd>`; UI.hint(`${L('up')}${L('left')}${L('down')}${L('right')} move · ${L('qp_mid')}${L('pp_mid')}${L('qk_mid')}${L('pk_mid')} strike — row above high, below low · ${L('guard')} guard · ${L('evade')} evade · ${L('pause')} moves`); this.cue(14, () => UI.hint(null)); }
  },
  *roundBreak(e) {
    const M = this.M; Sfx.bell(2); UI.hint(null); UI.stamp('End of round ' + e.round, `Judges score it ${e.score[0]}–${e.score[1]}`, '', 1.9); Arena.cheer(0.5, 2); for (const f of M.f) { f.wish.set(0, 0, 0); f.in.guard = false; }
    yield 2.0; UI.fade(1); yield 0.35; M.nextRound(); Cam.snap(M); yield 0.2; yield* this.roundStart();
  },
  *endFlow(r) {
    const M = this.M, w = r.winner; this.cine = true; UI.hint(null); UI.skipBtn(null);
    if (r.ko) { const W = M.f[w], V = M.f[1 - w]; Cam.mode = 'ko'; Cam.focus = V; Arena.setMood('ko'); Arena.drawScreen({ mode: 'text', text: r.how === 'KO' ? 'KNOCKOUT' : 'TKO', sub: W.def.name.toUpperCase() });
      yield 0.9; UI.stamp(r.how === 'KO' ? 'Knockout' : 'TKO', `${W.def.name} · round ${r.round}`, 'gold hi', 2.2); Sfx.bell(3); W.wish.set(0, 0, 0); yield 2.3; }
    else { Sfx.bell(3); for (const f of M.f) { f.wish.set(0, 0, 0); f.in.guard = false; } yield 0.9; UI.stamp('Decision', w < 0 ? 'The judges score it a draw' : `${r.ta}–${r.tb} for ${M.f[w].def.name}`, w < 0 ? '' : 'gold', 2.4); Sfx.sting('round'); yield 2.5; }
    UI.hudShow(false);
    if (w >= 0) { const W = M.f[w], L = M.f[1 - w], fw = W.fwd(V3()), sx = V3(-fw.z, 0, fw.x), s = W.sk.s; W.setState('cine'); W.cineFace = 'smile'; W.model.face.set(W.def.win === 'winFlex' ? 'roar' : 'smile', 6); W.anim.play(W.def.win, { hold: true, blendIn: 0.3 });
      if (!L.down) { L.setState('cine'); L.cineFace = 'tired'; L.anim.play('loseSlump', { hold: true, blendIn: 0.5 }); }
      Cam.focus = null; Cam.play({ dur: 3.4, ease: Ease.out, from: { pos: W.pos.clone().addScaledVector(fw, 2.9).addScaledVector(sx, 1.3).setY(0.7), tgt: W.pos.clone().setY(1.25 * s), fov: 32 }, to: { pos: W.pos.clone().addScaledVector(fw, 2.6).addScaledVector(sx, -0.9).setY(1.05), tgt: W.pos.clone().setY(1.4 * s), fov: 30 } });
      UI.lower(W, false); Sfx.sting(M.o.p1ai != null || w === 0 ? 'win' : 'lose'); Arena.cheer(1, 4); Arena.flashBurst(1); Arena.spot(0, W.pos.x, W.pos.z, 2, 0.8); yield { t: 3.2, skip: true }; }
    this.note = this.progress(r); UI.clearCard(); UI.hudShow(false); Arena.setMood('menu'); UI.results(M, this, this.note);
  },
  progress(r) { const M = this.M, S = Store.data; if (M.mode !== 'fight' || M.o.p1ai != null) return ''; S.fights++; const before = S.wins; let note = '';
    if (r.winner === 0) { S.wins++; if (r.ko) S.kos++; S.beaten[M.f[1].def.id] = Math.max(S.beaten[M.f[1].def.id] || 0, M.o.level + 1); const un = ROSTER.filter(d => d.unlock && before < d.unlock && S.wins >= d.unlock); note = un.length ? `New fighter unlocked · ${un.map(d => d.name).join(' · ')}` : ''; for (const d of un) Models.get(d); }
    else if (r.winner === 1) S.losses++; Store.save(); const nxt = ROSTER.filter(d => d.unlock && S.wins < d.unlock).sort((a, b) => a.unlock - b.unlock)[0];
    return note || `Record ${S.wins}–${S.losses}` + (nxt ? ` · ${nxt.unlock - S.wins} more win${nxt.unlock - S.wins === 1 ? '' : 's'} unlocks ${nxt.name}` : ''); },
  canReplay() { return Replay.count > 40 && this.replayKey() != null; },
  replayKey() { const ev = Replay.events, [a] = Replay.span(); let k = null; for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (e.t < a + 0.5) break; if (e.kd && e.final) return e.t; if (k == null && e.kd) k = e.t; } if (k != null) return k; let best = null; for (const e of ev) if (e.t > a + 1 && e.clean && (!best || e.heavy >= best.heavy)) best = e; return best && best.t; },
  resultAction(a) {
    if (a === 'replay') { const key = this.replayKey(); UI.closeScreen(); UI.stamp('Replay', null, '', 0.9); UI.skipBtn(IS_TOUCH && !Input.kbUsed ? 'Exit replay' : 'Exit replay <kbd>Enter</kbd>', () => Replay.stop()); Sfx.ui('ok'); Replay.snap = true; Replay.play(key, 2.6, 1.7, () => { UI.skipBtn(null); Cam.mode = 'ko'; UI.results(this.M, this, this.note); }); }
    else if (a === 'rematch') this.run(this.fightFlow({ ...this.lastFight, quick: true })); else this.run(this.hubFlow());
  },
  // ── hub / practice ─────────────────────────────────────────────────────
  *hubFlow() { UI.fade(1); Tutorial.stop(); UI.skipBtn(null); yield 0.3; if (this.M) { this.M.dispose(); this.M = null; } Models.hideAll(); for (let i = 0; i < 8; i++) Arena.blob(i, 0, 0, 0.2, 0); UI.hudShow(false); UI.clearCard(); UI.hint(null); UI.readout(null); this.mode = 'hub'; this.cine = false; Arena.setMood('menu'); Arena.drawScreen({ mode: 'logo' }); Arena.spot(0, -0.85, 0.6, 1.7, 0.9);
    Cam.play({ dur: 1e9, fn: (u, t) => ({ pos: _v1.set(0.5 + Math.sin(t * 0.12) * 0.25, 1.62, 4.5), tgt: _v2.set(0.55, 0.84, 0), fov: 34 }) }); UI.hub(this); UI.fade(0); for (const d of ROSTER) if (!d.unlock || Store.data.wins >= d.unlock) Models.get(d); },
  preview(def) { const tok = this.pvTok = (this.pvTok || 0) + 1; Models.get(def).then(m => { if (tok !== this.pvTok || this.mode !== 'hub') return; this.clearPreview(); const an = new Animator(m, def.style); an.root.set(-0.85, 0, 0.6); an.yaw = 0.42; an.placeFeet(); an.aimW.look.set(0.6, 1.5, 5); m.resetCondition(); m.setDim(1); m.group.visible = true; m.face.set('focus'); this.pv = { model: m, anim: an }; }); },
  clearPreview() { if (this.pv) { this.pv.model.group.visible = false; this.pv = null; } },
  hubAction(a) {
    const S = Store.data; if (a === 'fight') { const pool = ROSTER.filter(d => (!d.unlock || S.wins >= d.unlock || QS.has('unlock')) && d.id !== this.sel.me), opp = this.sel.opp === 'random' ? rand.pick(pool).id : this.sel.opp; this.run(this.fightFlow({ me: this.sel.me, opp, level: S.difficulty, rounds: S.rounds })); }
    else if (a === 'practice') this.run(this.practiceFlow(false)); else if (a === 'tutorial') this.run(this.tutorialFlow());
    else UI.panel(a === 'controls' ? 'Controls' : 'Settings', [['controls', 'Key bindings'], ['settings', 'Settings'], ['moves', 'Move list']], a, this);
  },
  *practiceFlow(warm) {
    const a = fighterDef(this.sel.me), b = fighterDef(this.sel.opp !== 'random' && this.sel.opp !== a.id ? this.sel.opp : a.id === 'duarte' ? 'vale' : 'duarte'); let models; UI.fade(1); yield 0.3; UI.closeScreen(); yield this.loadPair(a, b).then(m => models = m);
    this.mode = 'practice'; this.cine = false; const M = this.newMatch({ a, b, models, mode: 'practice', level: 0, rules: { noKO: true, noClock: true, infHp: true, rounds: 1 } }); M.f[1].ctrl.passive = true; this.dummy = 'stand';
    Arena.setMood('gym', true); Arena.drawScreen({ mode: 'text', text: 'PRACTICE', size: 150, sub: a.name.toUpperCase() }); UI.hudShow(true); UI.fade(0); M.start();
    const L = k => `<kbd>${esc(Input.label(k))}</kbd>`; UI.hint(IS_TOUCH && !Input.kbUsed ? (warm ? 'Warm-up · tap ❚❚ for the fight card' : 'Practice · tap ❚❚ for options') : (warm ? `Warm-up · <kbd>Enter</kbd> fight card · ${L('pause')} options` : `Practice · ${L('pause')} options and move list · <kbd>Enter</kbd> fight card`));
  },
  setDummy(k) { const M = this.M; if (!M) return; this.dummy = k; const ai = M.f[1].ctrl; ai.passive = k !== 'fight'; ai.passiveGuard = k === 'guard' ? 'mid' : null; ai.script = null; M.rules.infSt = k === 'infst' ? !M.rules.infSt : M.rules.infSt; },
  // ── pause ──────────────────────────────────────────────────────────────
  togglePause() {
    if (UI.mode === 'pause') { this.closePanel(); return; } const M = this.M; if (!M || Replay.active || UI.mode || this.cine || M.over || (M.state !== 'fight' && M.state !== 'ready')) return;
    this.paused = true; Sfx.ui('back'); const pr = this.mode === 'practice';
    UI.panel('Paused', [['menu', 'Menu'], ['moves', 'Move list'], ['controls', 'Controls'], ['settings', 'Settings']], 'menu', this, `<div class="menu"><button class="btn pri" data-a="resume">Resume</button>${pr ? `<button class="btn" data-a="d:stand">Partner · stands</button><button class="btn" data-a="d:guard">Partner · guards</button><button class="btn" data-a="d:fight">Partner · fights back</button><button class="btn" data-a="d:infst">Toggle infinite stamina</button>` : this.mode === 'fight' ? '<button class="btn" data-a="restart">Restart fight</button>' : '<button class="btn" data-a="skiptut">Skip tutorial</button>'}<button class="btn" data-a="hub">${pr ? 'Fight card' : 'Quit to fight card'}</button></div>`);
  },
  pauseAction(a) { if (a.startsWith('d:')) { this.setDummy(a.slice(2)); this.closePanel(); UI.toast(a === 'd:infst' ? `Infinite stamina ${this.M.rules.infSt ? 'on' : 'off'}` : 'Partner ' + { stand: 'stands still', guard: 'guards', fight: 'fights back' }[a.slice(2)]); return; }
    this.closePanel(); if (a === 'restart') this.run(this.fightFlow({ ...this.lastFight, quick: true })); else if (a === 'hub') this.run(this.hubFlow()); else if (a === 'skiptut') Tutorial.finish(true); },
  closePanel() { Input.capture = null; UI.closeScreen(); this.paused = false; Sfx.ui('back'); if (this.mode === 'hub') UI.hub(this); },
  async boot() {
    await Promise.race([Promise.all(['italic 800 48px', '600 20px', '800 48px', '700 20px'].map(f => document.fonts.load(f + ' "Barlow Condensed"'))), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
    Gfx.init(); Cam.init(); Input.init(); Sculptor.init(); IA.Gfx = Gfx; IA.Arena = Arena;
    if (QS.has('view')) { debugView(); return; }
    Arena.build(); Vfx.init(); Replay.init(); UI.init();
    Bus.on('anykey', () => { this.anyKey = true; Sfx.unlock(); });
    Bus.on('confirm', () => { this.skipReq = true; if (Replay.active) Replay.stop(); else if (this.mode === 'practice' && !this.paused && !UI.mode && !this.co) this.run(this.hubFlow()); });
    Bus.on('pause', () => { if (Replay.active) Replay.stop(); else this.togglePause(); });
    Bus.on('roundEnd', e => { if (!e.last) this.run(this.roundBreak(e)); });
    Bus.on('matchEnd', e => this.run(this.endFlow(e)));
    Bus.on('hit', e => { const M = this.M; if (!M) return; if (e.combo) UI.pop(e.att.idx, e.combo); else if (e.counter && e.clean) UI.pop(e.att.idx, 'Counter'); else if (e.perfect) UI.pop(e.def.idx, 'Perfect block'); else if (e.gbreak) UI.pop(e.att.idx, 'Guard break'); else if (e.check) UI.pop(e.def.idx, 'Checked'); else if (e.rocked) UI.pop(e.att.idx, 'Rocked');
      if (this.mode === 'practice' && e.att.idx === 0) UI.readout(`<b>${esc(e.m.name)}</b> · ${e.clean ? 'clean' : e.perfect ? 'perfect block' : e.type} · ${e.dmg.toFixed(1)} dmg<br>startup ${Math.round(e.att.ph[0] * 1000)} ms · recovery ${Math.round(e.att.ph[2] * 1000)} ms · ${e.m.lvl}${e.hits > 1 ? ` · ${e.hits}-hit combo` : ''}`); });
    Bus.on('evaded', e => UI.pop(e.f.idx, e.f.evade && e.f.evade.type === 'duck' ? 'Ducked' : 'Slipped'));
    Bus.on('exhaust', e => UI.pop(e.f.idx, 'Gassed'));
    Bus.on('knockdown', e => { if (!e.final) { UI.stamp('Knockdown', null, 'red hi', 1.2); Cam.mode = 'ko'; Cam.focus = e.f; } });
    Bus.on('getup', () => { if (!this.M.over) { Cam.mode = 'fight'; Cam.focus = null; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.M && this.M.state === 'fight' && !this.paused && this.M.o.p1ai == null) this.togglePause(); });
    UI.el.card.addEventListener('pointerdown', () => { this.skipReq = true; }); document.getElementById('gl').addEventListener('pointerdown', () => { if (this.cine) this.skipReq = true; });
    // test / debug hooks
    IA.Game = this; IA.AICtrl = AICtrl; IA.Bus = Bus; IA.Input = Input; IA.Cam = Cam; IA.MOVES = MOVES; IA.UI = UI; IA.Replay = Replay; IA.Tutorial = Tutorial; IA.Store = Store; IA.Sfx = Sfx;
    IA.dbg.step = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) this.step(dt, false); };
    IA.dbg.render = () => Gfx.render(0);
    IA.dbg.state = () => { const M = this.M; return { mode: this.mode, ui: UI.mode, co: !!this.co, paused: this.paused, tut: Tutorial.active ? Tutorial.tset[Tutorial.i].id + ':' + Tutorial.count.toFixed(1) : null, M: M && { t: +M.simT.toFixed(2), state: M.state, round: M.round, time: +M.time.toFixed(1), over: M.over, result: M.result, scores: M.scores, f: M.f.map(f => ({ id: f.def.id, hp: +f.hp.toFixed(1), st: +f.st.toFixed(0), cap: +f.stCap.toFixed(0), state: f.state, daze: +f.daze.toFixed(0), guard: +f.guard.toFixed(0), cond: Object.fromEntries(Object.entries(f.cond).map(([k, v]) => [k, Math.round(v)])), pos: [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)], stats: f.stats, move: f.move && f.move.id })) } }; };
    IA.dbg.exchange = (atk, def, delay = 0, dist = 0.9) => { const M = this.M; M.restart(); M.rules.noClock = true; M.state = 'fight'; const [a, b] = M.f; a.ctrl.passive = b.ctrl.passive = true; if (!a.ctrl.think.patched) { const A = new AICtrl(a, 0, M); A.passive = true; a.ctrl = A; } a.place(-dist / 2, 0, PI / 2); b.place(dist / 2, 0, -PI / 2);
      const ev = [], on = n => Bus.on(n, e => ev.push(n + (e.type ? ':' + e.type : '') + (e.perfect ? ':perfect' : '') + (e.clean ? ':clean' : '') + (e.counter ? ':counter' : '') + (e.kd ? ':kd' : '') + (e.dmg != null ? ':' + e.dmg.toFixed(1) : ''))), hs = ['hit', 'whiff', 'evaded', 'knockdown'].map(n => [n, on(n)]);
      for (let i = 0; i < 20; i++) M.update(1 / 60); b.pressMove(atk); let t = 0, done = false; const hp0 = a.hp;
      while (t < 1.6) { if (!done && t >= delay) { done = true; if (def.startsWith('guard')) a.ctrl.passiveGuard = def.slice(5) || 'mid'; else if (def.startsWith('ev:')) a.pressEvade(def.slice(3)); else if (def.startsWith('atk:')) a.pressMove(def.slice(4)); } M.update(1 / 120); t += 1 / 120; }
      for (const [n, f] of hs) Bus.off(n, f); a.ctrl.passiveGuard = null; return { ev, dHp: +(hp0 - a.hp).toFixed(1), aState: a.state, bHp: +(b.k.hpMax - b.hp).toFixed(1) }; };
    IA.dbg.fights = (n, maxSec = 420) => { const out = [], M = this.M; this.co = null; for (let i = 0; i < n; i++) { M.restart(); M.start(); let t = 0;
        while (!M.over && t < maxSec) { M.update(1 / 60); t += 1 / 60; if (M.state === 'roundEnd' && !M.over) { M.nextRound(); M.start(); } } this.co = null; this.cues.length = 0;
        const r = M.result || { winner: -2, how: 'timeout' }; out.push({ w: r.winner, how: r.how, rd: r.round, t: Math.round(M.simT), kd: [M.f[0].stats.kd, M.f[1].stats.kd], land: [M.f[0].stats.landed, M.f[1].stats.landed], thr: [M.f[0].stats.thrown, M.f[1].stats.thrown], blk: [M.f[0].stats.blocked, M.f[1].stats.blocked], ev: [M.f[0].stats.evaded, M.f[1].stats.evaded], hp: [Math.round(M.f[0].hp), Math.round(M.f[1].hp)], sc: M.scores }); M.simT = 0; }
      return out; };
    this.run(this.bootFlow()); IA.ready = true; this.last = performance.now(); if (!QS.has('manual')) requestAnimationFrame(t => this.frame(t));
  }
};
Game.boot();
