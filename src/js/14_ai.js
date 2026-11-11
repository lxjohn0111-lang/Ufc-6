/* ═══════════════════════════ OPPONENT BRAIN ═══════════════════════════
   Personality (from the roster) × difficulty. The AI sees a strike only after a reaction delay,
   then chooses to block (guessing the level), evade with the right evasion, back out, or eat it.
   On offence it manages range, picks openers that fit the distance, runs its fighter's own
   combinations, punishes whiffs, goes to the body/legs when the head is covered, and backs off
   to breathe when its stamina is low. */
const AI_LEVELS = [
  { name: 'Rookie',    react: 0.36, def: 0.46, read: 0.55, aggr: 0.6,  combo: 2, gap: [1.3, 2.8], punish: 0.25, adapt: 0.2 },
  { name: 'Contender', react: 0.26, def: 0.76, read: 0.75, aggr: 0.9,  combo: 4, gap: [0.9, 2.0], punish: 0.6, adapt: 0.6 },
  { name: 'Champion',  react: 0.18, def: 0.9, read: 0.9,  aggr: 1.15, combo: 6, gap: [0.55, 1.4], punish: 0.9, adapt: 1.0 },
];
class AICtrl {
  constructor(f, level, M) { this.f = f; this.M = M; this.D = AI_LEVELS[clamp(level, 0, 2)]; this.p = f.def.ai; this.tAct = 0.6 + rand(); this.queue = []; this.threat = null; this.plan = null; this.planT = 0; this.circ = rand() < 0.5 ? 1 : -1; this.circT = 0; this.rest = 0; this.holdG = 0; this.seen = { head: 0, body: 0, leg: 0 }; this.blockedHigh = 0; this.passive = false; this.script = null; }
  pickEvade(m) { const f = this.f; if (m.high && (m.kind === 'hook' || m.kind === 'round' || m.kind === 'spin')) return rand() < 0.6 ? 'duck' : 'sway'; if (m.lin) return rand() < 0.6 ? (rand() < 0.5 ? 'slipL' : 'slipR') : (m.lvl === 'head' ? 'sway' : 'slipL'); if (m.lvl === 'head') return 'sway'; return null; }
  think(dt) {
    const f = this.f, o = f.opp, p = this.p, D = this.D, M = this.M; f.wish.set(0, 0, 0); f.in.guard = false; f.in.glv = 0;
    if (M.state !== 'fight' || f.state === 'cine' || f.down) { this.queue.length = 0; this.threat = null; return; }
    if (this.script) { this.script(this, dt); return; }
    const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, dist = Math.hypot(dx, dz) || 1e-3, tx = dx / dist, tz = dz / dist, jr = f.rangeOf(MOVES.jab);
    this.tAct -= dt; this.circT -= dt; this.rest -= dt; this.holdG -= dt; if (this.circT < 0) { this.circT = 1 + rand() * 2.5; if (rand() < 0.45) this.circ *= -1; }
    const move = (fw, lat) => { f.wish.set(tx * fw - tz * lat * this.circ, 0, tz * fw + tx * lat * this.circ); };
    if (o.down) { if (dist < 2.3) move(-1, 0); this.queue.length = 0; return; }
    // ── defence: react to a strike in flight ─────────────────────────────
    let defending = false;
    if (o.state === 'attack' && !o.hitDone && !this.passive) {
      if (this.threat !== o.move || this.threatT > o.stateT) { this.threat = o.move; this.planT = D.react * (0.75 + 0.5 * rand()) * (f.rocked > 0 ? 1.5 : 1) * (1 + 0.5 * (1 - f.st / 100)) * (o.chain.length > 1 ? 0.45 : 1) * (1 - 0.6 * p.evade * D.def);
        const m = o.move, inR = dist < o.rangeOf(m) + 0.25, r = rand(), fam = Math.min(0.18, (this.seen[m.lvl] || 0) * 0.012 * D.adapt);
        const pBlock = clamp01(p.guard * D.def + fam), pEv = (1 - pBlock) * clamp01(p.evade * D.def * 1.1), ev = this.pickEvade(m);
        this.plan = !inR ? 'none' : r < pBlock ? 'block' : r < pBlock + pEv && ev && f.st > 12 ? 'evade' : r < pBlock + pEv + 0.12 ? 'back' : 'none'; this.planEv = ev;
        const right = rand() < D.read; this.planLvl = m.lvl === 'head' ? (right ? (rand() < 0.5 ? 1 : 0) : -1) : m.lvl === 'body' ? (right ? (rand() < 0.6 ? -1 : 0) : 1) : (right && rand() < D.read * 0.7 ? -1 : 0);
        if (m.fake && rand() > D.read * 0.6) this.planLvl = -1; this.seen[m.lvl] = (this.seen[m.lvl] || 0) + 1; }
      this.threatT = o.stateT; this.planT -= dt;
      if (this.planT <= 0 && (f.state === 'idle' || f.state === 'block')) {
        if (this.plan === 'block') { f.in.guard = true; f.in.glv = this.planLvl; defending = true; this.holdG = 0.25 + rand() * 0.2; this.holdLvl = this.planLvl; }
        else if (this.plan === 'evade') { if (o.stateT > o.ph[0] - 0.24) { f.pressEvade(this.planEv); this.plan = 'done'; this.counterArm = rand() < p.counter * D.def + 0.15; } defending = true; }
        else if (this.plan === 'back') { move(-1, 0); defending = true; }
      }
    } else { this.threat = null; if (this.holdG > 0 && f.sinceHit > 0.2 && !this.passive) { f.in.guard = true; f.in.glv = this.holdLvl || 0; defending = this.queue.length === 0; } }
    if (this.passive) { if (this.passiveGuard) { f.in.guard = true; f.in.glv = this.passiveGuard === 'high' ? 1 : this.passiveGuard === 'low' ? -1 : 0; } return; }
    // counter after a clean evade or a perfect block
    if (f.counterT > 0.2 && this.counterArm !== false && (f.state === 'idle' || f.state === 'evade') && !this.queue.length && dist < jr + 0.35) { const c = f.def.combos.filter(c => c.seq.length <= 3); this.queue = (c.length ? rand.pick(c).seq : ['cross', 'hookL']).slice(0, D.combo); this.counterArm = false; }
    if (f.counterT <= 0) this.counterArm = null;
    // punish a whiff / blocked heavy strike
    if (o.state === 'attack' && o.hitDone && !o.connected && f.free && !this.queue.length && dist < jr + 0.2 && rand() < D.punish * dt * 14) this.queue = this.pickCombo(dist, true);
    // ── offence ──────────────────────────────────────────────────────────
    if (this.queue.length) {
      const id = this.queue[0], m = MOVES[id];
      if (f.state === 'idle') { const r = f.rangeOf(m) * 0.96; if (dist <= r) { f.pressMove(id); this.queue.shift(); this.sent = id; } else if (dist < r + 0.9) move(1, 0.15); else this.queue.length = 0; }
      else if (f.state === 'attack' && f.hitDone) { if (f.connected || rand() < 0.3) { if (!f.buf) { f.pressMove(id); this.queue.shift(); } } else this.queue.length = 0; }
      else if (f.state === 'hit' || f.state === 'stagger') this.queue.length = 0;
      if (!this.queue.length) { this.tAct = lerp(D.gap[0], D.gap[1], rand()) * (1.35 - 0.6 * p.aggr) * f.k.time0 * f.k.time0; if (rand() > p.aggr) this.reset = 0.35 + rand() * 0.5; }
      return;
    }
    if (defending) return;
    const tired = f.st < 24 || f.exhaust > 0; if (tired && this.rest <= 0) this.rest = 1.2 + rand() * 1.2; if (f.st > 60) this.rest = Math.min(this.rest, 0.2);
    const want = jr * p.range * (this.rest > 0 ? 1.5 : 1) * (f.rocked > 0 ? 1.4 : 1), wall = ARENA.wallDist(f.pos);
    if (this.rest > 0) { if (dist < want) move(-0.9, 0.5); else move(0, 0.4); if (dist < jr + 0.2) { f.in.guard = true; f.in.glv = 0; } if (wall < 0.9) this.circ = this.sideToCenter(tx, tz); return; }
    this.reset = (this.reset || 0) - dt; if (this.reset > 0 && wall > 0.9) { move(-0.9, 0.5); return; }
    if (wall < 0.8) { this.circ = this.sideToCenter(tx, tz); move(dist > want ? 0.5 : -0.1, 1); }
    else if (dist > want + 0.12) move(clamp(0.55 + p.aggr * 0.5, 0.5, 1), dist < want + 0.8 ? 0.25 : 0);
    else if (dist < want - 0.28 && p.aggr < 0.75) move(-0.7, 0.3);
    else move((rand() - 0.5) * 0.3, 0.55 * (0.4 + (1 - p.aggr) * 0.8));
    // guard discipline: keep the hands home when in the pocket and not throwing
    if (dist < o.rangeOf(MOVES.cross) + 0.25 && f.free && o.state !== 'hit' && o.state !== 'stagger') { this.gT = (this.gT || 0) - dt; if (this.gT <= 0) { this.gT = 0.35 + rand() * 0.5; this.gOn = rand() < p.guard * D.def * (o.state === 'attack' ? 1.3 : 1.05) + 0.12; this.gLvl = rand() < 0.2 ? 1 : rand() < 0.12 ? -1 : 0; } if (this.gOn) { f.in.guard = true; f.in.glv = this.gLvl; } }
    if (this.tAct <= 0 && f.free && dist < jr + 1.0) {
      const go = clamp01(p.aggr * D.aggr * (o.rocked > 0 ? 1.6 : 1) * (f.st > 45 ? 1 : 0.5) * 0.8);
      if (rand() < go) this.queue = this.pickCombo(dist, false); else { this.tAct = 0.4 + rand() * 0.8; if (rand() < 0.3) this.holdG = 0.4, this.holdLvl = 0; }
    }
  }
  sideToCenter(tx, tz) { const f = this.f; return (-tz * -f.pos.x + tx * -f.pos.z) > 0 ? 1 : -1; }
  /** choose an attack sequence that suits distance, stamina, personality and what the opponent has been blocking */
  pickCombo(dist, punish) {
    const f = this.f, o = f.opp, p = this.p, D = this.D, opts = [], jr = f.rangeOf(MOVES.jab), g = f.def.moves;
    const add = (seq, w) => { const first = MOVES[seq[0]]; if (!first) return; const r = f.rangeOf(first); if (dist > r + 0.7) return; opts.push({ seq, w: w * (dist <= r ? 1.4 : 0.8) }); };
    const guardHigh = o.guarding && o.in.glv >= 0, bodyK = p.body * (guardHigh ? 2.2 : 1) * (1 + (1 - o.cond.body / 100)), kickK = p.kick * (f.cond.legs > 40 ? 1 : 0.4), legK = kickK * (1 + (1 - o.cond.legs / 100) * 1.5);
    for (const c of f.def.combos) add(c.seq, 1.6 * p.combo * (c.seq.length <= D.combo ? 1 : 0.35));
    add(['jab'], 1.4); add(['jab', 'cross'], 1.5); add(['jab', 'jab'], 0.5); add([g.pp.mid], 0.6); add(['jab', g.qp.high], 0.7); add([g.qp.high, g.pp.mid], 0.6);
    add([g.qp.low], 0.8 * bodyK); add([g.qp.low, g.pp.mid], 0.8 * bodyK); add(['jab', g.pp.low], 1.0 * bodyK); add([g.pp.low, g.qp.high], 0.8 * bodyK);
    add([g.qk.low], 1.2 * legK); add([g.pk.low], 1.3 * legK); add(['jab', g.pk.low], 1.0 * legK); add([g.qk.mid], 0.9 * kickK); add([g.pk.mid], 1.0 * kickK * (guardHigh ? 1.6 : 1)); add([g.pk.high], 0.45 * kickK * (o.rocked > 0 ? 2.5 : 1)); add(['jab', 'cross', g.pk.mid], 0.6 * kickK);
    for (const sg of f.def.sig) add(sg.macro || [sg.id], (punish ? 1.4 : 0.55) * (p.wild ? 1.25 : 1) * (f.st > 40 ? 1 : 0.2));
    if (dist < jr * 0.8) { add([g.pp.high], 1.3); add(['upperL', 'hookR'], 0.9); add([g.qp.high, g.pp.high], 1.0); }
    if (!opts.length) return ['jab'];
    let tot = 0; for (const op of opts) tot += op.w; let r = rand() * tot; for (const op of opts) { if ((r -= op.w) <= 0) return op.seq.slice(0, Math.max(1, D.combo)); } return opts[0].seq.slice();
  }
}

