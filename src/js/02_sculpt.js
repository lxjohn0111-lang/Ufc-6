/* ═══════════════════════════ SCULPT KERNEL ═══════════════════════════
   Characters are sculpted, not assembled from primitives: each body is a smooth-blended signed
   distance field (ellipsoids / round cones / rounded boxes placed like muscle groups), meshed at
   load time with naive Surface Nets, projected onto the exact iso-surface, then auto-skinned and
   given baked occlusion + crease attributes that the illustrated shader turns into ink and wash. */
const Sculpt = (() => {
  const E = 0, C = 1, B = 2;
  function rotM(e) { // euler XYZ → row-major 3x3
    if (!e) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = e, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    // R = Rz * Ry * Rx
    return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
            sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
            -sy, cy * sx, cy * cx];
  }
  /** compile authoring primitives → flat evaluators with bounds */
  function compile(prims) {
    const out = [];
    for (const p of prims) {
      const k = p.k ?? 0.02, q = { k, bone: p.bone ?? -1, sub: !!p.sub, stage: p.stage || 0 };
      if (p.t === 'e') {
        const R = rotM(p.rot), r = p.r; q.type = E; q.c = p.c; q.R = R; q.ir = [1 / r[0], 1 / r[1], 1 / r[2]];
        q.ir2 = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])]; q.minr = Math.min(r[0], r[1], r[2]);
        const m = Math.max(r[0], r[1], r[2]) + k + 0.004; q.lo = [p.c[0] - m, p.c[1] - m, p.c[2] - m]; q.hi = [p.c[0] + m, p.c[1] + m, p.c[2] + m];
      } else if (p.t === 'c') {
        let a = p.a, b = p.b; const sq = p.sq; q.type = C; q.ms = 1;
        if (sq) { // elliptical cross-section: evaluate in a space scaled about the midpoint
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; q.m = m; q.is = [1 / sq[0], 1 / sq[1], 1 / sq[2]];
          a = [m[0] + (a[0] - m[0]) * q.is[0], m[1] + (a[1] - m[1]) * q.is[1], m[2] + (a[2] - m[2]) * q.is[2]];
          b = [m[0] + (b[0] - m[0]) * q.is[0], m[1] + (b[1] - m[1]) * q.is[1], m[2] + (b[2] - m[2]) * q.is[2]];
          q.ms = Math.min(sq[0], sq[1], sq[2]);
        }
        q.a = a; q.ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; q.l2 = q.ba[0] ** 2 + q.ba[1] ** 2 + q.ba[2] ** 2 || 1e-9;
        q.ra = p.ra; q.rb = p.rb ?? p.ra; q.rr = q.ra - q.rb; q.a2 = q.l2 - q.rr * q.rr; q.il2 = 1 / q.l2;
        const sm = sq ? Math.max(sq[0], sq[1], sq[2]) : 1, m = Math.max(q.ra, q.rb) * sm + k + 0.004;
        q.lo = [Math.min(p.a[0], p.b[0]) - m, Math.min(p.a[1], p.b[1]) - m, Math.min(p.a[2], p.b[2]) - m];
        q.hi = [Math.max(p.a[0], p.b[0]) + m, Math.max(p.a[1], p.b[1]) + m, Math.max(p.a[2], p.b[2]) + m];
      } else {
        q.type = B; q.c = p.c; q.R = rotM(p.rot); q.h = p.h; q.rd = p.rr ?? 0.01;
        const m = Math.hypot(p.h[0], p.h[1], p.h[2]) + k + 0.004; q.lo = [p.c[0] - m, p.c[1] - m, p.c[2] - m]; q.hi = [p.c[0] + m, p.c[1] + m, p.c[2] + m];
      }
      out.push(q);
    }
    out.forEach((q, i) => q.ord = q.stage * 2e4 + (q.sub ? 1e4 : 0) + i); out.sort((a, b) => a.ord - b.ord);
    return out;
  }
  function dist(q, x, y, z) {
    if (q.type === E) {
      const dx = x - q.c[0], dy = y - q.c[1], dz = z - q.c[2], R = q.R;
      const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      const k0 = Math.sqrt(lx * lx * q.ir2[0] + ly * ly * q.ir2[1] + lz * lz * q.ir2[2]);
      if (k0 < 1e-6) return -q.minr;
      const k1 = Math.sqrt(lx * lx * q.ir2[0] * q.ir2[0] + ly * ly * q.ir2[1] * q.ir2[1] + lz * lz * q.ir2[2] * q.ir2[2]);
      return k0 * (k0 - 1) / k1;
    }
    if (q.type === C) {
      if (q.m) { x = q.m[0] + (x - q.m[0]) * q.is[0]; y = q.m[1] + (y - q.m[1]) * q.is[1]; z = q.m[2] + (z - q.m[2]) * q.is[2]; }
      const px = x - q.a[0], py = y - q.a[1], pz = z - q.a[2], ba = q.ba, l2 = q.l2;
      const yy = px * ba[0] + py * ba[1] + pz * ba[2], zz = yy - l2;
      const ex = px * l2 - ba[0] * yy, ey = py * l2 - ba[1] * yy, ez = pz * l2 - ba[2] * yy;
      const x2 = ex * ex + ey * ey + ez * ez, y2 = yy * yy * l2, z2 = zz * zz * l2, rr = q.rr;
      const k = (rr < 0 ? -1 : 1) * rr * rr * x2; let d;
      if ((zz < 0 ? -1 : 1) * q.a2 * z2 > k) d = Math.sqrt(x2 + z2) * q.il2 - q.rb;
      else if ((yy < 0 ? -1 : 1) * q.a2 * y2 < k) d = Math.sqrt(x2 + y2) * q.il2 - q.ra;
      else d = (Math.sqrt(x2 * q.a2 * q.il2) + yy * rr) * q.il2 - q.ra;
      return d * q.ms;
    }
    const dx = x - q.c[0], dy = y - q.c[1], dz = z - q.c[2], R = q.R, r = q.rd;
    const qx = Math.abs(R[0] * dx + R[3] * dy + R[6] * dz) - q.h[0] + r, qy = Math.abs(R[1] * dx + R[4] * dy + R[7] * dz) - q.h[1] + r, qz = Math.abs(R[2] * dx + R[5] * dy + R[8] * dz) - q.h[2] + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  function evalList(list, x, y, z) {
    let d = 1;
    for (let i = 0; i < list.length; i++) {
      const q = list[i], di = dist(q, x, y, z), k = q.k;
      if (q.sub) { const h = Math.max(k - Math.abs(d + di), 0) / k; d = Math.max(d, -di) + h * h * h * k / 6; }
      else { const h = Math.max(k - Math.abs(d - di), 0) / k; d = Math.min(d, di) - h * h * h * k / 6; }
    }
    return d;
  }

  /** Build a mesh from a primitive list.
      opt: { lo, hi, cell, clip(x,y,z)->d (intersection, optional), iso, nBones, weights:{adj, R, torso}, region(p,n,out) } */
  function mesh(prims, opt) {
    const all = compile(prims), h = opt.cell, iso = opt.iso || 0, clip = opt.clip, warp = opt.warp;
    const lo = opt.lo, nx = Math.ceil((opt.hi[0] - lo[0]) / h) + 1, ny = Math.ceil((opt.hi[1] - lo[1]) / h) + 1, nz = Math.ceil((opt.hi[2] - lo[2]) / h) + 1;
    // ── block culling: per 8³ block, the primitives that can matter there
    const BS = 8, bx = Math.ceil(nx / BS), by = Math.ceil(ny / BS), bz = Math.ceil(nz / BS), blocks = new Array(bx * by * bz);
    for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const x0 = lo[0] + i * BS * h - h, y0 = lo[1] + j * BS * h - h, z0 = lo[2] + k * BS * h - h, x1 = x0 + (BS + 2) * h, y1 = y0 + (BS + 2) * h, z1 = z0 + (BS + 2) * h, l = [];
      for (const q of all) if (q.lo[0] <= x1 && q.hi[0] >= x0 && q.lo[1] <= y1 && q.hi[1] >= y0 && q.lo[2] <= z1 && q.hi[2] >= z0) l.push(q);
      blocks[i + bx * (j + by * k)] = l.length && l.some(q => !q.sub) ? l : null;
    }
    const listAt = (x, y, z) => {
      const i = clamp(Math.floor((x - lo[0]) / (h * BS)), 0, bx - 1), j = clamp(Math.floor((y - lo[1]) / (h * BS)), 0, by - 1), k = clamp(Math.floor((z - lo[2]) / (h * BS)), 0, bz - 1);
      return blocks[i + bx * (j + by * k)];
    };
    const F = (x, y, z) => { const l = listAt(x, y, z); let d = l ? evalList(l, x, y, z) - iso : 1; if (warp && l) d += warp(x, y, z); if (clip) d = Math.max(d, clip(x, y, z)); return d; };
    // ── sample grid
    const val = new Float32Array(nx * ny * nz), nxy = nx * ny;
    for (let k = 0; k < nz; k++) { const z = lo[2] + k * h, bk = Math.min(bz - 1, (k / BS) | 0);
      for (let j = 0; j < ny; j++) { const y = lo[1] + j * h, bj = Math.min(by - 1, (j / BS) | 0);
        for (let i = 0; i < nx; i++) { const x = lo[0] + i * h, l = blocks[Math.min(bx - 1, (i / BS) | 0) + bx * (bj + by * bk)];
          let d = l ? evalList(l, x, y, z) - iso : 1; if (warp && l) d += warp(x, y, z); if (clip) d = Math.max(d, clip(x, y, z)); val[i + nx * j + nxy * k] = d; } } }
    // ── surface nets: one vertex per sign-changing cell
    const cx = nx - 1, cy = ny - 1, cz = nz - 1, cellV = new Int32Array(cx * cy * cz).fill(-1), P = [];
    const cornerOff = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1], cd = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const base = i + nx * j + nxy * k; let mask = 0;
      for (let c = 0; c < 8; c++) { cv[c] = val[base + cornerOff[c]]; if (cv[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 12; e++) { const a = edges[e][0], b = edges[e][1], va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb); sx += cd[a][0] + (cd[b][0] - cd[a][0]) * t; sy += cd[a][1] + (cd[b][1] - cd[a][1]) * t; sz += cd[a][2] + (cd[b][2] - cd[a][2]) * t; n++; }
      cellV[i + cx * (j + cy * k)] = P.length / 3; P.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
    }
    const idx = [], cxy = cx * cy;
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
    for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
      const base = i + nx * j + nxy * k, v0 = val[base] < 0, ci = i + cx * (j + cy * k);
      if (v0 !== (val[base + 1] < 0)) quad(cellV[ci - cx - cxy], cellV[ci - cxy], cellV[ci], cellV[ci - cx], v0);
      if (v0 !== (val[base + nx] < 0)) quad(cellV[ci - 1 - cxy], cellV[ci - 1], cellV[ci], cellV[ci - cxy], v0);
      if (v0 !== (val[base + nxy] < 0)) quad(cellV[ci - 1 - cx], cellV[ci - cx], cellV[ci], cellV[ci - 1], v0);
    }
    // ── refine: project to the exact surface, analytic normals, occlusion, skin weights
    const nv = P.length / 3, pos = new Float32Array(P), nor = new Float32Array(nv * 3), ao = new Float32Array(nv * 3);
    const e = h * 0.4, g = [0, 0, 0];
    const grad = (x, y, z) => { g[0] = F(x + e, y, z) - F(x - e, y, z); g[1] = F(x, y + e, z) - F(x, y - e, z); g[2] = F(x, y, z + e) - F(x, y, z - e); const l = Math.hypot(g[0], g[1], g[2]) || 1; g[0] /= l; g[1] /= l; g[2] /= l; };
    const nB = opt.nBones || 0, W = opt.weights, bd = new Float32Array(nB), si = nB ? new Uint16Array(nv * 4) : null, sw = nB ? new Float32Array(nv * 4) : null;
    const reg = opt.region ? new Float32Array(nv * 4) : null, rtmp = [0, 0, 0, 0];
    for (let v = 0; v < nv; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      for (let it = 0; it < 3; it++) { const d = F(x, y, z); if (Math.abs(d) < 2e-5) break; grad(x, y, z); const s = clamp(d, -h, h); x -= g[0] * s; y -= g[1] * s; z -= g[2] * s; }
      grad(x, y, z); pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; nor[v * 3] = g[0]; nor[v * 3 + 1] = g[1]; nor[v * 3 + 2] = g[2];
      const nxn = g[0], nyn = g[1], nzn = g[2];
      // crease (fine) and occlusion (broad): how much less open space than a flat wall would give
      const c1 = 1 - F(x + nxn * 0.010, y + nyn * 0.010, z + nzn * 0.010) / 0.010;
      const o1 = 1 - F(x + nxn * 0.03, y + nyn * 0.03, z + nzn * 0.03) / 0.03, o2 = 1 - F(x + nxn * 0.08, y + nyn * 0.08, z + nzn * 0.08) / 0.08;
      ao[v * 3] = clamp(1 - (o1 * 0.5 + o2 * 0.7), 0, 1); ao[v * 3 + 1] = clamp(c1, 0, 1); ao[v * 3 + 2] = clip ? clamp(-clip(x, y, z) / 0.014 - 0.15, 0, 1) : 1;   // outline fades out at cut planes
      if (nB) {
        bd.fill(9); const l = listAt(x, y, z);
        if (l) for (let i = 0; i < l.length; i++) { const q = l[i]; if (q.sub || q.bone < 0) continue; const d = dist(q, x, y, z); if (d < bd[q.bone]) bd[q.bone] = d; }
        let own = 0; for (let b = 1; b < nB; b++) if (bd[b] < bd[own]) own = b;
        // custom() may return 1 (weights final) or 2 (base weights given, still blend in neighbours by proximity)
        let ws = []; const R = W.R, mode = W.custom ? W.custom(own, x, y, z, ws) : 0; let tot = 0;
        if (mode !== 1) {
          if (!mode) ws.push([own, 1]);
          for (const b of W.adj[own]) { if (ws.some(w => w[0] === b)) continue; const r = Math.max(R[b], R[own]), w = Math.max(0, 1 - (bd[b] - bd[own]) / r); if (w > 0.001) ws.push([b, w * w * (3 - 2 * w)]); }
        }
        ws = ws.filter(w => w[1] > 1e-4).sort((a, b) => b[1] - a[1]); if (ws.length > 4) ws.length = 4; for (const w of ws) tot += w[1];
        for (let i = 0; i < 4; i++) { si[v * 4 + i] = i < ws.length ? ws[i][0] : 0; sw[v * 4 + i] = i < ws.length ? ws[i][1] / tot : 0; }
      }
      if (reg) { rtmp[0] = rtmp[1] = rtmp[2] = rtmp[3] = 0; opt.region(x, y, z, nxn, nyn, nzn, rtmp); reg.set(rtmp, v * 4); }
    }
    // consistent outward winding
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * (nor[a] + nor[b] + nor[c]) + fy * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + fz * (nor[a + 2] + nor[b + 2] + nor[c + 2]) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    }
    return { pos, nor, ao, idx: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), si, sw, reg, nv, nt: idx.length / 3 };
  }
  /** mirror a mesh across x=0, remapping bones through `map` */
  function mirror(m, map) {
    const o = { pos: m.pos.slice(), nor: m.nor.slice(), ao: m.ao, idx: m.idx.slice(), si: m.si && m.si.slice(), sw: m.sw, reg: m.reg, nv: m.nv, nt: m.nt };
    for (let i = 0; i < m.nv; i++) { o.pos[i * 3] = -m.pos[i * 3]; o.nor[i * 3] = -m.nor[i * 3]; }
    for (let i = 0; i < o.idx.length; i += 3) { const t = o.idx[i + 1]; o.idx[i + 1] = o.idx[i + 2]; o.idx[i + 2] = t; }
    if (o.si && map) for (let i = 0; i < o.si.length; i++) o.si[i] = map[o.si[i]];
    return o;
  }
  return { mesh, mirror, compile, evalList };
})();
