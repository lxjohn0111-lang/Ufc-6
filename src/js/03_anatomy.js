/* ═══════════════════════════ ANATOMY ═══════════════════════════
   Skeleton layout + the muscle-group primitives that the sculpt kernel turns into each fighter.
   Convention: Y up, fighter faces +Z, +X is the fighter's LEFT. Every bone has identity rotation
   in the bind pose (A-pose), so a bone's world rotation is simply its delta from bind. */
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'uarmL', 'farmL', 'handL', 'clavR', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
const BN = Object.fromEntries(BONES.map((n, i) => [n, i]));
const BONE_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19];
const MIRROR_BONE = [0, 1, 2, 3, 4, 9, 10, 11, 12, 5, 6, 7, 8, 17, 18, 19, 20, 13, 14, 15, 16];
const ARM_A = 50 * DEG, ARM_CA = Math.cos(ARM_A), ARM_SA = Math.sin(ARM_A), ARM_ROT = PI / 2 - ARM_A;

const Anatomy = (() => {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const BUILD0 = { height: 1.80, legs: 1, arms: 1, shoulders: 1, hips: 1, mass: 1, chest: 1, waist: 1, neck: 1, def: 0.6, head: 1, traps: 1, calves: 1, forearms: 1, glutes: 1 };
  const FACE0 = { skullW: 1, skullL: 1, jaw: 1, jawH: 1, chin: 1, cheek: 1, brow: 1, noseL: 1, noseW: 1, noseB: 1, lips: 1, ears: 1, eyeSp: 1, faceL: 1 };

  function skeleton(buildIn) {
    const b = { ...BUILD0, ...buildIn }, s = b.height / 1.80;
    const hipY = 0.93 * s * b.legs, headLen = 0.345 * s, torso = b.height - hipY - headLen, Y = f => hipY + torso * f;
    const wS = 0.168 * s * b.shoulders, wH = 0.090 * s * b.hips, ua = 0.295 * s * b.arms, fa = 0.262 * s * b.arms, hand = 0.088 * s;
    const d = [ARM_CA, -ARM_SA, 0], S = [wS, Y(1), -0.012 * s], El = add(S, mul(d, ua)), Wr = add(El, mul(d, fa)), Kn2 = add(Wr, mul(d, hand));
    const ankY = 0.085 * s, Hp = [wH, hipY, 0], An = [wH + 0.042 * s, ankY, -0.015 * s], Kn = [wH + 0.02 * s, ankY + (hipY - ankY) * 0.493, 0.008 * s], Ball = [An[0] + 0.006 * s, 0.022 * s, An[2] + 0.125 * s];
    const J = { hips: [0, Y(0.085), 0], spine: [0, Y(0.29), -0.004 * s], chest: [0, Y(0.58), -0.008 * s], neck: [0, Y(1.07), -0.02 * s], head: [0, Y(1) + 0.15 * s, -0.005 * s],
      clavL: [0.022 * s, Y(1) + 0.002, 0.02 * s], uarmL: S, farmL: El, handL: Wr, thighL: Hp, shinL: Kn, footL: An, toeL: Ball };
    for (const n of ['clav', 'uarm', 'farm', 'hand', 'thigh', 'shin', 'foot', 'toe']) { const p = J[n + 'L']; J[n + 'R'] = [-p[0], p[1], p[2]]; }
    return { b, s, Y, J, bind: BONES.map(n => J[n]), d, hipY, torso, ua, fa, hand, thigh: len(Hp, Kn), shin: len(Kn, An), ankY, knuckle: Kn2,
      neckCut: Y(1.07) + 0.04 * s, top: Y(1) + headLen, shoulderY: Y(1), footLen: 0.125 * s + 0.075 * s, eyeY: Y(1) + 0.15 * s + 0.066 * s * b.head };
  }

  /** all skin primitives for one fighter (left side authored, mirrored) */
  function bodyPrims(sk, faceIn) {
    const { b, s, Y, J, d } = sk, f = { ...FACE0, ...faceIn }, out = [];
    const ga = s * Math.pow(b.mass, 0.9), gl = s * b.mass, gc = s * Math.pow(b.mass, 0.6) * b.chest, gw = s * Math.pow(b.mass, 0.5) * b.waist, sw = s * b.shoulders, hw = s * b.hips;
    const kd = lerp(0.03, 0.014, b.def);                         // leaner fighters → tighter blends → sharper definition
    const push = p => out.push(p);
    const sym = p => { push(p); const m = { ...p, bone: MIRROR_BONE[p.bone] }; for (const key of ['c', 'a', 'b']) if (p[key]) m[key] = [-p[key][0], p[key][1], p[key][2]]; if (p.rot) m.rot = [p.rot[0], -p.rot[1], -p.rot[2]]; push(m); };
    const E = (bone, c, r, o = {}) => ({ t: 'e', bone: BN[bone], c, r, ...o }), C = (bone, a, bb, ra, rb, o = {}) => ({ t: 'c', bone: BN[bone], a, b: bb, ra, rb, ...o }), Bx = (bone, c, h, rr, o = {}) => ({ t: 'b', bone: BN[bone], c, h, rr, ...o });
    // ── torso
    push(E('hips', [0, Y(0.06), -0.004 * s], [0.150 * hw, 0.105 * s, 0.104 * gw], { k: 0.04 }));
    push(E('hips', [0, Y(0.2), 0.010 * s], [0.127 * gw, 0.095 * s, 0.096 * gw], { k: 0.04 }));
    push(E('spine', [0, Y(0.34), 0.006 * s], [0.122 * gw, 0.105 * s, 0.094 * gw], { k: 0.04 }));
    push(E('chest', [0, Y(0.66), -0.004 * s], [0.146 * gc, 0.165 * s, 0.112 * gc], { k: 0.04 }));
    push(C('chest', [-0.14 * sw, Y(0.955), -0.02 * s], [0.14 * sw, Y(0.955), -0.02 * s], 0.068 * gc, 0.068 * gc, { k: 0.04, sq: [1, 1, 0.95] }));
    sym(E('chest', [0.074 * sw, Y(0.815), 0.068 * gc], [0.084 * sw, 0.054 * gc, 0.03 * gc], { rot: [0.12, 0.16, -0.2], k: kd + 0.008 }));            // pecs
    sym(C('chest', [0.128 * gc, Y(0.85), -0.03 * s], [0.088 * gw, Y(0.4), -0.045 * s], 0.056 * gc, 0.028 * gw, { k: 0.045, sq: [0.9, 1, 1.15] }));                  // lats
    sym(C('chest', [0.03 * s, Y(1.085), -0.034 * s], [0.135 * sw, Y(1.0), -0.03 * s], 0.047 * gc * b.traps, 0.034 * gc, { k: 0.035 }));      // traps
    sym(E('chest', [0.082 * sw, Y(0.84), -0.082 * gc], [0.068 * gc, 0.09 * s, 0.038 * gc], { rot: [0, 0, -0.2], k: 0.03 }));                 // scapula mass
    sym(C('spine', [0.031 * s, Y(0.12), -0.082 * gw], [0.034 * s, Y(0.62), -0.096 * gc], 0.03 * gw, 0.032 * gc, { k: kd + 0.006 }));         // erectors → spine groove
    for (let i = 0; i < 4; i++) sym(E(i < 2 ? 'chest' : 'spine', [0.036 * s, Y(0.565 - i * 0.112), (0.092 - i * 0.003) * gw], [0.034 * s, 0.027 * s, 0.018 * gw], { k: lerp(0.024, 0.012, b.def) })); // abs
    sym(E('spine', [0.104 * gw, Y(0.3), 0.012 * s], [0.036 * gw, 0.09 * s, 0.074 * gw], { k: 0.03 }));                                       // obliques
    sym(E('hips', [0.076 * hw, Y(-0.02), -0.066 * gl], [0.088 * gl, 0.094 * s, 0.086 * gl * b.glutes], { k: 0.035 }));                       // glutes
    sym(C('chest', [0.022 * s, Y(1.012), 0.05 * gc], [0.15 * sw, Y(1.03), 0.012 * s], 0.012 * s, 0.013 * s, { k: 0.014 }));                  // collarbones
    sym(E('clavL', add(J.uarmL, [-0.008 * s, 0.01 * s, 0]), [0.056 * ga, 0.054 * ga, 0.058 * ga], { k: 0.035 }));                            // shoulder socket mass
    // ── neck
    const nk = s * b.neck, Hd = J.head, hs = s * b.head;
    push(C('neck', [0, Y(1.02), -0.022 * s], [0, Hd[1] + 0.02 * s, -0.014 * s], 0.061 * nk, 0.056 * nk, { k: 0.03 }));
    sym(C('neck', [0.012 * s, Y(1.03), 0.036 * s], [0.056 * nk, Hd[1] + 0.03 * s, -0.032 * s], 0.015 * nk, 0.018 * nk, { k: 0.016 }));       // sternomastoid
    // ── arm (left authored)
    const S = J.uarmL, El = J.farmL, Wr = J.handL, o = [ARM_SA, ARM_CA, 0], z = [0, 0, 1], along = (p, t, zo = 0, oo = 0) => add(add(p, mul(d, t)), [oo * o[0], oo * o[1], zo]);
    const fg = ga * b.forearms, ar = [0, 0, ARM_ROT];
    sym(E('uarmL', along(S, 0.034 * s, 0, 0.016 * s), [0.064 * ga, 0.086 * ga, 0.071 * ga], { rot: ar, k: 0.028 }));                           // deltoid
    sym(C('uarmL', S, El, 0.05 * ga, 0.041 * ga, { k: 0.03 }));
    sym(E('uarmL', along(S, sk.ua * 0.54, 0.025 * ga), [0.042 * ga, 0.09 * s, 0.045 * ga], { rot: ar, k: kd + 0.004 }));                     // biceps
    sym(E('uarmL', along(S, sk.ua * 0.46, -0.026 * ga, 0.008 * s), [0.044 * ga, 0.104 * s, 0.047 * ga], { rot: ar, k: kd + 0.004 }));          // triceps
    sym(E('farmL', along(El, 0, -0.012 * s), [0.034 * ga, 0.036 * ga, 0.036 * ga], { k: 0.02 }));                                            // elbow
    sym(C('farmL', El, Wr, 0.043 * fg, 0.0275 * s, { k: 0.025, sq: [0.94, 0.94, 1.1] }));
    sym(E('farmL', along(El, sk.fa * 0.28, 0.012 * fg, 0.01 * fg), [0.038 * fg, 0.085 * s, 0.043 * fg], { rot: ar, k: kd + 0.006 }));         // forearm extensors
    sym(E('farmL', along(El, sk.fa * 0.3, -0.008 * fg, -0.012 * fg), [0.035 * fg, 0.08 * s, 0.039 * fg], { rot: ar, k: kd + 0.006 }));        // flexors
    // ── hand: a closed fist inside a 4oz glove
    const hk = 0.006, hrot = ar;
    sym(Bx('handL', along(Wr, 0.052 * s), [0.026 * s, 0.04 * s, 0.042 * s], 0.019 * s, { rot: hrot, k: hk }));
    sym(C('handL', along(Wr, 0.086 * s, -0.03 * s, -0.012 * s), along(Wr, 0.086 * s, 0.03 * s, -0.012 * s), 0.02 * s, 0.021 * s, { k: hk }));  // curled fingers
    sym(C('handL', along(Wr, 0.064 * s, -0.028 * s, -0.03 * s), along(Wr, 0.064 * s, 0.026 * s, -0.03 * s), 0.014 * s, 0.014 * s, { k: hk }));
    sym(C('handL', along(Wr, 0.028 * s, 0.04 * s, -0.008 * s), along(Wr, 0.078 * s, 0.034 * s, -0.03 * s), 0.016 * s, 0.013 * s, { k: hk })); // thumb
    sym(Bx('handL', along(Wr, 0.058 * s, 0, 0.021 * s), [0.013 * s, 0.042 * s, 0.045 * s], 0.0128 * s, { rot: hrot, k: 0.012 }));               // knuckle padding
    sym(C('handL', along(Wr, -0.036 * s), along(Wr, 0.01 * s), 0.0385 * s, 0.037 * s, { k: 0.006, sq: [0.96, 0.96, 1.12] }));                 // cuff
    // ── leg
    const Hp = J.thighL, Kn = J.shinL, An = J.footL, Bl = J.toeL, cg = gl * b.calves;
    sym(C('thighL', add(Hp, [0, -0.02 * s, 0]), Kn, 0.086 * gl, 0.056 * gl, { k: 0.035 }));
    sym(E('thighL', add(mix(Hp, Kn, 0.45), [0.004 * s, 0, 0.032 * gl]), [0.068 * gl, 0.17 * s, 0.064 * gl], { rot: [0.03, 0, 0], k: 0.028 })); // quads
    sym(E('thighL', add(mix(Hp, Kn, 0.5), [0.034 * gl, 0, 0.006 * gl]), [0.044 * gl, 0.15 * s, 0.056 * gl], { k: kd + 0.008 }));               // outer sweep
    sym(E('thighL', add(Kn, [-0.028 * gl, 0.075 * s, 0.02 * gl]), [0.035 * gl, 0.052 * s, 0.035 * gl], { k: kd + 0.004 }));                    // teardrop
    sym(E('thighL', add(mix(Hp, Kn, 0.5), [0, 0, -0.038 * gl]), [0.064 * gl, 0.16 * s, 0.06 * gl], { k: 0.028 }));                            // hamstrings
    sym(E('thighL', add(mix(Hp, Kn, 0.2), [-0.032 * gl, 0, -0.004 * s]), [0.05 * gl, 0.11 * s, 0.06 * gl], { k: 0.03 }));                     // adductors
    sym(E('thighL', add(Kn, [0, 0.01 * s, 0.012 * s]), [0.048 * gl, 0.05 * s, 0.05 * gl], { k: 0.025 }));
    sym(E('shinL', add(Kn, [0, -0.012 * s, 0.022 * s]), [0.034 * gl, 0.04 * s, 0.032 * gl], { k: 0.018 }));                                   // kneecap
    sym(C('shinL', Kn, add(An, [0, 0.03 * s, 0]), 0.05 * gl, 0.034 * s, { k: 0.03 }));
    sym(E('shinL', add(mix(Kn, An, 0.27), [-0.008 * s, 0, -0.036 * cg]), [0.054 * cg, 0.11 * s, 0.056 * cg], { k: kd + 0.006 }));             // calf
    sym(E('shinL', add(mix(Kn, An, 0.25), [0.022 * cg, 0, -0.026 * cg]), [0.043 * cg, 0.095 * s, 0.046 * cg], { k: kd + 0.006 }));
    sym(E('shinL', add(mix(Kn, An, 0.36), [0.012 * s, 0, 0.014 * s]), [0.028 * gl, 0.11 * s, 0.03 * gl], { k: 0.02 }));                       // shin edge
    // ── foot
    sym(E('footL', add(An, [0.03 * s, -0.004 * s, -0.004 * s]), [0.019 * s, 0.02 * s, 0.02 * s], { k: 0.014 }));
    sym(E('footL', add(An, [-0.027 * s, 0.006 * s, 0]), [0.019 * s, 0.02 * s, 0.02 * s], { k: 0.014 }));
    sym(E('footL', add(An, [0, -0.045 * s, -0.04 * s]), [0.033 * s, 0.04 * s, 0.045 * s], { k: 0.02 }));                                       // heel
    sym(C('footL', add(An, [0, -0.02 * s, 0.004 * s]), add(Bl, [-0.004 * s, 0.014 * s, -0.025 * s]), 0.039 * s, 0.03 * s, { k: 0.02, sq: [1.22, 0.82, 1] }));
    sym(E('footL', add(Bl, [0, 0.002 * s, -0.002 * s]), [0.05 * s, 0.022 * s, 0.04 * s], { k: 0.016 }));                                       // ball
    sym(E('toeL', add(Bl, [-0.023 * s, -0.003 * s, 0.056 * s]), [0.0175 * s, 0.0165 * s, 0.03 * s], { k: 0.008 }));                            // big toe
    sym(E('toeL', add(Bl, [0.012 * s, -0.006 * s, 0.046 * s]), [0.032 * s, 0.014 * s, 0.027 * s], { rot: [0, -0.3, 0], k: 0.008 }));
    // ── head
    const H = (x, y, zz) => [Hd[0] + x * hs, Hd[1] + y * hs, Hd[2] + zz * hs], fk = 0.014 * hs;
    push(E('head', H(0, 0.108, -0.012), [0.0765 * hs * f.skullW, 0.097 * hs, 0.097 * hs * f.skullL], { k: 0.025 }));
    push(E('head', H(0, 0.03 * f.faceL, 0.036), [0.06 * hs * f.skullW, 0.076 * hs * f.faceL, 0.06 * hs], { k: 0.025 }));
    sym(C('head', H(0.044 * f.jaw, -0.012 * f.faceL, 0.004), H(0.012 * f.chin, -0.05 * f.faceL * f.jawH, 0.058), 0.021 * hs, 0.019 * hs * f.chin, { k: 0.02 }));           // mandible
    sym(E('head', H(0.05 * f.jaw, 0.006, 0.014), [0.015 * hs, 0.03 * hs, 0.024 * hs], { k: 0.022 }));                                         // masseter
    push(E('head', H(0, -0.028 * f.faceL, 0.03), [0.04 * hs * f.jaw, 0.026 * hs, 0.042 * hs], { k: 0.02 }));
    push(E('head', H(0, -0.052 * f.faceL * f.jawH, 0.063), [0.024 * hs * f.chin, 0.02 * hs, 0.02 * hs * f.chin], { k: 0.02 }));
    sym(E('head', H(0.047 * Math.sqrt(f.cheek), 0.046, 0.05), [0.017 * hs * f.cheek, 0.013 * hs, 0.024 * hs], { k: 0.026 }));
    push(C('head', H(-0.04, 0.083, 0.077), H(0.04, 0.083, 0.077), 0.0125 * hs * f.brow, 0.0125 * hs * f.brow, { k: fk }));
    push(C('head', H(0, 0.077, 0.088), H(0, 0.03, 0.088 + 0.021 * f.noseL), 0.0082 * hs * f.noseB, 0.0112 * hs * f.noseW, { k: 0.011 * hs }));
    sym(E('head', H(0.0115 * f.noseW, 0.025, 0.096 + 0.003 * (f.noseL - 1)), [0.0085 * hs * f.noseW, 0.0075 * hs, 0.0095 * hs], { k: 0.007 * hs }));
    push(E('head', H(0, -0.002, 0.076), [0.027 * hs, 0.02 * hs, 0.017 * hs], { k: 0.016 * hs }));
    push(E('head', H(0, 0.0035, 0.0915), [0.02 * hs, 0.0055 * hs * f.lips, 0.0075 * hs], { k: 0.006 * hs }));
    push(E('head', H(0, -0.0105, 0.0895), [0.0175 * hs, 0.0068 * hs * f.lips, 0.0078 * hs], { k: 0.006 * hs }));
    sym(E('head', H(0.076 * f.skullW, 0.047, -0.008), [0.007 * hs, 0.027 * hs * f.ears, 0.016 * hs * f.ears], { rot: [0, 0.3, -0.08], k: 0.008 * hs }));
    sym(E('head', H(0.031 * f.eyeSp, 0.0665, 0.092), [0.0195 * hs, 0.0125 * hs, 0.02 * hs], { sub: true, k: 0.012 * hs }));                    // eye sockets
    sym(E('head', H(0.031 * f.eyeSp, 0.0645, 0.0725), [0.0145 * hs, 0.0145 * hs, 0.0145 * hs], { stage: 1, k: 0.004 * hs }));                  // eyes
    return out;
  }

  const ADJ = (() => { const a = BONES.map(() => []); BONE_PARENT.forEach((p, i) => { if (p >= 0) { a[i].push(p); a[p].push(i); } }); a[BN.uarmL].push(BN.chest); a[BN.uarmR].push(BN.chest); a[BN.chest].push(BN.uarmL, BN.uarmR); return a; })();
  const BLEND_R = [0.08, 0.09, 0.09, 0.05, 0.04, 0.05, 0.06, 0.045, 0.028, 0.05, 0.06, 0.045, 0.028, 0.075, 0.055, 0.035, 0.028, 0.075, 0.055, 0.035, 0.028];

  /** Sculpt every mesh for a fighter look. Returns typed-array meshes + skeleton. */
  function build(look) {
    const t0 = performance.now(), sk = skeleton(look.build), { s, Y, J, d } = sk, prims = bodyPrims(sk, look.face), q = look.quality || 1;
    const W = { adj: ADJ, R: BLEND_R.map(r => r * s) }, nB = BONES.length, Wr = J.handL, An = J.footL, Hd = J.head, hs = s * sk.b.head;
    const wristCut = [Wr[0] - d[0] * 0.02 * s, Wr[1] - d[1] * 0.02 * s], ankleCut = An[1] + 0.04 * s, ov = 0.002;
    const wristD = (x, y) => Math.abs(x) < J.farmL[0] ? -1 : (Math.abs(x) - wristCut[0]) * d[0] + (y - wristCut[1]) * d[1];
    // shorts: an offset shell of the hips/thighs, cut at waist and hem
    const sh = { len: 0.5, loose: 0.5, rise: 0.19, ...look.shorts }, waistY = Y(sh.rise), dT = [J.shinL[0] - J.thighL[0], J.shinL[1] - J.thighL[1], J.shinL[2] - J.thighL[2]].map(v => v / sk.thigh);
    const hem = [J.thighL[0] + dT[0] * sk.thigh * sh.len, J.thighL[1] + dT[1] * sk.thigh * sh.len, J.thighL[2] + dT[2] * sk.thigh * sh.len];
    const shortsPr = prims.filter(p => [BN.hips, BN.spine, BN.thighL, BN.thighR].includes(p.bone)).map(p => ({ ...p, k: Math.max(p.k, 0.035) }));
    if (sh.loose > 0) for (const sx of [1, -1]) shortsPr.push({ t: 'c', bone: sx > 0 ? BN.thighL : BN.thighR, a: [sx * (J.thighL[0] + 0.004), J.thighL[1] - 0.05 * s, 0], b: [sx * (hem[0] + 0.006 * sh.loose), hem[1] - 0.03, hem[2]], ra: 0.085 * s * sk.b.mass, rb: (0.074 + 0.034 * sh.loose) * s * sk.b.mass, k: 0.04 });
    const shortsIso = 0.007 + 0.004 * sh.loose, shortsList = Sculpt.compile(shortsPr);
    const hemD = (x, y, z) => (Math.abs(x) - hem[0]) * dT[0] + (y - hem[1]) * dT[1] + (z - hem[2]) * dT[2];
    const shortsF = (x, y, z) => Math.max(Sculpt.evalList(shortsList, x, y, z) - shortsIso, y - waistY, hemD(x, y, z));
    const reach = J.handL[0] + 0.03;
    const body = Sculpt.mesh(prims, { lo: [-reach, ankleCut - 0.045, -0.24 * s - 0.05 * (sk.b.mass - 1)], hi: [reach, sk.neckCut + 0.04, 0.22 * s + 0.05 * (sk.b.mass - 1)], cell: 0.0088 * s / q, nBones: nB, weights: { ...W, custom: torsoW },
      clip: (x, y, z) => Math.max(y - sk.neckCut - 0.012, wristD(x, y) - ov, ankleCut - 0.012 - y),
      region: (x, y, z, nx, ny, nz, r) => { r[3] = clamp(Math.min(-shortsF(x, y, z) - 0.003, waistY - 0.012 - y, -hemD(x, y, z) - 0.012) / 0.01, -1, 1); } });
    function torsoW(own, x, y, z, ws) {             // spine column weights follow height, limbs blend in by proximity
      if (own > BN.chest) return 0;
      const t1 = sstep(Y(0.08), Y(0.3), y), t2 = sstep(Y(0.36), Y(0.62), y);
      ws.push([BN.hips, 1 - t1], [BN.spine, t1 * (1 - t2)], [BN.chest, t1 * t2]);
      return 2;
    }
    const head = Sculpt.mesh(prims, { lo: [-0.105 * hs, sk.neckCut - 0.03, Hd[2] - 0.135 * hs], hi: [0.105 * hs, sk.top + 0.02, Hd[2] + 0.14 * hs], cell: 0.0036 * hs / q, nBones: nB, weights: W,
      clip: (x, y, z) => sk.neckCut - 0.008 - y,
      region: (x, y, z, nx, ny, nz, r) => {
        const lx = (x - Hd[0]) / hs, ly = (y - Hd[1]) / hs, lz = (z - Hd[2]) / hs, az = Math.abs(Math.atan2(lx, lz)), hl = look.hair || {};
        const line = lerp(lerp(hl.front ?? 0.158, hl.side ?? 0.075, sstep(0.45, 1.15, az)), hl.nape ?? 0.012, sstep(1.9, 2.6, az)) + (hl.peak || 0) * Math.max(0, 1 - az / 0.3) * -0.012 + Math.max(0, 1 - Math.abs(az - 0.7) / 0.35) * (hl.recede || 0) * 0.03;
        r[0] = clamp((ly - line) / 0.04, -1, 1);
        const beardTop = az < 0.55 ? lerp(0.017, -0.004, sstep(0.28, 0.55, az)) : lerp(-0.004, 0.046, sstep(0.55, 1.5, az));   // moustache → mouth corner → sideburn
        r[1] = clamp(Math.min(beardTop - ly, ly + 0.082, lz + 0.035) / 0.02, -1, 1);
        r[2] = clamp(1 - Math.hypot(lx, (ly + 0.004) * 1.6, 0) / 0.034, -1, 1) * (lz > 0.05 ? 1 : 0);   // mouth zone
      } });
    const handR0 = [Wr[0] - 0.07 * s, Wr[1] - 0.14 * s, -0.075 * s], handR1 = [Wr[0] + 0.12 * s, Wr[1] + 0.07 * s, 0.085 * s];
    const o = [ARM_SA, ARM_CA];
    const handL = Sculpt.mesh(prims, { lo: handR0, hi: handR1, cell: 0.0042 * s / q, nBones: nB, weights: W, clip: (x, y, z) => -wristD(x, y) - 0.022 * s,
      region: (x, y, z, nx, ny, nz, r) => {
        const rx = x - Wr[0], ry = y - Wr[1], ld = rx * d[0] + ry * d[1], lb = rx * o[0] + ry * o[1];
        r[0] = clamp(Math.max(0.07 * s - ld, Math.min(0.106 * s - ld, lb - 0.006 * s)) / 0.012, -1, 1);   // glove coverage
        r[1] = clamp((0.004 * s - ld) / 0.008, -1, 1);                                                    // cuff / strap
        r[2] = clamp(Math.min(lb - 0.02 * s, ld - 0.02 * s, 0.1 * s - ld, 0.04 * s - Math.abs(z)) / 0.008, -1, 1); // pad panel
      } });
    const footL = Sculpt.mesh(prims, { lo: [An[0] - 0.08 * s, -0.01, An[2] - 0.11 * s], hi: [An[0] + 0.085 * s, ankleCut + 0.04, An[2] + 0.225 * s], cell: 0.0048 * s / q, nBones: nB, weights: W, clip: (x, y, z) => y - ankleCut - 0.008,
      region: (x, y, z, nx, ny, nz, r) => { r[0] = clamp((y - An[1] + 0.035 * s - 0.25 * (z - An[2])) / 0.01, -1, 1); r[1] = clamp(-ny * 2 - 1, -1, 1); } });
    const shorts = Sculpt.mesh(shortsPr, { lo: [-0.3 * s * sk.b.mass, hem[1] - 0.09, -0.24 * s * sk.b.mass], hi: [0.3 * s * sk.b.mass, waistY + 0.03, 0.22 * s * sk.b.mass], cell: 0.0085 * s / q, iso: shortsIso, nBones: nB, weights: { ...W, custom: torsoW },
      clip: (x, y, z) => Math.max(y - waistY, hemD(x, y, z)),
      region: (x, y, z, nx, ny, nz, r) => { r[0] = clamp((waistY - y) / 0.045, 0, 1); r[1] = clamp(-hemD(x, y, z) / 0.03, 0, 1); r[2] = clamp((hemD(x, y, z) + 0.004) / 0.004, 0, 1) * (ny < -0.5 ? 1 : 0); } });
    const meshes = { body, head, handL, handR: Sculpt.mirror(handL, MIRROR_BONE), footL, footR: Sculpt.mirror(footL, MIRROR_BONE), shorts };
    // hair / beard volumes ride on the head bone
    const headOnly = prims.filter(p => p.bone === BN.head && !p.sub && !p.stage), headW = { adj: ADJ, R: W.R, custom: (own, x, y, z, ws) => { ws.push([BN.head, 1]); return 1; } };
    const H = (x, y, zz) => [Hd[0] + x * hs, Hd[1] + y * hs, Hd[2] + zz * hs];
    const hb = { lo: [-0.14 * hs, Hd[1] - 0.14 * hs, Hd[2] - 0.2 * hs], hi: [0.14 * hs, sk.top + 0.1 * hs, Hd[2] + 0.16 * hs] };
    const hair = look.hair || {}, extra = [];
    const hp = (o2) => ({ bone: BN.head, k: 0.012 * hs, ...o2 });
    const cap = (off, kk = 0.02) => extra.push(hp({ t: 'e', c: H(0, 0.108, -0.012), r: [(0.0765 * (look.face && look.face.skullW || 1) + off) * hs, (0.097 + off) * hs, (0.097 * (look.face && look.face.skullL || 1) + off) * hs], k: kk }));
    const st = hair.style;
    if (st === 'crop') { cap(0.003, 0.03); extra.push(hp({ t: 'e', c: H(0, 0.176, 0.012), r: [0.05 * hs, 0.032 * hs, 0.078 * hs], rot: [-0.08, 0, 0], k: 0.04 }), hp({ t: 'e', c: H(0, 0.172, 0.068), r: [0.042 * hs, 0.026 * hs, 0.028 * hs], rot: [-0.55, 0, 0], k: 0.03 })); }
    else if (st === 'slick') { cap(0.011); extra.push(hp({ t: 'e', c: H(0, 0.19, -0.01), r: [0.064 * hs, 0.03 * hs, 0.09 * hs], rot: [-0.16, 0, 0], k: 0.03 }), hp({ t: 'c', a: H(0, 0.19, 0.07), b: H(0, 0.15, -0.1), ra: 0.034 * hs, rb: 0.03 * hs, k: 0.03 })); }
    else if (st === 'mohawk') { const sq = [0.62, 1.3, 1], k = 0.014; extra.push(hp({ t: 'c', a: H(0, 0.178, 0.078), b: H(0, 0.234, 0.0), ra: 0.024 * hs, rb: 0.031 * hs, k, sq }), hp({ t: 'c', a: H(0, 0.234, 0.0), b: H(0, 0.206, -0.078), ra: 0.031 * hs, rb: 0.027 * hs, k, sq }), hp({ t: 'c', a: H(0, 0.206, -0.078), b: H(0, 0.12, -0.116), ra: 0.027 * hs, rb: 0.015 * hs, k, sq })); }
    else if (st === 'bun') { cap(0.008); extra.push(hp({ t: 'e', c: H(0, 0.225, -0.062), r: [0.036 * hs, 0.034 * hs, 0.036 * hs], k: 0.008 })); }
    else if (st === 'dreads') { cap(0.011);
      const rg = RNG(77); for (let i = 0; i < 21; i++) { const a = -2.15 + 4.3 * (i / 20) + rg.range(-0.06, 0.06), sn = Math.sin(a), cs = Math.cos(a), len = rg.range(0, 0.07);   // a curtain of locks round the back and sides
        extra.push(hp({ t: 'c', a: H(sn * 0.066, 0.172 - Math.abs(a) * 0.012, -0.012 - cs * 0.07), b: H(sn * 0.1, 0.035 - len, -0.012 - cs * 0.112 - rg.range(0, 0.012)), ra: 0.0135 * hs, rb: 0.0115 * hs, k: 0.004 })); } }
    else if (st === 'curls') { cap(0.008); const rg = RNG(31); for (let i = 0; i < 30; i++) { const a = rg.range(0, TAU), e2 = rg.range(0.3, 1.4), r0 = 0.082; extra.push(hp({ t: 'e', c: H(Math.sin(a) * Math.cos(e2) * r0, 0.115 + Math.sin(e2) * 0.092, -0.012 + Math.cos(a) * Math.cos(e2) * r0 * 1.2), r: [0.021 * hs, 0.019 * hs, 0.021 * hs], k: 0.008 })); } }
    if (extra.length) {
      const hl = look.hair, vf = hl.volFront ?? hl.front ?? 0.158, vs = hl.volSide ?? hl.side ?? 0.075, vn = hl.volNape ?? hl.nape ?? 0.012;
      const scalpClip = (x, y, z) => { const lx = (x - Hd[0]) / hs, ly = (y - Hd[1]) / hs, lz = (z - Hd[2]) / hs, az = Math.abs(Math.atan2(lx, lz)); return (lerp(lerp(vf, vs, sstep(0.45, 1.15, az)), vn, sstep(1.9, 2.6, az)) - ly) * hs; };
      const skull = Sculpt.compile(headOnly);
      meshes.hair = Sculpt.mesh(extra, { ...hb, cell: 0.0046 * hs / q, nBones: nB, weights: headW,
        warp: st === 'mohawk' ? null : st === 'dreads' ? (x, y, z) => { const az = Math.abs(Math.atan2(x - Hd[0], z - Hd[2])); return az > 1.25 ? 0 : 0.016 * hs * (1 - sstep(-0.01 * hs, 0.06 * hs, -scalpClip(x, y, z))) * (1 - sstep(0.95, 1.25, az)); } : (x, y, z) => 0.014 * hs * (1 - sstep(-0.01 * hs, 0.06 * hs, -scalpClip(x, y, z))),
        region: (x, y, z, nx, ny, nz, r) => { r[0] = clamp(Sculpt.evalList(skull, x, y, z) / 0.03, 0, 1); r[1] = (y - Hd[1]) / hs; } });
    }
    const bd = look.beard || {};
    if (bd.style === 'full' || bd.style === 'goatee') {
      const iso = (bd.len ?? 0.008) * hs, cap = headOnly.filter((p, i) => true);
      const inside = (x, y, z) => { const lx = (x - Hd[0]) / hs, ly = (y - Hd[1]) / hs, lz = (z - Hd[2]) / hs, az = Math.abs(Math.atan2(lx, lz));
        const top = bd.style === 'goatee' ? -0.002 - 0.25 * Math.abs(lx) : lerp(0.006, 0.05, sstep(0.55, 1.45, az));                 // cheek line
        const mouth = 0.021 - Math.hypot(lx * 0.75, (ly + 0.004) * 2.1);                                                             // keep lips clear
        const side = bd.style === 'goatee' ? Math.abs(lx) - 0.034 : -lz - 0.014 - 0.6 * (0.03 - ly);
        return -Math.max(ly - top, mouth, side, -0.09 - ly) * hs; };
      meshes.beard = Sculpt.mesh(cap, { ...hb, cell: 0.0042 * hs / q, iso, nBones: nB, weights: headW,
        warp: (x, y, z) => (iso + 0.005) * (1 - sstep(0, 0.02 * hs, inside(x, y, z))),
        region: (x, y, z, nx, ny, nz, r) => { r[0] = 1; r[1] = (y - Hd[1]) / hs; } });
    }
    sk.buildMs = performance.now() - t0;
    return { sk, meshes, look };
  }
  return { skeleton, build, bodyPrims, ADJ };
})();