/** the human: turns device input into intents */
class PlayerCtrl {
  constructor(f, M) { this.f = f; this.M = M; }
  think(dt) {
    const f = this.f, I = Input, o = f.opp; f.wish.set(0, 0, 0); f.in.guard = false; f.in.glv = 0;
    const live = this.M.state === 'fight' && f.state !== 'cine' && !this.M.lockInput;
    if (!live) { I.queue.length = 0; return; }
    const mx = I.mx, my = I.my, mag = Math.hypot(mx, my);
    if (mag > 0.15) f.wish.set(Cam.right.x * mx + Cam.fwd.x * my, 0, Cam.right.z * mx + Cam.fwd.z * my).multiplyScalar(Math.min(1, mag) / mag);
    if (I.guard) { f.in.guard = true; f.in.glv = my > 0.45 ? 1 : my < -0.45 ? -1 : 0; f.wish.set(Cam.right.x * mx, 0, Cam.right.z * mx); }
    while (I.queue.length) { const e = I.queue.shift();
      if (e.t === 'atk') f.pressAttack(e.slot, e.lvl, e.upgrade); else if (e.t === 'sig') f.pressSig(e.i);
      else if (e.t === 'evade') { const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1, wx = Cam.right.x * mx + Cam.fwd.x * my, wz = Cam.right.z * mx + Cam.fwd.z * my, fw = (wx * dx + wz * dz) / d;
        const lead = f.anim.dir(1, 0, 0, _v1), lat = wx * lead.x + wz * lead.z;
        f.pressEvade(mag < 0.3 || fw < -0.5 ? 'sway' : fw > 0.6 ? 'duck' : lat > 0 ? 'slipL' : 'slipR'); }
      Bus.emit('input', e); }
  }
}
