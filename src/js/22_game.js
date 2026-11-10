/* ═══════════════════════════ GAME (provisional harness) ═══════════════════════════ */
const Game = { M: null, cine: false, paused: false, last: 0, t: 0,
  startMatch(o) { if (this.M) this.M.dispose(); const M = this.M = new Match(o); Cam.mode = 'fight'; M.tick(1 / 60); Cam.snap(M); return M; },
  frame(now) { const dt = clamp((now - this.last) / 1000, 0.001, 1 / 20); this.last = now; this.step(dt, true); requestAnimationFrame(t => this.frame(t)); },
  step(dt, render) { Input.update(); const M = this.M; let h = dt; if (M && !this.paused) h = M.update(dt); Cam.update(dt, M); Arena.update(dt, Gfx.camera); Vfx.update(h, Gfx.camera); Gfx.tick(dt); if (render) Gfx.render(dt); this.t += dt; }
};
IA.Game = Game; IA.Bus = Bus; IA.Input = Input; IA.Cam = Cam; IA.MOVES = MOVES; IA.CLIPS = CLIPS;
await Promise.race([Promise.all(['italic 800 48px', '600 20px', '800 48px', '700 20px'].map(f => document.fonts.load(f + ' "Barlow Condensed"'))), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
Gfx.init(); Cam.init(); Input.init(); IA.Gfx = Gfx; IA.Arena = Arena;
if (QS.has('view')) debugView();
else {
  Arena.build(); Vfx.init();
  const M = Game.startMatch({ a: fighterDef(QS.get('p1') || 'vale'), b: fighterDef(QS.get('p2') || 'koval'), level: +(QS.get('lvl') || 1), p1ai: QS.has('auto') ? +(QS.get('auto') || 1) : null, rules: { rounds: +(QS.get('rounds') || 3) } }); M.start();
  IA.dbg.step = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) Game.step(dt, false); };
  IA.dbg.state = () => { const M = Game.M; return { t: +M.simT.toFixed(2), state: M.state, round: M.round, time: +M.time.toFixed(1), over: M.over, result: M.result, scores: M.scores, f: M.f.map(f => ({ id: f.def.id, hp: +f.hp.toFixed(1), st: +f.st.toFixed(0), cap: +f.stCap.toFixed(0), state: f.state, daze: +f.daze.toFixed(0), guard: +f.guard.toFixed(0), cond: Object.fromEntries(Object.entries(f.cond).map(([k, v]) => [k, Math.round(v)])), pos: [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)], stats: f.stats, move: f.move && f.move.id })) }; };
  IA.dbg.render = () => Gfx.render(0);
  /** scripted exchange: fighter 1 throws `atk` at `dist`; fighter 0 answers with `def` after `delay` s. Returns the events seen. */
  IA.dbg.exchange = (atk, def, delay = 0, dist = 0.9, extra = {}) => { const M = Game.M; M.restart(); M.rules.noClock = true; M.state = 'fight'; const [a, b] = M.f; a.ctrl.passive = b.ctrl.passive = true; a.place(-dist / 2, 0, PI / 2); b.place(dist / 2, 0, -PI / 2);
    const ev = [], on = (n) => Bus.on(n, e => ev.push(n + (e.type ? ':' + e.type : '') + (e.perfect ? ':perfect' : '') + (e.clean ? ':clean' : '') + (e.counter ? ':counter' : '') + (e.kd ? ':kd' : '') + (e.dmg != null ? ':' + e.dmg.toFixed(1) : ''))), hs = ['hit', 'whiff', 'evaded', 'knockdown'].map(n => [n, on(n)]);
    for (let i = 0; i < 20; i++) Game.step(1 / 60, false); b.pressMove(atk); let t = 0, done = false; const hp0 = a.hp;
    while (t < 1.6) { if (!done && t >= delay) { done = true; if (def.startsWith('guard')) { a.ctrl.passiveGuard = def.slice(5) || 'mid'; } else if (def.startsWith('ev:')) a.pressEvade(def.slice(3)); else if (def.startsWith('atk:')) a.pressMove(def.slice(4)); }
      if (extra.then && t >= extra.thenAt && !extra.did) { extra.did = true; a.pressMove(extra.then); } Game.step(1 / 120, false); t += 1 / 120; }
    for (const [n, f] of hs) Bus.off(n, f); a.ctrl.passiveGuard = null; return { ev, dHp: +(hp0 - a.hp).toFixed(1), aState: a.state, bHp: +(b.k.hpMax - b.hp).toFixed(1), su: +b.k.time.toFixed(2) }; };
  /** run whole fights headless and report outcomes (balance testing) */
  IA.dbg.fights = (n, maxSec = 260) => { const out = []; for (let i = 0; i < n; i++) { const M = Game.M; M.restart(); M.start(); let t = 0;
      while (!M.over && t < maxSec) { Game.step(1 / 60, false); t += 1 / 60; if (M.state === 'roundEnd' && !M.over) { M.nextRound(); M.start(); } }
      const r = M.result || { winner: -2, how: 'timeout' }; out.push({ w: r.winner, how: r.how, rd: r.round, t: Math.round(t), kd: [M.f[0].stats.kd, M.f[1].stats.kd], land: [M.f[0].stats.landed, M.f[1].stats.landed], thr: [M.f[0].stats.thrown, M.f[1].stats.thrown], blk: [M.f[0].stats.blocked, M.f[1].stats.blocked], ev: [M.f[0].stats.evaded, M.f[1].stats.evaded], hp: [Math.round(M.f[0].hp), Math.round(M.f[1].hp)], sc: M.scores }); }
    return out; };
  IA.ready = true; Game.last = performance.now(); if (!QS.has('manual')) requestAnimationFrame(t => Game.frame(t));
}
