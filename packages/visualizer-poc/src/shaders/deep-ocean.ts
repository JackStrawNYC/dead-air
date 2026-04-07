/**
 * Deep Ocean Abyss — raymarched underwater scene with full 3D SDF.
 * Bioluminescent creatures, coral formations, volumetric light shafts,
 * caustic patterns on the seafloor, marine snow particles.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass           → ocean current sway, terrain pulse
 *   uEnergy         → bioluminescence brightness, creature count
 *   uDrumOnset      → jellyfish pulse flash
 *   uVocalPresence  → light shaft intensity from above
 *   uHarmonicTension→ water turbidity / fog density
 *   uSectionType    → jam=bioluminescent swarm, space=abyssal darkness,
 *                      chorus=light shaft flood, solo=dramatic isolation
 *   uClimaxPhase    → deep sea vent eruption
 *   uSlowEnergy     → ambient drift speed
 *   uHighs          → caustic sharpness
 *   uMids           → coral growth rate
 *   uMelodicPitch   → jellyfish drift altitude
 *   uTimbralBrightness → bioluminescent hue shift
 *   uSpaceScore     → abyssal depth increase
 *   uBeatStability  → current steadiness
 *   uStemBass       → seafloor rumble
 *   uFastEnergy     → particle burst intensity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const deepOceanVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  dofEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  caEnabled: true,
});

export const deepOceanFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════
// SDF PRIMITIVES
// ═══════════════════════════════════════════════

float do2Sphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float do2Capsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 ab = b - a;
  vec3 ap = pos - a;
  float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  return length(pos - (a + t * ab)) - radius;
}

float do2Box(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float do2Torus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float do2SmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float do2SmoothMax(float a, float b, float k) {
  return -do2SmoothMin(-a, -b, k);
}

// Rotation matrix around Y axis
mat2 do2Rot(float angle) {
  float ca = cos(angle);
  float sa = sin(angle);
  return mat2(ca, -sa, sa, ca);
}

// ═══════════════════════════════════════════════
// SEAFLOOR TERRAIN
// ═══════════════════════════════════════════════

float do2Terrain(vec3 pos, float bassVal, float time) {
  // Base rolling sand dunes
  float terrain = pos.y + 3.0;

  // Ridged sand ripples (bass makes them pulse)
  float ripple = ridgedMultifractal(pos * 0.4 + vec3(time * 0.02, 0.0, 0.0), 4, 2.0, 0.5);
  terrain -= ripple * 0.6 * (1.0 + bassVal * 0.3);

  // Large rock formations
  float rocks = fbm6(pos * 0.15 + vec3(0.0, 0.0, time * 0.005));
  terrain -= max(0.0, rocks - 0.2) * 2.5;

  // Bass-driven rumble
  float rumble = sin(pos.x * 0.5 + time * 0.8) * sin(pos.z * 0.7 + time * 0.6) * bassVal * 0.15;
  terrain += rumble;

  return terrain;
}

// ═══════════════════════════════════════════════
// CORAL FORMATIONS — branching tube coral SDFs
// ═══════════════════════════════════════════════

float do2CoralBranch(vec3 pos, float seed, float growth) {
  // Main trunk — capsule rising from floor
  float trunkH = 1.2 + seed * 0.8;
  trunkH *= growth;
  float trunk = do2Capsule(pos, vec3(0.0), vec3(0.0, trunkH, 0.0), 0.08 + seed * 0.04);

  // First branch fork
  vec3 forkBase = vec3(0.0, trunkH * 0.6, 0.0);
  vec3 forkDir = normalize(vec3(sin(seed * 17.3) * 0.6, 1.0, cos(seed * 23.7) * 0.6));
  float branch1 = do2Capsule(pos - forkBase, vec3(0.0), forkDir * trunkH * 0.5, 0.05 + seed * 0.02);

  // Second branch (opposite side)
  vec3 forkDir2 = normalize(vec3(-sin(seed * 11.1) * 0.5, 1.0, -cos(seed * 31.3) * 0.5));
  float branch2 = do2Capsule(pos - forkBase * 0.8, vec3(0.0), forkDir2 * trunkH * 0.4, 0.04 + seed * 0.02);

  // Bulbous tips (polyp heads)
  float tip1 = do2Sphere(pos - forkBase - forkDir * trunkH * 0.5, 0.1 + seed * 0.05);
  float tip2 = do2Sphere(pos - (vec3(0.0, trunkH, 0.0)), 0.12 + seed * 0.04);

  float coral = do2SmoothMin(trunk, branch1, 0.1);
  coral = do2SmoothMin(coral, branch2, 0.1);
  coral = do2SmoothMin(coral, tip1, 0.08);
  coral = do2SmoothMin(coral, tip2, 0.08);

  return coral;
}

float do2CoralFormation(vec3 pos, float time, float midsVal, float bassVal) {
  float coral = MAX_DIST;
  float growth = 0.8 + midsVal * 0.3;

  // Place 5 coral clusters along the seafloor
  for (int idx = 0; idx < 5; idx++) {
    float fi = float(idx);
    float seedVal = fract(fi * 0.618033988 + 0.3);

    // Positions scattered on the seafloor
    vec3 coralPos = vec3(
      sin(fi * 2.4 + 1.0) * 6.0,
      -3.0 + ridgedMultifractal(vec3(fi * 3.0, 0.0, 0.0), 3, 2.0, 0.5) * 0.5,
      cos(fi * 1.7 + 2.0) * 5.0 - 8.0
    );

    // Gentle bass sway at base
    coralPos.x += sin(time * 0.3 + fi) * bassVal * 0.15;

    float branch = do2CoralBranch(pos - coralPos, seedVal, growth);
    coral = min(coral, branch);
  }

  return coral;
}

// ═══════════════════════════════════════════════
// ROCK ARCH — dramatic geological formation
// ═══════════════════════════════════════════════

float do2RockArch(vec3 pos) {
  // Arch: torus with noise displacement, half submerged in floor
  vec3 archPos = pos - vec3(0.0, -1.5, -12.0);
  archPos.xz *= do2Rot(0.3);

  float arch = do2Torus(archPos, 3.5, 0.8);

  // Noise roughness for rock texture
  float roughness = fbm3(archPos * 0.8) * 0.3;
  arch += roughness;

  // Clip bottom half that merges with terrain
  arch = do2SmoothMax(arch, -(archPos.y + 2.0), 0.5);

  return arch;
}

// ═══════════════════════════════════════════════
// JELLYFISH — pulsing bell SDFs
// ═══════════════════════════════════════════════

float do2JellyfishBell(vec3 pos, float pulsePhase) {
  // Bell shape: hemisphere that contracts with pulse
  float squash = 1.0 + sin(pulsePhase) * 0.3;
  vec3 bellPos = pos * vec3(1.0, squash, 1.0);
  float bell = do2Sphere(bellPos, 0.5);

  // Scoop out underside for cup shape
  float hollow = do2Sphere(pos + vec3(0.0, 0.15, 0.0), 0.42);
  bell = max(bell, -hollow);

  // Frill at the bell rim
  float rimDist = length(pos.xz);
  float rimY = pos.y + 0.1;
  float frill = abs(rimY) - 0.03;
  frill = max(frill, abs(rimDist - 0.48) - 0.06);
  bell = min(bell, frill);

  return bell;
}

float do2Jellyfish(vec3 pos, float time, float drumOnset, float melodicPitch) {
  float jelly = MAX_DIST;

  // 3 jellyfish at different depths/positions
  for (int jIdx = 0; jIdx < 3; jIdx++) {
    float fj = float(jIdx);
    float seed = fj * 7.31 + 1.0;

    // Drift position — melodicPitch affects altitude
    vec3 jellyPos = vec3(
      sin(time * 0.12 + seed) * 4.0 + sin(time * 0.05 + seed * 2.0) * 2.0,
      -0.5 + fj * 1.5 + melodicPitch * 1.5 + sin(time * 0.2 + seed) * 0.5,
      -6.0 - fj * 3.0 + cos(time * 0.08 + seed) * 2.0
    );

    // Pulse: drum onset triggers strong contraction
    float pulse = time * (2.0 + fj * 0.5) + drumOnset * 8.0;

    float bell = do2JellyfishBell(pos - jellyPos, pulse);

    // Tentacles: vertical capsules below the bell
    for (int tIdx = 0; tIdx < 4; tIdx++) {
      float ft = float(tIdx);
      float tAngle = ft * TAU / 4.0 + fj;
      vec3 tentBase = jellyPos + vec3(cos(tAngle) * 0.3, -0.3, sin(tAngle) * 0.3);
      vec3 tentEnd = tentBase + vec3(
        sin(time * 0.5 + ft + seed) * 0.3,
        -1.0 - ft * 0.3,
        cos(time * 0.4 + ft + seed) * 0.3
      );
      float tentacle = do2Capsule(pos, tentBase, tentEnd, 0.02);
      bell = do2SmoothMin(bell, tentacle, 0.1);
    }

    jelly = min(jelly, bell);
  }

  return jelly;
}

// ═══════════════════════════════════════════════
// DEEP SEA VENT — climax eruption
// ═══════════════════════════════════════════════

float do2Vent(vec3 pos, float climaxAmount, float time) {
  if (climaxAmount < 0.01) return MAX_DIST;

  vec3 ventPos = pos - vec3(2.0, -3.0, -10.0);

  // Chimney cone
  float chimney = length(ventPos.xz) - (0.5 + ventPos.y * 0.15);
  chimney = max(chimney, ventPos.y - 3.0 * climaxAmount);
  chimney = max(chimney, -ventPos.y - 0.5);

  // Noise crust on the chimney
  chimney += fbm3(ventPos * 2.0) * 0.15;

  // Eruption plume (rising sphere column)
  float plume = MAX_DIST;
  for (int pi = 0; pi < 4; pi++) {
    float fpi = float(pi);
    float riseY = ventPos.y - 1.0 - fpi * 1.2 * climaxAmount;
    float plumeR = 0.3 + fpi * 0.15 + sin(time * 2.0 + fpi) * 0.1;
    vec3 plumePos = ventPos - vec3(
      sin(time + fpi * 2.0) * 0.3 * fpi,
      1.0 + fpi * 1.2 * climaxAmount,
      cos(time * 0.8 + fpi * 1.5) * 0.2 * fpi
    );
    float pBall = do2Sphere(plumePos, plumeR * climaxAmount);
    plume = do2SmoothMin(plume, pBall, 0.4);
  }

  return min(chimney, plume);
}

// ═══════════════════════════════════════════════
// SCENE SDF — combine all elements
// ═══════════════════════════════════════════════

// Material ID: 0=water, 1=terrain, 2=coral, 3=arch, 4=jellyfish, 5=vent
vec2 do2Map(vec3 pos, float time, float bassVal, float midsVal,
            float drumOnset, float melodicPitch, float climaxAmount) {
  // Seafloor terrain
  float terrain = do2Terrain(pos, bassVal, time);
  vec2 nearest = vec2(terrain, 1.0);

  // Coral formations
  float coral = do2CoralFormation(pos, time, midsVal, bassVal);
  if (coral < nearest.x) nearest = vec2(coral, 2.0);

  // Rock arch
  float arch = do2RockArch(pos);
  if (arch < nearest.x) nearest = vec2(arch, 3.0);

  // Jellyfish
  float jelly = do2Jellyfish(pos, time, drumOnset, melodicPitch);
  if (jelly < nearest.x) nearest = vec2(jelly, 4.0);

  // Deep sea vent (climax only)
  float vent = do2Vent(pos, climaxAmount, time);
  if (vent < nearest.x) nearest = vec2(vent, 5.0);

  return nearest;
}

// ═══════════════════════════════════════════════
// NORMALS via central differences
// ═══════════════════════════════════════════════

vec3 do2Normal(vec3 pos, float time, float bassVal, float midsVal,
               float drumOnset, float melodicPitch, float climaxAmount) {
  vec2 offset = vec2(0.002, 0.0);
  float centerD = do2Map(pos, time, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount).x;
  return normalize(vec3(
    do2Map(pos + offset.xyy, time, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount).x - centerD,
    do2Map(pos + offset.yxy, time, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount).x - centerD,
    do2Map(pos + offset.yyx, time, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount).x - centerD
  ));
}

// ═══════════════════════════════════════════════
// AMBIENT OCCLUSION (5-tap)
// ═══════════════════════════════════════════════

float do2Occlusion(vec3 pos, vec3 norm, float time, float bassVal, float midsVal,
                   float drumOnset, float melodicPitch, float climaxAmount) {
  float occl = 0.0;
  float scale = 1.0;
  for (int occIdx = 0; occIdx < 5; occIdx++) {
    float stepDist = 0.02 + float(occIdx) * 0.06;
    float sampled = do2Map(pos + norm * stepDist, time, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount).x;
    occl += (stepDist - sampled) * scale;
    scale *= 0.7;
  }
  return clamp(1.0 - occl * 3.0, 0.0, 1.0);
}

// ═══════════════════════════════════════════════
// UNDERWATER CAUSTICS (tileable sin/cos pattern)
// ═══════════════════════════════════════════════

float do2Caustic(vec2 coord, float time, float sharpness) {
  coord *= 4.0;
  vec2 iter = coord;
  float causVal = 1.0;
  float intensity = 0.005;

  for (int cn = 0; cn < 5; cn++) {
    float ct = time * (1.0 - (3.5 / float(cn + 1)));
    iter = coord + vec2(
      cos(ct - iter.x) + sin(ct + iter.y),
      sin(ct - iter.y) + cos(ct + iter.x)
    );
    causVal += 1.0 / length(vec2(
      coord.x / (sin(iter.x + ct) / intensity),
      coord.y / (cos(iter.y + ct) / intensity)
    ));
  }

  causVal /= 5.0;
  causVal = 1.17 - pow(causVal, 1.4);
  return clamp(pow(abs(causVal), mix(6.0, 12.0, sharpness)), 0.0, 1.0);
}

// ═══════════════════════════════════════════════
// VOLUMETRIC LIGHT SHAFTS
// ═══════════════════════════════════════════════

float do2LightShaft(vec3 pos, float time, float vocalPresence) {
  // Shafts come from above, angled slightly
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.1));

  // Project position onto shaft axis
  float projY = dot(pos, lightDir);

  // Create parallel shaft bands
  float shaftPattern = sin(pos.x * 1.5 + time * 0.2) * cos(pos.z * 1.2 + time * 0.15);
  shaftPattern = smoothstep(0.6, 1.0, shaftPattern);

  // Fade with depth (stronger near surface)
  float depthFade = smoothstep(-5.0, 3.0, pos.y);

  // Vocal presence intensifies
  float shaftStr = (0.3 + vocalPresence * 0.7) * depthFade * shaftPattern;

  // Scattering noise
  float scatter = fbm3(pos * 0.5 + vec3(time * 0.05));
  shaftStr *= 0.7 + scatter * 0.3;

  return clamp(shaftStr, 0.0, 1.0);
}

// ═══════════════════════════════════════════════
// BIOLUMINESCENT PARTICLES
// ═══════════════════════════════════════════════

vec3 do2Bioluminescence(vec3 rayOrigin, vec3 rayDir, float time, float energyVal,
                        float timbralBright, float sectionJam) {
  vec3 bioLight = vec3(0.0);

  // Number of creatures scales with energy + jam section
  int creatureCount = int(6.0 + energyVal * 6.0 + sectionJam * 8.0);

  for (int bIdx = 0; bIdx < 20; bIdx++) {
    if (bIdx >= creatureCount) break;

    float fb = float(bIdx);
    float seed = fb * 3.731 + 0.5;

    // 3D position: scattered through the water column
    vec3 bioPos = vec3(
      sin(seed * 17.3 + time * 0.06) * 8.0,
      sin(seed * 23.1 + time * 0.04) * 3.0 - 1.0,
      -5.0 - seed * 2.0 + cos(seed * 11.7 + time * 0.05) * 4.0
    );

    // Distance from ray to point (closest approach)
    vec3 toP = bioPos - rayOrigin;
    float projLen = dot(toP, rayDir);
    if (projLen < 0.0) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(bioPos - closest);

    // Glow falloff
    float glow = exp(-distToRay * distToRay * 8.0);

    // Pulsation
    float pulse = 0.4 + 0.6 * sin(time * (1.5 + fb * 0.3) + seed * TAU);
    pulse = pulse * pulse; // sharpen

    // Color: shifts with timbral brightness toward warmer tones
    float hueVal = fract(0.55 + fb * 0.07 + timbralBright * 0.2);
    vec3 bioColor = hsv2rgb(vec3(hueVal, 0.7, 1.0));

    // Depth attenuation
    float depthAtten = exp(-max(0.0, projLen) * 0.08);

    bioLight += bioColor * glow * pulse * depthAtten * 0.15;
  }

  return bioLight;
}

// ═══════════════════════════════════════════════
// MARINE SNOW (falling particle field)
// ═══════════════════════════════════════════════

vec3 do2MarineSnow(vec3 rayOrigin, vec3 rayDir, float time, float fastEnergy) {
  vec3 snow = vec3(0.0);

  for (int mIdx = 0; mIdx < 12; mIdx++) {
    float fm = float(mIdx);
    float seed = fm * 5.17 + 2.3;

    // Particles drift downward slowly
    vec3 snowPos = vec3(
      fract(seed * 0.37) * 16.0 - 8.0,
      mod(3.0 - time * (0.08 + fract(seed * 0.7) * 0.04) + fm * 1.3, 8.0) - 4.0,
      -3.0 - fm * 2.0 + fract(seed * 0.53) * 6.0
    );

    // Lateral drift
    snowPos.x += sin(time * 0.3 + fm * 1.7) * 0.5;
    snowPos.z += cos(time * 0.25 + fm * 2.1) * 0.3;

    // Ray proximity
    vec3 toParticle = snowPos - rayOrigin;
    float projLen = dot(toParticle, rayDir);
    if (projLen < 0.5) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(snowPos - closest);

    float particle = exp(-distToRay * distToRay * 200.0);
    float depthAtten = exp(-max(0.0, projLen) * 0.1);

    // Fast energy makes particles burst brighter momentarily
    float brightness = 0.03 + fastEnergy * 0.04;

    snow += vec3(0.6, 0.7, 0.8) * particle * depthAtten * brightness;
  }

  return snow;
}

// ═══════════════════════════════════════════════
// FRESNEL (Schlick approximation)
// ═══════════════════════════════════════════════

float do2Fresnel(vec3 viewDir, vec3 norm, float f0) {
  float cosTheta = clamp(dot(viewDir, norm), 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ═══════════════════════════════════════════════
// WATER FOG (exponential with turbidity)
// ═══════════════════════════════════════════════

vec3 do2WaterFog(vec3 col, float dist, vec3 fogColor, float turbidity) {
  float fogAmount = 1.0 - exp(-dist * (0.06 + turbidity * 0.08));
  return mix(col, fogColor, fogAmount);
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS (clamped) ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bassVal = clamp(uBass, 0.0, 1.0);
  float midsVal = clamp(uMids, 0.0, 1.0);
  float highsVal = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);

  // === SECTION TYPE DECODE ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxAmount = isClimax * climaxI;

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  vec3 waterColor = paletteHueColor(hue1, 0.7, 0.85);
  waterColor = mix(waterColor, vec3(0.02, 0.08, 0.18), 0.6 + spaceScore * 0.2);

  float hue2 = uPaletteSecondary;
  vec3 accentColor = paletteHueColor(hue2, 0.85, 0.95);
  accentColor = mix(accentColor, vec3(0.3, 0.7, 0.9), 0.3);

  // === FLOW TIME (section-modulated) ===
  float flowTime = uDynamicTime * (0.15 + slowE * 0.08)
    * mix(1.0, 1.4, sJam)
    * mix(1.0, 0.3, sSpace)
    * mix(1.0, 1.2, sChorus);

  // === CAMERA RAY ===
  vec3 rayOrigin, rayDir;
  setupCameraRay(uv, aspect, rayOrigin, rayDir);

  // Underwater camera drift: gentle bass-driven sway
  float swayX = sin(flowTime * 0.4) * 0.3 * (1.0 + bassVal * 0.5);
  float swayY = cos(flowTime * 0.3) * 0.15;
  rayOrigin += vec3(swayX, swayY - 0.5, 0.0);

  // Beat stability affects camera steadiness
  float jitter = (1.0 - beatStab) * 0.05;
  rayDir += vec3(
    snoise(vec3(uv * 5.0, uDynamicTime * 3.0)) * jitter,
    snoise(vec3(uv * 5.0 + 10.0, uDynamicTime * 3.0)) * jitter,
    0.0
  );
  rayDir = normalize(rayDir);

  // === RAYMARCH ===
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;
  vec3 marchPos = rayOrigin;

  for (int stepIdx = 0; stepIdx < MAX_STEPS; stepIdx++) {
    marchPos = rayOrigin + rayDir * totalDist;
    vec2 sceneResult = do2Map(marchPos, flowTime, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;

    if (sceneDist < SURF_DIST) {
      didHitSurface = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += sceneDist * 0.8; // conservative step for safety
  }

  // === BASE COLOR: deep ocean void ===
  // Space → deeper darkness, chorus → brighter
  float abyssDepth = 0.3 + spaceScore * 0.4 - sChorus * 0.15;
  vec3 col = waterColor * mix(0.15, 0.05, abyssDepth);

  // === VOLUMETRIC LIGHT SHAFTS (accumulated along ray) ===
  float shaftAccum = 0.0;
  float shaftStepSize = min(totalDist, MAX_DIST) / 16.0;
  for (int shIdx = 0; shIdx < 16; shIdx++) {
    float shDist = float(shIdx) * shaftStepSize;
    vec3 shPos = rayOrigin + rayDir * shDist;
    shaftAccum += do2LightShaft(shPos, flowTime, vocalPresence) * shaftStepSize * 0.15;
  }

  // Chorus floods the scene with light
  float shaftMult = 1.0 + sChorus * 1.5 + climaxAmount * 0.8;
  vec3 shaftColor = mix(vec3(0.4, 0.6, 0.8), accentColor, 0.3);
  col += shaftColor * shaftAccum * shaftMult;

  // === SURFACE SHADING ===
  if (didHitSurface) {
    vec3 norm = do2Normal(marchPos, flowTime, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount);
    float occl = do2Occlusion(marchPos, norm, flowTime, bassVal, midsVal, drumOnset, melodicPitch, climaxAmount);

    // Light direction: from above, slightly offset
    vec3 lightDir = normalize(vec3(0.3, 1.0, -0.2));

    // Diffuse lighting
    float diff = max(dot(norm, lightDir), 0.0);

    // Subsurface scattering approximation
    float scatter = max(0.0, dot(-norm, lightDir)) * 0.3;

    // Fresnel rim glow
    float fresnel = do2Fresnel(-rayDir, norm, 0.04);

    // Material coloring
    vec3 surfCol = vec3(0.0);

    if (matId < 1.5) {
      // Terrain — sandy with caustic projection
      float causticVal = do2Caustic(marchPos.xz, flowTime * 0.8, highsVal);
      vec3 sandColor = mix(vec3(0.15, 0.12, 0.08), vec3(0.25, 0.2, 0.15), fbm3(marchPos * 0.5));

      // Stem bass rumble displaces caustic intensity
      causticVal *= 1.0 + stemBass * 0.4;

      surfCol = sandColor * (0.3 + diff * 0.5) + accentColor * causticVal * 0.4;
    } else if (matId < 2.5) {
      // Coral — vibrant organic colors
      float coralNoise = fbm3(marchPos * 3.0);
      vec3 coralColor = mix(
        vec3(0.8, 0.2, 0.3),
        vec3(0.9, 0.5, 0.2),
        coralNoise
      );
      coralColor = mix(coralColor, accentColor, 0.3);
      surfCol = coralColor * (0.35 + diff * 0.5 + scatter * 0.3);
    } else if (matId < 3.5) {
      // Rock arch — dark stone with mineral veins
      float veins = ridgedMultifractal(marchPos * 1.5, 4, 2.0, 0.5);
      vec3 rockColor = mix(vec3(0.1, 0.09, 0.08), vec3(0.2, 0.18, 0.15), veins);
      surfCol = rockColor * (0.25 + diff * 0.4);
    } else if (matId < 4.5) {
      // Jellyfish — translucent, glowing
      vec3 jellyColor = mix(vec3(0.3, 0.5, 0.8), vec3(0.8, 0.3, 0.6), fresnel);
      jellyColor = mix(jellyColor, accentColor, 0.3);

      // Drum onset flash: jellyfish pulse bright
      float flashIntensity = 1.0 + drumOnset * 3.0;

      surfCol = jellyColor * (0.4 + diff * 0.3) * flashIntensity;
      // Emissive bioluminescent glow
      surfCol += jellyColor * 0.3 * (0.5 + 0.5 * sin(uDynamicTime * 2.0 + marchPos.y * 3.0));
    } else {
      // Vent — hot glowing minerals
      float ventHeat = smoothstep(-2.0, 2.0, marchPos.y + 2.0) * climaxAmount;
      vec3 ventColor = mix(vec3(0.2, 0.1, 0.05), vec3(1.0, 0.4, 0.1), ventHeat);
      surfCol = ventColor * (0.5 + diff * 0.3);
      // Emissive eruption glow
      surfCol += vec3(1.0, 0.5, 0.15) * ventHeat * 0.8;
    }

    // Apply AO
    surfCol *= 0.5 + 0.5 * occl;

    // Fresnel rim highlight (underwater edge glow)
    surfCol += accentColor * fresnel * 0.15;

    // === WATER FOG (exponential depth extinction) ===
    float turbidity = tension * 0.6 + sJam * 0.3;
    vec3 fogColor = waterColor * 0.12;
    surfCol = do2WaterFog(surfCol, totalDist, fogColor, turbidity);

    col = surfCol;
  } else {
    // Miss: deep water fog gradient
    float turbidity = tension * 0.5;
    vec3 deepFog = waterColor * mix(0.08, 0.03, spaceScore);
    col = do2WaterFog(col, MAX_DIST * 0.5, deepFog, turbidity);
  }

  // === BIOLUMINESCENT PARTICLES ===
  // Energy drives count, jam section intensifies
  vec3 bioGlow = do2Bioluminescence(rayOrigin, rayDir, flowTime, energy, timbralBright, sJam);
  col += bioGlow * (0.8 + energy * 0.5);

  // === MARINE SNOW ===
  col += do2MarineSnow(rayOrigin, rayDir, flowTime, fastE);

  // === CAUSTIC LIGHT on water volume (ambient scattered caustics) ===
  float volCaustic = do2Caustic(screenP + vec2(flowTime * 0.1), flowTime * 0.6, highsVal * 0.7);
  col += waterColor * volCaustic * 0.06 * (0.5 + vocalPresence * 0.5);

  // === SECTION SPECIAL BEHAVIORS ===

  // Jam: bioluminescent swarm intensifier (extra shimmer layer)
  if (sJam > 0.01) {
    float swarmNoise = fbm3(vec3(screenP * 4.0, flowTime * 0.8));
    float swarmPulse = smoothstep(0.3, 0.7, swarmNoise) * sJam;
    vec3 swarmColor = hsv2rgb(vec3(fract(0.55 + flowTime * 0.03), 0.8, 1.0));
    col += swarmColor * swarmPulse * 0.12 * energy;
  }

  // Space: abyssal darkness — suppress almost everything, leave faint glow
  col *= mix(1.0, 0.35, sSpace);

  // Solo: dramatic spotlight isolation — darken edges, brighten center
  if (sSolo > 0.01) {
    float spotlight = exp(-dot(screenP, screenP) * 2.0);
    col *= mix(1.0, 0.5 + spotlight * 1.0, sSolo);
  }

  // === CLIMAX: VENT ERUPTION ENVIRONMENTAL EFFECTS ===
  if (climaxAmount > 0.01) {
    // Orange-red tint from volcanic heat
    vec3 heatTint = vec3(1.0, 0.4, 0.1) * climaxAmount * 0.12;
    col += heatTint;

    // Particle storm: fast upward debris
    for (int debIdx = 0; debIdx < 6; debIdx++) {
      float fd = float(debIdx);
      float seed = fd * 7.13;
      vec3 debPos = vec3(
        sin(seed * 11.3) * 5.0 + 2.0,
        mod(uDynamicTime * 2.0 + fd * 1.5, 10.0) - 5.0,
        -10.0 + cos(seed * 7.7) * 3.0
      );
      vec3 toDebris = debPos - rayOrigin;
      float debProj = dot(toDebris, rayDir);
      if (debProj < 0.0) continue;
      vec3 debClosest = rayOrigin + rayDir * debProj;
      float debDist = length(debPos - debClosest);
      float debGlow = exp(-debDist * debDist * 50.0) * climaxAmount;
      col += vec3(1.0, 0.6, 0.2) * debGlow * 0.1;
    }
  }

  // === BEAT PULSE brightness ===
  float bpH = beatPulseHalf(uMusicalTime);
  col *= 1.0 + bpH * 0.08 * energy;
  col *= 1.0 + uBeatSnap * 0.1;

  // === SEMANTIC MODULATION ===
  // Cosmic → enhance deep blue tones
  col = mix(col, col * vec3(0.8, 0.85, 1.2), uSemanticCosmic * 0.15);
  // Tender → soften toward cool pastels
  col = mix(col, col * 0.92 + vec3(0.02, 0.03, 0.05), uSemanticTender * 0.2);
  // Ambient → deepen the darkness slightly
  col *= mix(1.0, 0.88, uSemanticAmbient * 0.3);
  // Psychedelic → saturate bioluminescence
  float psyLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(psyLuma), col, 1.0 + uSemanticPsychedelic * 0.4);

  // === VIGNETTE (deep ocean darkness at edges) ===
  float vigScale = mix(0.32, 0.26, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(waterColor * 0.03, vec3(0.02, 0.02, 0.04));
  col = mix(vigTint, col, vignette);

  // === DEAD ICONOGRAPHY ===
  float noiseField = snoise(vec3(screenP * 2.0, uTime * 0.1));
  col += iconEmergence(screenP, uTime, energy, bassVal, waterColor, accentColor, noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(screenP, uTime, energy, bassVal, waterColor, accentColor, noiseField, uSectionIndex);

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
