return { Sculpt, Anatomy, BONES, BN, BONE_PARENT, MIRROR_BONE, ARM_CA, ARM_SA, ARM_ROT };
}
const { Sculpt, Anatomy, BONES, BN, BONE_PARENT, MIRROR_BONE, ARM_CA, ARM_SA, ARM_ROT } = SculptKernel();

/** builds fighter geometry in background workers (falls back to the main thread) */
const Sculptor = {
  cache: new Map(), workers: [], queue: [], seq: 0, pending: new Map(),
  init() {
    if (QS.has('noworker')) return;
    try { const src = 'const K = (' + SculptKernel.toString() + ')(); onmessage = e => { const r = K.Anatomy.build(e.data.look), sk = Object.assign({}, r.sk); delete sk.Y; const tr = []; for (const k in r.meshes) { const m = r.meshes[k]; for (const a of ["pos", "nor", "ao", "idx", "si", "sw", "reg"]) if (m[a] && m[a].buffer && !tr.includes(m[a].buffer)) tr.push(m[a].buffer); } postMessage({ id: e.data.id, sk, meshes: r.meshes }, tr); };';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
      for (let i = 0; i < n; i++) { const w = new Worker(url); w.busy = false; w.onmessage = e => { w.busy = false; const p = this.pending.get(e.data.id); this.pending.delete(e.data.id); p && p.res(e.data); this.pump(); }; w.onerror = e => { console.warn('sculpt worker failed, using main thread', e.message); this.workers = []; for (const p of this.pending.values()) p.res(this.sync(p.look)); this.pending.clear(); this.pump(); }; this.workers.push(w); }
    } catch (e) { this.workers = []; }
  },
  sync(look) { const r = Anatomy.build(look); return { sk: r.sk, meshes: r.meshes }; },
  pump() { for (const w of this.workers) { if (w.busy || !this.queue.length) continue; const job = this.queue.shift(); w.busy = true; this.pending.set(job.id, job); w.postMessage({ id: job.id, look: job.look }); } },
  /** geometry for a fighter look (cached per fighter id + quality) */
  build(key, look) {
    if (this.cache.has(key)) return this.cache.get(key);
    const p = new Promise(res => { if (!this.workers.length) { setTimeout(() => res(this.sync(look)), 0); return; } const id = ++this.seq; this.queue.push({ id, look, res }); this.pump(); });
    this.cache.set(key, p); return p;
  }
};
