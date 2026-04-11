/**
 * Flower Field — raymarched 3D wildflower meadow.
 * Camera at ground level among tall flowers (poppy, daisy, lavender SDFs),
 * swaying in wind. Volumetric pollen haze, butterfly particles, rolling hills terrain.
 *
 * Audio reactivity:
 *   uBass             → wind sway amplitude, ground vibration
 *   uEnergy           → bloom state (closed buds → full petal spread), pollen density
 *   uDrumOnset        → petal burst animation trigger
 *   uVocalPresence    → flowers glow warmer (vocals = sunlight)
 *   uHarmonicTension  → color vibrancy shifts
 *   uBeatSnap         → pollen sparkle pulse
 *   uSectionType      → jam=rapid blooming, space=gentle closed buds, solo=spotlight
 *   uClimaxPhase      → full field explosion bloom
 *   uSlowEnergy       → overall color warmth and saturation
 *   uHighs            → butterfly/pollen particle count above field
 *   uMelodicPitch     → flower height modulation
 *   uChromaHue        → shifts petal colors with harmonic content
 *   uPalettePrimary   → dominant petal color
 *   uPaletteSecondary → secondary petal/stem color
 *   uSpectralFlux     → wind turbulence
 *   uDynamicRange     → contrast in terrain folds
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const flowerFieldVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fflNormalGLSL = buildRaymarchNormal("fflMap($P, timeVal, bass, energy, bloomState, sJam, sSpace).x", { eps: 0.002, name: "fflNormal" });
const fflAOGLSL = buildRaymarchAO("fflMap($P, timeVal, bass, energy, bloomState, sJam, sSpace).x", { steps: 5, stepBase: 0.01, stepScale: 0.04, weightDecay: 0.7, finalMult: 3.0, name: "fflAO" });

export const flowerFieldFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  halationEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.003

// ============================================================
// Prefixed utility functions (ffl = flower field)
// ============================================================
mat2 fflRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float fflHash(float n) { return fract(sin(n) * 43758.5453123); }
float fflHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 fflHash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ============================================================
// SDF primitives
// ============================================================
float fflSDSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float fflSDCylinder(vec3 pos, float radius, float halfH) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfH);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float fflSDPlane(vec3 pos, float yLevel) {
  return pos.y - yLevel;
}

float fflSDCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float fflSDEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float fflSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Terrain: rolling hills with noise displacement
// ============================================================
float fflTerrainHeight(vec2 xz, float timeVal) {
  float h = 0.0;
  // Large rolling hills
  h += sin(xz.x * 0.12 + 0.5) * cos(xz.y * 0.1) * 1.2;
  h += sin(xz.x * 0.07 - xz.y * 0.05 + 2.0) * 0.8;
  // Mid-frequency bumps
  h += snoise(vec3(xz * 0.3, 0.0)) * 0.5;
  h += snoise(vec3(xz * 0.7, 5.0)) * 0.2;
  // Fine grass tufts
  h += snoise(vec3(xz * 2.0, 10.0)) * 0.05;
  return h;
}

float fflTerrainSDF(vec3 pos, float timeVal) {
  float terrainY = fflTerrainHeight(pos.xz, timeVal);
  return pos.y - terrainY;
}

// ============================================================
// Flower SDF: poppy = sphere + petal lobes, daisy = disk + ring petals
// ============================================================
float fflFlowerHead(vec3 pos, float petalCount, float bloomAmount, float variety) {
  // Bud center
  float budRadius = mix(0.02, 0.04, variety);
  float bud = fflSDSphere(pos, budRadius);

  // Petals as radially arranged ellipsoids
  float petals = 1e5;
  for (int i = 0; i < 7; i++) {
    if (float(i) >= petalCount) break;
    float angle = float(i) * TAU / petalCount;
    vec3 petalPos = pos;
    // Rotate to petal position
    petalPos.xz = fflRot2(angle) * petalPos.xz;
    // Offset outward
    float petalLen = mix(0.01, 0.06, bloomAmount);
    petalPos.x -= petalLen * 0.5 + budRadius;
    // Petal shape: flattened ellipsoid
    vec3 petalRadii = vec3(petalLen, 0.005 + 0.005 * bloomAmount, 0.02 * bloomAmount + 0.005);
    float petal = fflSDEllipsoid(petalPos, petalRadii);
    petals = min(petals, petal);
  }

  return fflSmin(bud, petals, 0.01);
}

// ============================================================
// Single flower plant: stem + leaves + head
// ============================================================
float fflPlantSDF(vec3 pos, float stemHeight, float swayX, float swayZ,
                  float bloomAmt, float petalCount, float variety) {
  // Stem as capsule from ground up, curved by sway
  vec3 stemBase = vec3(0.0, 0.0, 0.0);
  vec3 stemMid = vec3(swayX * 0.3, stemHeight * 0.5, swayZ * 0.3);
  vec3 stemTop = vec3(swayX, stemHeight, swayZ);

  float stem = fflSDCapsule(pos, stemBase, stemMid, 0.008);
  stem = min(stem, fflSDCapsule(pos, stemMid, stemTop, 0.006));

  // Leaf at mid-stem
  vec3 leafPos = pos - vec3(swayX * 0.15, stemHeight * 0.35, swayZ * 0.15);
  leafPos.xz = fflRot2(variety * TAU) * leafPos.xz;
  vec3 leafRadii = vec3(0.04, 0.003, 0.015);
  float leaf = fflSDEllipsoid(leafPos, leafRadii);
  stem = min(stem, leaf);

  // Second leaf opposite side
  vec3 leaf2Pos = pos - vec3(swayX * 0.25, stemHeight * 0.55, swayZ * 0.25);
  leaf2Pos.xz = fflRot2(variety * TAU + PI) * leaf2Pos.xz;
  float leaf2 = fflSDEllipsoid(leaf2Pos, leafRadii * 0.85);
  stem = min(stem, leaf2);

  // Flower head at top
  vec3 headPos = pos - stemTop;
  // Tilt the flower slightly outward
  headPos.xz = fflRot2(variety * 3.0) * headPos.xz;
  float headAngle = 0.3 + variety * 0.3;
  float ca = cos(headAngle), sa = sin(headAngle);
  headPos.yz = mat2(ca, sa, -sa, ca) * headPos.yz;
  float flowerHead = fflFlowerHead(headPos, petalCount, bloomAmt, variety);

  return fflSmin(stem, flowerHead, 0.005);
}

// ============================================================
// Material IDs: 0=terrain, 1=stem/leaf, 2=petal, 3=sky
// ============================================================
vec2 fflMap(vec3 pos, float timeVal, float bass, float energy, float bloomState,
            float sJam, float sSpace) {
  // Terrain
  float terrain = fflTerrainSDF(pos, timeVal);
  vec2 result = vec2(terrain, 0.0);

  // Wind sway parameters
  float windTime = timeVal * 0.3;
  float windBase = bass * 0.08 + 0.03;

  // Place flowers in a grid around the camera
  vec2 cellSize = vec2(0.8);
  vec2 cellID = floor(pos.xz / cellSize);
  vec2 cellLocal = fract(pos.xz / cellSize) - 0.5;

  // Check neighboring cells for overlapping flowers
  for (int ox = -1; ox <= 1; ox++) {
    for (int oz = -1; oz <= 1; oz++) {
      vec2 neighborID = cellID + vec2(float(ox), float(oz));
      float presence = fflHash2(neighborID * 1.31);
      if (presence < 0.35) continue; // sparse field

      vec2 offset = vec2(fflHash2(neighborID * 2.71) - 0.5, fflHash2(neighborID * 3.91) - 0.5) * 0.5;
      vec2 localXZ = (cellLocal - vec2(float(ox), float(oz)) - offset) * cellSize;

      // Per-flower properties from hash
      float seed = fflHash2(neighborID * 7.13);
      float stemH = 0.15 + seed * 0.25 + energy * 0.08;
      float petalCnt = floor(mix(5.0, 8.0, fflHash2(neighborID * 5.17)));

      // Wind sway per flower
      float windPhase = neighborID.x * 1.7 + neighborID.y * 2.3;
      float swX = sin(windTime + windPhase) * windBase * (1.0 + sJam * 0.8 - sSpace * 0.5);
      float swZ = cos(windTime * 0.7 + windPhase + 1.0) * windBase * 0.6;

      // Terrain height at flower base
      vec2 worldXZ = (neighborID + 0.5 + offset) * cellSize;
      float baseY = fflTerrainHeight(worldXZ, timeVal);

      vec3 flowerPos = vec3(localXZ.x, pos.y - baseY, localXZ.y);

      // Local bloom with wave modulation
      float waveMod = snoise(vec3(neighborID * 0.3, timeVal * 0.15)) * 0.3;
      float localBloom = clamp(bloomState + waveMod, 0.0, 1.0);

      float flowerDist = fflPlantSDF(flowerPos, stemH, swX, swZ,
                                      localBloom, petalCnt, seed);

      // Determine material: stem vs petal
      vec3 headWorldPos = vec3(swX, stemH, swZ);
      float distToHead = length(flowerPos - headWorldPos);
      float matID = distToHead < 0.08 ? 2.0 : 1.0;

      if (flowerDist < result.x) {
        result = vec2(flowerDist, matID);
      }
    }
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${fflNormalGLSL}
${fflAOGLSL}

// ============================================================
// Soft shadow
// ============================================================
float fflSoftShadow(vec3 ro, vec3 rd, float mint, float maxt,
                    float timeVal, float bass, float energy, float bloom,
                    float sJam, float sSpace) {
  float res = 1.0;
  float tShadow = mint;
  for (int i = 0; i < 32; i++) {
    float h = fflMap(ro + rd * tShadow, timeVal, bass, energy, bloom, sJam, sSpace).x;
    res = min(res, 8.0 * h / tShadow);
    tShadow += clamp(h, 0.02, 0.2);
    if (h < 0.001 || tShadow > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ============================================================
// Sky gradient
// ============================================================
vec3 fflSky(vec3 rd, float energy, float slowE, vec3 sunDir, vec3 palCol1, vec3 palCol2) {
  float skyGrad = rd.y * 0.5 + 0.5;
  vec3 skyBottom = mix(vec3(0.95, 0.75, 0.50), vec3(1.0, 0.55, 0.30), energy * 0.5);
  vec3 skyTop = mix(vec3(0.45, 0.55, 0.85), vec3(0.35, 0.45, 0.85), energy * 0.3);
  skyBottom = mix(skyBottom, palCol1 * 0.8, 0.15);
  vec3 sky = mix(skyBottom, skyTop, skyGrad);

  // Sun disc
  float sunDot = max(dot(rd, sunDir), 0.0);
  sky += vec3(1.0, 0.9, 0.7) * pow(sunDot, 128.0) * 2.0;
  sky += vec3(1.0, 0.8, 0.5) * pow(sunDot, 16.0) * 0.3;

  // Clouds
  float cloudNoise = fbm3(vec3(rd.xz * 2.0 / max(rd.y, 0.05), uDynamicTime * 0.02));
  float cloudMask = smoothstep(0.15, 0.6, rd.y) * smoothstep(0.8, 0.5, rd.y);
  sky += vec3(1.0, 0.97, 0.92) * smoothstep(0.3, 0.7, cloudNoise) * cloudMask * 0.25;

  return sky;
}

// ============================================================
// Volumetric pollen haze
// ============================================================
vec3 fflPollenHaze(vec3 ro, vec3 rd, float marchDist, float energy, float highs, float timeVal) {
  vec3 haze = vec3(0.0);
  float stepSize = 0.5;
  float pollenDensity = mix(0.01, 0.06, energy + highs * 0.3);

  for (int i = 0; i < 16; i++) {
    float tHaze = float(i) * stepSize + 0.5;
    if (tHaze > marchDist) break;
    vec3 hazePos = ro + rd * tHaze;

    // Pollen only near ground level
    float heightMask = smoothstep(-0.5, 0.5, hazePos.y) * smoothstep(2.0, 0.5, hazePos.y);
    float noiseDensity = fbm3(vec3(hazePos.xz * 0.5, timeVal * 0.1));
    noiseDensity = smoothstep(0.3, 0.7, noiseDensity);

    float density = heightMask * noiseDensity * pollenDensity;
    vec3 pollenColor = mix(vec3(1.0, 0.95, 0.7), vec3(0.9, 0.8, 0.5), noiseDensity);
    haze += pollenColor * density * stepSize;
  }
  return haze;
}

// ============================================================
// Butterfly particles (ray-sphere test)
// ============================================================
vec3 fflButterflies(vec3 ro, vec3 rd, float highs, float energy, float timeVal,
                    vec3 palCol1, vec3 palCol2) {
  vec3 result = vec3(0.0);
  int count = int(mix(4.0, 12.0, highs));
  for (int i = 0; i < 12; i++) {
    if (i >= count) break;
    float fi = float(i);
    vec3 seed = fflHash3(fi * 7.13 + 1.23);

    // Lissajous flight path
    float bTime = timeVal * (0.2 + seed.x * 0.15);
    vec3 bPos = vec3(
      sin(bTime + seed.z * TAU) * 3.0 + seed.x * 4.0 - 2.0,
      0.5 + seed.y * 1.5 + sin(bTime * 2.0) * 0.3,
      cos(bTime * 0.7 + seed.y * TAU) * 3.0 + seed.z * 4.0 - 2.0
    );

    // Ray-sphere intersection
    vec3 toB = bPos - ro;
    float proj = dot(toB, rd);
    if (proj < 0.0) continue;
    vec3 closest = ro + rd * proj;
    float dist = length(closest - bPos);

    // Wing flap
    float wingFlap = sin(timeVal * (6.0 + seed.x * 4.0)) * 0.5 + 0.5;
    float bSize = 0.04 + wingFlap * 0.02;

    float glow = smoothstep(bSize * 4.0, 0.0, dist);
    float core = smoothstep(bSize, 0.0, dist);

    vec3 bColor = mix(palCol1, palCol2, seed.y);
    bColor *= 1.5;
    result += bColor * (glow * 0.2 + core * 0.5) * (0.3 + energy * 0.7);
  }
  return result;
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
  float vocalW = clamp(uVocalPresence, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float timeVal = uDynamicTime * 0.15;

  // Bloom state
  float bloomState = mix(0.15, 1.0, energy);
  bloomState = mix(bloomState, 1.0, sJam * 0.5);
  bloomState = mix(bloomState, 0.1, sSpace * 0.7);
  bloomState += climaxBoost * 0.3 + onset * 0.3;
  bloomState = clamp(bloomState, 0.0, 1.0);

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, sat, mix(0.85, 1.0, energy)));
  vec3 palCol2 = hsv2rgb(vec3(hue2, sat * 0.9, mix(0.8, 0.95, energy)));

  // Camera setup — ground level among flowers
  float camPanX = uTime * 0.02 * (1.0 + sJam * 0.5 - sSpace * 0.3);
  float camBobY = sin(uTime * 0.1) * 0.05;
  vec3 camOrigin = vec3(camPanX, 0.35 + camBobY + melPitch * 0.15, 0.0);
  camOrigin.y += fflTerrainHeight(camOrigin.xz, timeVal) + 0.2;

  vec3 camTarget = camOrigin + vec3(0.8, -0.05 + sin(uTime * 0.05) * 0.05, 0.3);
  vec3 camForward = normalize(camTarget - camOrigin);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(camForward, camWorldUp));
  vec3 camUp = cross(camRight, camForward);

  // Ray direction
  vec3 rd = normalize(screenPos.x * camRight + screenPos.y * camUp + 1.5 * camForward);

  // Sun direction — golden hour
  vec3 sunDir = normalize(vec3(0.5, 0.35, -0.3));

  // ─── Raymarching ───
  float marchDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = camOrigin + rd * marchDist;
    vec2 dist = fflMap(pos, timeVal, bass, energy, bloomState, sJam, sSpace);
    if (dist.x < SURF_DIST) {
      marchResult = vec2(marchDist, dist.y);
      break;
    }
    marchDist += dist.x * 0.7;
    if (marchDist > MAX_DIST) break;
  }

  vec3 col;

  if (marchResult.y < 0.0) {
    // Sky
    col = fflSky(rd, energy, slowE, sunDir, palCol1, palCol2);
  } else {
    vec3 hitPos = camOrigin + rd * marchResult.x;
    vec3 norm = fflNormal(hitPos);
    float matID = marchResult.y;

    // ─── Lighting ───
    // Diffuse
    float diffuse = max(dot(norm, sunDir), 0.0);

    // Soft shadow
    float shadow = fflSoftShadow(hitPos + norm * 0.01, sunDir, 0.05, 8.0,
                                  timeVal, bass, energy, bloomState, sJam, sSpace);
    diffuse *= shadow;

    // Specular (Blinn-Phong)
    vec3 viewDir = normalize(camOrigin - hitPos);
    vec3 halfDir = normalize(sunDir + viewDir);
    float specPow = matID > 1.5 ? 64.0 : 16.0;
    float specular = pow(max(dot(norm, halfDir), 0.0), specPow);
    specular *= shadow;

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(viewDir, norm), 0.0), 3.0);

    // Ambient occlusion
    float ambOcc = fflAO(hitPos, norm);

    // ─── Material colors ───
    vec3 matColor;
    vec3 specColor;

    if (matID < 0.5) {
      // Terrain: green grass with noise variation
      float grassNoise = fbm3(vec3(hitPos.xz * 3.0, 0.0));
      matColor = mix(vec3(0.12, 0.35, 0.08), vec3(0.2, 0.5, 0.12), grassNoise * 0.5 + 0.5);
      matColor = mix(matColor, vec3(0.3, 0.4, 0.1), dynRange * 0.2);
      // Wildflower undergrowth (small colored dots)
      float wildflowerN = snoise(vec3(hitPos.xz * 12.0, 5.0));
      if (wildflowerN > 0.7) {
        matColor = mix(matColor, palCol1 * 0.6, 0.3);
      }
      specColor = vec3(0.1, 0.15, 0.05);
    } else if (matID < 1.5) {
      // Stem/leaf: green
      matColor = mix(vec3(0.15, 0.45, 0.1), vec3(0.25, 0.6, 0.15), energy * 0.3);
      specColor = vec3(0.1, 0.2, 0.05);
    } else {
      // Petals: palette-driven with chroma hue shift
      float petalSeed = fract(hitPos.x * 10.0 + hitPos.z * 7.0);
      matColor = mix(palCol1, palCol2, petalSeed);
      matColor = mix(matColor, vec3(1.0, 0.95, 0.85), vocalW * 0.25);
      matColor *= 1.0 + onset * 0.4;
      matColor = mix(matColor, matColor * 1.3, tension * 0.2);
      specColor = matColor * 0.4 + vec3(0.2);
    }

    // ─── Compose lighting ───
    vec3 ambient = matColor * 0.15 * (0.5 + slowE * 0.5);
    vec3 sunColor = vec3(1.0, 0.9, 0.7);

    col = ambient * ambOcc;
    col += matColor * sunColor * diffuse * 0.7;
    col += specColor * sunColor * specular * 0.4;
    col += matColor * fresnelVal * 0.1;

    // Vocal warmth: golden tint
    col = mix(col, col * vec3(1.1, 1.05, 0.9), vocalW * 0.2);

    // Distance fog
    float fogDist = marchResult.x;
    float fogAmount = 1.0 - exp(-fogDist * 0.04);
    vec3 fogColor = mix(vec3(0.85, 0.75, 0.55), palCol1 * 0.5, 0.3);
    col = mix(col, fogColor, fogAmount);
  }

  // ─── Volumetric pollen haze ───
  float hazeDepth = marchResult.y < 0.0 ? MAX_DIST : marchResult.x;
  col += fflPollenHaze(camOrigin, rd, hazeDepth, energy, highs, timeVal);

  // ─── Butterfly particles ───
  col += fflButterflies(camOrigin, rd, highs, energy, timeVal, palCol1, palCol2);

  // ─── Icon emergence ───
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

  // ─── Vignette ───
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.08, 0.05, 0.02), col, vignette);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
