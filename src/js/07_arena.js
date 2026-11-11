/* ═══════════════════════════ ARENA ═══════════════════════════
   An original octagonal cage on a raised platform inside a three-tier bowl: painted canvas,
   chain-link that fades on the camera side, padded posts, light rig with soft beams, an animated
   instanced crowd with camera flashes, LED ribbon, hanging screens, haze and drifting dust. */
const ARENA = { R: 4.3, fenceH: 1.78, platH: 1.2, N: 8 };
ARENA.Rv = ARENA.R / Math.cos(PI / 8);
ARENA.vert = i => { const a = PI / 8 + i * PI / 4; return [Math.cos(a) * ARENA.Rv, Math.sin(a) * ARENA.Rv]; };
/** keep a point inside the cage; returns penetration normal if it was pushed */
ARENA.clampInside = (p, margin = 0.35) => { let hit = null; for (let i = 0; i < 8; i++) { const a = i * PI / 4, nx = Math.cos(a), nz = Math.sin(a), d = p.x * nx + p.z * nz - (ARENA.R - margin); if (d > 0) { p.x -= nx * d; p.z -= nz * d; hit = hit || { nx, nz, i, d }; } } return hit; };
ARENA.wallDist = p => { let m = 99; for (let i = 0; i < 8; i++) { const a = i * PI / 4; m = Math.min(m, ARENA.R - (p.x * Math.cos(a) + p.z * Math.sin(a))); } return m; };

GLSL.envVert = /* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
#ifdef USE_INSTANCING_X
attribute vec4 aSeed; varying vec4 vSeed;
#endif
void main(){ vUv = uv; vec3 transformed = position; vec3 objectNormal = normal;
  #include <defaultnormal_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); }`;
GLSL.envFragHead = /* glsl */`
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${GLSL.noise}
uniform vec3 uFogCol, uPoolCol, uAmbEnv; uniform float uPool, uTime, uHouse; uniform vec4 uSpot[2];
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
vec3 fogged(vec3 c){ float d = length(vW - cameraPosition); return mix(c, uFogCol, 1.0 - exp(-d * 0.021)); }
float pool(vec2 p){ float r = length(p); return exp(-r * r / 34.0); }
`;
GLSL.floorFrag = GLSL.envFragHead + /* glsl */`
uniform sampler2D uMap; uniform vec4 uBlob[8];
void main(){
  vec3 base = texture2D(uMap, vUv).rgb;
  float weave = vnoise(vW.xz * 240.0) * 0.5 + vnoise(vW.xz * vec2(60.0, 700.0)) * 0.25 + vnoise(vW.xz * vec2(700.0, 60.0)) * 0.25;
  base *= 0.93 + 0.12 * weave;
  float sh = getShadowMask();
  float ao = 1.0; for (int i = 0; i < 8; i++) { vec2 d = (vW.xz - uBlob[i].xy) / max(uBlob[i].z, 0.01); ao *= 1.0 - uBlob[i].w * exp(-dot(d, d) * 2.2); }
  float pl = pool(vW.xz) * uPool; float sp = 0.0;
  for (int i = 0; i < 2; i++) { float r = length(vW.xz - uSpot[i].xy); sp += uSpot[i].w * (1.0 - smoothstep(uSpot[i].z * 0.72, uSpot[i].z, r)); }
  vec3 light = uAmbEnv * 0.55 + uPoolCol * (pl * mix(0.42, 1.0, sh) + sp);
  vec3 col = base * light * ao;
  col = mix(col, col * vec3(0.78, 0.82, 1.0), (1.0 - sh) * 0.35);
  gl_FragColor = vec4(fogged(col), 1.0);
}`;
GLSL.propFrag = GLSL.envFragHead + /* glsl */`
uniform vec3 uCol, uCol2, uEmis; uniform float uGloss, uFadeNear; uniform sampler2D uMap; uniform float uUseMap, uShade;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  vec3 base = uCol; if (uUseMap > 0.5) { vec4 t = texture2D(uMap, vUv); base = mix(uCol, t.rgb, t.a); }
  float top = N.y * 0.5 + 0.5, pl = pool(vW.xz) * uPool;
  float n = fbm(vW.xz * 3.0 + vW.y * 2.0);
  vec3 light = uAmbEnv * (0.35 + 0.5 * top) + uPoolCol * pl * (0.25 + 0.75 * smoothstep(0.2, 0.9, top)) * mix(1.0, getShadowMask(), uShade) + uAmbEnv * uHouse * 0.8;
  vec3 col = base * (0.9 + 0.2 * n) * light;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0); col += uPoolCol * rim * uGloss * pl * 0.5;
  col += uEmis;
  float a = 1.0;
  if (uFadeNear > 0.5) { vec2 cd = normalize(cameraPosition.xz + 1e-4); float facing = dot(normalize(vW.xz), cd); float camR = length(cameraPosition.xz);
    a = 1.0 - smoothstep(-0.05, 0.42, facing) * smoothstep(1.6, 3.2, camR + 1.2 - 0.0); if (a < 0.02) discard; }
  gl_FragColor = vec4(fogged(col), a);
}`;
GLSL.fenceFrag = GLSL.envFragHead + /* glsl */`
uniform vec3 uCol; uniform vec2 uSize;
void main(){
  vec2 p = vUv * uSize / 0.075; vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;           // diamond lattice
  vec2 g = abs(fract(d) - 0.5); float w = fwidth(d.x) * 1.2 + 0.001;
  float line = 1.0 - smoothstep(0.06, 0.06 + w, min(g.x, g.y));
  float dens = clamp(0.3 / (w + 0.3), 0.0, 1.0);                                       // far away the lattice melts into a veil
  float a = mix(0.22, line, dens);
  vec2 cd = normalize(cameraPosition.xz + 1e-4); float facing = dot(normalize(vW.xz), cd);
  a *= 1.0 - smoothstep(-0.05, 0.42, facing) * smoothstep(1.6, 3.2, length(cameraPosition.xz) + 1.2);
  if (a < 0.01) discard;
  float pl = pool(vW.xz) * uPool; vec3 V = normalize(cameraPosition - vW);
  float glint = pow(max(0.0, 1.0 - abs(dot(normalize(vN), V))), 2.0);
  vec3 col = uCol * (uAmbEnv * 0.6 + uPoolCol * pl * (0.25 + 0.6 * glint + 0.35 * line * (0.5 + 0.5 * sin(d.x * 6.283))));
  gl_FragColor = vec4(fogged(col), a * 0.92);
}`;
GLSL.crowdVert = /* glsl */`
attribute vec4 aSeed; uniform float uTime, uExcite; uniform vec2 uWave;
varying vec2 vUv; varying vec3 vTint; varying float vFog, vLit, vRow;
vec3 pal(float t){ t = fract(t) * 8.0; if (t < 1.0) return vec3(0.12, 0.13, 0.16); if (t < 2.0) return vec3(0.2, 0.2, 0.23); if (t < 3.0) return vec3(0.17, 0.11, 0.1); if (t < 4.0) return vec3(0.1, 0.13, 0.2);
  if (t < 5.0) return vec3(0.25, 0.23, 0.2); if (t < 6.0) return vec3(0.13, 0.15, 0.12); if (t < 7.0) return vec3(0.34, 0.31, 0.27); return vec3(0.3, 0.22, 0.12); }
void main(){
  vec4 c0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float ang = atan(c0.z, c0.x), r = length(c0.xz);
  float ph = aSeed.y * 6.2831;
  float wave = smoothstep(0.75, 1.0, sin(ang * 1.0 - uWave.x) * 0.5 + 0.5) * uWave.y;
  float ex = clamp(smoothstep(aSeed.w * 0.85, aSeed.w * 0.85 + 0.2, uExcite) + wave, 0.0, 1.0);
  vec3 p = position;
  p.x += sin(uTime * (0.5 + aSeed.y * 0.8) + ph) * 0.02 * uv.y * (1.0 + 2.5 * ex);
  p.y += (abs(sin(uTime * (2.6 + aSeed.y * 2.0) + ph)) * 0.09 + 0.2) * ex + sin(uTime * 0.7 + ph) * 0.006;
  float cheer = step(0.5, ex);
  float v = floor(aSeed.x * 7.999);
  vUv = vec2((v + uv.x) / 8.0, (1.0 - cheer + uv.y) * 0.5);
  vTint = pal(aSeed.z); vRow = aSeed.z;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vLit = mix(1.0, 0.3, smoothstep(8.0, 34.0, r)) * (0.75 + 0.5 * aSeed.y);
  vec4 mv = viewMatrix * wp; vFog = 1.0 - exp(-length(mv.xyz) * 0.03);
  gl_Position = projectionMatrix * mv;
}`;
GLSL.crowdFrag = /* glsl */`
uniform sampler2D uAtlas; uniform vec3 uFogCol, uCrowdCol; uniform float uCrowdLight, uFlashAll;
varying vec2 vUv; varying vec3 vTint; varying float vFog, vLit, vRow;
void main(){ vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.5) discard;
  vec3 col = vTint * (0.45 + t.r * 1.1) * vLit * uCrowdLight * 0.42;
  col += uCrowdCol * t.g * t.g * vLit * vLit * (0.3 * uCrowdLight + uFlashAll);          // top-light on heads and shoulders
  gl_FragColor = vec4(mix(col, uFogCol, vFog), 1.0); }`;
