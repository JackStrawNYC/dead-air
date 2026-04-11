/**
 * Desert Road — raymarched vast desert landscape.
 * Sand dunes as noise-displaced terrain, heat shimmer distortion, dust devils
 * as volumetric spirals, bleached bones/skull SDF, Joshua trees.
 * Harsh sun, endless horizon.
 *
 * Audio reactivity:
 *   uBass             → dune rumble displacement, dust devil spin speed
 *   uEnergy           → heat shimmer intensity, sun harshness
 *   uDrumOnset        → sand burst particle trigger
 *   uVocalPresence    → mirage intensity
 *   uHarmonicTension  → sky color shift (blue→amber)
 *   uBeatSnap         → heat ripple pulse
 *   uSectionType      → jam=dust storm, space=still moonlit desert, solo=road focus
 *   uClimaxPhase      → full dust storm eruption
 *   uSlowEnergy       → overall warmth, sun position
 *   uHighs            → shimmer detail, sand sparkle
 *   uMelodicPitch     → dune height modulation
 *   uChromaHue        → sand/sky color temperature
 *   uPalettePrimary   → sand base color
 *   uPaletteSecondary → sky accent
 *   uSpectralFlux     → wind turbulence
 *   uDynamicRange     → shadow contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const desertRoadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const drdNormalGLSL = buildRaymarchNormal("drdMap($P, timeVal, bass).x", { eps: 0.002, name: "drdNormal" });
const drdAOGLSL = buildRaymarchAO("drdMap($P, timeVal, bass).x", { steps: 5, stepBase: 0.02, stepScale: 0.06, weightDecay: 0.65, finalMult: 2.5, name: "drdAO" });

export const desertRoadFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.04,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  thermalShimmerEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 90
#define MAX_DIST 60.0
#define SURF_DIST 0.002

// ============================================================
// Prefixed utility functions (drd = desert road)
// ============================================================
mat2 drdRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float drdHash(float n) { return fract(sin(n) * 43758.5453123); }
float drdHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 drdHash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ============================================================
// SDF primitives
// ============================================================
float drdSDSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float drdSDBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float drdSDCylinder(vec3 pos, float radius, float halfH) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfH);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float drdSDCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float drdSDEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float drdSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Desert terrain: dunes
// ============================================================
float drdDuneHeight(vec2 xz, float timeVal, float bass) {
  float h = 0.0;
  // Large dune formations
  h += sin(xz.x * 0.04 + xz.y * 0.02 + 1.5) * 3.0;
  h += sin(xz.x * 0.07 - xz.y * 0.03) * 1.5;
  // Medium dune ridges
  h += snoise(vec3(xz * 0.08, 0.0)) * 2.0;
  h += snoise(vec3(xz * 0.15, 5.0)) * 0.8;
  // Fine wind ripples
  float rippleAngle = 0.3;
  vec2 rippleUV = vec2(xz.x * cos(rippleAngle) + xz.y * sin(rippleAngle), 0.0);
  h += sin(rippleUV.x * 2.0) * 0.15;
  h += snoise(vec3(xz * 0.5, 10.0)) * 0.3;
  // Bass rumble displacement
  h += sin(xz.x * 0.3 + timeVal * 0.5) * bass * 0.3;
  return h;
}

float drdTerrainSDF(vec3 pos, float timeVal, float bass) {
  // Road: flat strip along Z-axis
  float roadHalf = 2.0;
  float roadBlend = smoothstep(roadHalf, roadHalf + 1.5, abs(pos.x));
  float duneH = drdDuneHeight(pos.xz, timeVal, bass);
  float terrainY = mix(-0.1, duneH, roadBlend);
  return pos.y - terrainY;
}

// ============================================================
// Joshua tree SDF
// ============================================================
float drdJoshuaTree(vec3 pos, float seed) {
  // Trunk
  float trunkH = 1.5 + seed * 1.0;
  float trunk = drdSDCapsule(pos, vec3(0.0), vec3(0.0, trunkH, 0.0), 0.08 + seed * 0.03);

  // Branches: 2-3 branches splitting near top
  float branches = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float branchAngle = (fi / 3.0) * TAU + seed * 5.0;
    float branchTilt = 0.5 + drdHash(seed * 10.0 + fi) * 0.4;
    vec3 branchStart = vec3(0.0, trunkH * 0.7, 0.0);
    vec3 branchEnd = branchStart + vec3(
      cos(branchAngle) * 0.5,
      0.6 + drdHash(fi + seed * 20.0) * 0.3,
      sin(branchAngle) * 0.5
    );
    float branch = drdSDCapsule(pos, branchStart, branchEnd, 0.04);

    // Foliage cluster at branch end
    vec3 foliagePos = pos - branchEnd;
    float foliage = drdSDEllipsoid(foliagePos, vec3(0.2, 0.15, 0.2));
    branch = drdSmin(branch, foliage, 0.1);
    branches = min(branches, branch);
  }

  // Top foliage on trunk
  vec3 topFoliagePos = pos - vec3(0.0, trunkH, 0.0);
  float topFoliage = drdSDEllipsoid(topFoliagePos, vec3(0.25, 0.2, 0.25));

  return drdSmin(trunk, min(branches, topFoliage), 0.05);
}

// ============================================================
// Skull/bones SDF (bleached roadside remains)
// ============================================================
float drdSkull(vec3 pos) {
  // Cranium: elongated sphere
  float cranium = drdSDEllipsoid(pos, vec3(0.12, 0.1, 0.14));
  // Eye sockets: subtract spheres
  float eyeL = drdSDSphere(pos - vec3(-0.04, 0.02, -0.11), 0.035);
  float eyeR = drdSDSphere(pos - vec3(0.04, 0.02, -0.11), 0.035);
  float skull = max(cranium, -eyeL);
  skull = max(skull, -eyeR);
  // Jaw: small box
  float jaw = drdSDBox(pos - vec3(0.0, -0.06, -0.08), vec3(0.06, 0.02, 0.04));
  skull = drdSmin(skull, jaw, 0.02);
  return skull;
}

// ============================================================
// Full scene SDF: terrain + trees + skull + road markings
// matID: 0=desert, 1=road, 2=joshua tree, 3=skull/bone
// ============================================================
vec2 drdMap(vec3 pos, float timeVal, float bass) {
  float terrain = drdTerrainSDF(pos, timeVal, bass);

  // Detect road vs desert
  float roadHalf = 2.0;
  float onRoad = 1.0 - smoothstep(roadHalf - 0.5, roadHalf, abs(pos.x));
  float matID = onRoad > 0.5 ? 1.0 : 0.0;

  vec2 result = vec2(terrain, matID);

  // Joshua trees placed sparsely
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float treeSeed = drdHash(fi * 13.7);
    float treeX = (treeSeed - 0.5) * 40.0;
    // Keep trees off the road
    if (abs(treeX) < 4.0) treeX += sign(treeX) * 4.0;
    float treeZ = (drdHash(fi * 27.3) - 0.5) * 50.0;
    vec3 treeBase = vec3(treeX, 0.0, treeZ);
    treeBase.y = drdDuneHeight(treeBase.xz, timeVal, bass);

    float treeDist = drdJoshuaTree(pos - treeBase, treeSeed);
    if (treeDist < result.x) {
      result = vec2(treeDist, 2.0);
    }
  }

  // Skull on roadside
  vec3 skullPos = pos - vec3(3.5, drdDuneHeight(vec2(3.5, 8.0), timeVal, bass) + 0.08, 8.0);
  skullPos.xz = drdRot2(0.7) * skullPos.xz;
  float skullDist = drdSkull(skullPos);
  if (skullDist < result.x) {
    result = vec2(skullDist, 3.0);
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${drdNormalGLSL}
${drdAOGLSL}

// ============================================================
// Soft shadow
// ============================================================
float drdSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float timeVal, float bass) {
  float res = 1.0;
  float tSh = mint;
  for (int i = 0; i < 40; i++) {
    float h = drdMap(ro + rd * tSh, timeVal, bass).x;
    res = min(res, 10.0 * h / tSh);
    tSh += clamp(h, 0.02, 0.5);
    if (h < 0.001 || tSh > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ============================================================
// Sky with harsh sun
// ============================================================
vec3 drdSky(vec3 rd, float energy, float tension, vec3 sunDir, vec3 palCol1, vec3 palCol2) {
  float skyGrad = rd.y * 0.5 + 0.5;
  vec3 skyTop = mix(vec3(0.3, 0.45, 0.8), vec3(0.5, 0.4, 0.3), tension * 0.5);
  vec3 skyHorizon = mix(vec3(0.85, 0.7, 0.5), palCol2 * 0.7, 0.2);
  vec3 sky = mix(skyHorizon, skyTop, skyGrad);

  // Harsh sun
  float sunDot = max(dot(rd, sunDir), 0.0);
  sky += vec3(1.0, 0.95, 0.8) * pow(sunDot, 256.0) * 3.0;
  sky += vec3(1.0, 0.85, 0.6) * pow(sunDot, 32.0) * 0.5;
  sky += vec3(1.0, 0.7, 0.4) * pow(sunDot, 8.0) * 0.15;

  return sky;
}

// ============================================================
// Volumetric dust devil
// ============================================================
vec3 drdDustDevil(vec3 ro, vec3 rd, float marchDist, float timeVal, float energy, float sJam) {
  vec3 dust = vec3(0.0);
  float dustIntensity = energy * 0.3 + sJam * 0.5;
  if (dustIntensity < 0.05) return dust;

  float stepSize = 0.8;
  for (int i = 0; i < 20; i++) {
    float tD = float(i) * stepSize + 1.0;
    if (tD > marchDist) break;
    vec3 dPos = ro + rd * tD;

    // Devil center: spiraling column
    vec2 devilCenter = vec2(8.0 + sin(timeVal * 0.2) * 3.0, 10.0 + cos(timeVal * 0.15) * 4.0);
    float distToDevil = length(dPos.xz - devilCenter);
    float columnMask = smoothstep(2.0, 0.0, distToDevil);
    float heightMask = smoothstep(0.0, 1.0, dPos.y) * smoothstep(8.0, 3.0, dPos.y);

    // Spiral noise
    float spiralAngle = atan(dPos.z - devilCenter.y, dPos.x - devilCenter.x);
    float spiral = sin(spiralAngle * 3.0 + dPos.y * 2.0 - timeVal * 3.0) * 0.5 + 0.5;
    float turbulence = fbm3(vec3(dPos * 0.3 + vec3(0.0, -timeVal * 0.5, 0.0)));

    float density = columnMask * heightMask * spiral * turbulence * dustIntensity * 0.1;
    vec3 dustColor = mix(vec3(0.7, 0.55, 0.35), vec3(0.9, 0.75, 0.5), dPos.y * 0.15);
    dust += dustColor * density * stepSize;
  }
  return dust;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uDrumOnset, 0.0, 1.0);
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

  float timeVal = uDynamicTime * 0.1;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.06;
  float hue2 = uPaletteSecondary + chromaH * 0.04;
  float sat = mix(0.4, 0.8, slowE) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, sat, mix(0.7, 0.9, energy)));
  vec3 palCol2 = hsv2rgb(vec3(hue2, sat * 0.8, mix(0.6, 0.85, energy)));

  // Camera: driving down the road
  float camSpeed = 0.5 + energy * 0.3 + sJam * 0.4 - sSpace * 0.3;
  float camZ = uTime * camSpeed;
  float camY = 1.5 + sin(uTime * 0.1) * 0.1;
  float camX = sin(uTime * 0.05) * 0.3 * (1.0 - sSolo);
  vec3 camOrigin = vec3(camX, camY + drdDuneHeight(vec2(camX, camZ), timeVal, bass) * 0.0, camZ);

  vec3 camTarget = camOrigin + vec3(sin(uTime * 0.03) * 0.5 * (1.0 - sSolo), -0.15, 5.0);
  vec3 camForward = normalize(camTarget - camOrigin);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRt = normalize(cross(camForward, camWorldUp));
  vec3 camUpV = cross(camRt, camForward);

  // Heat shimmer distortion
  float shimmerStr = (energy * 0.015 + beatSnap * 0.01) * mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace);
  vec2 shimmer = vec2(
    snoise(vec3(screenPos * 8.0, uDynamicTime * 2.0)),
    snoise(vec3(screenPos * 8.0 + 50.0, uDynamicTime * 2.0 + 30.0))
  ) * shimmerStr * smoothstep(-0.1, 0.1, screenPos.y);

  vec2 distortedScreen = screenPos + shimmer;

  vec3 rd = normalize(distortedScreen.x * camRt + distortedScreen.y * camUpV + 1.8 * camForward);

  // Sun direction
  vec3 sunDir = normalize(vec3(0.3, 0.6, 0.5));

  // ─── Raymarching ───
  float marchDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = camOrigin + rd * marchDist;
    vec2 dist = drdMap(pos, timeVal, bass);
    if (dist.x < SURF_DIST) {
      marchResult = vec2(marchDist, dist.y);
      break;
    }
    marchDist += dist.x * 0.7;
    if (marchDist > MAX_DIST) break;
  }

  vec3 col;

  if (marchResult.y < 0.0) {
    col = drdSky(rd, energy, tension, sunDir, palCol1, palCol2);
  } else {
    vec3 hitPos = camOrigin + rd * marchResult.x;
    vec3 norm = drdNormal(hitPos);
    float matID = marchResult.y;

    // Lighting
    float diffuse = max(dot(norm, sunDir), 0.0);
    float shadow = drdSoftShadow(hitPos + norm * 0.01, sunDir, 0.05, 15.0, timeVal, bass);
    diffuse *= shadow;

    vec3 viewDir = normalize(camOrigin - hitPos);
    vec3 halfDir = normalize(sunDir + viewDir);
    float specPow = matID < 0.5 ? 8.0 : (matID < 1.5 ? 12.0 : 32.0);
    float specular = pow(max(dot(norm, halfDir), 0.0), specPow) * shadow;

    float fresnelVal = pow(1.0 - max(dot(viewDir, norm), 0.0), 3.0);
    float ambOcc = drdAO(hitPos, norm);

    // Materials
    vec3 matColor;
    vec3 specCol;

    if (matID < 0.5) {
      // Desert sand
      float sandNoise = fbm3(vec3(hitPos.xz * 0.5, 0.0));
      float ripple = sin(hitPos.x * cos(0.3) * 4.0 + hitPos.z * sin(0.3) * 4.0) * 0.5 + 0.5;
      matColor = mix(vec3(0.65, 0.50, 0.30), vec3(0.80, 0.65, 0.40), sandNoise * 0.5 + 0.5);
      matColor = mix(matColor, palCol1 * 0.7, 0.1);
      matColor += vec3(0.05, 0.04, 0.02) * ripple * 0.3;
      // Sand sparkle on highs
      float sparkle = smoothstep(0.92, 0.96, snoise(vec3(hitPos.xz * 20.0, uDynamicTime * 0.5)));
      matColor += vec3(1.0, 0.95, 0.8) * sparkle * highs * 0.3;
      specCol = vec3(0.2, 0.15, 0.08);
    } else if (matID < 1.5) {
      // Road: asphalt
      float roadTex = fbm3(vec3(hitPos.xz * 8.0, 5.0));
      matColor = vec3(0.08, 0.07, 0.06) + roadTex * 0.04;
      // Center line
      float centerLine = smoothstep(0.04, 0.02, abs(hitPos.x));
      float dashPattern = step(0.5, fract(hitPos.z * 0.3));
      matColor = mix(matColor, vec3(0.8, 0.7, 0.2), centerLine * dashPattern * 0.8);
      specCol = vec3(0.1);
    } else if (matID < 2.5) {
      // Joshua tree
      matColor = mix(vec3(0.2, 0.3, 0.1), vec3(0.35, 0.25, 0.15), 0.5);
      specCol = vec3(0.1, 0.12, 0.05);
    } else {
      // Skull/bones: bleached white
      matColor = vec3(0.85, 0.82, 0.75);
      specCol = vec3(0.3, 0.28, 0.25);
    }

    // Compose lighting
    vec3 sunColor = vec3(1.0, 0.92, 0.75);
    vec3 skyAmbient = vec3(0.4, 0.5, 0.7) * 0.15;

    col = matColor * skyAmbient * ambOcc;
    col += matColor * sunColor * diffuse * 0.75;
    col += specCol * sunColor * specular * 0.5;
    col += matColor * fresnelVal * 0.08;

    // Dynamic range contrast
    col *= mix(0.9, 1.1, dynRange * (shadow * 0.5 + 0.5));

    // Distance fog: desert haze
    float fogDist = marchResult.x;
    float fogAmount = 1.0 - exp(-fogDist * fogDist * 0.0004);
    vec3 fogColor = mix(vec3(0.8, 0.7, 0.5), palCol2 * 0.6, 0.2);
    fogColor = mix(fogColor, vec3(0.9, 0.85, 0.7), 0.3);
    col = mix(col, fogColor, fogAmount);
  }

  // Volumetric dust devil
  float dustMarchDist = marchResult.y < 0.0 ? MAX_DIST : marchResult.x;
  col += drdDustDevil(camOrigin, rd, dustMarchDist, timeVal, energy, sJam);

  // Mirage shimmer at horizon (vocal presence)
  float horizonMask = smoothstep(0.05, -0.02, screenPos.y);
  col = mix(col, col * vec3(1.05, 1.0, 0.95), vocalP * horizonMask * 0.3);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 2.0, timeVal));
    vec3 iconLight = iconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }
  {
    float nf = fbm3(vec3(screenPos * 1.5, timeVal + 10.0));
    vec3 heroLight = heroIconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uSectionIndex);
    col += heroLight;
  }

  // Vignette
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.05, 0.03, 0.01), col, vignette);

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;

// Keep extra exports for backward compat (previously had separate ground/mesa shaders)
export const desertGroundFrag = desertRoadFrag;
export const mesaFrag = desertRoadFrag;
