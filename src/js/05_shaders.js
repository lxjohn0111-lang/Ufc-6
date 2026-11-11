/* ═══════════════════════════ SHADERS ═══════════════════════════
   One illustrated material family: three painted tones with brush-wobbled edges, hatching in the
   shadow tone, ink wash in baked creases, cool rim light, sweat highlights and an inked outline. */
const GLSL = {};
GLSL.noise = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
`;
GLSL.charVert = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
attribute vec3 aAO; attribute vec4 aReg;
varying vec3 vBind; varying vec3 vBindN; varying vec3 vN; varying vec3 vW; varying vec2 vAO; varying vec4 vReg;
#ifdef OUTLINE
uniform float uLine; uniform float uProj; uniform vec2 uRes;
#endif
void main(){
  vBind = position; vBindN = normal; vAO = aAO.xy; vReg = aReg;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #ifdef OUTLINE
    vec3 nv = normalize(transformedNormal);
    float px = clamp(uLine * uProj / gl_Position.w, 0.7, 4.0) * (0.55 + 0.45 * aAO.x) * aAO.z;
    vec2 off = normalize(nv.xy + 1e-5) * px * 2.0 / uRes;
    gl_Position.xy += off * gl_Position.w * smoothstep(0.0, 0.25, length(nv.xy));
    gl_Position.z += 0.0006 * gl_Position.w;
  #endif
}`;
GLSL.outlineFrag = /* glsl */`
uniform vec3 uInk; varying vec4 vReg; varying vec3 vBind;
#ifdef BODY
uniform float uHideOn;
#endif
void main(){
  #ifdef BODY
  if (vReg.w * uHideOn > 0.0) discard;
  #endif
  gl_FragColor = vec4(uInk, 1.0);
}`;
GLSL.charFrag = /* glsl */`
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${GLSL.noise}
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uRimDir, uRimCol, uAmbTop, uAmbBot;
uniform float uTime, uShadowAmt;
uniform vec3 uSkin, uSkinShade, uColA, uColB, uColC, uColD, uHairCol;
uniform float uSweat, uCrease, uHatch, uDirt, uFlash, uStubble, uHideOn, uDim;
uniform vec4 uDmg;           // head, body, arms, legs  (0..1)
uniform vec4 uZone;          // hipY, shoulderX, ankleY, scale
uniform vec4 uMarks[6];      // recent impact marks: xyz in bind space, w = strength
#ifdef FACE
uniform sampler2D uFace; uniform vec4 uFaceRect;   // cx, cy, 1/w, 1/h
#endif
#ifdef PAINT
uniform sampler2D uPaint; uniform vec4 uPaintRect;
#endif
#ifdef SHORTS
uniform sampler2D uDecal; uniform vec4 uDecalRect; uniform float uPattern, uThighX;
#endif
varying vec3 vBind; varying vec3 vBindN; varying vec3 vN; varying vec3 vW; varying vec2 vAO; varying vec4 vReg;

vec3 toneRamp(vec3 base, vec3 shadeCol, float tMid, float tLit, float warm){
  vec3 lit = base * mix(vec3(1.0), vec3(1.16, 1.1, 0.98), warm) + 0.03;
  vec3 c = mix(shadeCol, base, tMid);
  return mix(c, lit, tLit);
}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float sc = uZone.w;
  vec2 bp = vBind.xy / sc + vBind.z * vec2(0.37, 0.21) / sc;
  float nLow = fbm(bp * 9.0), nMid = fbm(bp * 34.0 + 7.3), nHi = vnoise(bp * 420.0);
  // ── albedo by surface kind ───────────────────────────────────────────────
  vec3 base = uSkin; vec3 shadeMul = uSkinShade; float gloss = 0.35 + 0.65 * uSweat, specAmt = 0.09 + 0.26 * uSweat, warm = 1.0, hatchAmt = uHatch, isSkin = 1.0;
  base *= 0.94 + 0.12 * nLow;
  #ifdef BODY
    if (vReg.w * uHideOn > 0.0) discard;
  #endif
  #ifdef HEAD
    float scalp = smoothstep(-0.55, 0.5, vReg.x + (nMid - 0.5) * 0.5); scalp *= mix(0.6 + 0.4 * nHi, 1.0, scalp) * 0.985;
    base = mix(base, uHairCol, scalp * uColD.x);
    shadeMul = mix(shadeMul, vec3(0.4, 0.4, 0.5), scalp * uColD.x);
    float stub = smoothstep(-0.25, 0.6, vReg.y + (nMid - 0.5) * 0.6) * uStubble * (0.55 + 0.45 * nHi);
    base = mix(base, mix(base, uHairCol, 0.75), stub);
    specAmt *= 1.0 - scalp * uColD.x;
    base = mix(base, base * vec3(1.08, 0.86, 0.84), smoothstep(0.2, 1.0, vReg.z) * 0.0);
  #endif
  #ifdef FACE
    vec2 fuv = (vBind.xy - uFaceRect.xy) * uFaceRect.zw + 0.5;
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      vec4 fp = texture2D(uFace, fuv);
      float fw = smoothstep(0.02, 0.3, vBindN.z);
      base = base * (1.0 - fp.a * fw) + fp.rgb * fw;
    }
  #endif
  #ifdef PAINT
    vec2 puv = (vBind.xy - uPaintRect.xy) * uPaintRect.zw + 0.5; puv.x = vBindN.z < 0.0 ? 1.0 - puv.x * 0.5 : puv.x * 0.5;
    vec4 pp = texture2D(uPaint, puv); float pw = smoothstep(0.05, 0.35, abs(vBindN.z));
    base = base * (1.0 - pp.a * pw) + pp.rgb * pw;
  #endif
  #ifdef HAND
    float gl = smoothstep(-0.1, 0.1, vReg.x), cuff = smoothstep(-0.1, 0.1, vReg.y), pad = smoothstep(-0.15, 0.15, vReg.z);
    vec3 gcol = mix(uColA, uColC, pad); gcol = mix(gcol, uColB, cuff);
    gcol *= 0.9 + 0.2 * nMid;
    base = mix(base, gcol, gl); shadeMul = mix(shadeMul, vec3(0.34, 0.33, 0.42), gl);
    gloss = mix(gloss, 0.55, gl); specAmt = mix(specAmt, 0.32, gl); isSkin = 1.0 - gl; warm = isSkin;
  #endif
  #ifdef FOOT
    float wrap = smoothstep(-0.1, 0.1, vReg.x) * uColD.y;
    base = mix(base, uColB, wrap); shadeMul = mix(shadeMul, vec3(0.4, 0.4, 0.5), wrap); isSkin = 1.0 - wrap;
    base = mix(base, base * vec3(0.8, 0.74, 0.7), smoothstep(0.0, 1.0, vReg.y) * (0.5 + uDirt));
  #endif
  #ifdef SHORTS
    float ang = atan(abs(vBind.x) - uThighX, vBind.z);                 // 0 = front of each leg, ±π back
    vec3 cA = uColA, cB = uColB, cC = uColC;
    float side = smoothstep(0.16, 0.19, abs(vBind.x) / sc - 0.0) ;
    vec3 sbase = cA;
    if (uPattern < 0.5) { float st = smoothstep(1.05, 1.12, ang) * (1.0 - smoothstep(1.75, 1.82, ang)); sbase = mix(cA, cB, st); float pin = smoothstep(1.36, 1.39, ang) * (1.0 - smoothstep(1.48, 1.51, ang)); sbase = mix(sbase, cC, pin); }
    else if (uPattern < 1.5) { float diag = vBind.y / sc * 9.0 + ang * 1.3; float ch = smoothstep(0.42, 0.5, abs(fract(diag) - 0.5)); sbase = mix(cA, cB, ch * smoothstep(0.7, 0.75, ang)); }
    else if (uPattern < 2.5) { float pnl = smoothstep(0.0, 0.03, vBind.z / sc + 0.02 - 0.5 * (vBind.y / sc - 0.8)); sbase = mix(cB, cA, pnl); float edge = 1.0 - smoothstep(0.0, 0.012, abs(vBind.z / sc + 0.02 - 0.5 * (vBind.y / sc - 0.8) - 0.012)); sbase = mix(sbase, cC, edge); }
    else if (uPattern < 3.5) { float f = fbm(vec2(ang * 2.2, vBind.y / sc * 7.0)); float fl = smoothstep(0.45, 0.5, f + (1.0 - vReg.y) * 0.35 - 0.12); sbase = mix(cA, cB, fl); sbase = mix(sbase, cC, smoothstep(0.62, 0.66, f + (1.0 - vReg.y) * 0.35 - 0.12)); }
    else { float g = step(0.5, fract(vBind.y / sc * 14.0 + sin(ang * 6.0) * 0.4)) ; sbase = mix(cA, cA * 0.72 + cB * 0.2, g * 0.6); float st = smoothstep(1.2, 1.25, ang) * (1.0 - smoothstep(1.6, 1.65, ang)); sbase = mix(sbase, cB, st); }
    vec2 duv = (vec2(vBind.x, vBind.y) - uDecalRect.xy) * uDecalRect.zw + 0.5;
    if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0 && vBindN.z > 0.2) { vec4 dc = texture2D(uDecal, duv); sbase = sbase * (1.0 - dc.a) + dc.rgb; }
    float band = 1.0 - smoothstep(0.42, 0.5, vReg.x); sbase = mix(sbase, cC, band);
    sbase = mix(sbase, cB, (1.0 - smoothstep(0.12, 0.16, vReg.y)) * (1.0 - band));
    float fold = fbm(vec2(ang * 3.0, vBind.y / sc * 16.0)) ; sbase *= 0.86 + 0.26 * fold;
    sbase = mix(sbase, vec3(0.015), vReg.z);
    base = sbase; shadeMul = vec3(0.30, 0.30, 0.42); gloss = 0.25; specAmt = 0.06; warm = 0.0; isSkin = 0.0;
  #endif
  #ifdef HAIR
    float strand = fbm(vec2(atan(vBind.x, vBind.z + 0.02) * 26.0, vBind.y / sc * 18.0 + nLow * 3.0));
    base = uHairCol * (0.62 + 0.8 * strand); shadeMul = vec3(0.34, 0.33, 0.44); gloss = 0.2; specAmt = 0.02 * uColD.z * strand; warm = 0.3; isSkin = 0.0; hatchAmt *= 0.5;
  #endif
  // ── condition: flush, bruising, impact marks, canvas dirt ────────────────
  #if defined(BODY) || defined(HEAD) || defined(HAND) || defined(FOOT)
    float dmg = uDmg.y;
    #ifdef HEAD
      dmg = uDmg.x;
    #else
      float isLeg = 1.0 - smoothstep(uZone.x - 0.06, uZone.x + 0.02, vBind.y), isArm = smoothstep(uZone.y - 0.02, uZone.y + 0.05, abs(vBind.x)) * (1.0 - isLeg);
      dmg = mix(mix(uDmg.y, uDmg.z, isArm), uDmg.w, isLeg);
    #endif
    float blot = smoothstep(1.0 - dmg * 0.95, 1.14 - dmg * 0.95, nLow * 0.6 + nMid * 0.55);
    vec3 bruise = mix(vec3(1.12, 0.62, 0.6), vec3(0.74, 0.5, 0.66), smoothstep(0.5, 1.0, dmg) * nMid);
    base = mix(base, base * bruise, blot * 0.7 * isSkin);
    base = mix(base, base * vec3(1.1, 0.86, 0.84), dmg * 0.5 * isSkin);
    float mk = 0.0;
    for (int i = 0; i < 6; i++) { vec3 dd = vBind - uMarks[i].xyz; mk = max(mk, uMarks[i].w * (1.0 - smoothstep(0.012 * sc, 0.075 * sc, length(dd) + (nMid - 0.5) * 0.03))); }
    base = mix(base, base * vec3(1.22, 0.5, 0.5), mk * 0.9 * isSkin);
    float dirt = smoothstep(0.62, 0.8, nLow + nMid * 0.4) * uDirt;
    base = mix(base, base * vec3(0.72, 0.7, 0.68), dirt);
  #endif
  // ── three painted tones, brush-wobbled edges ─────────────────────────────
  float shd = mix(1.0, getShadowMask(), uShadowAmt);
  float wob = (nMid - 0.5) * 0.13 + (nLow - 0.5) * 0.08;
  float lit = (dot(N, uKeyDir) * 0.5 + 0.5) * mix(0.62, 1.0, shd) * mix(0.66, 1.0, vAO.x) + wob;
  float tMid = smoothstep(0.40, 0.47, lit), tLit = smoothstep(0.72, 0.80, lit);
  vec3 shadeCol = base * shadeMul;
  vec3 col = toneRamp(base, shadeCol, tMid, tLit, warm);
  // skin: saturated warm band along the terminator, like a painted core shadow edge
  float term = tMid * (1.0 - tMid) * 4.0; col = mix(col, col * vec3(1.22, 0.8, 0.7), term * 0.32 * isSkin);
  // hatching inside the shadow tone
  float ha = (vBind.x * 0.86 + vBind.y * 0.5 + vBind.z * 0.3) / sc * 560.0 + nLow * 5.0;
  float hl = smoothstep(0.35, 0.8, sin(ha) * 0.5 + 0.5) * clamp(1.4 - fwidth(ha) * 0.55, 0.0, 1.0);
  col = mix(col, col * 0.74, hl * (1.0 - tMid) * hatchAmt);
  float h2 = smoothstep(0.5, 0.9, sin(ha * 0.5 + 1.7) * 0.5 + 0.5) * clamp(1.4 - fwidth(ha) * 0.3, 0.0, 1.0);
  col = mix(col, col * 0.86, h2 * tMid * (1.0 - tLit) * hatchAmt * (1.0 - smoothstep(0.5, 0.62, lit)));
  // ink wash in creases
  float crease = smoothstep(0.22, 0.7, vAO.y + (nMid - 0.5) * 0.15) * uCrease;
  col = mix(col, shadeCol * 0.5, crease * 0.8);
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.55, vAO.x));
  // ── light colour: ambient in shade, warm key in the light ────────────────
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5);
  col *= mix(amb, uKeyCol, tMid * 0.72 + tLit * 0.28);
  float fill = smoothstep(0.1, 0.75, dot(N, uFillDir) + wob); col += base * uFillCol * fill * (1.0 - tMid * 0.7);
  float fr = 1.0 - max(dot(N, V), 0.0);
  float rim = smoothstep(0.52, 0.72, fr + wob * 0.6) * smoothstep(-0.15, 0.45, dot(N, uRimDir));
  col += uRimCol * rim * (0.55 + 0.45 * base) * (0.4 + 0.6 * vAO.x);
  vec3 Hh = normalize(uKeyDir + V); float sp = pow(max(dot(N, Hh), 0.0), mix(18.0, 70.0, gloss));
  float sweatDots = smoothstep(0.9, 0.97, nHi) * uSweat * isSkin * tLit;
  col += uKeyCol * (smoothstep(0.32, 0.5, sp + wob) * specAmt + sweatDots * 0.14) * shd;
  col = col * uDim + uFlash * vec3(1.0, 0.92, 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

GLSL.fsVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
GLSL.bloomPre = /* glsl */`uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main(){ vec3 c = (texture2D(tMap, vUv + uTexel * vec2(-1,-1)).rgb + texture2D(tMap, vUv + uTexel * vec2(1,-1)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1,1)).rgb + texture2D(tMap, vUv + uTexel * vec2(1,1)).rgb) * 0.25;
  c = min(c, vec3(12.0)); float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThresh, uThresh * 2.2, l); gl_FragColor = vec4(c * k, 1.0); }`;
GLSL.bloomDown = /* glsl */`uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;
void main(){ vec3 c = texture2D(tMap, vUv).rgb * 4.0; c += texture2D(tMap, vUv + uTexel * vec2(-1,-1)).rgb + texture2D(tMap, vUv + uTexel * vec2(1,-1)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1,1)).rgb + texture2D(tMap, vUv + uTexel * vec2(1,1)).rgb; gl_FragColor = vec4(c / 8.0, 1.0); }`;
GLSL.bloomUp = /* glsl */`uniform sampler2D tMap, tAdd; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
void main(){ vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1,0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1,0)).rgb + texture2D(tMap, vUv + uTexel * vec2(0,-1)).rgb + texture2D(tMap, vUv + uTexel * vec2(0,1)).rgb;
  c += (texture2D(tMap, vUv + uTexel * vec2(-.7,-.7)).rgb + texture2D(tMap, vUv + uTexel * vec2(.7,-.7)).rgb + texture2D(tMap, vUv + uTexel * vec2(-.7,.7)).rgb + texture2D(tMap, vUv + uTexel * vec2(.7,.7)).rgb);
  gl_FragColor = vec4(c / 8.0 * uMix + texture2D(tAdd, vUv).rgb, 1.0); }`;
GLSL.final = /* glsl */`uniform sampler2D tScene, tBloom; uniform vec2 uRes, uCenter; uniform float uBloom, uExposure, uVig, uGrain, uTime, uChroma, uRadial, uDesat, uFade, uFlash, uLetter; uniform vec3 uTint;
varying vec2 vUv;
${GLSL.noise}
void main(){
  vec2 uv = vUv, d = uv - uCenter; vec3 c;
  if (uRadial > 0.002) { c = vec3(0.0); for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; c += texture2D(tScene, uv - d * uRadial * t).rgb; } c /= 8.0; }
  else c = texture2D(tScene, uv).rgb;
  if (uChroma > 0.0005) { c.r = mix(c.r, texture2D(tScene, uv + d * uChroma).r, 0.85); c.b = mix(c.b, texture2D(tScene, uv - d * uChroma).b, 0.85); }
  c += texture2D(tBloom, uv).rgb * uBloom;
  c *= uExposure;
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(c, vec3(l) * vec3(1.02, 1.0, 0.96), uDesat);
  c *= mix(vec3(0.94, 0.98, 1.07), vec3(1.05, 1.0, 0.93), smoothstep(0.0, 0.9, l)) * uTint;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  vec2 vd = (vUv - 0.5) * vec2(1.0, 0.82); c *= 1.0 - uVig * smoothstep(0.32, 0.92, length(vd));
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  float g = hash12(vUv * uRes + fract(uTime) * 91.7) - 0.5; float paper = vnoise(vUv * uRes * 0.35) - 0.5;
  c += g * uGrain + paper * uGrain * 0.6;
  c = mix(c, vec3(1.0, 0.97, 0.9), uFlash); c *= uFade;
  float lb = step(uLetter, vUv.y) * step(vUv.y, 1.0 - uLetter); c *= lb;
  gl_FragColor = vec4(c, 1.0);
}`;