GLSL.pointsVert = /* glsl */`
attribute vec3 aSeed; uniform float uTime, uRate, uSize, uDrift; varying float vA;
void main(){ vec3 p = position;
  if (uDrift > 0.0) { p.x += sin(uTime * 0.11 + aSeed.x * 40.0) * 0.6; p.y += sin(uTime * 0.07 + aSeed.y * 31.0) * 0.5 + fract(uTime * 0.008 + aSeed.z) * 0.0; p.z += cos(uTime * 0.09 + aSeed.z * 23.0) * 0.6; vA = 0.35 + 0.65 * sin(uTime * 0.6 + aSeed.x * 50.0) * 0.5 + 0.3; }
  else { float t = fract(uTime * (0.25 + aSeed.x * 0.6) + aSeed.y); float gate = step(1.0 - uRate * (0.4 + aSeed.z), fract(aSeed.z * 7.0 + floor(uTime * (0.25 + aSeed.x * 0.6) + aSeed.y) * 0.37)); vA = gate * (1.0 - smoothstep(0.0, 0.07, t)) ; }
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (300.0 / -mv.z) * (0.6 + aSeed.x); }`;
GLSL.pointsFrag = /* glsl */`uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); a = a * a; if (vA * a < 0.003) discard; gl_FragColor = vec4(uCol * vA * a, 1.0); }`;
GLSL.beamVert = /* glsl */`varying vec3 vN; varying vec3 vV; varying float vH; void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
GLSL.beamFrag = /* glsl */`uniform vec3 uCol; uniform float uInt, uTime, uSeed; varying vec3 vN; varying vec3 vV; varying float vH;
${GLSL.noise}
void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float h = pow(vH, 1.4); float n = 0.75 + 0.25 * vnoise(vec2(vH * 6.0 - uTime * 0.25, uSeed)); gl_FragColor = vec4(uCol * e * h * n * uInt, 1.0); }`;
GLSL.screenFrag = /* glsl */`uniform sampler2D uMap; uniform float uGain, uScroll, uTime; uniform vec2 uRep, uPx; varying vec2 vUv;
void main(){ vec2 uv = vec2(fract(vUv.x * uRep.x + uScroll * uTime), vUv.y * uRep.y); vec3 c = texture2D(uMap, uv).rgb;
  vec2 led = abs(fract(vUv * uPx) - 0.5); float m = smoothstep(0.5, 0.28, max(led.x, led.y)); float flick = 0.96 + 0.04 * sin(uTime * 50.0 + vUv.y * 30.0);
  gl_FragColor = vec4(c * uGain * (0.55 + 0.45 * m) * flick, 1.0); }`;

function canvasTex(w, h, draw, o = {}) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.aniso || 8; if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.cv = cv; return t; }
const FONT_D = '"Barlow Condensed","Avenir Next Condensed","Roboto Condensed","Arial Narrow",Impact,sans-serif';
/** the IRON ARENA mark: octagon, bar and chevron (an abstract I + A / anvil) */
function drawEmblem(c, x, y, r, col, lw = 0.07) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineJoin = 'miter'; c.lineWidth = r * lw;
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(-r * 0.5, r * 0.46); c.lineTo(-r * 0.5, -r * 0.46); c.lineTo(-r * 0.3, -r * 0.46); c.lineTo(-r * 0.3, r * 0.46); c.closePath(); c.fill();                // I
  c.beginPath(); c.moveTo(-r * 0.14, r * 0.46); c.lineTo(r * 0.16, -r * 0.46); c.lineTo(r * 0.3, -r * 0.46); c.lineTo(r * 0.6, r * 0.46); c.lineTo(r * 0.39, r * 0.46); c.lineTo(r * 0.23, -r * 0.1); c.lineTo(r * 0.07, r * 0.46); c.closePath(); c.fill(); // A
  c.fillRect(r * 0.08, r * 0.14, r * 0.34, r * 0.1);
  c.restore();
}

const Arena = {
  group: null, u: null, excite: 0, exciteT: 0, flash: 0, wave: 0, waveA: 0, mood: null, moodT: null, blobs: null, beams: [], t: 0,
  build() {
    const G = this.group = new THREE.Group(); Gfx.scene.add(G); const q = Gfx.q;
    const U = this.u = { uFogCol: { value: new THREE.Color(0.02, 0.024, 0.034) }, uPoolCol: { value: new THREE.Color(1.5, 1.36, 1.14) }, uAmbEnv: { value: new THREE.Color(0.16, 0.17, 0.22) }, uPool: { value: 1 }, uTime: Gfx.L.uTime, uHouse: { value: 0 },
      uSpot: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] } };
    const lightsU = () => THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
    const prop = (o = {}) => { const m = new THREE.ShaderMaterial({ vertexShader: GLSL.envVert, fragmentShader: GLSL.propFrag, lights: true, transparent: !!o.fade, uniforms: Object.assign(lightsU(), U, { uCol: { value: new THREE.Color(o.col || '#1a1b1f') }, uCol2: { value: new THREE.Color('#000') },
      uEmis: { value: new THREE.Color(o.emis || '#000000').multiplyScalar(o.emisK || 1) }, uGloss: { value: o.gloss ?? 0.3 }, uFadeNear: { value: o.fade ? 1 : 0 }, uMap: { value: o.map || null }, uUseMap: { value: o.map ? 1 : 0 }, uShade: { value: o.shade ? 1 : 0 } }), side: o.side || THREE.FrontSide }); return m; };
    const mesh = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); if (o.pos) m.position.set(...o.pos); if (o.rot) m.rotation.set(...o.rot); m.receiveShadow = !!o.rs; m.castShadow = !!o.cs; (o.parent || G).add(m); return m; };
    const R = ARENA.R, Rv = ARENA.Rv, H = ARENA.platH;
    // ── canvas ─────────────────────────────────────────────────────────────
    const S = 2048, k = S / (Rv * 2.02), cx = S / 2;
    const floorTex = this.floorTex = canvasTex(S, S, (c) => {
      c.fillStyle = '#d8d1c2'; c.fillRect(0, 0, S, S);
      const g = c.createRadialGradient(cx, cx, 100, cx, cx, S * 0.55); g.addColorStop(0, 'rgba(255,250,238,.5)'); g.addColorStop(1, 'rgba(150,140,125,.35)'); c.fillStyle = g; c.fillRect(0, 0, S, S);
      const oct = (r) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * k, cx + Math.sin(a) * r * k); } c.closePath(); };
      c.fillStyle = '#17181c'; oct(Rv * 1.01); c.fill(); c.fillStyle = '#d8d1c2'; oct(Rv - 0.34); c.fill(); c.fillStyle = g; oct(Rv - 0.34); c.fill();
      c.strokeStyle = '#b8924a'; c.lineWidth = 0.035 * k; oct(Rv - 0.4); c.stroke(); c.strokeStyle = 'rgba(23,24,28,.8)'; c.lineWidth = 0.012 * k; oct(Rv - 0.47); c.stroke();
      c.strokeStyle = 'rgba(60,52,44,.16)'; c.lineWidth = 2; for (const o of [-1.55, 1.55]) { c.beginPath(); c.moveTo(cx + o * k, 0); c.lineTo(cx + o * k, S); c.stroke(); }
      c.globalAlpha = 0.9; drawEmblem(c, cx, cx, 1.28 * k, '#1b1c20', 0.06); c.globalAlpha = 0.95; c.strokeStyle = '#b8924a'; c.lineWidth = 0.02 * k; oct(1.42 / Math.cos(PI / 8) * 1.0); c.stroke(); c.globalAlpha = 1;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) { c.save(); c.translate(cx, cx); c.rotate(i * PI / 2); c.fillStyle = i % 2 ? '#1b1c20' : '#a8843f'; c.font = `italic 800 ${0.5 * k}px ${FONT_D}`; c.fillText('IRON ARENA', 0, -2.75 * k);
        c.font = `600 ${0.15 * k}px ${FONT_D}`; c.fillStyle = 'rgba(27,28,32,.85)'; c.fillText('O P E N W E I G H T   G R A N D   P R I X', 0, -2.36 * k); c.restore(); }
      for (let i = 0; i < 4; i++) { c.save(); c.translate(cx, cx); c.rotate(PI / 4 + i * PI / 2); drawEmblem(c, 0, -2.85 * k, 0.33 * k, i % 2 ? '#a8843f' : '#1b1c20', 0.09); c.restore(); }
      const rg = RNG(11); for (let i = 0; i < 260; i++) { const a = rg.range(0, TAU), r = Math.sqrt(rg()) * 3.9 * k, x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r, rr = rg.range(6, 46);
        const sg = c.createRadialGradient(x, y, 0, x, y, rr); const dk = rg() < 0.7; sg.addColorStop(0, dk ? `rgba(70,60,50,${rg.range(0.03, 0.11)})` : `rgba(255,252,244,${rg.range(0.04, 0.12)})`); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.save(); c.translate(x, y); c.scale(1, rg.range(0.3, 1)); c.translate(-x, -y); c.fillRect(x - rr, y - rr, rr * 2, rr * 2); c.restore(); }
      c.strokeStyle = 'rgba(40,36,32,.07)'; c.lineWidth = 1.5; for (let i = 0; i < 90; i++) { const x = cx + rg.range(-3.6, 3.6) * k, y = cx + rg.range(-3.6, 3.6) * k, a = rg.range(0, TAU), l = rg.range(8, 50); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rg.range(-8, 8), y + Math.sin(a) * l * 0.5 + rg.range(-8, 8), x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    }, { aniso: 16 });
    const octShape = (r) => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return s; };
    const fg = new THREE.ShapeGeometry(octShape(Rv * 1.01)); { const p = fg.attributes.position, uv = fg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (Rv * 2.02), 0.5 + p.getY(i) / (Rv * 2.02)); }
    this.blobs = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0.2, 0));
    this.floorMat = new THREE.ShaderMaterial({ vertexShader: GLSL.envVert, fragmentShader: GLSL.floorFrag, lights: true, uniforms: Object.assign(lightsU(), U, { uMap: { value: floorTex }, uBlob: { value: this.blobs } }) });
    mesh(fg, this.floorMat, { rot: [-PI / 2, 0, 0], rs: true });
    // ── apron, skirt, posts, rails, fence ─────────────────────────────────
    const apronOut = Rv + 0.75, vinyl = prop({ col: '#141518', gloss: 0.7, shade: 1 });
    const ring = new THREE.RingGeometry(Rv * 1.005, apronOut, 8, 1, PI / 8); mesh(ring, vinyl, { rot: [-PI / 2, 0, 0], pos: [0, -0.004, 0], rs: true });
    const skirtTex = canvasTex(1024, 256, (c, w, h) => { c.fillStyle = '#121316'; c.fillRect(0, 0, w, h); c.fillStyle = '#b8924a'; c.fillRect(0, 10, w, 5); c.fillRect(0, h - 15, w, 3);
      c.font = `italic 800 110px ${FONT_D}`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#e9e3d6'; c.fillText('IRON ARENA', w * 0.3, h / 2 + 4); drawEmblem(c, w * 0.66, h / 2, 76, '#b8924a', 0.09);
      c.font = `600 34px ${FONT_D}`; c.fillStyle = '#8b9099'; c.fillText('G R A N D   P R I X', w * 0.86, h / 2 + 4); });
    const skirtMat = prop({ col: '#121316', map: skirtTex, gloss: 0.5 });
    const railMat = prop({ col: '#17181c', gloss: 0.8, fade: 1 }), goldMat = prop({ col: '#b8924a', gloss: 1, fade: 1 }), postMat = prop({ col: '#1b1c20', gloss: 0.8, fade: 1 });
    this.cornerMats = [prop({ col: '#7a2a22', gloss: 0.8, fade: 1 }), prop({ col: '#22407a', gloss: 0.8, fade: 1 })];
    const fenceMat = new THREE.ShaderMaterial({ vertexShader: GLSL.envVert, fragmentShader: GLSL.fenceFrag, lights: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
      uniforms: Object.assign(lightsU(), U, { uCol: { value: new THREE.Color('#34363c') }, uSize: { value: new THREE.Vector2(1, 1) } }) });
    fenceMat.uniforms.uSize.value.set(2 * R * Math.tan(PI / 8), ARENA.fenceH);
    const side = 2 * R * Math.tan(PI / 8), outSide = 2 * (apronOut * Math.cos(PI / 8)) * Math.tan(PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = i * PI / 4, nx = Math.cos(a), nz = Math.sin(a), ry = -a + PI / 2, P = new THREE.Group(); P.position.set(nx * R, 0, nz * R); P.rotation.y = ry; G.add(P);
      const f = mesh(new THREE.PlaneGeometry(side, ARENA.fenceH), fenceMat, { pos: [0, ARENA.fenceH / 2 + 0.04, 0], parent: P }); f.renderOrder = 5;
      mesh(new THREE.BoxGeometry(side, 0.13, 0.15), railMat, { pos: [0, ARENA.fenceH + 0.06, 0], parent: P }); mesh(new THREE.BoxGeometry(side, 0.025, 0.156), goldMat, { pos: [0, ARENA.fenceH - 0.0, 0], parent: P });
      mesh(new THREE.BoxGeometry(side, 0.09, 0.12), railMat, { pos: [0, 0.045, 0], parent: P });
      mesh(new THREE.PlaneGeometry(outSide, H), skirtMat, { pos: [0, -H / 2, apronOut * Math.cos(PI / 8) - R], parent: P });
      const [vx, vz] = ARENA.vert(i), pm = i === 3 || i === 4 ? this.cornerMats[0] : i === 7 || i === 0 ? this.cornerMats[1] : postMat;
      mesh(new THREE.CylinderGeometry(0.115, 0.115, ARENA.fenceH + 0.2, 14), pm, { pos: [vx, (ARENA.fenceH + 0.2) / 2, vz] });
      mesh(new THREE.CylinderGeometry(0.119, 0.119, 0.05, 14), goldMat, { pos: [vx, ARENA.fenceH - 0.12, vz] }); mesh(new THREE.SphereGeometry(0.118, 12, 8), pm, { pos: [vx, ARENA.fenceH + 0.2, vz] });
    }
    // ── arena floor, barricade, cageside tables ───────────────────────────
    mesh(new THREE.CircleGeometry(60, 64), prop({ col: '#0c0d10', gloss: 1 }), { rot: [-PI / 2, 0, 0], pos: [0, -H, 0] });
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.9) });
    mesh(new THREE.CylinderGeometry(7.6, 7.6, 1.0, 48, 1, true), prop({ col: '#111215', gloss: 0.6, side: THREE.DoubleSide }), { pos: [0, -H + 0.5, 0] });
    mesh(new THREE.TorusGeometry(7.6, 0.022, 6, 96), ledMat, { rot: [PI / 2, 0, 0], pos: [0, -H + 1.02, 0] });
    for (let i = 0; i < 6; i++) { const a = PI / 8 + i * PI / 3, r = 6.5; const t = mesh(new THREE.BoxGeometry(1.7, 0.75, 0.6), prop({ col: '#16171b' }), { pos: [Math.cos(a) * r, -H + 0.38, Math.sin(a) * r], rot: [0, -a + PI / 2, 0] });
      mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.3) }), { pos: [0.3, 0.52, -0.1], rot: [-0.3, PI, 0], parent: t }); mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.9, 0.5) }), { pos: [-0.35, 0.52, -0.1], rot: [-0.3, PI, 0], parent: t }); }
    // ── bowl structure ────────────────────────────────────────────────────
    const stand = prop({ col: '#0b0c0f', side: THREE.DoubleSide });
    const cone = (r0, y0, r1, y1) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 64, 1, true); return mesh(g, stand, { pos: [0, (y0 + y1) / 2, 0] }); };
    cone(13, -0.9, 27.6, 6.9); cone(28.4, 9.2, 44, 18.4); cone(27.6, 6.9, 28.4, 9.2); cone(44, 18.4, 44, 30);
    mesh(new THREE.CircleGeometry(46, 48), prop({ col: '#050507' }), { rot: [PI / 2, 0, 0], pos: [0, 30, 0] });
    // LED ribbon between the bowls
    const ribTex = canvasTex(2048, 64, (c, w, h) => { c.fillStyle = '#0a0806'; c.fillRect(0, 0, w, h); c.font = `italic 800 50px ${FONT_D}`; c.textBaseline = 'middle'; let x = 20; const items = ['IRON ARENA', '◆', 'OPENWEIGHT GRAND PRIX', '◆', 'IRON ARENA', '◆', 'NO SHORTCUTS', '◆'];
      for (const it of items) { c.fillStyle = it === '◆' ? '#e8c987' : (items.indexOf(it) % 4 === 0 ? '#f4efe4' : '#e8c987'); c.fillText(it, x, h / 2 + 3); x += c.measureText(it).width + 46; } }, { repeat: true });
    this.ribMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: GLSL.screenFrag, side: THREE.BackSide,
      uniforms: { uMap: { value: ribTex }, uGain: { value: 1.5 }, uScroll: { value: 0.012 }, uTime: Gfx.L.uTime, uRep: { value: new THREE.Vector2(-6, 1) }, uPx: { value: new THREE.Vector2(1800, 14) } } });
    mesh(new THREE.CylinderGeometry(27.75, 27.75, 0.95, 96, 1, true), this.ribMat, { pos: [0, 8.05, 0] });
    // big screens: four on the bowl + a centre-hung cube
    this.screenTex = canvasTex(1024, 576, (c, w, h) => { c.fillStyle = '#0c0d10'; c.fillRect(0, 0, w, h); });
    this.screenMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: GLSL.screenFrag,
      uniforms: { uMap: { value: this.screenTex }, uGain: { value: 1.25 }, uScroll: { value: 0 }, uTime: Gfx.L.uTime, uRep: { value: new THREE.Vector2(1, 1) }, uPx: { value: new THREE.Vector2(240, 135) } } });
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2, r = 28.6; const fr = mesh(new THREE.BoxGeometry(11.6, 6.8, 0.4), prop({ col: '#0e0f12' }), { pos: [Math.cos(a) * r, 12.6, Math.sin(a) * r], rot: [0, -a - PI / 2, 0] }); fr.rotateX(0.2);
      mesh(new THREE.PlaneGeometry(11, 6.2), this.screenMat, { pos: [0, 0, 0.21], parent: fr }); }
    const cube = new THREE.Group(); cube.position.set(0, 12.2, 0); G.add(cube); mesh(new THREE.BoxGeometry(6.6, 3.9, 6.6), prop({ col: '#0e0f12' }), { parent: cube });
    for (let i = 0; i < 4; i++) mesh(new THREE.PlaneGeometry(6.2, 3.5), this.screenMat, { pos: [Math.sin(i * PI / 2) * 3.32, 0, Math.cos(i * PI / 2) * 3.32], rot: [0.0, i * PI / 2, 0], parent: cube });
    { const rm2 = this.ribMat.clone(); rm2.side = THREE.FrontSide; rm2.uniforms.uMap.value = ribTex; rm2.uniforms.uTime = Gfx.L.uTime; rm2.uniforms.uRep.value.set(1.5, 1); rm2.uniforms.uPx.value.set(300, 8); mesh(new THREE.CylinderGeometry(4.75, 4.75, 0.5, 4, 1, true), rm2, { pos: [0, -2.3, 0], rot: [0, PI / 4, 0], parent: cube }); }
    // ── light rig ─────────────────────────────────────────────────────────
    const rig = new THREE.Group(); rig.position.y = 7.4; G.add(rig); const truss = prop({ col: '#16171b', gloss: 0.4 });
    const lampGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.34, 10), lensGeo = new THREE.CircleGeometry(0.19, 12);
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6.2, 4.8) });
    const beamGeo = new THREE.CylinderGeometry(0.2, 2.5, 7.4, 20, 1, true); beamGeo.translate(0, -3.7, 0); { const uv = beamGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i)); }
    const beamMat = (col, k2, seed) => new THREE.ShaderMaterial({ vertexShader: GLSL.beamVert, fragmentShader: GLSL.beamFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, uniforms: { uCol: { value: new THREE.Color(col) }, uInt: { value: k2 }, uTime: Gfx.L.uTime, uSeed: { value: seed } } });
    for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = 4.9, b = mesh(new THREE.BoxGeometry(4.2, 0.28, 0.28), truss, { pos: [Math.cos(a) * r, 0, Math.sin(a) * r], rot: [0, -a + PI / 2, 0], parent: rig });
      mesh(new THREE.BoxGeometry(4.2, 0.06, 0.06), truss, { pos: [0, 0.5, 0], parent: b }); for (let j = -3; j <= 3; j++) mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), truss, { pos: [j * 0.65, 0.25, 0], rot: [0, 0, j % 2 ? 0.5 : -0.5], parent: b });
      for (const off of [-1.1, 1.1]) { const l = mesh(lampGeo, truss, { pos: [off, -0.28, 0], parent: b }); mesh(lensGeo, this.lensMat, { pos: [0, -0.171, 0], rot: [PI / 2, 0, 0], parent: l }); }
      const bm = mesh(beamGeo, beamMat('#ffe6b8', 0.05, i), { pos: [Math.cos(a) * r, -0.3, Math.sin(a) * r], parent: rig }); bm.lookAt(Math.cos(a) * 1.2, 0.4, Math.sin(a) * 1.2); bm.rotateX(-PI / 2); bm.renderOrder = 8; this.beams.push({ m: bm, base: 0.05, kind: 'key' }); }
    mesh(new THREE.BoxGeometry(0.3, 0.3, 9.8), truss, { parent: rig }); mesh(new THREE.BoxGeometry(9.8, 0.3, 0.3), truss, { parent: rig });
    // moving heads on an outer ring: slow drift in a fight, sweeping in intros
    this.movers = []; const mvGeo = new THREE.CylinderGeometry(0.12, 1.3, 26, 14, 1, true); mvGeo.translate(0, -13, 0);
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + 0.3, piv = new THREE.Group(); piv.position.set(Math.cos(a) * 16, 15.5, Math.sin(a) * 16); G.add(piv);
      const m = mesh(mvGeo, beamMat(i % 3 === 0 ? '#ffd9a0' : '#bcd4ff', 0.035, i + 20), { parent: piv }); m.renderOrder = 8; mesh(new THREE.SphereGeometry(0.22, 8, 6), this.lensMat, { parent: piv }); this.movers.push({ piv, m, a, ph: i * 1.7 }); }
    // ceiling grid lights + drifting dust + camera flashes
    const pts = (n, gen, o) => { const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3), rg = RNG(o.seed || 5); for (let i = 0; i < n; i++) { const p = gen(rg, i); pos.set(p, i * 3); seed.set([rg(), rg(), rg()], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      const m = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: GLSL.pointsVert, fragmentShader: GLSL.pointsFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { uTime: Gfx.L.uTime, uRate: { value: o.rate || 0 }, uSize: { value: o.size }, uDrift: { value: o.drift ? 1 : 0 }, uCol: { value: new THREE.Color(...o.col) } } })); m.frustumCulled = false; G.add(m); return m; };
    this.dust = pts(Math.round(260 * q.crowd), (rg) => [rg.range(-6, 6), rg.range(0.3, 7), rg.range(-6, 6)], { size: 0.05, drift: 1, col: [0.5, 0.45, 0.36], seed: 3 });
    pts(240, (rg) => { const a = rg.range(0, TAU), r = rg.range(6, 42); return [Math.cos(a) * r, 29.5, Math.sin(a) * r]; }, { size: 0.9, drift: 1, col: [1.2, 1.1, 0.95], seed: 9 }).material.uniforms.uDrift.value = 0.0001;
    // ── crowd ─────────────────────────────────────────────────────────────
    const atlas = this.atlas = canvasTex(1024, 512, (c) => { const rg = RNG(4);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) { const x0 = i * 128, y0 = row * 256, cxp = x0 + 64 + rg.range(-4, 4), up = row === 1;
        const hw = rg.range(15, 19), hh = rg.range(19, 23), hy = y0 + (up ? 56 : 66) + rg.range(-4, 4), sw = rg.range(42, 54), sy = hy + hh + 6;
        const fig = (col, dx, dy, grow) => { c.fillStyle = col; c.beginPath(); c.ellipse(cxp + dx, hy + dy, hw + grow, hh + grow, 0, 0, TAU); c.fill();
          c.beginPath(); c.moveTo(cxp - sw - grow + dx, y0 + 256); c.quadraticCurveTo(cxp - sw - grow + dx, sy + dy - grow, cxp - 14 + dx, sy + dy - 4 - grow); c.lineTo(cxp + 14 + dx, sy + dy - 4 - grow); c.quadraticCurveTo(cxp + sw + grow + dx, sy + dy - grow, cxp + sw + grow + dx, y0 + 256); c.closePath(); c.fill();
          if (up) for (const sd of (i % 3 === 0 ? [1] : [1, -1])) { c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = 15 + grow * 2; c.beginPath(); c.moveTo(cxp + sd * (sw - 8) + dx, sy + 10 + dy); c.quadraticCurveTo(cxp + sd * (sw + 12) + dx, sy - 30 + dy, cxp + sd * (sw - 6 + rg.range(-8, 10)) + dx, y0 + 18 + dy + rg.range(0, 14)); c.stroke(); }
          if (i % 4 === 1) { c.fillStyle = col; c.fillRect(cxp - hw - 3 - grow + dx, hy - hh * 0.55 + dy - grow, (hw + 3 + grow) * 2, 9); } };   // cap brim
        fig('rgba(70,0,0,1)', 0, 0, 0);
        // green channel = top light catching head and shoulders
        c.save(); c.globalCompositeOperation = 'lighter'; const gl = c.createLinearGradient(0, hy - hh, 0, sy + 44); gl.addColorStop(0, 'rgba(60,210,0,1)'); gl.addColorStop(0.35, 'rgba(40,60,0,1)'); gl.addColorStop(0.5, 'rgba(60,150,0,1)'); gl.addColorStop(1, 'rgba(30,0,0,1)');
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = gl; c.fillRect(x0, y0, 128, 256); c.restore(); }
    }, { aniso: 4 });
    atlas.colorSpace = THREE.NoColorSpace;
    const rows = []; for (let i = 0; i < 4; i++) rows.push({ r: 8.6 + i * 1.0, y: -H + 0.62 + i * 0.03, sp: 0.6 });
    for (let i = 0; i < 17; i++) rows.push({ r: 13.5 + i * 0.84, y: -0.72 + i * 0.455, sp: 0.6 });
    for (let i = 0; i < 13; i++) rows.push({ r: 29.2 + i * 1.12, y: 9.6 + i * 0.66, sp: 0.72 });
    let count = 0; const dens = q.crowd; for (const rw of rows) rw.n = Math.floor(TAU * rw.r / rw.sp * (rw.r > 28 ? dens : Math.min(1, dens + 0.2))), count += rw.n;
    const cg = new THREE.PlaneGeometry(0.66, 1.02); cg.translate(0, 0.51, 0);
    const seeds = new Float32Array(count * 4), crowd = this.crowd = new THREE.InstancedMesh(cg, new THREE.ShaderMaterial({ vertexShader: GLSL.crowdVert, fragmentShader: GLSL.crowdFrag, alphaToCoverage: Gfx.q.msaa > 0, side: THREE.DoubleSide,
      uniforms: { uAtlas: { value: atlas }, uTime: Gfx.L.uTime, uExcite: { value: 0 }, uWave: { value: new THREE.Vector2(0, 0) }, uFogCol: U.uFogCol, uCrowdCol: { value: new THREE.Color(0.5, 0.46, 0.4) }, uCrowdLight: { value: 1 }, uFlashAll: { value: 0 } } }), count);
    const rg = RNG(8), M = new THREE.Matrix4(), Qr = new THREE.Quaternion(), Sc = V3(), Ps = V3(), flashPos = []; let n = 0;
    for (const rw of rows) for (let j = 0; j < rw.n; j++) { const a = (j + rg.range(-0.25, 0.25)) / rw.n * TAU + rw.r * 0.37, r = rw.r + rg.range(-0.12, 0.12), sc = rg.range(0.9, 1.12);
      Ps.set(Math.cos(a) * r, rw.y, Math.sin(a) * r); Qr.setFromAxisAngle(UP, -a - PI / 2 + rg.range(-0.25, 0.25)); Sc.set(sc * (rg() < 0.5 ? -1 : 1), sc, 1); M.compose(Ps, Qr, Sc); crowd.setMatrixAt(n, M);
      seeds.set([rg(), rg(), rg(), rg.range(0.08, 1)], n * 4); if (rg() < 0.11) flashPos.push([Ps.x, rw.y + 0.85, Ps.z]); n++; }
    cg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4)); crowd.frustumCulled = false; crowd.instanceMatrix.needsUpdate = true; G.add(crowd);
    this.flashes = pts(flashPos.length, (r2, i) => flashPos[i], { size: 1.5, rate: 0.02, col: [3, 3.2, 3.6], seed: 2 });
    this.setMood('fight', true); this.drawScreen({ mode: 'logo' });
    return this;
  },
  MOODS: {
    fight:  { key: [1.46, 1.34, 1.16], amb: [0.5, 0.49, 0.56], ambB: [0.3, 0.27, 0.3], pool: 1.0, env: [0.16, 0.17, 0.22], beams: 1, movers: 0.45, crowd: 1.0, house: 0, rim: [0.75, 0.9, 1.25], exp: 1.0 },
    intro:  { key: [1.25, 1.1, 0.9], amb: [0.2, 0.22, 0.32], ambB: [0.1, 0.1, 0.16], pool: 0.1, env: [0.07, 0.08, 0.13], beams: 0.25, movers: 1.6, crowd: 0.6, house: 0, rim: [0.9, 1.1, 1.7], exp: 1.05 },
    gym:    { key: [1.3, 1.24, 1.12], amb: [0.6, 0.6, 0.64], ambB: [0.36, 0.34, 0.36], pool: 0.85, env: [0.2, 0.21, 0.25], beams: 0.5, movers: 0.0, crowd: 0.5, house: 0.5, rim: [0.5, 0.6, 0.8], exp: 1.0 },
    ko:     { key: [1.6, 1.4, 1.1], amb: [0.42, 0.42, 0.52], ambB: [0.24, 0.22, 0.28], pool: 1.1, env: [0.15, 0.16, 0.22], beams: 1.2, movers: 1.2, crowd: 1.25, house: 0, rim: [0.9, 1.05, 1.5], exp: 1.0 },
    menu:   { key: [1.3, 1.18, 1.0], amb: [0.34, 0.35, 0.44], ambB: [0.18, 0.18, 0.24], pool: 0.4, env: [0.1, 0.11, 0.16], beams: 0.7, movers: 0.9, crowd: 0.7, house: 0, rim: [0.8, 1.0, 1.5], exp: 1.0 },
  },
  setMood(name, snap) { this.moodT = this.MOODS[name]; this.moodName = name; if (snap || !this.mood) this.mood = JSON.parse(JSON.stringify(this.moodT)); },
  cheer(amount, hold = 1.2) { this.excite = Math.max(this.excite, amount); this.exciteT = Math.max(this.exciteT, hold); },
  flashBurst(k = 1) { this.flash = Math.max(this.flash, k); },
  doWave() { this.waveA = 1; this.wave = 0; },
  setCorners(colA, colB) { this.cornerMats[0].uniforms.uCol.value.set(colA).multiplyScalar(0.8); this.cornerMats[1].uniforms.uCol.value.set(colB).multiplyScalar(0.8); },
  spot(i, x, z, r, k) { this.u.uSpot.value[i].set(x, z, r, k); },
  update(dt, cam) {
    this.t += dt; const m = this.mood, T = this.moodT, k = 1 - Math.exp(-dt * 2.6), L = Gfx.L, U = this.u;
    for (const key in T) { if (Array.isArray(T[key])) for (let i = 0; i < 3; i++) m[key][i] += (T[key][i] - m[key][i]) * k; else m[key] += (T[key] - m[key]) * k; }
    L.uKeyCol.value.setRGB(...m.key); L.uAmbTop.value.setRGB(...m.amb); L.uAmbBot.value.setRGB(...m.ambB); L.uRimCol.value.setRGB(...m.rim); U.uPool.value = m.pool; U.uAmbEnv.value.setRGB(...m.env); U.uHouse.value = m.house; Gfx.fx.exposure = m.exp;
    this.exciteT -= dt; if (this.exciteT < 0) this.excite = damp(this.excite, 0.06, 0.9, dt);
    this.flash = damp(this.flash, 0, 1.6, dt); this.waveA = damp(this.waveA, 0, 0.5, dt); this.wave += dt * 2.4;
    const cu = this.crowd.material.uniforms; cu.uExcite.value = damp(cu.uExcite.value, this.excite, 5, dt); cu.uWave.value.set(this.wave, this.waveA); cu.uCrowdLight.value = m.crowd; cu.uFlashAll.value = this.flash * 0.6;
    this.flashes.material.uniforms.uRate.value = 0.012 + this.excite * 0.1 + this.flash * 0.5;
    for (const b of this.beams) b.m.material.uniforms.uInt.value = b.base * m.beams;
    for (const mv of this.movers) { const sw = this.moodName === 'intro' || this.moodName === 'ko' || this.moodName === 'menu' ? 1 : 0.25, t = this.t * (0.35 + 0.5 * sw) + mv.ph;
      _v1.set(Math.sin(t * 0.9) * 6 * sw + Math.cos(mv.a) * 2, 0, Math.cos(t * 0.7) * 6 * sw + Math.sin(mv.a) * 2); mv.piv.lookAt(_v1); mv.piv.rotateX(-PI / 2); mv.m.material.uniforms.uInt.value = 0.035 * m.movers; }
    // character light: mostly overhead, pulled toward the camera so the visible side always reads
    if (cam) { _v1.copy(cam.position).setY(0).normalize(); _v2.set(-_v1.z, 0, _v1.x); L.uKeyDir.value.set(_v1.x * 0.3 + _v2.x * 0.5, 0.8, _v1.z * 0.3 + _v2.z * 0.5).normalize();
      L.uFillDir.value.set(_v1.x * 0.5 - _v2.x * 0.7, 0.15, _v1.z * 0.5 - _v2.z * 0.7).normalize(); L.uRimDir.value.set(-_v1.x * 0.85 - _v2.x * 0.3, 0.4, -_v1.z * 0.85 - _v2.z * 0.3).normalize(); }
  },
  /** contact shadows: i = slot, world x/z, radius, strength */
  blob(i, x, z, r, k) { this.blobs[i].set(x, z, r, k); },
  drawScreen(st) {
    const cv = this.screenTex.userData.cv, c = cv.getContext('2d'), w = cv.width, h = cv.height; this.screenState = st;
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#15161a'); g.addColorStop(1, '#090a0c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9a45c'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); c.textAlign = 'center'; c.textBaseline = 'middle';
    if (st.mode === 'logo') { drawEmblem(c, w / 2, h * 0.4, 130, '#c9a45c', 0.07); c.fillStyle = '#efe9dc'; c.font = `italic 800 120px ${FONT_D}`; c.fillText('IRON ARENA', w / 2, h * 0.8); }
    else if (st.mode === 'vs') { c.fillStyle = st.colA; c.beginPath(); c.moveTo(0, 10); c.lineTo(w * 0.5, 10); c.lineTo(w * 0.42, h - 10); c.lineTo(0, h - 10); c.fill(); c.fillStyle = st.colB; c.beginPath(); c.moveTo(w, 10); c.lineTo(w * 0.58, 10); c.lineTo(w * 0.5, h - 10); c.lineTo(w, h - 10); c.fill();
      c.fillStyle = 'rgba(8,8,10,.55)'; c.fillRect(0, 10, w, h - 20); if (st.imgA) c.drawImage(st.imgA, 20, 60, 400, 500); if (st.imgB) { c.save(); c.translate(w, 0); c.scale(-1, 1); c.drawImage(st.imgB, 20, 60, 400, 500); c.restore(); }
      c.fillStyle = '#efe9dc'; c.font = `italic 800 96px ${FONT_D}`; c.fillText(st.a, w * 0.27, h * 0.84); c.fillText(st.b, w * 0.73, h * 0.84); c.fillStyle = '#c9a45c'; c.font = `italic 800 150px ${FONT_D}`; c.fillText('VS', w / 2, h * 0.46); }
    else if (st.mode === 'fight') { c.fillStyle = '#efe9dc'; c.font = `800 210px ${FONT_D}`; c.fillText(st.time, w / 2, h * 0.5); c.fillStyle = '#c9a45c'; c.font = `700 70px ${FONT_D}`; c.fillText('ROUND ' + st.round, w / 2, h * 0.16);
      c.fillStyle = '#efe9dc'; c.font = `italic 800 64px ${FONT_D}`; c.textAlign = 'left'; c.fillText(st.a, 40, h * 0.87); c.textAlign = 'right'; c.fillText(st.b, w - 40, h * 0.87); }
    else if (st.mode === 'text') { c.fillStyle = st.col || '#c9a45c'; c.font = `italic 800 ${st.size || 190}px ${FONT_D}`; c.fillText(st.text, w / 2, h * 0.47); if (st.sub) { c.fillStyle = '#efe9dc'; c.font = `700 72px ${FONT_D}`; c.fillText(st.sub, w / 2, h * 0.8); } }
    this.screenTex.needsUpdate = true;
  }
};
