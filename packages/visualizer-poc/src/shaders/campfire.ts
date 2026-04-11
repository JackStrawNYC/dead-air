/**
 * Campfire — raymarched nighttime campfire in a forest clearing.
 * Fire pit with stone ring, pine trees surrounding as silhouettes,
 * smoke rising through canopy, stars through tree gaps, tent silhouette.
 * NON song-specific version, different from campfire-embers.
 *
 * Audio reactivity:
 *   uBass             → flame height/width, deep fire pulse
 *   uEnergy           → flame intensity, ember count
 *   uDrumOnset        → spark burst (ember explosion)
 *   uVocalPresence    → warm glow radius expansion
 *   uHarmonicTension  → flame color shift (warm → aggressive)
 *   uBeatSnap         → crackle flash
 *   uSectionType      → jam=roaring fire, space=dying embers, chorus=full blaze
 *   uClimaxPhase      → fire erupts upward, ember shower
 *   uSlowEnergy       → smoke drift speed
 *   uHighs            → ember sharpness, spark detail
 *   uMelodicPitch     → flame tip height modulation
 *   uChromaHue        → flame color (orange → crimson → magenta)
 *   uPalettePrimary   → fire base hue
 *   uPaletteSecondary → ambient tint
 *   uSpectralFlux     → flame turbulence
 *   uDynamicRange     → light/shadow contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const campfireVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const cf2NormalGLSL = buildRaymarchNormal("cf2Map($P).x", { eps: 0.002, name: "cf2Normal" });
const cf2AOGLSL = buildRaymarchAO("cf2Map($P).x", { steps: 5, stepBase: 0.01, stepScale: 0.04, weightDecay: 0.65, finalMult: 3.0, name: "cf2AO" });
const cf2DepthAlpha = buildDepthAlphaOutput("marchDist", "MAX_DIST");

export const campfireFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.1,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  beatPulseEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 70
#define MAX_DIST 25.0
#define SURF_DIST 0.003
#define EMBER_COUNT 20

// ============================================================
// Prefixed utilities (cf2 = campfire)
// ============================================================
mat2 cf2Rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float cf2Hash(float n) { return fract(sin(n) * 43758.5453123); }
float cf2Hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 cf2Hash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ============================================================
// SDF primitives
// ============================================================
float cf2SDSphere(vec3 pos, float radius) { return length(pos) - radius; }

float cf2SDBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cf2SDCylinder(vec3 pos, float radius, float halfH) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfH);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float cf2SDCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float cf2SDPlane(vec3 pos, float yLevel) { return pos.y - yLevel; }

float cf2Smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Ground with pebble displacement
// ============================================================
float cf2Ground(vec3 pos) {
  float ground = cf2SDPlane(pos, 0.0);
  float pebbles = snoise(vec3(pos.xz * 8.0, 0.0)) * 0.015;
  pebbles += snoise(vec3(pos.xz * 18.0, 1.0)) * 0.006;
  ground -= pebbles;
  return ground;
}

// ============================================================
// Stone ring around fire pit
// ============================================================
float cf2StoneRing(vec3 pos) {
  float stones = 1e5;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float stoneAngle = fi * TAU / 12.0 + cf2Hash(fi) * 0.25;
    float stoneR = 0.5 + cf2Hash(fi + 10.0) * 0.08;
    vec3 stonePos = vec3(cos(stoneAngle) * stoneR, 0.03, sin(stoneAngle) * stoneR);
    float stoneSize = 0.04 + cf2Hash(fi + 20.0) * 0.025;
    vec3 stoneScale = vec3(stoneSize * 1.2, stoneSize * 0.7, stoneSize);
    float stone = cf2SDBox(pos - stonePos, stoneScale);
    stones = min(stones, stone);
  }
  return stones;
}

// ============================================================
// Log structure (teepee)
// ============================================================
float cf2LogStructure(vec3 pos) {
  float logRadius = 0.05;
  float logLen = 0.65;

  vec3 p1 = pos - vec3(-0.2, 0.0, -0.18);
  float a1 = 0.85; float c1 = cos(a1); float s1 = sin(a1);
  p1.yz = mat2(c1, s1, -s1, c1) * p1.yz;
  float log1 = cf2SDCylinder(p1, logRadius, logLen);

  vec3 p2 = pos - vec3(0.22, 0.0, -0.18);
  p2.yz = mat2(c1, s1, -s1, c1) * p2.yz;
  float yr2 = 0.8; float cy2 = cos(yr2); float sy2 = sin(yr2);
  p2.xz = mat2(cy2, sy2, -sy2, cy2) * p2.xz;
  float log2 = cf2SDCylinder(p2, logRadius, logLen);

  vec3 p3 = pos - vec3(0.0, 0.0, 0.25);
  float a3 = 0.85; float c3 = cos(a3); float s3 = sin(a3);
  p3.yz = mat2(c3, s3, -s3, c3) * p3.yz;
  float yr3 = -0.4; float cy3 = cos(yr3); float sy3 = sin(yr3);
  p3.xz = mat2(cy3, sy3, -sy3, cy3) * p3.xz;
  float log3 = cf2SDCylinder(p3, logRadius, logLen);

  return min(min(log1, log2), log3);
}

// ============================================================
// Tent silhouette (triangular prism)
// ============================================================
float cf2Tent(vec3 pos) {
  vec3 tentPos = pos - vec3(3.0, 0.0, -1.0);
  tentPos.xz = cf2Rot2(0.3) * tentPos.xz;
  // Triangular cross-section: two planes meeting at ridge
  float tentH = 1.2;
  float tentW = 0.8;
  float ridge = tentPos.y - tentH + abs(tentPos.x) * (tentH / tentW);
  float base = -tentPos.y;
  float depth = abs(tentPos.z) - 1.0;
  return max(max(ridge, base), depth);
}

// ============================================================
// Pine tree (cone + trunk)
// ============================================================
float cf2PineTree(vec3 pos, float seed) {
  float treeH = 3.0 + seed * 2.0;
  float trunk = cf2SDCapsule(pos, vec3(0.0), vec3(0.0, treeH * 0.3, 0.0), 0.06);
  float canopy = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float coneY = treeH * (0.25 + fi * 0.22);
    float coneR = (0.6 - fi * 0.12) * (1.0 + seed * 0.2);
    float coneH = 0.8;
    vec3 conePos = pos - vec3(0.0, coneY, 0.0);
    float cone = length(conePos.xz) - coneR * (1.0 - conePos.y / coneH);
    cone = max(cone, -conePos.y);
    cone = max(cone, conePos.y - coneH);
    canopy = min(canopy, cone);
  }
  return min(trunk, canopy);
}

// ============================================================
// Scene SDF (solid geometry — fire is volumetric)
// matID: 0=ground, 1=stone, 2=logs, 3=tent, 4=tree
// ============================================================
vec2 cf2Map(vec3 pos) {
  float ground = cf2Ground(pos);
  vec2 result = vec2(ground, 0.0);

  float stones = cf2StoneRing(pos);
  if (stones < result.x) result = vec2(stones, 1.0);

  float logs = cf2LogStructure(pos);
  if (logs < result.x) result = vec2(logs, 2.0);

  float tent = cf2Tent(pos);
  if (tent < result.x) result = vec2(tent, 3.0);

  // Trees in a circle around clearing
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float treeAngle = fi * TAU / 8.0 + cf2Hash(fi + 50.0) * 0.3;
    float treeR = 5.0 + cf2Hash(fi + 60.0) * 2.0;
    vec3 treeBase = vec3(cos(treeAngle) * treeR, 0.0, sin(treeAngle) * treeR);
    float tree = cf2PineTree(pos - treeBase, cf2Hash(fi + 70.0));
    if (tree < result.x) result = vec2(tree, 4.0);
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${cf2NormalGLSL}
${cf2AOGLSL}

// ============================================================
// Fire density (volumetric flame)
// ============================================================
float cf2FireDensity(vec3 pos, float bass, float energy, float flameH, float flameW, float timeVal) {
  float coneR = flameW * (1.0 - smoothstep(0.0, flameH, pos.y));
  float horizDist = length(pos.xz);
  float coneField = horizDist - coneR;
  if (coneField > 0.8) return 0.0;

  vec3 advected = pos;
  advected.y -= timeVal * (1.5 + bass * 0.8);
  advected.xz += vec2(
    sin(pos.y * 2.0 + timeVal * 0.7) * 0.12,
    cos(pos.y * 1.8 + timeVal * 0.5) * 0.1
  );

  float turb = fbm6(advected * 1.8);
  turb += fbm3(advected * 3.5 + 10.0) * 0.4;

  float density = smoothstep(0.3, -0.2, coneField);
  density *= (0.5 + turb * 0.5);
  density *= smoothstep(-0.05, 0.15, pos.y);
  density *= smoothstep(flameH + 0.2, flameH * 0.5, pos.y);
  density *= 0.5 + energy * 0.6;

  return clamp(density, 0.0, 1.0);
}

// ============================================================
// Flame color by height
// ============================================================
vec3 cf2FlameColor(float heightNorm, float tension, float chromaH) {
  vec3 coreC = vec3(0.9, 0.15, 0.02);
  vec3 midC = vec3(1.0, 0.45, 0.05);
  vec3 tipC = vec3(1.0, 0.85, 0.25);
  vec3 hotW = vec3(1.0, 0.95, 0.8);

  vec3 col = mix(coreC, midC, smoothstep(0.0, 0.35, heightNorm));
  col = mix(col, tipC, smoothstep(0.35, 0.7, heightNorm));
  col = mix(col, hotW, smoothstep(0.7, 1.0, heightNorm) * 0.4);
  col = mix(col, col * vec3(1.1, 0.7, 0.5), tension * 0.3);

  float hueShift = chromaH * 0.1;
  col.r += hueShift * 0.3;
  col.g -= hueShift * 0.1;

  return col;
}

// ============================================================
// Ember particles
// ============================================================
vec3 cf2Embers(vec3 ro, vec3 rd, float energy, float bass, float drumOnset,
               float climaxBoost, float timeVal) {
  vec3 embers = vec3(0.0);
  int count = int(mix(8.0, 20.0, energy + climaxBoost * 0.5));
  for (int i = 0; i < EMBER_COUNT; i++) {
    if (i >= count) break;
    float fi = float(i);
    vec3 seed = cf2Hash3(fi * 7.13 + 3.14);

    float life = fract(seed.x * 3.7 + timeVal * (0.08 + seed.y * 0.06));
    float emberH = life * (2.5 + energy * 2.0 + climaxBoost * 2.5);
    float spiralA = seed.z * TAU + timeVal * (0.5 + seed.x * 0.3) + life * 3.0;
    float spiralR = 0.1 + life * (0.3 + seed.y * 0.25);
    spiralR += drumOnset * seed.x * 0.6;

    vec3 emberPos = vec3(cos(spiralA) * spiralR, emberH, sin(spiralA) * spiralR);

    vec3 toE = emberPos - ro;
    float proj = dot(toE, rd);
    if (proj < 0.0) continue;
    vec3 closest = ro + rd * proj;
    float dist = length(closest - emberPos);

    float eSize = 0.012 + seed.y * 0.008;
    float glow = smoothstep(eSize * 4.0, 0.0, dist);
    float brightness = smoothstep(eSize, 0.0, dist);
    float flicker = 0.6 + 0.4 * sin(fi * 17.3 + timeVal * (8.0 + seed.z * 5.0));
    float lifeFade = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.7, life);

    vec3 eCol = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.3, 0.05), life);
    eCol *= 1.0 + brightness * 1.5;
    embers += eCol * (glow * 0.3 + brightness * 0.6) * flicker * lifeFade * (0.5 + energy * 0.5);
  }
  return embers;
}

// ============================================================
// Smoke volumetric
// ============================================================
vec3 cf2Smoke(vec3 ro, vec3 rd, float marchDist, float timeVal, float slowE, float energy) {
  vec3 smoke = vec3(0.0);
  float stepSize = 0.4;
  for (int i = 0; i < 20; i++) {
    float tS = float(i) * stepSize + 0.5;
    if (tS > marchDist) break;
    vec3 sPos = ro + rd * tS;

    float smokeBase = smoothstep(0.8, 1.8, sPos.y) * smoothstep(6.0, 2.5, sPos.y);
    if (smokeBase < 0.01) continue;

    float driftSpeed = 0.1 + slowE * 0.12;
    vec3 smokeP = sPos;
    smokeP.y -= timeVal * driftSpeed;
    smokeP.xz += vec2(sin(timeVal * 0.2) * 0.25, cos(timeVal * 0.15) * 0.18);

    float smokeTurb = fbm3(smokeP * 0.8) * 0.5 + 0.5;
    float hFade = smoothstep(1.0, 0.0, length(sPos.xz));
    float density = smokeBase * smokeTurb * hFade * 0.03;
    density *= 0.3 + (1.0 - energy) * 0.4;

    vec3 smokeCol = mix(vec3(0.15, 0.12, 0.1), vec3(0.25, 0.22, 0.2), sPos.y * 0.15);
    smoke += smokeCol * density * stepSize;
  }
  return smoke;
}

// ============================================================
// Star field
// ============================================================
vec3 cf2Stars(vec3 rd) {
  if (rd.y < 0.05) return vec3(0.0);
  vec3 stars = vec3(0.0);
  vec2 starUV = rd.xz / (rd.y + 0.001);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 cell = floor(starUV * (18.0 + fi * 12.0));
    float sh = cf2Hash2(cell + fi * 100.0);
    if (sh > 0.91) {
      vec2 sc = (cell + 0.5 + (cf2Hash2(cell + 7.0) - 0.5) * 0.7) / (18.0 + fi * 12.0);
      float dist = length(starUV - sc);
      float brightness = smoothstep(0.02 / (1.0 + fi), 0.0, dist);
      float twinkle = 0.7 + 0.3 * sin(cf2Hash(sh * 100.0) * TAU + uTime * (1.5 + cf2Hash(sh * 200.0) * 2.0));
      stars += vec3(0.8, 0.85, 1.0) * brightness * twinkle * 0.35;
    }
  }
  return stars;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float timeVal = uDynamicTime * 0.15;

  // Flame parameters
  float flameH = mix(0.5, 2.0, energy) * (1.0 + sJam * 0.4 + sChorus * 0.3 - sSpace * 0.6 + sSolo * 0.2);
  flameH += climaxBoost * 0.8 + melPitch * 0.3;
  float flameW = mix(0.15, 0.4, energy) * (1.0 + sJam * 0.3 - sSolo * 0.2);

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.06;
  float hue2 = uPaletteSecondary + chromaH * 0.04;
  float palSat = mix(0.5, 0.8, energy) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, palSat, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(hue2, palSat * 0.6, 0.7));

  // Camera: sitting around fire
  float camAngle = uTime * 0.015;
  float camR = 2.5;
  vec3 camOrigin = vec3(cos(camAngle) * camR, 1.0, sin(camAngle) * camR);
  vec3 camTarget = vec3(0.0, 0.5, 0.0);
  vec3 camForward = normalize(camTarget - camOrigin);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRt = normalize(cross(camForward, camWorldUp));
  vec3 camUpV = cross(camRt, camForward);

  vec3 rd = normalize(screenPos.x * camRt + screenPos.y * camUpV + 1.2 * camForward);

  // ─── Raymarch solid geometry ───
  float marchDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = camOrigin + rd * marchDist;
    vec2 dist = cf2Map(pos);
    if (dist.x < SURF_DIST) {
      marchResult = vec2(marchDist, dist.y);
      break;
    }
    marchDist += dist.x * 0.7;
    if (marchDist > MAX_DIST) break;
  }

  vec3 col;

  if (marchResult.y < 0.0) {
    // Night sky with stars
    col = vec3(0.005, 0.005, 0.015);
    col += cf2Stars(rd);
  } else {
    vec3 hitPos = camOrigin + rd * marchResult.x;
    vec3 norm = cf2Normal(hitPos);
    float matID = marchResult.y;
    float ambOcc = cf2AO(hitPos, norm);

    // Fire as point light source
    vec3 firePos = vec3(0.0, flameH * 0.3, 0.0);
    vec3 toFire = firePos - hitPos;
    float fireDist = length(toFire);
    vec3 fireDir = toFire / fireDist;
    float fireAtten = 1.0 / (1.0 + fireDist * fireDist * 0.3);
    float fireDiffuse = max(dot(norm, fireDir), 0.0) * fireAtten;

    // Fire light color
    vec3 fireLightCol = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.7, 0.3), energy * 0.5);
    fireLightCol = mix(fireLightCol, palCol1, 0.1);
    float fireIntensity = (0.5 + energy * 1.5) * (1.0 + sChorus * 0.3 - sSpace * 0.4);

    // Specular from fire
    vec3 viewDir = normalize(camOrigin - hitPos);
    vec3 halfFire = normalize(fireDir + viewDir);
    float fireSpec = pow(max(dot(norm, halfFire), 0.0), 32.0) * fireAtten;

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(viewDir, norm), 0.0), 3.0);

    // Material colors
    vec3 matColor;
    if (matID < 0.5) {
      // Ground: dark earth
      float groundN = fbm3(vec3(hitPos.xz * 4.0, 0.0));
      matColor = mix(vec3(0.04, 0.03, 0.02), vec3(0.08, 0.06, 0.04), groundN);
    } else if (matID < 1.5) {
      // Stones: gray
      matColor = vec3(0.12, 0.11, 0.10);
    } else if (matID < 2.5) {
      // Logs: dark brown
      matColor = vec3(0.06, 0.04, 0.02);
    } else if (matID < 3.5) {
      // Tent: dark fabric
      matColor = vec3(0.03, 0.04, 0.03);
    } else {
      // Trees: dark green/black
      matColor = vec3(0.01, 0.03, 0.01);
    }

    // Compose lighting: fire is the sole light source
    vec3 ambient = matColor * 0.02 * ambOcc;
    col = ambient;
    col += matColor * fireLightCol * fireDiffuse * fireIntensity * 0.8;
    col += vec3(0.3, 0.2, 0.1) * fireSpec * fireIntensity * 0.3;
    col += matColor * fresnelVal * 0.02;

    // Warm glow expansion from vocal presence
    float glowRadius = 1.0 + vocalP * 1.5;
    float glowFalloff = 1.0 / (1.0 + fireDist * fireDist / (glowRadius * glowRadius));
    col += fireLightCol * 0.03 * glowFalloff * vocalP;

    // Dynamic range contrast
    col *= mix(0.8, 1.2, dynRange * fireDiffuse);
  }

  // ─── Volumetric fire ───
  float fireStepSize = 0.05;
  vec3 fireAccum = vec3(0.0);
  float maxFireDist = min(marchResult.y < 0.0 ? MAX_DIST : marchResult.x, 5.0);

  for (int i = 0; i < 40; i++) {
    float tF = float(i) * fireStepSize + 0.1;
    if (tF > maxFireDist) break;
    vec3 fPos = camOrigin + rd * tF;

    float density = cf2FireDensity(fPos, bass, energy, flameH, flameW, timeVal);
    if (density < 0.01) continue;

    float heightNorm = clamp(fPos.y / flameH, 0.0, 1.0);
    vec3 fColor = cf2FlameColor(heightNorm, tension, chromaH);
    fColor = mix(fColor, fColor * palCol1 * 2.0, 0.08);

    // Crackle flash on beat snap
    fColor *= 1.0 + beatSnap * 0.5;

    fireAccum += fColor * density * fireStepSize * 3.0;
  }
  col += fireAccum;

  // ─── Ember particles ───
  col += cf2Embers(camOrigin, rd, energy, bass, drumOnset, climaxBoost, timeVal);

  // ─── Smoke ───
  float smokeMarchDist = marchResult.y < 0.0 ? MAX_DIST : marchResult.x;
  col += cf2Smoke(camOrigin, rd, smokeMarchDist, timeVal, slowE, energy);

  // ─── Icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, timeVal));
    vec3 iconLight = iconEmergence(screenPos, uTime, energy, bass,
      cf2FlameColor(0.5, tension, chromaH), palCol2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }
  {
    float nf = fbm3(vec3(screenPos * 1.5, timeVal + 5.0));
    vec3 heroLight = heroIconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uSectionIndex);
    col += heroLight;
  }

  // ─── Vignette ───
  float vigScale = mix(0.32, 0.25, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.002), col, vignette);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
  ${cf2DepthAlpha}
}
`;
