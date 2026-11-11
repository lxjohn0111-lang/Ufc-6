/* ═══════════════════════════ INTERFACE ═══════════════════════════
   DOM overlay in a broadcast-graphics language: skewed bars, octagonal chips, gold rules.
   The fight HUD keeps to the top edge; callouts sit under each fighter's plate so nothing
   covers the action. Everything scales with clamp() and respects safe-area insets. */
const emblemSVG = (col = '#c9a45c') => `<svg viewBox="-110 -110 220 220"><g fill="${col}" stroke="${col}"><polygon fill="none" stroke-width="7" points="${Array.from({ length: 8 }, (_, i) => { const a = PI / 8 + i * PI / 4; return (Math.cos(a) * 100).toFixed(1) + ',' + (Math.sin(a) * 100).toFixed(1); }).join(' ')}"/><path stroke="none" d="M-50 46V-46H-30V46ZM-14 46 16 -46H30L60 46H39L23 -10 7 46ZM8 14H42V24H8Z"/></g></svg>`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ftIn = cm => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)}'${i % 12}"`; };

const Portraits = {
  map: {}, pending: {},
  ensure(def) { if (this.map[def.id]) return Promise.resolve(this.map[def.id]); return this.pending[def.id] || (this.pending[def.id] = Models.get(def).then(m => (this.map[def.id] = this.render(m, def)))); },
  render(model, def) {
    const g = model.group, vis = [], L = Gfx.L, keep = { key: L.uKeyDir.value.clone(), kc: L.uKeyCol.value.clone(), fd: L.uFillDir.value.clone(), fc: L.uFillCol.value.clone(), rd: L.uRimDir.value.clone(), rc: L.uRimCol.value.clone(), at: L.uAmbTop.value.clone(), ab: L.uAmbBot.value.clone(), sh: L.uShadowAmt.value };
    for (const o of Gfx.scene.children) { vis.push([o, o.visible]); if (o.isGroup || o.isMesh || o.isPoints) o.visible = false; }
    const sv = { p: g.position.clone(), r: g.rotation.y }, an = new Animator(model, def.style), sd = def.stance === 'southpaw' ? -1 : 1;
    an.root.set(0, 0, 0); an.yaw = 0.42 * sd; an.placeFeet(); an.aimW.look.set(0.3 * sd, 1.6, 4); for (let i = 0; i < 50; i++) an.update(1 / 60);
    model.face.set('focus'); model.face.cur = { ...EXPR.focus }; model.face.blink = 0; model.face.draw(); g.visible = true; model.setDim(1); model.setFlash(0);
    const hd = an.pt('headC', V3()), cam = new THREE.PerspectiveCamera(23, 0.8, 0.1, 30); cam.position.set(hd.x - 0.1 * sd, hd.y - 0.06, hd.z + 2.05); cam.lookAt(hd.x - 0.02 * sd, hd.y - 0.2, hd.z);
    L.uKeyDir.value.set(-0.5 * sd, 0.62, 0.6).normalize(); L.uKeyCol.value.setRGB(1.5, 1.4, 1.26); L.uFillDir.value.set(0.7 * sd, 0.1, 0.5).normalize(); L.uFillCol.value.setRGB(0.1, 0.12, 0.18); L.uRimDir.value.set(0.6 * sd, 0.4, -0.7).normalize(); L.uRimCol.value.set(def.accent).multiplyScalar(2.4).addScalar(0.25); L.uAmbTop.value.setRGB(0.46, 0.46, 0.52); L.uAmbBot.value.setRGB(0.24, 0.22, 0.26); L.uShadowAmt.value = 0.5;
    const shot = Gfx.snapshot(cam, 384, 480);
    L.uKeyDir.value.copy(keep.key); L.uKeyCol.value.copy(keep.kc); L.uFillDir.value.copy(keep.fd); L.uFillCol.value.copy(keep.fc); L.uRimDir.value.copy(keep.rd); L.uRimCol.value.copy(keep.rc); L.uAmbTop.value.copy(keep.at); L.uAmbBot.value.copy(keep.ab); L.uShadowAmt.value = keep.sh;
    for (const [o, v] of vis) o.visible = v; g.position.copy(sv.p); g.rotation.y = sv.r; g.visible = false;
    // painted card: accent wash, halftone, mark, then the fighter
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 480; const c = cv.getContext('2d'), gr = c.createLinearGradient(0, 0, 384, 480); gr.addColorStop(0, shadeHex(def.accent, 0.95)); gr.addColorStop(1, shadeHex(def.accent, 0.28)); c.fillStyle = gr; c.fillRect(0, 0, 384, 480);
    c.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < 480; y += 9) for (let x = (y / 9 % 2) * 4.5; x < 384; x += 9) { const r = 3.4 * clamp01((x + y * 0.6) / 620); if (r > 0.3) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } }
    c.save(); c.globalAlpha = 0.22; drawEmblem(c, 262, 150, 150, '#0e0f12', 0.06); c.restore();
    c.save(); c.translate(-40, 480); c.rotate(-0.28); c.fillStyle = 'rgba(14,15,18,.55)'; c.fillRect(0, 0, 700, 34); c.restore();
    c.drawImage(shot, 0, 0); const v = c.createLinearGradient(0, 300, 0, 480); v.addColorStop(0, 'rgba(8,9,11,0)'); v.addColorStop(1, 'rgba(8,9,11,.82)'); c.fillStyle = v; c.fillRect(0, 300, 384, 180);
    return cv.toDataURL('image/jpeg', 0.9);
  }
};

