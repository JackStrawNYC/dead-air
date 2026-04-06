/**
 * Lava Flow — raymarched volcanic landscape.
 * Rivers of flowing lava carve channels through black basalt terrain.
 * Cooling crust cracks to reveal molten material below. Volcanic vents
 * emit smoke and fire. Obsidian formations with glass-like reflections.
 *
 * Full raymarched 3D SDF scene with proper lighting:
 *   - Basalt terrain (ridged multifractal rock with erosion channels)
 *   - Lava river channels (emissive flowing magma with cooling crust)
 *   - Obsidian formations (smooth reflective volcanic glass pillars)
 *   - Volcanic vents (eruption columns with smoke volumetrics)
 *   - Heat distortion, AO, specular, magma emission, fresnel
 *
 * Audio reactivity (16 uniforms):
 *   uBass             → lava flow speed / crust cracking / magma pulse
 *   uEnergy           → lava brightness / vent activity / overall intensity
 *   uDrumOnset        → volcanic vent burst / shockwave
 *   uVocalPresence    → magma underglow / subsurface warmth
 *   uHarmonicTension  → crust stability (stable=solid, tension=cracking)
 *   uMelodicPitch     → vent height variation
 *   uSectionType      → jam=rapids/active flow, space=cooling/still, chorus=fresh eruption
 *   uClimaxPhase      → massive eruption with lava fountain
 *   uBeatSnap         → lava pulse flash
 *   uSlowEnergy       → ambient drift speed
 *   uBeatStability    → terrain rumble coherence
 *   uDynamicRange     → magma emission contrast
 *   uTimbralBrightness → ember particle brightness
 *   uSpaceScore       → cooling aftermath mode
 *   uSemanticAggressive → destruction multiplier
 *   uHighs            → obsidian specular sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const lavaFlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.1,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  thermalShimmerEnabled: true,
  lightLeakEnabled: true,
});

export const lavaFlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 35.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Magma color ramp: black -> deep red -> orange -> yellow -> white-hot
// ═══════════════════════════════════════════════════════════

vec3 lvMagmaColor(float temp, float hueShift) {
  float scaledT = clamp(temp, 0.0, 1.0);
  vec3 col = vec3(0.0);
  col += vec3(0.7, 0.06, 0.0) * smoothstep(0.0, 0.25, scaledT);
  col += vec3(0.9, 0.25, 0.02) * smoothstep(0.15, 0.45, scaledT);
  col += vec3(0.5, 0.45, 0.0) * smoothstep(0.4, 0.7, scaledT);
  col += vec3(0.3, 0.3, 0.15) * smoothstep(0.6, 0.85, scaledT);
  col += vec3(0.5, 0.5, 0.45) * smoothstep(0.85, 1.0, scaledT);

  float angle = hueShift * TAU * 0.08;
  float cs = cos(angle);
  float sn = sin(angle);
  col.rg = vec2(cs * col.r - sn * col.g, sn * col.r + cs * col.g);
  col = max(col, vec3(0.0));
  return col;
}

// ═══════════════════════════════════════════════════════════
// Basalt terrain SDF — rough volcanic landscape with erosion channels
// ═══════════════════════════════════════════════════════════

float lvTerrain(vec3 pos, float bass, float tension, float flowTime, float flowSpeedMod) {
  // Base ground plane tilted slightly toward camera
  float ground = pos.y + 0.5;

  // Large-scale terrain undulation via ridged multifractal
  float ridges = ridgedMultifractal(pos * 0.15 + vec3(0.0, 0.0, flowTime * 0.01), 5, 2.1, 0.52);
  ground += ridges * 1.8;

  // Mid-frequency rocky detail
  float rockDetail = fbm6(vec3(pos.xz * 0.4, pos.y * 0.2)) * 0.6;
  ground += rockDetail;

  // Fine basalt columnar fracture texture
  float basaltColumns = ridgedMultifractal(pos * 0.8 + tension * 0.2, 4, 2.3, 0.48);
  ground += basaltColumns * 0.15 * (1.0 + tension * 0.5);

  // River channel erosion — sinusoidal valleys carved by lava
  float channelX = pos.x + sin(pos.z * 0.3 + 1.5) * 2.0 + sin(pos.z * 0.08) * 4.0;
  float channel1 = smoothstep(1.8, 0.0, abs(channelX)) * 1.2;

  float channelX2 = pos.x - 2.5 + sin(pos.z * 0.2 + 3.0) * 1.5 + cos(pos.z * 0.12) * 3.0;
  float channel2 = smoothstep(1.4, 0.0, abs(channelX2)) * 0.9;

  // Bass widens the channels (pressurizes magma outward)
  float channelWiden = bass * 0.3;
  channel1 *= 1.0 + channelWiden;
  channel2 *= 1.0 + channelWiden;

  ground -= max(channel1, channel2);

  // Terrain rumble: bass-driven micro-displacement
  float rumble = sin(pos.x * 8.0 + flowTime * 3.0) * cos(pos.z * 6.0 + flowTime * 2.5) * bass * 0.02;
  ground += rumble;

  return ground;
}

// ═══════════════════════════════════════════════════════════
// Lava river surface — flowing magma in carved channels
// ═══════════════════════════════════════════════════════════

float lvLava(vec3 pos, float bass, float energy, float flowTime, float flowSpeedMod) {
  // Lava sits in channel depressions
  float lavaY = -0.4 + bass * 0.15 + energy * 0.1;

  // Flowing surface undulation
  float waveZ = sin(pos.z * 1.2 - flowTime * flowSpeedMod * 2.0) * 0.06;
  float waveX = sin(pos.x * 1.8 + flowTime * flowSpeedMod * 1.5 + 0.7) * 0.04;
  float surfaceNoise = fbm3(vec3(pos.xz * 0.6, flowTime * flowSpeedMod * 0.3)) * 0.1;

  float lavaSurface = pos.y - lavaY - waveZ - waveX - surfaceNoise;

  // Channel mask — only place lava in river channels
  float channelX = pos.x + sin(pos.z * 0.3 + 1.5) * 2.0 + sin(pos.z * 0.08) * 4.0;
  float channelMask1 = smoothstep(2.0, 0.8, abs(channelX));

  float channelX2 = pos.x - 2.5 + sin(pos.z * 0.2 + 3.0) * 1.5 + cos(pos.z * 0.12) * 3.0;
  float channelMask2 = smoothstep(1.6, 0.5, abs(channelX2));

  float channelMask = max(channelMask1, channelMask2);
  lavaSurface = mix(10.0, lavaSurface, channelMask);

  return lavaSurface;
}

// ═══════════════════════════════════════════════════════════
// Obsidian formations — smooth volcanic glass pillars/spires
// ═══════════════════════════════════════════════════════════

float lvObsidian(vec3 pos, float tension) {
  float minDist = 1e5;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Deterministic positions along lava channel banks
    float spireX = -3.0 + fi * 2.2 + sin(fi * 3.1) * 0.8;
    float spireZ = -2.0 + fi * 3.5 + cos(fi * 2.7) * 1.5;
    float spireHeight = 2.0 + sin(fi * 4.3) * 1.0;
    float spireRadius = 0.25 + fi * 0.04;

    vec3 localPos = pos - vec3(spireX, 0.0, spireZ);

    // Tapered column: wider at base, narrow at tip
    float taper = 1.0 - smoothstep(0.0, spireHeight, localPos.y) * 0.6;
    float baseBulge = exp(-localPos.y * 1.5) * 0.15;
    float cylDist = length(localPos.xz) - (spireRadius * taper + baseBulge);

    // Height clamp
    float heightClamp = max(-localPos.y - 1.0, localPos.y - spireHeight);
    float columnDist = max(cylDist, heightClamp);

    // Conchoidal fracture surface (obsidian's signature feature)
    float fracture = sin(localPos.y * 12.0 + localPos.x * 8.0) * 0.008;
    fracture += sin(atan(localPos.z, localPos.x) * 5.0) * 0.01;
    columnDist += fracture;

    // Tension-driven cracking
    float crackNoise = ridgedMultifractal(localPos * 4.0 + tension * 0.3, 3, 2.0, 0.5);
    columnDist += crackNoise * tension * 0.03;

    minDist = min(minDist, columnDist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Volcanic vents — eruption points with hot gas columns
// ═══════════════════════════════════════════════════════════

float lvVent(vec3 pos, float energy, float drumOnset, float ventTime,
             float melodicPitch, float eruptionScale) {
  float minDist = 1e5;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Vent positions: along the lava channels
    float vAngle = fi * TAU / 3.0 + 0.8;
    float vRadius = 1.2 + fi * 0.6;
    vec2 vPos = vec2(cos(vAngle) * vRadius + sin(fi * 2.3) * 0.5,
                     sin(vAngle) * vRadius - 1.0 + fi * 2.0);

    vec3 localPos = pos - vec3(vPos.x, -0.3, vPos.y);

    // Vent cone: eruption column rising from ground
    float ventHeight = (0.5 + energy * 2.5 + drumOnset * 2.0 + melodicPitch * 0.8) * eruptionScale;
    float ventWidth = 0.2 + energy * 0.1 + drumOnset * 0.15;

    // Inverted cone: wider at top for plume shape
    float heightFrac = clamp(localPos.y / max(ventHeight, 0.1), 0.0, 1.0);
    float coneRadius = ventWidth * (0.4 + heightFrac * 0.8);

    float coneDist = length(localPos.xz) - coneRadius;
    coneDist = max(coneDist, -localPos.y);
    coneDist = max(coneDist, localPos.y - ventHeight);

    // Fire turbulence displacement
    vec3 noisePos = localPos * 2.5;
    noisePos.y -= ventTime * (2.5 + energy);
    float fireTurb = fbm3(noisePos) * 0.25 * (0.4 + heightFrac);
    coneDist += fireTurb;

    minDist = min(minDist, coneDist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — returns vec2(distance, materialId)
//   matId: 0=basalt terrain, 1=lava river, 2=obsidian, 3=vent
// ═══════════════════════════════════════════════════════════

vec2 lvMap(vec3 pos, float bass, float energy, float drumOnset, float tension,
           float flowTime, float flowSpeedMod, float melodicPitch,
           float eruptionScale, float ventTime) {

  // Basalt terrain
  float terrain = lvTerrain(pos, bass, tension, flowTime, flowSpeedMod);
  vec2 result = vec2(terrain, 0.0);

  // Lava river channels
  float lava = lvLava(pos, bass, energy, flowTime, flowSpeedMod);
  if (lava < result.x) {
    result = vec2(lava, 1.0);
  }

  // Obsidian formations
  float obsidian = lvObsidian(pos, tension);
  if (obsidian < result.x) {
    result = vec2(obsidian, 2.0);
  }

  // Volcanic vents
  float vent = lvVent(pos, energy, drumOnset, ventTime, melodicPitch, eruptionScale);
  if (vent < result.x) {
    result = vec2(vent, 3.0);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Normal estimation via central differences
// ═══════════════════════════════════════════════════════════

vec3 lvNormal(vec3 pos, float bass, float energy, float drumOnset, float tension,
              float flowTime, float flowSpeedMod, float melodicPitch,
              float eruptionScale, float ventTime) {
  vec2 offset = vec2(0.003, 0.0);
  float dist = lvMap(pos, bass, energy, drumOnset, tension, flowTime, flowSpeedMod,
                     melodicPitch, eruptionScale, ventTime).x;
  vec3 norm = vec3(
    lvMap(pos + offset.xyy, bass, energy, drumOnset, tension, flowTime, flowSpeedMod,
          melodicPitch, eruptionScale, ventTime).x - dist,
    lvMap(pos + offset.yxy, bass, energy, drumOnset, tension, flowTime, flowSpeedMod,
          melodicPitch, eruptionScale, ventTime).x - dist,
    lvMap(pos + offset.yyx, bass, energy, drumOnset, tension, flowTime, flowSpeedMod,
          melodicPitch, eruptionScale, ventTime).x - dist
  );
  return normalize(norm);
}

// ═══════════════════════════════════════════════════════════
// Ambient occlusion — 5-sample hemisphere probe
// ═══════════════════════════════════════════════════════════

float lvOcclusion(vec3 pos, vec3 norm, float bass, float energy, float drumOnset,
                  float tension, float flowTime, float flowSpeedMod, float melodicPitch,
                  float eruptionScale, float ventTime) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 0; i < 5; i++) {
    float dist = 0.02 + 0.08 * float(i);
    float sampled = lvMap(pos + norm * dist, bass, energy, drumOnset, tension,
                          flowTime, flowSpeedMod, melodicPitch, eruptionScale, ventTime).x;
    occ += (dist - sampled) * weight;
    weight *= 0.7;
  }
  return clamp(1.0 - occ * 3.5, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Fresnel approximation (Schlick)
// ═══════════════════════════════════════════════════════════

float lvFresnel(vec3 viewDir, vec3 norm, float f0) {
  float cosTheta = max(0.0, dot(viewDir, norm));
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ═══════════════════════════════════════════════════════════
// Lava crust pattern — cooling plates with cracking between them
// Returns vec2(crustMask, crackGlow)
// ═══════════════════════════════════════════════════════════

vec2 lvCrustPattern(vec3 pos, float flowTime, float flowSpeedMod, float tension, float bass) {
  // Crust as ridged multifractal: dark solidified plates
  vec3 crustPos = vec3(pos.xz * 2.5 - vec2(0.0, flowTime * flowSpeedMod * 0.4), pos.y);
  float crustNoise = ridgedMultifractal(crustPos, 4, 2.2, 0.5);

  // Tension destabilizes crust (lower threshold = more cracks)
  float crustThreshold = mix(0.55, 0.35, tension) - bass * 0.08;
  float crust = smoothstep(crustThreshold, crustThreshold + 0.15, crustNoise);

  // Crack glow: bright emission at plate boundaries
  float crackEdge = smoothstep(crustThreshold + 0.05, crustThreshold - 0.02, crustNoise);
  float crackGlow = crackEdge * (1.0 - crust);

  return vec2(crust, crackGlow);
}

// ═══════════════════════════════════════════════════════════
// Smoke volumetrics — accumulated density along ray
// ═══════════════════════════════════════════════════════════

vec3 lvSmokeVolume(vec3 rayOrigin, vec3 rayDir, float tMax, float flowTime,
                   float energy, float hueShift) {
  vec3 accum = vec3(0.0);
  float alpha = 0.0;
  float stepSize = tMax / 8.0;

  for (int i = 0; i < 8; i++) {
    if (alpha > 0.9) break;
    float marchT = 2.0 + float(i) * stepSize;
    if (marchT > tMax) break;
    vec3 samplePos = rayOrigin + rayDir * marchT;

    // Smoke rises above vents: density from height and noise
    float smokeNoise = fbm3(samplePos * 0.4 + vec3(0.0, -flowTime * 0.3, flowTime * 0.1));
    float heightFade = smoothstep(0.5, 4.0, samplePos.y) * smoothstep(8.0, 5.0, samplePos.y);
    float density = max(0.0, smokeNoise) * heightFade * (0.2 + energy * 0.4);

    if (density > 0.01) {
      // Warm smoke illuminated by magma below
      vec3 smokeColor = mix(vec3(0.04, 0.02, 0.01), vec3(0.12, 0.06, 0.02), energy * 0.5);
      // Underlit by magma
      smokeColor += lvMagmaColor(0.3 + energy * 0.2, hueShift) * heightFade * 0.15;
      float sampleAlpha = density * stepSize * 0.15;
      accum += smokeColor * sampleAlpha * (1.0 - alpha);
      alpha += sampleAlpha * (1.0 - alpha);
    }
  }

  return accum;
}

// ═══════════════════════════════════════════════════════════
// Rising ember particles
// ═══════════════════════════════════════════════════════════

float lvEmber(vec3 pos, float flowTime) {
  vec3 pWrapped = pos;
  pWrapped.y = mod(pWrapped.y - flowTime * 1.8, 10.0) - 1.0;
  pWrapped.x += sin(pWrapped.y * 1.8 + flowTime * 0.6) * 0.35;
  pWrapped.z += cos(pWrapped.y * 1.3 + flowTime * 0.4) * 0.25;

  float particle = snoise(pWrapped * 3.5);
  particle = pow(max(0.0, particle), 13.0);
  return particle;
}

// ═══════════════════════════════════════════════════════════
// Heat distortion: UV displacement from thermal convection
// ═══════════════════════════════════════════════════════════

vec2 lvHeatDistort(vec2 screenPos, float energy, float bass, float onset) {
  float strength = 0.012 + energy * 0.018 + onset * 0.03 + bass * 0.008;
  vec2 distortion = vec2(
    snoise(vec3(screenPos * 5.0, uDynamicTime * 1.2)),
    snoise(vec3(screenPos * 5.0 + 50.0, uDynamicTime * 1.2 + 30.0))
  );
  return distortion * strength;
}

// ═══════════════════════════════════════════════════════════
// MAIN — single void main()
// ═══════════════════════════════════════════════════════════

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO CLAMPING ===
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float aggressive = clamp(uSemanticAggressive, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.05;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section-driven modifiers:
  //   jam=rapids/active flow, space=cooling/still, chorus=fresh eruption, solo=dramatic vents
  float flowSpeedMod = mix(1.0, 1.8, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.4, sChorus) * mix(1.0, 1.1, sSolo);
  float crustBreakMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.3, sChorus);
  float magmaGlowMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.6, sChorus);
  float ventMod = mix(1.0, 1.6, sJam) * mix(1.0, 0.1, sSpace) * mix(1.0, 1.3, sChorus) * mix(1.0, 1.5, sSolo);
  float shakeMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.1, sSpace) * mix(1.0, 1.2, sChorus);

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === DERIVED PARAMETERS ===
  float eruptionScale = clamp(ventMod * (0.3 + energy * 0.4 + drumOnset * 0.3 + aggressive * 0.15)
                              + climaxBoost * 0.6, 0.0, 2.0);
  float magmaPressure = clamp((bass * 0.4 + energy * 0.3 + vocalPresence * 0.3) * magmaGlowMod
                              + climaxBoost * 0.3, 0.0, 1.2);
  float flowTime = uDynamicTime * (0.12 + slowEnergy * 0.08 + bass * 0.05);
  float ventTime = uDynamicTime * (0.7 + energy * 0.4);
  float shakeAmp = (bass * 0.4 + drumOnset * 0.3 + beatSnap * 0.2) * shakeMod * (1.0 + climaxBoost * 0.4);

  // === PALETTE ===
  float hue1 = hsvToCosineHue(uPalettePrimary) + chordHue + chromaHueMod;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  float hueShift = uPalettePrimary + chromaHueMod;
  vec3 basaltTint = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  basaltTint = mix(basaltTint, vec3(0.2, 0.15, 0.12), 0.7); // push toward dark rock

  // === HEAT DISTORTION on screen UVs ===
  vec2 heatOffset = lvHeatDistort(screenP, energy, bass, drumOnset);
  vec2 distortedUV = uv + heatOffset;

  // === CAMERA (uses 3D camera system) ===
  vec3 ro, rd;
  setupCameraRay(distortedUV, aspect, ro, rd);

  // Camera shake: bass-driven micro-displacement
  float shakeX = sin(uDynamicTime * 14.0) * shakeAmp * 0.018;
  float shakeY = cos(uDynamicTime * 11.0 + 1.5) * shakeAmp * 0.012;
  ro.x += shakeX;
  ro.y += shakeY;

  // === RAYMARCH ===
  float totalDist = 0.0;
  float matId = -1.0;
  vec3 marchPos = ro;
  bool marchFound = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    vec2 mapResult = lvMap(marchPos, bass, energy, drumOnset, tension,
                           flowTime, flowSpeedMod, melodicPitch, eruptionScale, ventTime);
    float dist = mapResult.x;
    matId = mapResult.y;

    if (abs(dist) < SURF_DIST) {
      marchFound = true;
      break;
    }
    if (totalDist > MAX_DIST) break;
    totalDist += dist * 0.7; // conservative step for complex SDFs
  }

  // === LIGHTING SETUP ===
  // Primary: magma glow from below (warm, intense uplight)
  vec3 magmaLightDir = normalize(vec3(0.2, -1.0, 0.3));
  // Secondary: dim sky ambient from above
  vec3 ambientDir = normalize(vec3(-0.1, 1.0, -0.2));
  // Fill: angled key light for terrain definition
  vec3 keyLightDir = normalize(vec3(0.5, 0.6, -0.4));

  vec3 viewDir = normalize(ro - marchPos);
  vec3 col = vec3(0.0);

  if (marchFound) {
    vec3 norm = lvNormal(marchPos, bass, energy, drumOnset, tension,
                         flowTime, flowSpeedMod, melodicPitch, eruptionScale, ventTime);

    // Ambient occlusion
    float occVal = lvOcclusion(marchPos, norm, bass, energy, drumOnset, tension,
                               flowTime, flowSpeedMod, melodicPitch, eruptionScale, ventTime);

    if (matId < 0.5) {
      // ──── BASALT TERRAIN MATERIAL ────
      // Dark volcanic rock with ridged detail
      float rockNoise = fbm6(vec3(marchPos * 0.6)) * 0.5 + 0.5;
      float ridgeDetail = ridged4(marchPos * 1.2) * 0.35;
      vec3 rockColor = mix(vec3(0.05, 0.04, 0.03), vec3(0.15, 0.11, 0.08), rockNoise);
      rockColor = mix(rockColor, basaltTint * 0.12, 0.15);

      // Diffuse: key light for terrain shape + magma uplight + ambient
      float diffKey = max(0.0, dot(norm, keyLightDir)) * 0.25;
      float diffMagma = max(0.0, dot(norm, -magmaLightDir)) * 0.35;
      float diffAmbient = max(0.0, dot(norm, ambientDir)) * 0.06;

      col = rockColor * (0.03 + diffKey + diffMagma * magmaPressure + diffAmbient) * occVal;

      // Specular from key light on wet/glassy basalt surfaces
      vec3 halfVecKey = normalize(keyLightDir + viewDir);
      float specKey = pow(max(0.0, dot(norm, halfVecKey)), 24.0);
      col += vec3(0.08, 0.06, 0.04) * specKey * 0.15 * occVal;

      // Subsurface magma glow through thin rock (near river channels)
      float channelX = marchPos.x + sin(marchPos.z * 0.3 + 1.5) * 2.0 + sin(marchPos.z * 0.08) * 4.0;
      float nearChannel = smoothstep(2.5, 1.0, abs(channelX));
      float subsurface = pow(max(0.0, dot(-norm, magmaLightDir)), 2.5);
      col += lvMagmaColor(magmaPressure * 0.4, hueShift) * subsurface * nearChannel * 0.3 * vocalPresence;

      // Fresnel rim from magma light
      float fresnelVal = lvFresnel(viewDir, norm, 0.04);
      col += lvMagmaColor(magmaPressure * 0.3, hueShift) * fresnelVal * 0.1 * magmaPressure * nearChannel;

      // Ridge detail adds texture
      col += vec3(0.015) * ridgeDetail * occVal;

    } else if (matId < 1.5) {
      // ──── LAVA RIVER MATERIAL ────
      // Emissive flowing magma with cooling crust pattern
      vec2 crustData = lvCrustPattern(marchPos, flowTime, flowSpeedMod, tension * crustBreakMod, bass);
      float crust = crustData.x;
      float crackGlow = crustData.y;

      // Flowing magma noise for temperature variation
      float lavaNoise = fbm6(vec3(marchPos.xz * 1.0, flowTime * flowSpeedMod * 0.25)) * 0.5 + 0.5;
      float lavaDetail = fbm3(vec3(marchPos.xz * 3.0 + 30.0, flowTime * flowSpeedMod * 0.4)) * 0.5 + 0.5;

      // Temperature: hot in cracks between crust plates, cooler on crust
      float temperature = mix(0.85, 0.25, crust) * magmaPressure;
      temperature += lavaNoise * 0.2;
      temperature += bass * 0.12; // bass pulses the lava hotter
      temperature += drumOnset * 0.1; // drum hits crack crust open
      temperature = clamp(temperature, 0.0, 1.0);

      // Emissive color from temperature
      vec3 lavaEmission = lvMagmaColor(temperature, hueShift);

      // Cooled crust: dark basalt plates floating on magma
      vec3 crustColor = vec3(0.04, 0.025, 0.015);
      crustColor += vec3(0.02) * lavaDetail; // subtle texture on crust

      col = mix(lavaEmission * (1.8 + vocalPresence * 0.6), crustColor, crust * 0.75);

      // Crack glow emission: bright lines where crust splits
      col += lvMagmaColor(0.9, hueShift) * crackGlow * (1.2 + bass * 0.5 + climaxBoost * 0.6);

      // Flow velocity streaks: bright directional lines in the flow
      float flowStreak = sin(marchPos.z * 6.0 - flowTime * flowSpeedMod * 4.0 + marchPos.x * 2.0);
      flowStreak = smoothstep(0.7, 1.0, flowStreak) * (1.0 - crust);
      col += lvMagmaColor(0.8, hueShift) * flowStreak * 0.2 * energy;

      // Bass pulse: periodic brightness surge in the magma
      float bassPulse = sin(uDynamicTime * 2.0 + marchPos.z * 1.5) * 0.5 + 0.5;
      col += lvMagmaColor(0.7, hueShift) * bassPulse * bass * 0.25 * (1.0 - crust);

      // Beat snap flash
      col *= 1.0 + beatSnap * 0.25 * (1.0 - crust);

      // Minimal AO for lava (it emits light)
      col *= mix(1.0, occVal, 0.2);

    } else if (matId < 2.5) {
      // ──── OBSIDIAN FORMATION MATERIAL ────
      // Smooth, dark, highly reflective volcanic glass
      vec3 obsidianBase = vec3(0.015, 0.015, 0.025);
      float surfNoise = fbm3(marchPos * 4.0) * 0.5 + 0.5;

      // Subtle deep color from palette
      vec3 deepTint = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
      obsidianBase = mix(obsidianBase, deepTint * 0.04, 0.25);

      // Diffuse: minimal (obsidian is mostly specular/reflective)
      float diffMagma = max(0.0, dot(norm, -magmaLightDir)) * 0.12;
      float diffKey = max(0.0, dot(norm, keyLightDir)) * 0.08;
      col = obsidianBase * (0.015 + diffMagma * magmaPressure + diffKey) * occVal;

      // Sharp specular: obsidian is glassy
      vec3 halfVecMagma = normalize(-magmaLightDir + viewDir);
      float specPower = 48.0 + highs * 80.0 + tension * 32.0;
      float specMagma = pow(max(0.0, dot(norm, halfVecMagma)), specPower);
      vec3 specColor = lvMagmaColor(magmaPressure * 0.7, hueShift);
      col += specColor * specMagma * 0.5 * magmaPressure;

      // Key light specular
      vec3 halfVecKey = normalize(keyLightDir + viewDir);
      float specKeyVal = pow(max(0.0, dot(norm, halfVecKey)), specPower * 0.8);
      col += vec3(0.15, 0.12, 0.1) * specKeyVal * 0.3;

      // Fresnel: obsidian has strong reflectivity at grazing angles
      float fresnelObs = lvFresnel(viewDir, norm, 0.08);
      vec3 envReflect = lvMagmaColor(magmaPressure * 0.3, hueShift) * 0.35;
      col += envReflect * fresnelObs * 0.5;

      // Internal fire veins visible through translucent obsidian
      float fireVeins = ridgedMultifractal(marchPos * 5.0 + tension * 0.4, 3, 2.2, 0.5);
      float veinGlow = smoothstep(0.65, 0.85, fireVeins) * tension * magmaPressure;
      col += lvMagmaColor(0.5 + tension * 0.3, hueShift) * veinGlow * 0.35;

      // Conchoidal fracture highlights: curved breakage planes catch light
      float conchoidal = abs(sin(marchPos.y * 15.0 + marchPos.x * 10.0 + surfNoise * 4.0));
      float conchoidalHighlight = smoothstep(0.95, 1.0, conchoidal);
      col += vec3(0.1, 0.08, 0.12) * conchoidalHighlight * 0.4 * occVal;

    } else {
      // ──── VOLCANIC VENT MATERIAL ────
      // Volumetric fire: emissive, minimal surface shading
      float heightNorm = clamp((marchPos.y + 0.3) / 4.0, 0.0, 1.0);

      // Fire noise for color variation
      vec3 fireNoisePos = marchPos * 2.0;
      fireNoisePos.y -= ventTime * 3.0;
      float fireNoise = fbm3(fireNoisePos) * 0.5 + 0.5;

      // Temperature: hottest at base, cooler at tips
      float temperature = (1.0 - heightNorm * 0.5) * (0.5 + energy * 0.5);
      temperature += fireNoise * 0.3;
      temperature += drumOnset * 0.3; // drum onset = eruption burst
      temperature = clamp(temperature, 0.0, 1.0);

      col = lvMagmaColor(temperature, hueShift) * (2.0 + energy + drumOnset * 2.0);

      // White-hot core at base
      float coreGlow = exp(-length(marchPos.xz) * 3.5) * (1.0 - heightNorm);
      col += vec3(1.0, 0.9, 0.7) * coreGlow * 0.6;

      // Sparks: bright noise points in the plume
      float sparks = snoise(fireNoisePos * 4.0);
      sparks = pow(max(0.0, sparks), 10.0) * heightNorm;
      col += vec3(1.0, 0.8, 0.4) * sparks * 0.8;
    }

    // === DISTANCE FOG: volcanic haze ===
    float fogDist = totalDist;
    float fog = 1.0 - exp(-fogDist * 0.045);
    vec3 fogColor = mix(vec3(0.03, 0.015, 0.005), vec3(0.1, 0.04, 0.015), magmaPressure * 0.3);
    col = mix(col, fogColor, fog);

  } else {
    // ──── SKY (no geometry hit) ────
    // Dark volcanic sky with magma horizon glow and smoke
    float skyGrad = smoothstep(-0.2, 0.5, rd.y);
    vec3 skyColor = mix(vec3(0.08, 0.03, 0.01), vec3(0.015, 0.01, 0.015), skyGrad);

    // Magma glow on horizon (lava rivers illuminate the atmosphere)
    float horizonGlow = smoothstep(0.15, -0.2, rd.y);
    skyColor += lvMagmaColor(magmaPressure * 0.45, hueShift) * horizonGlow * 0.25 * magmaGlowMod;

    // Smoke/ash layers in the sky
    float smokeNoise = fbm3(vec3(rd.xz * 3.0 + flowTime * 0.15, rd.y * 2.0 + uDynamicTime * 0.015));
    skyColor += vec3(0.03, 0.015, 0.008) * (smokeNoise * 0.5 + 0.5) * (1.0 - skyGrad);

    // Distant eruption glow: pulsing on energy
    float distantEruption = smoothstep(0.0, -0.1, rd.y) * energy * 0.15;
    skyColor += lvMagmaColor(0.5, hueShift) * distantEruption;

    col = skyColor;
  }

  // === SMOKE VOLUMETRICS ===
  {
    float smokeLimit = marchFound ? totalDist : MAX_DIST;
    vec3 smokeAccum = lvSmokeVolume(ro, rd, smokeLimit, flowTime, energy, hueShift);
    col += smokeAccum;
  }

  // === EMBER PARTICLES ===
  {
    float emberDensity = lvEmber(ro + rd * 2.5, flowTime) * (0.4 + energy * 0.6);
    emberDensity += lvEmber(ro + rd * 5.0 + 1.0, flowTime * 0.7) * 0.4;
    vec3 emberColor = lvMagmaColor(0.6 + timbralBright * 0.3, hueShift);
    col += emberColor * emberDensity * (0.15 + climaxBoost * 0.25);
  }

  // === VOLCANIC ASH HAZE ===
  {
    float ashNoise = fbm3(vec3(screenP * 2.5 + flowTime * 0.2, uDynamicTime * 0.08));
    float ashMask = smoothstep(0.2, 0.55, ashNoise) * energy * 0.06;
    col += vec3(0.15, 0.08, 0.04) * ashMask * shakeMod;
  }

  // === DRUM ONSET SHOCKWAVE (volcanic burst) ===
  {
    float shockRadius = drumOnset * 2.5 + beatSnap * 1.2;
    float shockDist = length(screenP);
    float shockRing = smoothstep(shockRadius, shockRadius - 0.06, shockDist)
                    * smoothstep(shockRadius - 0.12, shockRadius - 0.06, shockDist);
    vec3 shockColor = lvMagmaColor(0.8, hueShift);
    col += shockColor * shockRing * (drumOnset * 0.35 + beatSnap * 0.15);
  }

  // === BEAT SNAP PULSE ===
  col *= 1.0 + beatSnap * 0.12 * (1.0 + climaxBoost * 0.3);

  // === CLIMAX ERUPTION: massive lava fountain ===
  if (climaxBoost > 0.1) {
    // Lava fountains: bright emission columns across the screen
    float fountainNoise = fbm3(vec3(screenP * 1.5, uDynamicTime * 0.4));
    float fountain = smoothstep(0.3, 0.8, fountainNoise) * climaxBoost;
    col += lvMagmaColor(0.85 + climaxBoost * 0.15, hueShift) * fountain * 0.6;

    // Ground fractures completely: magma everywhere
    float crackFlood = fbm3(vec3(screenP * 3.0, uDynamicTime * 0.6));
    float flood = smoothstep(0.4, 0.7, crackFlood) * climaxBoost * 0.35;
    col += lvMagmaColor(0.7, hueShift) * flood;

    // Bright core flash
    float coreBurst = exp(-length(screenP) * 2.0) * climaxBoost;
    col += vec3(1.0, 0.85, 0.6) * coreBurst * 0.4;
  }

  // === JAM PHASE FEEDBACK ===
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    // Exploration: wider flow channels (pressure up)
    magmaPressure += jpExplore * 0.1;
    // Building: faster flow
    col *= 1.0 + jpBuild * 0.08;
    // Peak: maximum brightness
    col *= 1.0 + jpPeak * 0.15;
  }

  // === DYNAMIC RANGE -> MAGMA CONTRAST ===
  {
    float magmaContrast = mix(0.85, 1.3, dynRange);
    float lumaDR = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lumaDR), col, magmaContrast);
  }

  // === SPACE SCORE: cooling aftermath ===
  {
    float cooling = spaceScore * 0.3;
    float lumaSpace = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lumaSpace * 0.8, lumaSpace * 0.6, lumaSpace * 0.5), cooling);
  }

  // === SEMANTIC: aggressive -> intensify destruction ===
  col *= 1.0 + aggressive * 0.2;

  // === SDF ICON EMERGENCE ===
  {
    float iconNoise = fbm3(vec3(screenP * 2.0, uDynamicTime * 0.1));
    vec3 iconC1 = lvMagmaColor(0.7, hueShift);
    vec3 iconC2 = lvMagmaColor(0.4, hueShift);
    col += iconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uSectionIndex);
  }

  // === VIGNETTE: volcanic darkness at edges ===
  {
    float vigScale = mix(0.28, 0.18, energy);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    vec3 vigColor = mix(vec3(0.012, 0.004, 0.0), vec3(0.0), 1.0 - magmaPressure * 0.15);
    col = mix(vigColor, col, vignette);
  }

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
