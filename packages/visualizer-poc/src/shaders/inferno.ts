/**
 * Inferno — "Inferno Descent" raymarched volcanic cavern.
 * Camera descends into a hellish chamber with lava rivers, obsidian columns,
 * fire geysers, and magma pools. Dante's inferno meets geological reality.
 *
 * Full raymarched 3D SDF scene with proper PBR-inspired lighting:
 *   - Cavern walls (ridged multifractal rock)
 *   - Obsidian columns (smooth reflective pillars)
 *   - Lava pools (emissive flowing magma floor)
 *   - Fire geysers (volumetric eruption columns)
 *   - Heat distortion, fresnel, AO, specular, magma emission
 *
 * Audio reactivity (16 uniforms):
 *   uBass             → lava pulse / pool expansion / cavern breathe
 *   uEnergy           → fire geyser height / overall blaze intensity
 *   uDrumOnset        → fire geyser eruption trigger / shockwave
 *   uVocalPresence    → magma glow warmth / subsurface scattering
 *   uHarmonicTension  → obsidian fracturing / column crack density
 *   uMelodicPitch     → geyser height variation
 *   uSectionType      → jam=maximum eruption, space=smoldering, chorus=lava flood
 *   uClimaxPhase      → full volcanic eruption sequence
 *   uBeatSnap         → lava pulse flash
 *   uSlowEnergy       → ambient magma drift speed
 *   uBeatStability    → cavern rumble coherence
 *   uDynamicRange     → magma emission contrast
 *   uTimbralBrightness → ember particle brightness
 *   uSpaceScore       → smoldering aftermath mode
 *   uSemanticAggressive → destruction multiplier
 *   uHighs            → obsidian specular sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const infernoVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.12,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  thermalShimmerEnabled: true,
  lightLeakEnabled: true,
});

const in2NormalGLSL = buildRaymarchNormal("in2Map($P, bass, energy, drumOnset, tension, flowTime, floodLevel, melodicPitch, eruptionScale, geyserTime).x", { eps: 0.003, name: "in2Normal" });
const in2OcclusionGLSL = buildRaymarchAO("in2Map($P, bass, energy, drumOnset, tension, flowTime, floodLevel, melodicPitch, eruptionScale, geyserTime).x", { steps: 5, stepBase: 0.02, stepScale: 0.06, weightDecay: 0.7, finalMult: 4.0, name: "in2Occlusion" });
const in2DepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

export const infernoFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Magma color ramp: black → deep red → orange → yellow → white-hot
// ═══════════════════════════════════════════════════════════

vec3 in2MagmaColor(float temp, float hueShift) {
  float scaledT = clamp(temp, 0.0, 1.0);
  vec3 col = vec3(0.0);
  col += vec3(0.6, 0.05, 0.0) * smoothstep(0.0, 0.25, scaledT);
  col += vec3(0.8, 0.2, 0.02) * smoothstep(0.15, 0.45, scaledT);
  col += vec3(0.6, 0.45, 0.0) * smoothstep(0.4, 0.7, scaledT);
  col += vec3(0.3, 0.3, 0.1) * smoothstep(0.6, 0.85, scaledT);
  col += vec3(0.5, 0.5, 0.5) * smoothstep(0.85, 1.0, scaledT);

  float angle = hueShift * TAU * 0.08;
  float cs = cos(angle);
  float sn = sin(angle);
  col.rg = vec2(cs * col.r - sn * col.g, sn * col.r + cs * col.g);
  col = max(col, vec3(0.0));
  return col;
}

// ═══════════════════════════════════════════════════════════
// Cavern wall SDF — tube-like enclosure with rocky detail
// ═══════════════════════════════════════════════════════════

float in2CavernWall(vec3 pos, float bass, float tension) {
  // Cylindrical cavern: distance from y-axis minus radius
  float radius = 5.0 + bass * 1.6;
  float cylinderDist = radius - length(pos.xz);

  // Rocky wall detail via ridged multifractal
  float wallNoise = ridgedMultifractal(pos * 0.4, 5, 2.1, 0.52) * 0.8;
  wallNoise += fbm3(pos * 0.2 + vec3(0.0, pos.y * 0.1, 0.0)) * 0.5;

  // Tension fractures the walls
  float fractures = ridgedMultifractal(pos * 1.2 + tension * 0.3, 3, 2.5, 0.45);
  wallNoise += fractures * tension * 0.3;

  cylinderDist -= wallNoise;

  // Ceiling: dome above
  float ceiling = 8.0 + fbm3(pos * 0.3 + 100.0) * 1.5 - pos.y;

  // Floor: irregular rocky ground
  float floorNoise = fbm3(vec3(pos.xz * 0.5, 0.0)) * 0.4;
  floorNoise += ridged4(vec3(pos.xz * 0.3, 0.0)) * 0.3;
  float floorDist = pos.y + 2.0 + floorNoise;

  return min(min(cylinderDist, ceiling), floorDist);
}

// ═══════════════════════════════════════════════════════════
// Obsidian columns — smooth volcanic glass pillars
// ═══════════════════════════════════════════════════════════

float in2Column(vec3 pos, float tension) {
  float minDist = 1e5;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Deterministic positions around cavern
    float angle = fi * TAU / 5.0 + 0.3;
    float colRadius = 2.8 + sin(fi * 3.7) * 0.8;
    vec2 colCenter = vec2(cos(angle), sin(angle)) * colRadius;

    vec3 localPos = pos - vec3(colCenter.x, 0.0, colCenter.y);

    // Column: cylinder with tapered top/bottom
    float colHeight = 5.0 + sin(fi * 2.1) * 1.5;
    float colThickness = 0.3 + fi * 0.06;
    // Taper with height
    float taper = 1.0 - smoothstep(colHeight * 0.6, colHeight, localPos.y) * 0.4;
    taper *= 1.0 - smoothstep(-1.5, -2.0, localPos.y) * 0.3;
    float cylDist = length(localPos.xz) - colThickness * taper;

    // Height clamp
    float heightClamp = max(-localPos.y - 2.0, localPos.y - colHeight);
    float columnDist = max(cylDist, heightClamp);

    // Tension cracks: displacement along surface
    float crackNoise = ridgedMultifractal(localPos * 3.0 + tension * 0.5, 3, 2.0, 0.5);
    columnDist += crackNoise * tension * 0.04;

    // Subtle faceting (hexagonal cross-section feel)
    float facetAngle = atan(localPos.z, localPos.x);
    float faceting = sin(facetAngle * 6.0) * 0.015 * (1.0 - tension * 0.5);
    columnDist += faceting;

    minDist = min(minDist, columnDist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Lava pool surface — flowing magma on cavern floor
// ═══════════════════════════════════════════════════════════

float in2LavaPool(vec3 pos, float bass, float flowTime, float floodLevel) {
  // Lava sits in cavern floor depressions
  float poolY = -1.5 + bass * 0.3 + floodLevel * 0.5;

  // Undulating surface
  float waveX = sin(pos.x * 1.5 + flowTime * 0.8) * 0.08;
  float waveZ = sin(pos.z * 1.2 + flowTime * 0.6 + 1.0) * 0.06;
  float surfaceNoise = fbm3(vec3(pos.xz * 0.8, flowTime * 0.2)) * 0.15;

  float lavaSurface = pos.y - poolY - waveX - waveZ - surfaceNoise;

  // Constrain lava to pool areas (distance from center)
  float poolMask = smoothstep(4.5, 3.0, length(pos.xz));
  lavaSurface = mix(10.0, lavaSurface, poolMask);

  return lavaSurface;
}

// ═══════════════════════════════════════════════════════════
// Fire geyser SDF — erupting flame columns
// ═══════════════════════════════════════════════════════════

float in2Geyser(vec3 pos, float energy, float drumOnset, float geyserTime,
                float melodicPitch, float eruptionScale) {
  float minDist = 1e5;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Geyser positions
    float gAngle = fi * TAU / 3.0 + 1.2;
    float gRadius = 1.5 + fi * 0.5;
    vec2 gPos = vec2(cos(gAngle), sin(gAngle)) * gRadius;

    vec3 localPos = pos - vec3(gPos.x, -1.5, gPos.y);

    // Geyser: inverted cone of fire
    float geyserHeight = (0.5 + energy * 5.0 + drumOnset * 3.0 + melodicPitch * 1.5) * eruptionScale;
    float geyserWidth = 0.15 + energy * 0.35 + drumOnset * 0.3;

    // Cone shape: wider at top
    float heightFrac = clamp(localPos.y / max(geyserHeight, 0.1), 0.0, 1.0);
    float coneRadius = geyserWidth * (0.3 + heightFrac * 0.7);

    float coneDist = length(localPos.xz) - coneRadius;

    // Height bound
    coneDist = max(coneDist, -localPos.y);
    coneDist = max(coneDist, localPos.y - geyserHeight);

    // Fire turbulence displacement
    vec3 noisePos = localPos * 2.0;
    noisePos.y -= geyserTime * (2.0 + energy);
    float fireTurb = fbm3(noisePos) * 0.3 * (0.5 + heightFrac);
    coneDist += fireTurb;

    minDist = min(minDist, coneDist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — returns vec2(distance, materialId)
//   matId: 0=cavern wall, 1=obsidian column, 2=lava pool, 3=geyser
// ═══════════════════════════════════════════════════════════

vec2 in2Map(vec3 pos, float bass, float energy, float drumOnset, float tension,
            float flowTime, float floodLevel, float melodicPitch, float eruptionScale,
            float geyserTime) {

  // Cavern walls (inverted — we're inside)
  float cavern = in2CavernWall(pos, bass, tension);
  vec2 result = vec2(cavern, 0.0);

  // Obsidian columns
  float columns = in2Column(pos, tension);
  if (columns < result.x) {
    result = vec2(columns, 1.0);
  }

  // Lava pool surface
  float lava = in2LavaPool(pos, bass, flowTime, floodLevel);
  if (lava < result.x) {
    result = vec2(lava, 2.0);
  }

  // Fire geysers
  float geyser = in2Geyser(pos, energy, drumOnset, geyserTime, melodicPitch, eruptionScale);
  if (geyser < result.x) {
    result = vec2(geyser, 3.0);
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${in2NormalGLSL}
${in2OcclusionGLSL}

// ═══════════════════════════════════════════════════════════
// Fresnel approximation (Schlick)
// ═══════════════════════════════════════════════════════════

float in2Fresnel(vec3 viewDir, vec3 norm, float f0) {
  float cosTheta = max(0.0, dot(viewDir, norm));
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ═══════════════════════════════════════════════════════════
// Volumetric fire accumulation (geyser interior glow)
// ═══════════════════════════════════════════════════════════

vec3 in2FireVolume(vec3 rayOrigin, vec3 rayDir, float tStart, float tEnd,
                   float energy, float drumOnset, float flowTime, float hueShift) {
  vec3 accum = vec3(0.0);
  float alpha = 0.0;
  int volSteps = 12;
  float stepSize = (tEnd - tStart) / float(volSteps);

  for (int i = 0; i < 12; i++) {
    if (alpha > 0.95) break;
    float marchT = tStart + (float(i) + 0.5) * stepSize;
    vec3 samplePos = rayOrigin + rayDir * marchT;

    // Fire density from turbulent noise
    vec3 noisePos = samplePos * 1.5;
    noisePos.y -= flowTime * 3.0;
    float density = fbm3(noisePos) * 0.5 + 0.5;
    density *= smoothstep(2.0, 0.5, length(samplePos.xz)); // fade at edges
    density *= (0.3 + energy * 0.7 + drumOnset * 0.5);

    if (density > 0.01) {
      // Temperature from height: hotter at base
      float heightNorm = clamp((samplePos.y + 1.5) / 5.0, 0.0, 1.0);
      float temperature = (1.0 - heightNorm * 0.6) * density;
      vec3 fireCol = in2MagmaColor(temperature, hueShift);

      float sampleAlpha = density * stepSize * 2.0;
      accum += fireCol * sampleAlpha * (1.0 - alpha);
      alpha += sampleAlpha * (1.0 - alpha);
    }
  }

  return accum;
}

// ═══════════════════════════════════════════════════════════
// Heat distortion: UV displacement from thermal convection
// ═══════════════════════════════════════════════════════════

vec2 in2HeatDistort(vec2 screenPos, float energy, float bass, float onset) {
  float strength = 0.015 + energy * 0.02 + onset * 0.04 + bass * 0.01;
  vec2 distortion = vec2(
    snoise(vec3(screenPos * 6.0, uDynamicTime * 1.5)),
    snoise(vec3(screenPos * 6.0 + 50.0, uDynamicTime * 1.5 + 30.0))
  );
  return distortion * strength;
}

// ═══════════════════════════════════════════════════════════
// Rising ember particles
// ═══════════════════════════════════════════════════════════

float in2Ember(vec3 pos, float flowTime) {
  vec3 pWrapped = pos;
  pWrapped.y = mod(pWrapped.y - flowTime * 2.0, 12.0) - 2.0;
  pWrapped.x += sin(pWrapped.y * 1.5 + flowTime * 0.7) * 0.4;
  pWrapped.z += cos(pWrapped.y * 1.2 + flowTime * 0.5) * 0.3;

  float particle = snoise(pWrapped * 3.5);
  particle = pow(max(0.0, particle), 14.0);
  return particle;
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

  // Section-driven modifiers
  // Jam=maximum eruption, space=smoldering embers, chorus=lava flood, solo=dramatic geysers
  // Space sections: energy-dependent minimum (0.20-0.35) instead of flat 0.15
  // so loud space still shows SOMETHING, and jam eruption reaches higher
  float spaceFloor = mix(0.20, 0.35, energy);
  float eruptionMod = mix(1.0, 2.2, sJam) * mix(1.0, spaceFloor, sSpace) * mix(1.0, 1.5, sChorus) * mix(1.0, 1.8, sSolo);
  float lavaFloodMod = mix(0.0, 0.2, sJam) * 1.0 + sChorus * 0.6 + sSpace * (-0.3);
  float magmaGlowMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.4, sChorus);
  float geyserMod = mix(1.0, 1.6, sJam) * mix(1.0, 0.1, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.4, sSolo);

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Internal evolution over long holds
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float evolveComplexity = smoothstep(0.0, 0.5, holdP) * (1.0 - smoothstep(0.8, 1.0, holdP) * 0.4);
  float evolveOpenness = 1.0 - smoothstep(0.0, 0.3, holdP) * 0.3 + smoothstep(0.75, 1.0, holdP) * 0.3;

  // === DERIVED PARAMETERS ===
  float eruptionScale = clamp(eruptionMod * (0.1 + energy * 0.8 + drumOnset * 0.4 + aggressive * 0.3)
                              + climaxBoost * 0.5, 0.0, 2.0) * geyserMod * (0.3 + evolveComplexity * 0.7);
  float floodLevel = clamp(lavaFloodMod + bass * 0.3 + climaxBoost * 0.4, -0.3, 1.0);
  float magmaPressure = clamp((bass * 0.4 + energy * 0.3 + vocalPresence * 0.3) * magmaGlowMod
                              + climaxBoost * 0.3, 0.0, 1.2) * (0.4 + evolveComplexity * 0.6);
  float flowTime = uDynamicTime * (0.15 + slowEnergy * 0.1);
  float geyserTime = uDynamicTime * (0.8 + energy * 0.5);

  // === PALETTE ===
  float hue1 = uPalettePrimary + chordHue + chromaHueMod;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float hueShift = uPalettePrimary + chromaHueMod;

  // === HEAT DISTORTION on screen UVs ===
  vec2 heatOffset = in2HeatDistort(screenP, energy, bass, drumOnset);
  vec2 distortedUV = uv + heatOffset;
  vec2 distortedP = (distortedUV - 0.5) * aspect;

  // === CAMERA (uses 3D camera system with descent motion) ===
  vec3 ro, rd;
  setupCameraRay(distortedUV, aspect, ro, rd);

  // Camera shake: bass-driven micro-displacement + descent vibration
  float shakeAmp = bass * 0.5 + drumOnset * 0.3 + beatSnap * 0.2;
  shakeAmp *= mix(1.0, 0.1, sSpace); // calm in space sections
  float shakeX = sin(uDynamicTime * 13.0) * shakeAmp * 0.015;
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
    vec2 mapResult = in2Map(marchPos, bass, energy, drumOnset, tension,
                            flowTime, floodLevel, melodicPitch, eruptionScale, geyserTime);
    float dist = mapResult.x;
    matId = mapResult.y;

    if (abs(dist) < SURF_DIST) {
      marchFound = true;
      break;
    }
    if (totalDist > MAX_DIST) break;
    totalDist += dist * 0.7; // conservative stepping for complex SDFs
  }

  // === LIGHTING SETUP ===
  // Primary light: magma glow from below (warm, intense)
  vec3 magmaLightDir = normalize(vec3(0.2, -1.0, 0.3));
  // Secondary: dim ambient from above (cool, faint)
  vec3 ambientDir = normalize(vec3(-0.1, 1.0, -0.2));
  // Point lights at geyser positions (dynamic)
  vec3 geyserLight1 = vec3(1.5 * cos(1.2), 0.5 + energy * 2.0, 1.5 * sin(1.2));
  vec3 geyserLight2 = vec3(2.0 * cos(1.2 + TAU/3.0), 0.5 + energy * 2.0, 2.0 * sin(1.2 + TAU/3.0));

  vec3 viewDir = normalize(ro - marchPos);
  vec3 col = vec3(0.0);

  if (marchFound) {
    vec3 norm = in2Normal(marchPos);

    // Ambient occlusion
    float occVal = in2Occlusion(marchPos, norm);

    if (matId < 0.5) {
      // ──── CAVERN WALL MATERIAL ────
      // Dark volcanic rock with subsurface magma glow
      float rockNoise = fbm6(vec3(marchPos * 0.8)) * 0.5 + 0.5;
      float ridgeDetail = ridged4(marchPos * 1.5) * 0.4;
      vec3 rockColor = mix(vec3(0.06, 0.04, 0.03), vec3(0.18, 0.12, 0.08), rockNoise);

      // Palette tint
      vec3 rockTint = paletteHueColor(hue1, 0.7, 0.85);
      rockColor = mix(rockColor, rockTint * 0.15, 0.15);

      // Diffuse lighting: magma from below + dim ambient — blend shared for crossfade continuity
      float localDiffMagma = max(0.0, dot(norm, -magmaLightDir)) * 0.4;
      float localDiffAmbient = max(0.0, dot(norm, ambientDir)) * 0.08;
      vec3 sharedLight = sharedDiffuse(norm);
      float diffMagma = mix(localDiffMagma, dot(sharedLight, vec3(0.333)) * 0.4, 0.3);
      float diffAmbient = mix(localDiffAmbient, dot(sharedLight, vec3(0.333)) * 0.08, 0.3);

      // Geyser point lights contribution
      float geyserDiff1 = max(0.0, dot(norm, normalize(geyserLight1 - marchPos)))
                          / (1.0 + 0.1 * length(geyserLight1 - marchPos));
      float geyserDiff2 = max(0.0, dot(norm, normalize(geyserLight2 - marchPos)))
                          / (1.0 + 0.1 * length(geyserLight2 - marchPos));

      col = rockColor * (0.04 + diffMagma * magmaPressure + diffAmbient) * occVal;

      // Geyser illumination on walls (warm orange)
      vec3 geyserColor = in2MagmaColor(0.6, hueShift);
      col += geyserColor * (geyserDiff1 + geyserDiff2) * 0.3 * eruptionScale * occVal;

      // Subsurface magma glow through thinner rock
      float subsurface = pow(max(0.0, dot(-norm, magmaLightDir)), 3.0);
      float depthGlow = smoothstep(1.0, -2.0, marchPos.y); // stronger near floor
      col += in2MagmaColor(magmaPressure * 0.5, hueShift) * subsurface * depthGlow * 0.25 * vocalPresence;

      // Fresnel rim from magma light
      float fresnelVal = in2Fresnel(viewDir, norm, 0.04);
      col += in2MagmaColor(magmaPressure * 0.4, hueShift) * fresnelVal * 0.15 * magmaPressure;

      // Ridge detail adds geometric texture
      col += vec3(0.02) * ridgeDetail * occVal;

    } else if (matId < 1.5) {
      // ──── OBSIDIAN COLUMN MATERIAL ────
      // Smooth, dark, highly reflective volcanic glass
      vec3 obsidianBase = vec3(0.02, 0.02, 0.03);
      float surfNoise = fbm3(marchPos * 3.0) * 0.5 + 0.5;

      // Subtle deep color from palette
      vec3 deepTint = paletteHueColor(hue2, 0.85, 0.8);
      obsidianBase = mix(obsidianBase, deepTint * 0.05, 0.3);

      // Diffuse: minimal (obsidian is mostly specular)
      float diffMagma = max(0.0, dot(norm, -magmaLightDir)) * 0.15;
      col = obsidianBase * (0.02 + diffMagma) * occVal;

      // Strong specular: obsidian is glassy
      vec3 halfVecMagma = normalize(-magmaLightDir + viewDir);
      float specPower = 32.0 + highs * 64.0 + tension * 32.0;
      float specMagma = pow(max(0.0, dot(norm, halfVecMagma)), specPower);
      vec3 specColor = in2MagmaColor(magmaPressure * 0.7, hueShift);
      col += specColor * specMagma * 0.6 * magmaPressure;

      // Geyser specular reflections
      vec3 gDir1 = normalize(geyserLight1 - marchPos);
      vec3 halfG1 = normalize(gDir1 + viewDir);
      float specG1 = pow(max(0.0, dot(norm, halfG1)), specPower * 0.5);
      col += in2MagmaColor(0.8, hueShift) * specG1 * 0.3 * eruptionScale
             / (1.0 + 0.05 * length(geyserLight1 - marchPos));

      // Fresnel: obsidian has strong reflectivity at grazing angles
      float fresnelObs = in2Fresnel(viewDir, norm, 0.08);
      vec3 envReflect = in2MagmaColor(magmaPressure * 0.3, hueShift) * 0.4;
      col += envReflect * fresnelObs * 0.5;

      // Tension fracture lines glow with internal heat
      float fracLines = ridgedMultifractal(marchPos * 3.0 + tension * 0.5, 3, 2.0, 0.5);
      float fractureGlow = smoothstep(0.6, 0.8, fracLines) * tension;
      col += in2MagmaColor(0.5 + tension * 0.3, hueShift) * fractureGlow * 0.4;

    } else if (matId < 2.5) {
      // ──── LAVA POOL MATERIAL ────
      // Emissive flowing magma surface — this IS the primary light source
      float lavaNoise = fbm6(vec3(marchPos.xz * 1.0, flowTime * 0.3)) * 0.5 + 0.5;
      float lavaDetail = fbm3(vec3(marchPos.xz * 3.0 + 30.0, flowTime * 0.5)) * 0.5 + 0.5;

      // Cooled crust pattern (dark patches on surface)
      float crustNoise = ridgedMultifractal(vec3(marchPos.xz * 2.0, flowTime * 0.08), 4, 2.2, 0.5);
      float crust = smoothstep(0.4, 0.6, crustNoise);

      // Temperature: hot in cracks between crust, cool on crust surface
      float temperature = mix(0.9, 0.3, crust) * magmaPressure;
      temperature += lavaNoise * 0.2;
      temperature += bass * 0.15; // bass pulses make lava hotter
      temperature = clamp(temperature, 0.0, 1.0);

      // Emissive color from temperature
      vec3 lavaEmission = in2MagmaColor(temperature, hueShift);

      // Crust is dark rock
      vec3 crustColor = vec3(0.04, 0.02, 0.01);
      col = mix(lavaEmission * (1.5 + vocalPresence * 0.8), crustColor, crust * 0.7);

      // Bass pulse: periodic brightness surge
      float bassPulse = sin(uDynamicTime * 2.0 + marchPos.x * 1.5) * 0.5 + 0.5;
      col += in2MagmaColor(0.8, hueShift) * bassPulse * bass * 0.3 * (1.0 - crust);

      // Beat snap flash
      col *= 1.0 + beatSnap * 0.3 * (1.0 - crust);

      // Minimal AO for lava (it emits light, less shadow)
      col *= mix(1.0, occVal, 0.3);

    } else {
      // ──── FIRE GEYSER MATERIAL ────
      // Volumetric fire: emissive, no real surface shading
      float heightNorm = clamp((marchPos.y + 1.5) / 5.0, 0.0, 1.0);

      // Fire noise for color variation
      vec3 fireNoisePos = marchPos * 2.0;
      fireNoisePos.y -= geyserTime * 3.0;
      float fireNoise = fbm3(fireNoisePos) * 0.5 + 0.5;

      // Temperature: hottest at base, cooler at tips
      float temperature = (1.0 - heightNorm * 0.5) * (0.5 + energy * 0.5);
      temperature += fireNoise * 0.3;
      temperature += drumOnset * 0.2;
      temperature = clamp(temperature, 0.0, 1.0);

      col = in2MagmaColor(temperature, hueShift) * (2.0 + energy + drumOnset * 1.5);

      // Bright core at base
      float coreGlow = exp(-length(marchPos.xz) * 3.0) * (1.0 - heightNorm);
      col += vec3(1.0, 0.9, 0.7) * coreGlow * 0.5;
    }

    // === DISTANCE FOG: hot volcanic atmosphere ===
    float fogDist = totalDist;
    float fog = 1.0 - exp(-fogDist * 0.04);
    vec3 fogColor = mix(vec3(0.03, 0.01, 0.005), vec3(0.12, 0.04, 0.01), magmaPressure * 0.3);
    col = mix(col, fogColor, fog);

  } else {
    // ──── NO GEOMETRY HIT: deep cavern darkness ────
    // Smoky atmosphere with distant magma glow
    float depthGrad = smoothstep(-0.2, 0.5, rd.y);
    vec3 deepColor = mix(vec3(0.06, 0.02, 0.005), vec3(0.01, 0.005, 0.01), depthGrad);

    // Distant magma glow below
    float belowGlow = smoothstep(0.1, -0.3, rd.y);
    deepColor += in2MagmaColor(magmaPressure * 0.4, hueShift) * belowGlow * 0.2 * magmaGlowMod;

    // Volumetric smoke in distance
    float smokeNoise = fbm3(vec3(rd.xz * 4.0 + flowTime * 0.15, rd.y * 2.0 + uDynamicTime * 0.02));
    deepColor += vec3(0.03, 0.015, 0.005) * (smokeNoise * 0.5 + 0.5) * (1.0 - depthGrad);

    col = deepColor;
  }

  // === VOLUMETRIC FIRE ACCUMULATION (geysers seen from distance) ===
  {
    float volFireAccum = 0.0;
    vec3 volFireColor = vec3(0.0);
    for (int v = 0; v < 10; v++) {
      float vt = 0.5 + float(v) * 0.8;
      if (vt > totalDist && marchFound) continue;
      vec3 vpos = ro + rd * vt;

      // Only accumulate near geyser positions
      for (int g = 0; g < 3; g++) {
        float gf = float(g);
        float gAngle = gf * TAU / 3.0 + 1.2;
        float gRadius = 1.5 + gf * 0.5;
        vec2 gCenter = vec2(cos(gAngle), sin(gAngle)) * gRadius;
        float lateralDist = length(vpos.xz - gCenter);

        if (lateralDist < 1.5 && vpos.y > -2.0 && vpos.y < 6.0) {
          vec3 fNoisePos = vpos * 1.5;
          fNoisePos.y -= geyserTime * 3.0;
          float fDensity = fbm3(fNoisePos) * 0.5 + 0.5;
          fDensity *= smoothstep(1.5, 0.3, lateralDist);
          fDensity *= smoothstep(-2.0, 0.0, vpos.y) * smoothstep(6.0, 1.0, vpos.y);
          fDensity *= eruptionScale * 0.5;

          if (fDensity > 0.01) {
            float fTemp = (1.0 - clamp((vpos.y + 1.5) / 5.0, 0.0, 1.0) * 0.5) * fDensity;
            float fAlpha = fDensity * 0.06 * (1.0 - volFireAccum);
            volFireColor += in2MagmaColor(fTemp, hueShift) * fAlpha;
            volFireAccum += fAlpha;
          }
        }
      }
    }
    col += volFireColor * (1.5 + drumOnset * 0.5 + climaxBoost * 0.4);
  }

  // === EMBER PARTICLES ===
  {
    float emberDensity = in2Ember(ro + rd * 3.0, flowTime) * (0.4 + energy * 0.6);
    emberDensity += in2Ember(ro + rd * 6.0 + 2.0, flowTime * 0.7) * 0.4;
    vec3 emberColor = in2MagmaColor(0.6 + timbralBright * 0.3, hueShift);
    col += emberColor * emberDensity * (0.2 + climaxBoost * 0.25);
  }

  // === MAGMA POOL REFLECTION ON CAVERN CEILING ===
  {
    // Upward-facing surfaces get warm reflected magma light
    float ceilingGlow = fbm3(vec3(screenP * 2.0 + flowTime * 0.2, uDynamicTime * 0.05));
    ceilingGlow = ceilingGlow * 0.5 + 0.5;
    float upwardMask = smoothstep(0.0, 0.3, rd.y); // looking up
    col += in2MagmaColor(magmaPressure * 0.3, hueShift) * ceilingGlow * upwardMask * 0.08 * magmaGlowMod;
  }

  // === BEAT SNAP PULSE ===
  col *= 1.0 + beatSnap * 0.15 * (1.0 + climaxBoost * 0.3);

  // === DRUM ONSET SHOCKWAVE ===
  {
    float shockRadius = drumOnset * 2.5 + beatSnap * 1.0;
    float shockDist = length(screenP);
    float shockRing = smoothstep(shockRadius, shockRadius - 0.06, shockDist)
                    * smoothstep(shockRadius - 0.12, shockRadius - 0.06, shockDist);
    col += in2MagmaColor(0.7, hueShift) * shockRing * (drumOnset * 0.4 + beatSnap * 0.15);
  }

  // === CLIMAX: FULL VOLCANIC ERUPTION ===
  if (climaxBoost > 0.1) {
    // Magma everywhere: cavern floods, geysers at maximum
    float eruptionNoise = fbm3(vec3(screenP * 1.5, uDynamicTime * 0.6));
    float eruption = smoothstep(0.2, 0.7, eruptionNoise) * climaxBoost;
    col += in2MagmaColor(eruption * 0.7 + 0.3, hueShift) * eruption * 0.35;

    // Central radial burst
    float burstDist = length(screenP);
    float burst = exp(-burstDist * 2.5) * climaxBoost * 0.25;
    col += vec3(1.0, 0.7, 0.3) * burst;

    // Screen edge lava flood
    float edgeFlood = smoothstep(0.3, 0.7, length(screenP));
    col += in2MagmaColor(0.6, hueShift) * edgeFlood * climaxBoost * 0.1;
  }

  // === SPACE SCORE → SMOLDERING AFTERMATH ===
  if (spaceScore > 0.3) {
    float aftermath = smoothstep(0.3, 0.8, spaceScore);
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(luma) * vec3(1.0, 0.85, 0.7), aftermath * 0.4);
    col *= 1.0 - aftermath * 0.3;
    // Subtle residual ember glow
    col += vec3(0.04, 0.01, 0.0) * aftermath * (sin(uDynamicTime * 0.5) * 0.5 + 0.5);
  }

  // === DYNAMIC RANGE → MAGMA CONTRAST ===
  {
    float magmaContrast = mix(0.85, 1.3, dynRange);
    float lumaDR = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lumaDR), col, magmaContrast);
  }

  // === SEMANTIC: aggressive → intensify destruction ===
  col *= 1.0 + aggressive * 0.25;

  // === SDF ICON EMERGENCE ===
  {
    float iconNoise = fbm3(vec3(screenP * 2.0, uDynamicTime * 0.1));
    vec3 iconC1 = in2MagmaColor(0.7, hueShift);
    vec3 iconC2 = in2MagmaColor(0.4, hueShift);
    col += iconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uSectionIndex);
  }

  // === VIGNETTE: hot edges ===
  {
    float vigScale = mix(0.30, 0.20, energy);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    vec3 vigColor = mix(vec3(0.015, 0.005, 0.0), vec3(0.0), 1.0 - magmaPressure * 0.2);
    col = mix(vigColor, col, vignette);
  }

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${in2DepthAlpha}
}
`;