const UI = {
  el: {}, last: [{}, {}], mode: null,
  init() {
    const R = this.root = document.getElementById('ui');
    R.innerHTML = `<div id="hud"><div class="top">${[0, 1].map(i => `<div class="plate ${i ? 'r' : 'l'}"><div class="pic"><img alt=""></div><div class="info"><div class="nm"></div><div class="bars"><div class="bar hp"><u></u><i></i></div><div class="bar stm"><i></i><s></s></div><div class="bar grd"><i></i></div></div><div class="row"><span class="chip">HEAD</span><span class="chip">BODY</span><span class="chip">ARMS</span><span class="chip">LEGS</span><span class="pop"></span></div></div></div>`).join('<div class="clock"><div class="rd">ROUND 1</div><div class="tm">0:00</div><div class="pips"></div></div>')}</div><div id="hint" class="hide"></div><button id="pauseBtn" aria-label="Pause"></button><div id="readout" class="hide"></div></div>
      <div id="tut" class="hide"></div><div id="card"></div><div id="fade"></div><div id="screen"></div><div id="toast"></div>`;
    const q = s => R.querySelector(s), qa = s => [...R.querySelectorAll(s)], E = this.el;
    E.hud = q('#hud'); E.plates = qa('.plate').map(p => ({ root: p, img: p.querySelector('img'), pic: p.querySelector('.pic'), nm: p.querySelector('.nm'), hp: p.querySelector('.hp'), hpI: p.querySelector('.hp i'), hpU: p.querySelector('.hp u'), st: p.querySelector('.stm'), stI: p.querySelector('.stm i'), stS: p.querySelector('.stm s'), gd: p.querySelector('.grd'), gdI: p.querySelector('.grd i'), chips: [...p.querySelectorAll('.chip')], pop: p.querySelector('.pop') }));
    E.rd = q('.clock .rd'); E.tm = q('.clock .tm'); E.pips = q('.pips'); E.hint = q('#hint'); E.card = q('#card'); E.fade = q('#fade'); E.screen = q('#screen'); E.toast = q('#toast'); E.tut = q('#tut'); E.readout = q('#readout'); E.pause = q('#pauseBtn');
    E.pause.onclick = () => Bus.emit('pause'); Input.buildTouch(R); if (IS_TOUCH) document.body.classList.add('touch');
    Bus.on('resize', v => { document.documentElement.style.setProperty('--gh', v.h + 'px'); }); document.documentElement.style.setProperty('--gh', Gfx.viewport.h + 'px');
    R.addEventListener('click', e => { const b = e.target.closest('button,.fc'); if (b) Sfx.ui(b.classList.contains('pri') ? 'ok' : 'move'); });
  },
  // ── HUD ────────────────────────────────────────────────────────────────
  hudBind(M) { M.f.forEach((f, i) => { const p = this.el.plates[i], d = f.def; p.pic.style.setProperty('--ac', d.accent); p.root.style.setProperty('--ac', d.accent); p.nm.innerHTML = `${esc(d.name.split(' ')[0])}<b>“${esc(d.nick)}”</b>${esc(d.name.split(' ').slice(1).join(' '))}`; p.img.src = Portraits.map[d.id] || ''; Portraits.ensure(d).then(u => p.img.src = u); this.last[i] = {}; });
    this.el.pips.innerHTML = M.rules.noClock ? '' : Array.from({ length: M.rules.rounds }, () => '<i></i>').join(''); this.lastT = null; },
  hudShow(v) { this.el.hud.classList.toggle('on', !!v); },
  hudUpdate(M) {
    M.f.forEach((f, i) => { const p = this.el.plates[i], L = this.last[i], hp = clamp01(f.hp / f.k.hpMax), st = f.st / 100, cap = f.stCap / 100, gd = clamp01(f.guard / f.k.guardMax);
      if (Math.abs(hp - (L.hp ?? -1)) > 0.002) { p.hpI.style.transform = `scaleX(${hp.toFixed(3)})`; p.hpU.style.transform = `scaleX(${hp.toFixed(3)})`; p.hp.classList.toggle('low', hp < 0.28); L.hp = hp; }
      if (Math.abs(st - (L.st ?? -1)) > 0.004) { p.stI.style.transform = `scaleX(${st.toFixed(3)})`; p.st.classList.toggle('low', st < 0.22); L.st = st; }
      if (Math.abs(cap - (L.cap ?? -1)) > 0.004) { p.stS.style.transform = `scaleX(${(1 - cap).toFixed(3)})`; L.cap = cap; }
      if (Math.abs(gd - (L.gd ?? -1)) > 0.01) { p.gdI.style.transform = `scaleX(${gd.toFixed(2)})`; L.gd = gd; } const brk = f.gbreak > 0; if (brk !== L.brk) { p.gd.classList.toggle('brk', brk); L.brk = brk; }
      ['head', 'body', 'arms', 'legs'].forEach((r, k) => { const c = f.cond[r], lv = c < 28 ? 3 : c < 52 ? 2 : c < 78 ? 1 : 0; if (L['c' + k] !== lv) { p.chips[k].className = 'chip' + (lv ? ' d' + lv : ''); L['c' + k] = lv; } }); });
    const t = M.rules.noClock ? '∞' : M.clock(); if (t !== this.lastT) { this.el.tm.textContent = t; this.el.tm.classList.toggle('low', !M.rules.noClock && M.time < 10.5); this.lastT = t; }
    const rd = M.mode === 'practice' ? 'PRACTICE' : M.mode === 'tutorial' ? 'TUTORIAL' : 'ROUND ' + M.round; if (rd !== this.lastR) { this.el.rd.textContent = rd; this.lastR = rd; [...this.el.pips.children].forEach((e, k) => e.classList.toggle('on', k < M.round)); }
  },
  pop(i, text) { const p = this.el.plates[i].pop; p.textContent = text; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); },
  hint(html) { this.el.hint.classList.toggle('hide', !html); if (html) this.el.hint.innerHTML = html; },
  readout(html) { this.el.readout.classList.toggle('hide', !html); if (html) this.el.readout.innerHTML = html; },
  // ── cards ──────────────────────────────────────────────────────────────
  timers: [],
  /** game-time timers so overlays pause with the game and behave identically at any frame rate */
  after(t, fn) { this.timers.push({ t, fn }); },
  tick(dt) { for (let i = this.timers.length - 1; i >= 0; i--) if ((this.timers[i].t -= dt) <= 0) this.timers.splice(i, 1)[0].fn(); },
  stamp(text, sub, cls = '', hold = 1.2) { const c = this.el.card; this.clearCard('.stamp'); const d = document.createElement('div'); d.className = 'stamp' + (cls.includes('hi') ? ' hi' : ''); d.innerHTML = `<h1 class="${cls}">${esc(text)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}`; c.appendChild(d); if (hold) this.after(hold, () => { d.classList.add('out'); this.after(0.36, () => d.remove()); }); return d; },
  clearCard(sel) { for (const e of [...this.el.card.children]) if (!sel || e.matches(sel)) e.remove(); },
  fighterMeta(d, sk) { const h = Math.round(sk ? sk.b.height * 100 : d.look.build.height * 100), reach = sk ? Math.round(2 * (sk.J.uarmL[0] + sk.ua + sk.fa + 0.19 * sk.s) * 100) : 0; return `<b>${esc(d.cls)}</b> · ${d.lbs} lb · ${ftIn(h)}${reach ? ` · reach ${Math.round(reach / 2.54)}"` : ''} · ${esc(d.stance)} · <b>${esc(d.record)}</b>`; },
  vsCard(M) { const c = this.el.card; this.clearCard(); const v = document.createElement('div'); v.className = 'vs';
    v.innerHTML = M.f.map((f, i) => { const d = f.def; return `<div class="vcard ${i ? 'r' : ''}" style="--ac:${d.accent}"><div class="por"><img src="${Portraits.map[d.id] || ''}" alt=""></div><div class="nk">“${esc(d.nick)}”</div><h2>${esc(d.name)}</h2><div class="meta">${this.fighterMeta(d, f.sk)}<br>${esc(d.arch)}</div></div>`; }).join('<div class="vsx">VS</div>'); c.appendChild(v);
    M.f.forEach((f, i) => Portraits.ensure(f.def).then(u => { const im = v.querySelectorAll('img')[i]; if (im) im.src = u; })); },
  lower(f, right) { this.clearCard('.lower'); const d = f.def, e = document.createElement('div'); e.className = 'lower' + (right ? ' r' : ''); e.style.setProperty('--ac', d.accent); e.innerHTML = `<p>“${esc(d.nick)}” · ${esc(d.arch)}</p><h3>${esc(d.name)}</h3><small>${this.fighterMeta(d, f.sk)} · ${esc(d.from)}</small>`; this.el.card.appendChild(e); },
  fade(v, fast) { this.el.fade.style.transitionDuration = fast ? '0s' : '.3s'; this.el.fade.style.opacity = v; },
  toast(text) { const d = document.createElement('div'); d.textContent = text; this.el.toast.appendChild(d); this.after(3.5, () => d.remove()); },
  skipBtn(label, fn) { let b = document.getElementById('skip'); if (!label) { b && b.remove(); return; } if (!b) { b = document.createElement('button'); b.id = 'skip'; this.root.appendChild(b); } b.innerHTML = label; b.onclick = fn; },
  // ── screens ────────────────────────────────────────────────────────────
  screen(cls, html) { const s = this.el.screen; s.innerHTML = `<div class="scr ${cls}">${html}</div>`; document.body.classList.add('menu'); this.mode = cls.split(' ')[0]; return s.firstChild; },
  closeScreen() { this.el.screen.innerHTML = ''; document.body.classList.remove('menu'); this.mode = null; },
  splash() { const s = this.screen('splash grain', `${emblemSVG()}<div class="wm">IRON <b>ARENA</b></div><div class="tag">Openweight Grand Prix</div><div class="rule"><i></i></div><div class="go">Preparing the cage…</div><div class="foot">An original fighting game · headphones recommended</div>`); return { bar: s.querySelector('.rule i'), go: s.querySelector('.go') }; },
  statRows(d) { return [['Power', 'power'], ['Speed', 'speed'], ['Stamina', 'stamina'], ['Defense', 'defense'], ['Endurance', 'endurance']].map(([l, k]) => `<label>${l}</label><div class="sb"><i style="transform:scaleX(${d.stats[k] / 100})"></i></div><em>${d.stats[k]}</em>`).join(''); },
  hub(G) {
    const S = Store.data, unlocked = d => !d.unlock || S.wins >= d.unlock || QS.has('unlock');
    const s = this.screen('hub', `<div class="hdr">${emblemSVG()}<h2>IRON <b>ARENA</b></h2><div class="sp"></div><div class="rec">Record <b>${S.wins}–${S.losses}</b> · KOs <b>${S.kos}</b></div></div>
      <div class="hubb"><div class="who"></div><div class="side scroll"><div class="sec">Choose your fighter</div><div class="rost">${ROSTER.map(d => `<div class="fc load${unlocked(d) ? '' : ' lock'}" data-id="${d.id}" style="--ac:${d.accent}"><img alt=""><span>${unlocked(d) ? esc(d.name) : `Win ${d.unlock} fights`}</span></div>`).join('')}</div>
      <div class="stats"></div><div class="pm"></div>
      <div class="opts"><div class="opt" data-o="opp"><label>Opponent</label><button>‹</button><b></b><button>›</button></div><div class="opt" data-o="lvl"><label>Level</label><button>‹</button><b></b><button>›</button></div><div class="opt" data-o="rounds"><label>Rounds</label><button>‹</button><b></b><button>›</button></div></div></div></div>
      <div class="acts"><button class="btn sm" data-a="tutorial">Tutorial</button><button class="btn sm" data-a="controls">Controls</button><button class="btn sm" data-a="settings">Settings</button><div class="sp"></div><button class="btn" data-a="practice">Practice</button><button class="btn pri" data-a="fight">Fight</button></div>`);
    const who = s.querySelector('.who'), stats = s.querySelector('.stats'), pm = s.querySelector('.pm'), cards = [...s.querySelectorAll('.fc')], opts = ['random', ...ROSTER.filter(unlocked).map(d => d.id)];
    const st = G.sel; if (!unlocked(fighterDef(st.me))) st.me = 'vale'; if (st.opp !== 'random' && !unlocked(fighterDef(st.opp))) st.opp = 'random';
    const draw = () => { const d = fighterDef(st.me);
      who.style.setProperty('--ac', d.accent); who.innerHTML = `<div class="nk">“${esc(d.nick)}”</div><h1>${esc(d.name)}</h1><div class="ar">${esc(d.arch)}</div><div class="meta">${this.fighterMeta(d)} · ${esc(d.from)}</div><q>${esc(d.blurb)}</q>`;
      stats.innerHTML = this.statRows(d); pm.innerHTML = `<div><b class="p">+</b>${esc(d.plus)}</div><div><b class="m">–</b>${esc(d.minus)}</div><div><b class="s">Signature</b>${d.sig.map(x => esc(x.name || MOVES[x.id].name)).join(' · ')}</div>`;
      cards.forEach(c => { c.classList.toggle('sel', c.dataset.id === st.me); c.classList.toggle('opp', c.dataset.id === st.opp); });
      s.querySelector('[data-o=opp] b').textContent = st.opp === 'random' ? 'Random' : fighterDef(st.opp).name.split(' ').pop(); s.querySelector('[data-o=lvl] b').textContent = AI_LEVELS[S.difficulty].name; s.querySelector('[data-o=rounds] b').textContent = S.rounds + ' × ' + (S.rounds === 1 ? '2:00' : '1:15'); G.preview(d); };
    cards.forEach(c => { const d = fighterDef(c.dataset.id); Portraits.ensure(d).then(u => { c.querySelector('img').src = u; c.classList.remove('load'); }); c.onclick = () => { if (c.classList.contains('lock')) { this.toast(`Win ${d.unlock} fights to unlock ${d.name}`); return; } st.me = d.id; S.lastFighter = d.id; Store.save(); draw(); }; });
    s.querySelectorAll('.opt').forEach(o => { const [a, b] = o.querySelectorAll('button'), k = o.dataset.o; const step = dir => { if (k === 'opp') st.opp = opts[(opts.indexOf(st.opp) + dir + opts.length) % opts.length]; else if (k === 'lvl') S.difficulty = (S.difficulty + dir + 3) % 3; else S.rounds = S.rounds === 1 ? (dir > 0 ? 3 : 5) : S.rounds === 3 ? (dir > 0 ? 5 : 1) : (dir > 0 ? 1 : 3); Store.save(); draw(); }; a.onclick = () => step(-1); b.onclick = () => step(1); });
    s.querySelectorAll('[data-a]').forEach(b => b.onclick = () => G.hubAction(b.dataset.a)); draw();
  },
  results(M, G, extra) {
    const r = M.result, [a, b] = M.f, me = M.o.p1ai == null, won = r.winner === 0, draw = r.winner < 0, wf = draw ? null : M.f[r.winner], tm = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    const row = (label, x, y, hi = true) => `<div class="v l ${hi && x > y ? 'w' : ''}">${x}</div><div class="c">${label}</div><div class="v ${hi && y > x ? 'w' : ''}">${y}</div>`, sa = a.stats, sb = b.stats, pct = s => s.thrown ? Math.round(s.landed / s.thrown * 100) + '%' : '—';
    const s = this.screen('res', `<div class="out ${!draw && !won && me ? 'l' : ''}">${draw ? 'Draw' : me ? (won ? 'Victory' : 'Defeat') : esc(wf.def.name.split(' ').pop()) + ' wins'}</div>
      <div class="how">${draw ? 'Judges’ decision' : `${esc(wf.def.name)} · ${esc(r.how)}${r.how === 'Decision' ? ` · ${r.ta}–${r.tb}` : ` · Round ${r.round} · ${tm}`}`}</div>
      <div class="tbl"><div class="h l" style="--ac:${a.def.accent}">${esc(a.def.name)}</div><div class="c"></div><div class="h" style="--ac:${b.def.accent}">${esc(b.def.name)}</div>
      ${row('Strikes landed', sa.landed, sb.landed)}${row('Thrown', sa.thrown, sb.thrown, false)}${`<div class="v l">${pct(sa)}</div><div class="c">Accuracy</div><div class="v">${pct(sb)}</div>`}${row('Significant', sa.sig, sb.sig)}${`<div class="v l">${sa.head} / ${sa.body} / ${sa.legs}</div><div class="c">Head / body / legs</div><div class="v">${sb.head} / ${sb.body} / ${sb.legs}</div>`}${row('Knockdowns', sa.kd, sb.kd)}${row('Blocked', sa.blocked, sb.blocked)}${row('Evaded', sa.evaded, sb.evaded)}${row('Counters', sa.counters, sb.counters)}${row('Best combo', sa.best, sb.best)}
      ${M.scores.length ? `<div class="v l">${M.scores.map(x => x[0]).join(' · ')}</div><div class="c">Scorecard</div><div class="v">${M.scores.map(x => x[1]).join(' · ')}</div>` : ''}</div>
      ${extra ? `<div class="note">${extra}</div>` : ''}<div class="brow">${G.canReplay() ? '<button class="btn" data-a="replay">Watch replay</button>' : ''}<button class="btn pri" data-a="rematch">Rematch</button><button class="btn" data-a="hub">New fight</button></div>`);
    s.querySelectorAll('[data-a]').forEach(bt => bt.onclick = () => G.resultAction(bt.dataset.a));
  },
  moveList(d) { const lab = k => Input.touchUsed && !Input.kbUsed ? '' : `<small>${esc(Input.label(k))}</small>`, cols = [['qp', 'Quick punch'], ['pp', 'Power punch'], ['qk', 'Quick kick'], ['pk', 'Power kick']];
    return `<div class="mv"><div></div>${cols.map(c => `<div class="hd">${c[1]}</div>`).join('')}${[['high', 'High ▲'], ['mid', 'Mid'], ['low', 'Low ▼']].map(([lv, ln]) => `<div class="hd">${ln}</div>` + cols.map(c => { const m = MOVES[d.moves[c[0]][lv]], alt = ALT0[m.id]; return `<div class="cell"><b>${esc(m.name)}</b>${lab(c[0] + '_' + lv)}${alt && alt !== m.id ? `<small> · again: ${esc(MOVES[alt].name)}</small>` : ''}</div>`; }).join('')).join('')}</div>
      <div class="cmb"><b>Signature 1</b><span>${esc(d.sig[0].name || MOVES[d.sig[0].id].name)} — ${Input.touchUsed && !Input.kbUsed ? '★ button' : `<kbd>${esc(Input.label('sig1'))}</kbd> or both punch keys together`}</span><b>Signature 2</b><span>${esc(d.sig[1].name || MOVES[d.sig[1].id].name)} — ${Input.touchUsed && !Input.kbUsed ? '★ button' : `<kbd>${esc(Input.label('sig2'))}</kbd> or both kick keys together`}</span>
      ${d.combos.map(c => `<b>${esc(c.name)}</b><span>${c.seq.map(id => esc(MOVES[id].name)).join(' → ')}</span>`).join('')}</div>
      <p class="pm" style="margin-top:10px">Chain strikes from <b>different limbs</b> to cancel recovery. Finishing a named combination adds damage. <b>Guard</b> + up / down sets a high or low guard. <b>Evade</b> + back sways, + sideways slips straight strikes, + forward ducks high ones.</p>`; },
  bindsPanel() { return `<div class="binds">${Object.keys(BIND0).map(a => `<label>${BIND_LABEL[a]}</label><button data-b="${a}">${esc(Input.label(a))}</button>`).join('')}</div><div class="brow" style="margin-top:12px"><button class="btn sm" data-r="1">Reset to defaults</button></div><p class="pm" style="margin-top:10px">Also: arrow keys move · left / right mouse buttons throw quick / power punch · gamepads are supported (triggers pick high / low).</p>`; },
  settingsPanel() { const v = Store.data.vol, S = Store.data; return `<div class="sets">${[['master', 'Master volume'], ['sfx', 'Effects'], ['crowd', 'Crowd'], ['music', 'Stings']].map(([k, l]) => `<label>${l}</label><input type="range" min="0" max="1" step="0.05" value="${v[k]}" data-v="${k}">`).join('')}
      <label>Graphics</label><div class="seg" data-s="quality">${['auto', 'high', 'medium', 'low'].map(q => `<button class="${S.quality === q ? 'on' : ''}" data-q="${q}">${q}</button>`).join('')}</div>
      <label>Opponent level</label><div class="seg" data-s="difficulty">${AI_LEVELS.map((l, i) => `<button class="${S.difficulty === i ? 'on' : ''}" data-q="${i}">${l.name}</button>`).join('')}</div></div><p class="pm" style="margin-top:12px">Graphics changes apply to new fighters after a reload; resolution adapts automatically to hold frame rate.</p>`; },
  /** tabbed panel used by pause and by the hub (controls / settings) */
  panel(title, tabs, start, G, menuHtml) {
    const s = this.screen('pause', `<div class="panel"><header><h3>${esc(title)}</h3><button class="btn sm" data-x="1">${menuHtml ? 'Resume' : 'Close'}</button></header><div class="tabs">${tabs.map(t => `<button data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="pbody scroll"></div></div>`), body = s.querySelector('.pbody');
    const show = id => { s.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
      if (id === 'menu') { body.innerHTML = menuHtml; body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => G.pauseAction(b.dataset.a)); }
      else if (id === 'moves') body.innerHTML = this.moveList(G.M ? G.M.f[0].def : fighterDef(G.sel.me));
      else if (id === 'controls') { body.innerHTML = this.bindsPanel(); body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { b.classList.add('cap'); b.textContent = 'press a key'; Input.capture = code => { if (code !== 'Escape') Input.rebind(b.dataset.b, code); show('controls'); }; }); body.querySelector('[data-r]').onclick = () => { Input.resetBinds(); show('controls'); }; }
      else if (id === 'settings') { body.innerHTML = this.settingsPanel(); body.querySelectorAll('input').forEach(i => i.oninput = () => { Store.data.vol[i.dataset.v] = +i.value; Store.save(); Sfx.setVol(); }); body.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { const k = g.dataset.s; Store.data[k] = k === 'difficulty' ? +b.dataset.q : b.dataset.q; Store.save(); if (k === 'quality' && b.dataset.q !== 'auto') Gfx.setQuality(b.dataset.q); if (k === 'difficulty' && G.M && G.M.f[1].ctrl.D) G.M.f[1].ctrl.D = AI_LEVELS[Store.data.difficulty]; show('settings'); })); } };
    s.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.t)); s.querySelector('[data-x]').onclick = () => G.closePanel(); show(start);
  }
};
