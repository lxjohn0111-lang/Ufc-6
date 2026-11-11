/* ═══════════════════════════ SOUND ═══════════════════════════
   Everything is synthesised with the Web Audio API — no samples. Layered impacts (thump + crack
   + body), whooshes that follow strike weight, glove-on-guard thuds, canvas footsteps, breathing
   that gets heavier with fatigue, a three-layer crowd bed whose energy follows the fight, crowd
   one-shots (gasp, roar, whistles), a struck bell, UI ticks and short percussive stings.
   The context is created on the first user gesture, as browsers require. */
const Sfx = {
  ctx: null, ready: false, excite: 0, breathT: 0, musicOn: null, vol: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(), v = this.vol = Store.data.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = v.master; comp.connect(this.master); this.master.connect(c.destination);
    const bus = (g) => { const n = c.createGain(); n.gain.value = g; n.connect(comp); return n; };
    this.bSfx = bus(v.sfx); this.bCrowd = bus(v.crowd * 0.9); this.bMusic = bus(v.music * 0.8);
    // noise sources
    const len = c.sampleRate * 2, nb = this.noiseBuf = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const bb = this.brownBuf = c.createBuffer(1, len, c.sampleRate), e = bb.getChannelData(0); let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = l * 3.5; }
    this.an = c.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an);
    this.crowdBed(); this.ready = true; if (c.state === 'suspended') c.resume();
  },
  /** output level right now (used by the automated test to prove sound is produced) */
  rms() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); },
  setVol() { if (!this.ctx) return; const v = Store.data.vol, t = this.ctx.currentTime; this.master.gain.setTargetAtTime(v.master, t, 0.05); this.bSfx.gain.setTargetAtTime(v.sfx, t, 0.05); this.bCrowd.gain.setTargetAtTime(v.crowd * 0.9, t, 0.05); this.bMusic.gain.setTargetAtTime(v.music * 0.8, t, 0.05); },
  noise(buf, loop) { const s = this.ctx.createBufferSource(); s.buffer = buf || this.noiseBuf; s.loop = !!loop; if (!loop) s.playbackRate.value = 0.8 + Math.random() * 0.4; return s; },
  pan(x) { const c = this.ctx; if (!c.createStereoPanner) return null; const p = c.createStereoPanner(); p.pan.value = clamp(x, -0.8, 0.8); return p; },
  /** filtered noise burst */
  burst(o) { const c = this.ctx, t = c.currentTime + (o.at || 0), s = this.noise(o.brown ? this.brownBuf : null), f = c.createBiquadFilter(), g = c.createGain();
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur); f.Q.value = o.q ?? 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + (o.att ?? 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); const p = o.pan != null && this.pan(o.pan); if (p) { g.connect(p); p.connect(o.bus || this.bSfx); } else g.connect(o.bus || this.bSfx); s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05); },
  /** pitched body (sine / triangle with a pitch drop) */
  tone(o) { const c = this.ctx, t = c.currentTime + (o.at || 0), s = c.createOscillator(), g = c.createGain(); s.type = o.wave || 'sine'; s.frequency.setValueAtTime(o.f0, t); if (o.f1) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur * (o.drop || 1));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + (o.att ?? 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur); s.connect(g); const p = o.pan != null && this.pan(o.pan); if (p) { g.connect(p); p.connect(o.bus || this.bSfx); } else g.connect(o.bus || this.bSfx); s.start(t); s.stop(t + o.dur + 0.05); },
  // ── crowd ──────────────────────────────────────────────────────────────
  crowdBed() { const c = this.ctx, mk = (buf, type, freq, q, gain) => { const s = this.noise(buf, true), f = c.createBiquadFilter(), g = c.createGain(); f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.bCrowd); s.start(0, Math.random()); return { f, g }; };
    this.cLow = mk(this.brownBuf, 'lowpass', 320, 0.5, 0.2); this.cMid = mk(this.noiseBuf, 'bandpass', 760, 0.6, 0.035); this.cHi = mk(this.noiseBuf, 'bandpass', 2300, 0.9, 0.0);
    // slow swell so the room never sounds like a constant hiss
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(this.cMid.g.gain); lfo.start(); },
  crowd(level, mood = 1) { if (!this.ready) return; const t = this.ctx.currentTime; this.cLow.g.gain.setTargetAtTime(0.14 * mood + 0.1 * level, t, 0.3); this.cMid.g.gain.setTargetAtTime(0.03 * mood + 0.085 * level, t, 0.25); this.cMid.f.frequency.setTargetAtTime(700 + 500 * level, t, 0.3); this.cHi.g.gain.setTargetAtTime(0.05 * level * level, t, 0.2); },
  roar(k = 1) { if (!this.ready) return; this.burst({ f0: 900, f1: 1700, q: 0.5, gain: 0.2 * k, att: 0.25, dur: 2.6 + k, bus: this.bCrowd }); this.burst({ f0: 2400, f1: 3200, q: 0.8, gain: 0.07 * k, att: 0.4, dur: 2.2 + k, bus: this.bCrowd }); if (k > 0.6) for (let i = 0; i < 3; i++) this.whistle(0.3 + Math.random() * 1.6); },
  gasp(k = 1) { if (!this.ready) return; this.burst({ f0: 1300, f1: 520, q: 0.7, gain: 0.13 * k, att: 0.05, dur: 0.9, bus: this.bCrowd }); },
  whistle(at = 0) { const c = this.ctx, t = c.currentTime + at, s = c.createOscillator(), g = c.createGain(), f0 = 2200 + Math.random() * 1200; s.frequency.setValueAtTime(f0 * 0.8, t); s.frequency.linearRampToValueAtTime(f0, t + 0.12); s.frequency.linearRampToValueAtTime(f0 * 0.92, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); const p = this.pan(Math.random() * 1.6 - 0.8); s.connect(g); if (p) { g.connect(p); p.connect(this.bCrowd); } else g.connect(this.bCrowd); s.start(t); s.stop(t + 0.6); },
  // ── combat ─────────────────────────────────────────────────────────────
  whoosh(heavy, kick, pan) { if (!this.ready) return; const k = 0.75 + Math.random() * 0.4; this.burst({ f0: (kick ? 380 : 620) * k, f1: (kick ? 1500 : 2600) * k, q: 1.2, gain: 0.05 + heavy * 0.035 + (kick ? 0.02 : 0), att: 0.03, dur: 0.11 + heavy * 0.05 + (kick ? 0.06 : 0), pan }); },
  exhale(pan) { if (!this.ready) return; this.burst({ type: 'highpass', f0: 2800, q: 0.7, gain: 0.018 + Math.random() * 0.012, att: 0.01, dur: 0.07, pan }); },
  impact(lvl, heavy, pan, k = 1) { if (!this.ready) return; const v = (0.8 + Math.random() * 0.3) * k, p = 0.9 + Math.random() * 0.2;
    if (lvl === 'head') { this.tone({ f0: 190 * p, f1: 62, dur: 0.11 + heavy * 0.04, gain: (0.28 + heavy * 0.14) * v, pan }); this.burst({ type: 'highpass', f0: 1700, q: 0.6, gain: (0.16 + heavy * 0.1) * v, dur: 0.045, pan }); this.burst({ f0: 900 * p, q: 1.4, gain: (0.12 + heavy * 0.07) * v, dur: 0.07, pan }); }
    else if (lvl === 'body') { this.tone({ f0: 120 * p, f1: 44, dur: 0.16 + heavy * 0.05, gain: (0.36 + heavy * 0.16) * v, pan }); this.burst({ type: 'lowpass', f0: 520, q: 0.8, gain: (0.22 + heavy * 0.1) * v, dur: 0.1, pan, brown: true }); this.burst({ f0: 1300, q: 1.2, gain: 0.06 * v, dur: 0.04, pan }); }
    else { this.burst({ f0: 1900 * p, q: 1.6, gain: (0.2 + heavy * 0.08) * v, dur: 0.05, pan }); this.tone({ f0: 230 * p, f1: 85, dur: 0.09, gain: (0.2 + heavy * 0.1) * v, pan }); this.burst({ type: 'highpass', f0: 2600, q: 0.6, gain: 0.07 * v, dur: 0.03, pan }); }
    if (heavy > 1) this.tone({ f0: 70, f1: 34, dur: 0.3, gain: 0.3 * v, pan }); },
  block(heavy, pan, perfect) { if (!this.ready) return; const p = 0.9 + Math.random() * 0.2; this.burst({ type: 'lowpass', f0: 950 * p, q: 0.8, gain: 0.16 + heavy * 0.05, dur: 0.06, pan }); this.tone({ f0: 115 * p, f1: 66, dur: 0.08, gain: 0.16 + heavy * 0.05, pan });
    if (perfect) { this.tone({ wave: 'triangle', f0: 1240, dur: 0.22, gain: 0.07, pan }); this.tone({ wave: 'triangle', f0: 1860, dur: 0.18, gain: 0.045, pan }); } },
  step(h, pan) { if (!this.ready) return; this.burst({ type: 'lowpass', f0: 260, q: 0.7, gain: 0.03 + h * 0.5, dur: 0.05, pan, brown: true }); if (Math.random() < 0.18) this.burst({ f0: 2700, q: 6, gain: 0.006, dur: 0.05, pan }); },
  fall(pan) { if (!this.ready) return; this.tone({ f0: 95, f1: 32, dur: 0.34, gain: 0.5, pan }); this.burst({ type: 'lowpass', f0: 300, q: 0.6, gain: 0.34, dur: 0.26, pan, brown: true }); this.burst({ f0: 1400, q: 1, gain: 0.05, dur: 0.05, pan, at: 0.01 }); },
  cage(pan) { if (!this.ready) return; for (let i = 0; i < 4; i++) this.tone({ wave: 'triangle', f0: 900 + Math.random() * 1800, dur: 0.25 + Math.random() * 0.2, gain: 0.02, pan, at: i * 0.012 }); this.burst({ f0: 3000, q: 2, gain: 0.05, dur: 0.18, pan }); },
  breath(k, pan) { if (!this.ready) return; this.burst({ f0: 620, f1: 480, q: 0.9, gain: 0.02 * k, att: 0.12, dur: 0.42, pan }); this.burst({ f0: 900, f1: 1100, q: 0.9, gain: 0.014 * k, att: 0.1, dur: 0.34, pan, at: 0.5 }); },
  bell(n = 1) { if (!this.ready) return; for (let i = 0; i < n; i++) for (const [m, g, d] of [[1, 0.22, 1.5], [2.76, 0.1, 1.0], [5.4, 0.06, 0.6], [8.93, 0.03, 0.35]]) this.tone({ wave: 'sine', f0: 540 * m, dur: d, gain: g, at: i * 0.36 }); this.burst({ type: 'highpass', f0: 3000, gain: 0.05, dur: 0.03 }); },
  ui(kind) { if (!this.ready) return; if (kind === 'move') this.tone({ wave: 'triangle', f0: 760, dur: 0.05, gain: 0.04 }); else if (kind === 'ok') { this.tone({ wave: 'triangle', f0: 620, dur: 0.07, gain: 0.07 }); this.tone({ wave: 'triangle', f0: 930, dur: 0.12, gain: 0.07, at: 0.06 }); } else if (kind === 'back') this.tone({ wave: 'triangle', f0: 520, f1: 380, dur: 0.1, gain: 0.06 }); else if (kind === 'good') { this.tone({ wave: 'triangle', f0: 880, dur: 0.09, gain: 0.06 }); this.tone({ wave: 'triangle', f0: 1320, dur: 0.16, gain: 0.06, at: 0.08 }); } },
  /** percussive hit used by stings and the presentation drums */
  drum(at, f0, gain, dur = 0.3) { this.tone({ f0, f1: f0 * 0.4, dur, gain, at, bus: this.bMusic }); this.burst({ type: 'lowpass', f0: f0 * 6, gain: gain * 0.35, dur: 0.07, at, bus: this.bMusic, brown: true }); },
  chord(at, notes, dur, gain) { const c = this.ctx, t = c.currentTime + at; for (const n of notes) for (const det of [-5, 5]) { const s = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); s.type = 'sawtooth'; s.frequency.value = n; s.detune.value = det; f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2200, t + dur * 0.25); f.frequency.linearRampToValueAtTime(700, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.bMusic); s.start(t); s.stop(t + dur + 0.05); } },
  sting(kind) { if (!this.ready) return; const N = { D2: 73.4, A2: 110, D3: 146.8, F3: 174.6, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, 'F#4': 370, G4: 392, A4: 440 };
    if (kind === 'intro') { for (let i = 0; i < 8; i++) this.drum(i * 0.28, i % 4 === 0 ? 62 : 92, i % 4 === 0 ? 0.5 : 0.22, 0.34); this.chord(0, [N.D2, N.A2], 2.4, 0.045); this.chord(1.12, [N.D3, N.F3, N.A3], 1.4, 0.035); }
    else if (kind === 'fight') { this.drum(0, 60, 0.6, 0.5); this.drum(0.14, 60, 0.5, 0.5); this.chord(0, [N.D3, N.A3, N.D4], 0.9, 0.05); }
    else if (kind === 'win') { this.drum(0, 62, 0.55, 0.5); this.chord(0, [N.D3, N['F#4'], N.A3], 0.5, 0.05); this.chord(0.42, [N.D3, N.A3, N.D4], 0.5, 0.05); this.chord(0.84, [N.D4, N['F#4'], N.A4], 1.8, 0.055); this.drum(0.84, 62, 0.6, 0.6); }
    else if (kind === 'lose') { this.drum(0, 55, 0.5, 0.6); this.chord(0, [N.D3, N.F3, N.A3], 1.0, 0.045); this.chord(0.7, [N.D3, N.F3, N.C4 * 0.5 * 2 * 0.94], 1.8, 0.04); }
    else if (kind === 'ko') { this.drum(0, 48, 0.8, 0.9); this.chord(0, [N.D2, N.A2, N.D3], 2.2, 0.06); }
    else if (kind === 'round') { this.drum(0, 70, 0.45, 0.35); this.chord(0, [N.D3, N.A3], 0.7, 0.04); } },
  update(dt, M) {
    if (!this.ready) return; this.excite = damp(this.excite, Arena.excite, 3, dt); const mood = Arena.moodName === 'gym' ? 0.45 : Arena.moodName === 'intro' ? 1.15 : 1; this.crowd(clamp01(this.excite), mood);
    if (M && M.state === 'fight') { this.breathT -= dt; if (this.breathT <= 0) { const f = M.f[0], tired = clamp01((60 - f.st) / 50); this.breathT = lerp(2.6, 1.05, tired); if (tired > 0.1 && !f.down) this.breath(tired * 1.6, -0.3); const g = M.f[1], t2 = clamp01((50 - g.st) / 50); if (t2 > 0.3 && !g.down) this.breath(t2, 0.3); } }
  },
  screenPan(pos) { Cam.toScreen(pos, _v3); return clamp((_v3.x / Gfx.viewport.w) * 2 - 1, -1, 1) * 0.7; }
};
Bus.on('strike', e => { const p = Sfx.screenPan(e.f.pos); Sfx.whoosh(e.m.heavy, e.m.limb[1] === 'f', p); if (Math.random() < 0.7) Sfx.exhale(p); });
Bus.on('hit', e => { const p = Sfx.screenPan(e.pos); if (e.clean) { Sfx.impact(e.m.lvl, e.heavy, p, e.counter ? 1.2 : 1); if (e.heavy > 1 || e.counter) Sfx.gasp(0.6 + e.heavy * 0.2); if (e.combo) Sfx.roar(0.35); } else { Sfx.block(e.heavy, p, e.perfect); if (e.check) Sfx.impact('leg', 0, p, 0.6); if (e.gbreak) Sfx.gasp(0.8); } });
Bus.on('knockdown', e => { Sfx.roar(e.final ? 1.3 : 0.9); setTimeout(() => Sfx.fall(Sfx.screenPan(e.f.pos)), 380); if (e.final) Sfx.sting('ko'); });
Bus.on('evaded', e => { Sfx.burst({ f0: 1400, f1: 3200, q: 1.5, gain: 0.05, dur: 0.14 }); });
Bus.on('step', e => Sfx.step(e.h, Sfx.screenPan(e.f.pos)));
Bus.on('cage', e => Sfx.cage(Sfx.screenPan(e.f.pos)));
