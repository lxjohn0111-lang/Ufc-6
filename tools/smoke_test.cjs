#!/usr/bin/env node
/* End-to-end smoke test for iron_arena.html (optional; the game itself needs no tooling).

   Needs Playwright:   npm i -g playwright   (or a local install), then
     node tools/smoke_test.cjs
   Offline / sandboxed machines can point the three.js CDN request at a local copy:
     IRON_ARENA_THREE=/path/to/three.module.min.js node tools/smoke_test.cjs

   It drives the real page in headless Chromium: boots, plays tutorial steps with key presses,
   fights to a finish, checks results / replay / rematch / decision / hub / practice / pause /
   rebinding / touch layout / audio output, and fails on any uncaught page error. The game is
   stepped manually (?manual) so the run is fast and deterministic even on software WebGL. */
const path = require('path'), fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed: npm i -g playwright'); process.exit(2); }
const FILE = 'file://' + path.resolve(__dirname, '..', 'iron_arena.html'), THREE_LOCAL = process.env.IRON_ARENA_THREE;
let failed = 0; const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const session = async (viewport, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    if (THREE_LOCAL) await ctx.route(/three@[^/]+\/build\/three\.module(\.min)?\.js/, r => r.fulfill({ path: THREE_LOCAL, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '', contentType: 'text/css' }));          // fonts are optional
    const adv = async sec => { for (let t = 0; t < sec - 1e-6; t += 0.25) { await page.evaluate(s => IA.dbg.step(s), Math.min(0.25, sec - t)); await page.waitForTimeout(3); } };
    const until = async (fn, max = 30, step = 0.25, arg) => { for (let t = 0; t < max; t += step) { if (await page.evaluate(fn, arg)) return true; await adv(step); } return false; };
    const tap = async (code, hold = 0.05) => { await page.keyboard.down(code); await adv(hold); await page.keyboard.up(code); };
    const open = async (qs = '') => { await page.goto(FILE + '?manual&noadapt&q=low' + (qs ? '&' + qs : '')); await page.waitForFunction('window.IA && IA.ready', null, { timeout: 120000 });
      for (let i = 0; i < 600; i++) { await adv(0.1); if (await page.evaluate(() => { const g = document.querySelector('.go'); return !g || g.classList.contains('blink'); })) return; await page.waitForTimeout(40); } };
    return { ctx, page, errors, adv, until, tap, open, state: () => page.evaluate(() => IA.dbg.state()) };
  };

  // ── desktop: first session ────────────────────────────────────────────
  let S = await session({ width: 1280, height: 720 }); let { page, adv, until, tap, open, state } = S;
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('fresh')) { localStorage.clear(); sessionStorage.setItem('fresh', '1'); } } catch (e) {} });
  await open(); ok('boots to the splash without a menu', await page.evaluate(() => IA.UI.mode === 'splash'));
  await tap('Enter'); await until(() => IA.Tutorial.active, 20, 0.1); let s = await state();
  ok('first session starts in the interactive tutorial', s.mode === 'tutorial' && s.tut && s.tut.startsWith('move'), s.tut);
  ok('audio context starts after the first gesture', await page.evaluate(() => IA.Sfx.ready && IA.Sfx.ctx.state === 'running'));
  await page.keyboard.down('KeyD'); await adv(0.8); await page.keyboard.up('KeyD'); await page.keyboard.down('KeyW'); await adv(1.4); await page.keyboard.up('KeyW'); await page.keyboard.down('KeyA'); await adv(1.4); await page.keyboard.up('KeyA'); await adv(1.2);
  ok('tutorial: movement step completes with WASD', ((await state()).tut || '').startsWith('jab'), (await state()).tut);
  const close = async () => { await page.keyboard.down('KeyD'); await until(() => { const M = IA.Game.M; return M.f[0].pos.distanceTo(M.f[1].pos) < 0.95; }, 4, 0.05); await page.keyboard.up('KeyD'); };
  await close(); for (let i = 0; i < 4; i++) { await tap('KeyJ'); await adv(0.5); } await adv(1.0);
  ok('tutorial: three jabs land and the step completes', ((await state()).tut || '').startsWith('types'), (await state()).tut);
  ok('audio is audible (non-zero output level)', await page.evaluate(() => IA.Sfx.rms() > 1e-4), 'rms ' + (await page.evaluate(() => IA.Sfx.rms().toFixed(4))));
  await tap('KeyT'); await until(() => IA.Game.M && IA.Game.M.state === 'intro', 25, 0.1); s = await state();
  ok('skipping the tutorial leads straight to the first fight', s.mode === 'fight' && s.M.f.map(f => f.id).join() === 'vale,koval');
  ok('fight introduction shows both name cards', await page.evaluate(() => document.querySelectorAll('.vcard').length === 2));
  await adv(0.5); await tap('Enter'); await until(() => IA.Game.M.state === 'fight', 15, 0.1); ok('introduction can be skipped; round starts', (await state()).M.state === 'fight');
  // direct control
  await adv(0.3); await tap('KeyK', 0.03); await adv(0.05); ok('power punch key throws the cross', (await state()).M.f[0].move === 'cross');
  let hk = null; for (let i = 0; i < 4 && hk !== 'headKickR'; i++) { await until(() => IA.Game.M.f[0].state === 'idle', 4, 0.05); await tap('KeyP', 0.03); await adv(0.05); hk = (await state()).M.f[0].move; await adv(1.0); }   // (retries if the opponent interrupts)
  ok('high power-kick key throws the head kick', hk === 'headKickR', String(hk));
  await page.keyboard.down('Space'); await adv(0.2); ok('guard key raises the guard', await page.evaluate(() => IA.Game.M.f[0].guarding)); await page.keyboard.up('Space'); await adv(0.1);
  await tap('ShiftLeft', 0.03); await adv(0.05); ok('evade key starts an evasion', (await state()).M.f[0].state === 'evade'); await adv(0.6);
  const st0 = (await state()).M.f[0].st; for (let i = 0; i < 6; i++) { await tap('Semicolon', 0.03); await adv(0.75); } const st1 = (await state()).M.f[0].st;
  ok('strikes cost stamina', st1 < st0 - 15, `${st0} → ${st1}`); await adv(4); ok('stamina recovers gradually, not instantly', (await state()).M.f[0].st > st1 && (await state()).M.f[0].st <= 100);
  // let an AI finish the fight for the player
  await page.evaluate(() => { const M = IA.Game.M; M.f[0].ctrl = new IA.AICtrl(M.f[0], 2, M); window.__ev = []; for (const n of ['knockdown', 'getup', 'roundEnd', 'matchEnd']) IA.Bus.on(n, e => __ev.push(n + (e.final ? ':final' : ''))); });
  await until(() => IA.Game.M.over, 420, 0.5); s = await state(); const ev = await page.evaluate(() => __ev);
  ok('the fight reaches a result', s.M.over && !!s.M.result, JSON.stringify(s.M.result)); ok('knockdown / ragdoll events occurred', ev.some(e => e.startsWith('knockdown')), ev.join(' '));
  ok('damage changed region condition', s.M.f.some(f => Object.values(f.cond).some(v => v < 90)));
  await until(() => IA.UI.mode === 'res', 20, 0.2); ok('results screen appears', (await state()).ui === 'res'); ok('progress is saved', await page.evaluate(() => IA.Store.data.fights === 1 && IA.Store.data.tutorialDone));
  if (await page.evaluate(() => !!document.querySelector('[data-a=replay]'))) { await page.click('[data-a=replay]'); await adv(1.0); const cam0 = await page.evaluate(() => IA.Gfx.camera.position.toArray());
    ok('replay plays back recorded frames', await page.evaluate(() => IA.Replay.active && IA.Replay.count > 60)); await until(() => IA.Replay.pass === 1, 25, 0.2); await adv(0.5); const cam1 = await page.evaluate(() => IA.Gfx.camera.position.toArray());
    ok('replay switches to a second camera angle', Math.hypot(cam0[0] - cam1[0], cam0[1] - cam1[1], cam0[2] - cam1[2]) > 0.5); await tap('Enter'); await adv(0.3); ok('replay exits cleanly to the results', !(await page.evaluate(() => IA.Replay.active)) && (await state()).ui === 'res'); }
  else ok('replay offered after the fight', false);
  await page.click('[data-a=rematch]'); await until(() => IA.Game.M && IA.Game.M.state === 'fight' && !IA.Game.M.over, 20, 0.1); s = await state();
  ok('rematch starts a fresh fight', s.M.round === 1 && s.M.f.every(f => f.hp > 95 && f.st > 95));
  // decision path: run the clock out
  await page.evaluate(() => { const M = IA.Game.M; M.f[0].ctrl = new IA.AICtrl(M.f[0], 0, M); M.rules.noKO = true; });
  for (let r = 0; r < 3; r++) { await page.evaluate(() => { IA.Game.M.time = 1.5; }); await until((r) => IA.Game.M.over || (IA.Game.M.round > r + 1 && IA.Game.M.state === 'fight'), 20, 0.2, r); }
  s = await state(); ok('going the distance produces a judges’ decision', s.M.over && s.M.result.how === 'Decision' && s.M.scores.length === 3, JSON.stringify(s.M.scores));
  await until(() => IA.UI.mode === 'res', 20, 0.2); await page.click('[data-a=hub]'); await until(() => IA.UI.mode === 'hub', 15, 0.1);
  // hub, practice, pause, settings, rebinding
  ok('fighter select lists six fighters', await page.evaluate(() => document.querySelectorAll('.fc').length === 6));
  await page.click('.fc[data-id=navarro]'); await adv(0.2); ok('choosing a fighter updates the panel', await page.evaluate(() => document.querySelector('.who h1').textContent.includes('Navarro')));
  await page.click('[data-a=practice]'); await until(() => IA.Game.mode === 'practice' && IA.Game.M && IA.Game.M.state === 'fight', 30, 0.1); s = await state(); ok('practice mode starts with the chosen fighter', s.M.f[0].id === 'navarro');
  await close(); await tap('KeyJ'); await adv(0.6); ok('practice shows strike data', await page.evaluate(() => !document.getElementById('readout').classList.contains('hide')));
  await tap('Escape'); await adv(0.2); ok('pause opens', (await state()).paused && (await state()).ui === 'pause'); const t0 = (await state()).M.t; await adv(0.5); ok('simulation is frozen while paused', (await state()).M.t === t0);
  await page.click('[data-t=moves]'); ok('move list shows the 4×3 grid', await page.evaluate(() => document.querySelectorAll('.mv .cell').length === 12));
  await page.click('[data-t=controls]'); await page.click('[data-b=guard]'); await page.keyboard.press('KeyG'); await adv(0.1); ok('controls can be rebound', await page.evaluate(() => IA.Input.binds.guard === 'KeyG'));
  await page.click('[data-r]'); ok('bindings reset to defaults', await page.evaluate(() => IA.Input.binds.guard === 'Space'));
  await page.click('[data-t=settings]'); ok('settings panel has volume sliders', await page.evaluate(() => document.querySelectorAll('.sets input[type=range]').length === 4));
  await page.click('[data-x]'); await adv(0.2); ok('resume returns to play', !(await state()).paused);
  ok('no uncaught errors on desktop', S.errors.length === 0, S.errors.slice(0, 3).join(' | ')); await S.ctx.close();

  // ── returning player: no menu on boot either ──────────────────────────
  S = await session({ width: 1280, height: 720 }); ({ page, adv, until, tap, open, state } = S);
  await page.addInitScript(() => { try { localStorage.setItem('iron_arena_v1', JSON.stringify({ tutorialDone: true, wins: 2, losses: 1 })); } catch (e) {} });
  await open(); await tap('Enter'); await until(() => IA.Game.mode === 'practice' && IA.Game.M && IA.Game.M.state === 'fight', 30, 0.1); s = await state();
  ok('returning players land in a playable warm-up, not a menu', s.mode === 'practice' && !s.ui); ok('no uncaught errors (returning player)', S.errors.length === 0, S.errors.slice(0, 3).join(' | ')); await S.ctx.close();

  // ── phones: touch controls and layout ─────────────────────────────────
  for (const [label, vp] of [['landscape phone 844×390', { width: 844, height: 390 }], ['portrait phone 390×844', { width: 390, height: 844 }], ['small phone 568×320', { width: 568, height: 320 }]]) {
    S = await session(vp, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); ({ page, adv, until, tap, open, state } = S);
    await open('touch&mobile'); await page.touchscreen.tap(vp.width / 2, vp.height / 2); await until(() => IA.Tutorial.active, 25, 0.1);
    const cdp = await S.ctx.newCDPSession(page), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    const jx = vp.width * 0.18, jy = vp.height > vp.width ? vp.height * 0.82 : vp.height * 0.7;
    await touch('touchStart', [[jx, jy, 1]]); await touch('touchMove', [[jx + 42, jy, 1]]); await adv(0.4); ok(`${label}: joystick moves the fighter`, await page.evaluate(() => IA.Input.mx > 0.6));
    await until(() => { const M = IA.Game.M; return M.f[0].pos.distanceTo(M.f[1].pos) < 0.95; }, 6, 0.05); await touch('touchEnd', []);
    const [bx, by] = await page.evaluate(() => { const b = document.querySelector('.b-qp').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await touch('touchStart', [[bx, by, 2]]); await adv(0.04); const tapMove = await page.evaluate(() => IA.Game.M.f[0].move && IA.Game.M.f[0].move.id); await touch('touchEnd', []); await adv(0.7);
    await touch('touchStart', [[bx, by, 2]]); await adv(0.03); await touch('touchMove', [[bx, by - 34, 2]]); await adv(0.05); const flick = await page.evaluate(() => IA.Game.M.f[0].move && IA.Game.M.f[0].move.id); await touch('touchEnd', []); await adv(0.7);
    ok(`${label}: tap = jab, flick up = high strike`, tapMove === 'jab' && flick === 'hookL', `${tapMove} / ${flick}`);
    const audit = () => page.evaluate(() => { const sel = ['.plate.l', '.plate.r', '.clock', '#pauseBtn', '.tcard', '.b-qp', '.b-pp', '.b-qk', '.b-pk', '.b-guard', '.b-ev', '.b-s1', '.b-s2', '.tc-joy', '#hint', '#skip', '#readout'], bx = [];
      for (const q of sel) { const e = document.querySelector(q); if (!e) continue; const c = getComputedStyle(e); if (c.display === 'none' || e.classList.contains('hide') || +c.opacity === 0) continue; const b = e.getBoundingClientRect(); if (b.width > 2) bx.push([q, b.left, b.top, b.right, b.bottom]); }
      const out = []; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const A = bx[i], B = bx[j]; if (Math.min(A[3], B[3]) - Math.max(A[1], B[1]) > 3 && Math.min(A[4], B[4]) - Math.max(A[2], B[2]) > 3) out.push(A[0] + '×' + B[0]); }
      for (const b of bx) if (b[1] < -1 || b[2] < -1 || b[3] > innerWidth + 1 || b[4] > innerHeight + 1) out.push(b[0] + ' off-screen'); return out; });
    let a = await audit(); ok(`${label}: no overlapping or off-screen HUD (tutorial)`, a.length === 0, a.join(', '));
    await page.evaluate(() => document.querySelector('.tskip').click()); await until(() => IA.Game.M && IA.Game.M.state === 'intro', 25, 0.1); await adv(0.4); await page.touchscreen.tap(vp.width / 2, vp.height * 0.3); await until(() => IA.Game.M.state === 'fight', 20, 0.1); await adv(1.5);
    a = await audit(); ok(`${label}: no overlapping or off-screen HUD (fight)`, a.length === 0, a.join(', ')); ok(`${label}: no uncaught errors`, S.errors.length === 0, S.errors.slice(0, 2).join(' | ')); await S.ctx.close();
  }
  await browser.close(); console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED', e); process.exit(2); });
