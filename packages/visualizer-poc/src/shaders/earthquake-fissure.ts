/**
 * Earthquake Fissure — raymarched cracking ground with magma glow.
 * For "Bertha" — raw power, driving rhythm, relentless energy.
 * The earth itself is torn apart by the music.
 *
 * Concept: Voronoi-cracked ground plane with magma emission from below,
 * floating rock chunks torn upward, seismic ripple waves, dust/ember
 * particles, heat distortion, and molten rivulets on rock surfaces.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → fissure width (bass OPENS the earth), ground shake
 *   uEnergy           → rock float height, magma brightness, destruction level
 *   uDrumOnset        → seismic shockwave, crack propagation, rock launch
 *   uVocalPresence    → magma glow intensity
 *   uHarmonicTension  → rock rotation speed, fissure jaggedness
 *   uMelodicPitch     → rock float height variation
 *   uSectionType      → jam=max destruction, space=smoldering, chorus=active quake
 *   uClimaxPhase      → ground fully fractures, rocks orbit, magma erupts
 *   uBeatSnap         → shockwave pulse
 *   uSlowEnergy       → drift/float speed
 *   uBeatStability    → ground tremor coherence
 *   uDynamicRange     → magma contrast
 *   uTimbralBrightness → ember particle brightness
 *   uSpaceScore       → aftermath stillness
 *   uSemanticAggressive → destruction multiplier
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const earthquakeFissureVert = /* glsl */ `
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
});

export const earthquakeFissureFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Voronoi — 2D cell ID + distance for crack generation
// ═══════════════════════════════════════════════════════════

vec2 efVoronoiHash(vec2 cellCoord) {
  cellCoord = vec2(dot(cellCoord, vec2(127.1, 311.7)),
                   dot(cellCoord, vec2(269.5, 183.3)));
  return fract(sin(cellCoord) * 43758.5453);
}

// Returns vec3(minDist, edgeDist, cellId)
vec3 efVoronoi(vec2 coord, float jitter) {
  vec2 cell = floor(coord);
  vec2 frac = fract(coord);

  float minDist = 1.0;
  float secondDist = 1.0;
  float cellId = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = efVoronoiHash(cell + neighbor);
      point = 0.5 + jitter * 0.5 * sin(TAU * point + uDynamicTime * 0.02);
      vec2 diff = neighbor + point - frac;
      float dist = length(diff);
      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
        cellId = dot(cell + neighbor, vec2(7.0, 113.0));
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }
  float edgeDist = secondDist - minDist;
  return vec3(minDist, edgeDist, cellId);
}

// ═══════════════════════════════════════════════════════════
// Magma color ramp: black → deep red → orange → yellow → white
// ═══════════════════════════════════════════════════════════

vec3 efMagmaColor(float temp, float hueShift) {
  float scaledT = clamp(temp, 0.0, 1.0);
  vec3 col = vec3(0.0);
  // Deep red core
  col += vec3(1.0, 0.15, 0.02) * smoothstep(0.0, 0.4, scaledT);
  // Orange mid
  col += vec3(0.8, 0.4, 0.0) * smoothstep(0.3, 0.65, scaledT);
  // Yellow hot
  col += vec3(0.6, 0.5, 0.0) * smoothstep(0.55, 0.85, scaledT);
  // White-hot core
  col += vec3(0.5, 0.5, 0.5) * smoothstep(0.8, 1.0, scaledT);

  // Palette hue shift
  float angle = hueShift * TAU * 0.1;
  float cs = cos(angle);
  float sn = sin(angle);
  col.rg = vec2(cs * col.r - sn * col.g, sn * col.r + cs * col.g);
  col = max(col, vec3(0.0));
  return col;
}

// ═══════════════════════════════════════════════════════════
// Ground SDF with Voronoi cracks and seismic displacement
// ═══════════════════════════════════════════════════════════

float efSeismicRipple(vec2 xzPos, float phase) {
  float dist = length(xzPos);
  float wave = sin(dist * 8.0 - phase * 12.0) * exp(-dist * 0.5);
  return wave;
}

float efGround(vec3 pos, float bass, float drumOnset, float tension,
               float destructionLevel, float shakeAmp, float seismicPhase) {
  // Base ground plane
  float ground = pos.y;

  // Seismic ripples: concentric displacement waves
  float ripple = efSeismicRipple(pos.xz, seismicPhase) * shakeAmp * 0.15;
  ground += ripple;

  // Noise roughness for rocky terrain
  float roughness = fbm3(vec3(pos.xz * 1.5, 0.0)) * 0.08;
  roughness += ridged4(vec3(pos.xz * 0.8, tension * 0.5)) * 0.04 * (1.0 + tension);
  ground += roughness;

  // Voronoi cell displacement: cells tilt and separate
  vec3 vor = efVoronoi(pos.xz * 2.5, 0.8 + tension * 0.2);
  float cellTilt = sin(vor.z * 3.17) * destructionLevel * 0.12;
  ground += cellTilt;

  // Bass opens fissures: depress along crack edges
  float crackWidth = 0.04 + bass * 0.12 + drumOnset * 0.08;
  float crackDepth = smoothstep(crackWidth, 0.0, vor.y) * (0.3 + bass * 0.5 + destructionLevel * 0.4);
  ground -= crackDepth;

  return ground;
}

// ═══════════════════════════════════════════════════════════
// Floating rock chunks — Voronoi cells torn from the ground
// ═══════════════════════════════════════════════════════════

float efRock(vec3 pos, vec3 rockCenter, float rockSize, float rotation, float tension) {
  vec3 localPos = pos - rockCenter;

  // Rotation around Y axis
  float cs = cos(rotation);
  float sn = sin(rotation);
  localPos.xz = vec2(cs * localPos.x + sn * localPos.z, -sn * localPos.x + cs * localPos.z);

  // Slight tilt on X axis
  float tiltAngle = sin(rockCenter.x * 2.0 + rockCenter.z) * 0.3;
  float tc = cos(tiltAngle);
  float ts = sin(tiltAngle);
  localPos.yz = vec2(tc * localPos.y - ts * localPos.z, ts * localPos.y + tc * localPos.z);

  // Base shape: rounded box
  vec3 boxSize = vec3(rockSize, rockSize * 0.6, rockSize * 0.8);
  vec3 dd = abs(localPos) - boxSize;
  float box = length(max(dd, 0.0)) + min(max(dd.x, max(dd.y, dd.z)), 0.0) - rockSize * 0.1;

  // Rough surface noise
  float surfNoise = snoise(localPos * (4.0 / rockSize)) * rockSize * 0.15;
  surfNoise += ridged4(localPos * (2.0 / rockSize)) * rockSize * 0.08 * (1.0 + tension * 0.5);

  return box + surfNoise;
}

// ═══════════════════════════════════════════════════════════
// Magma emission field below ground — visible through cracks
// ═══════════════════════════════════════════════════════════

float efMagmaField(vec3 pos, float flowTime, float pressure) {
  // Thick magma layer below y = -0.3
  float depth = -pos.y - 0.3;
  if (depth < 0.0) return 0.0;

  float magma = fbm6(vec3(pos.xz * 1.2, flowTime * 0.3)) * 0.5 + 0.5;
  magma += fbm3(vec3(pos.xz * 3.0 + 50.0, flowTime * 0.5)) * 0.3;
  magma *= smoothstep(0.0, 0.6, depth); // denser deeper
  magma *= pressure;
  return clamp(magma, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Scene SDF: ground + rocks + magma (returns vec2: dist, matId)
//   matId: 0=ground, 1=rock, 2=magma volume
// ═══════════════════════════════════════════════════════════

vec2 efMap(vec3 pos, float bass, float energy, float drumOnset, float tension,
           float destructionLevel, float shakeAmp, float seismicPhase,
           float melodicPitch, float slowEnergy, float rotSpeed) {

  // Ground
  float ground = efGround(pos, bass, drumOnset, tension, destructionLevel, shakeAmp, seismicPhase);
  vec2 result = vec2(ground, 0.0);

  // Floating rock chunks (6 rocks, positioned by hash)
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float rockHash = fract(sin(fi * 127.1 + 311.7) * 43758.5453);
    float rockHash2 = fract(sin(fi * 269.5 + 183.3) * 43758.5453);
    float rockHash3 = fract(sin(fi * 419.2 + 71.9) * 43758.5453);

    // Rock only lifts if destruction is high enough
    float liftThreshold = rockHash * 0.6;
    float liftAmount = smoothstep(liftThreshold, liftThreshold + 0.3, destructionLevel);
    if (liftAmount < 0.01) continue;

    // Position: spread across ground plane
    float rx = (rockHash - 0.5) * 6.0;
    float rz = (rockHash2 - 0.5) * 6.0 - 2.0;

    // Float height: energy + melodic pitch variation + drum launch
    float baseHeight = 0.3 + energy * 1.2 + melodicPitch * 0.5;
    float bobPhase = uDynamicTime * (0.3 + slowEnergy * 0.2) + fi * 2.1;
    float bob = sin(bobPhase) * 0.15 * liftAmount;
    float launchBoost = drumOnset * 0.5 * smoothstep(0.3, 0.8, rockHash3);
    float ry = baseHeight * liftAmount + bob + launchBoost;

    vec3 rockCenter = vec3(rx, ry, rz);
    float rockSize = 0.2 + rockHash3 * 0.25;
    float rockRot = uDynamicTime * rotSpeed * (0.5 + rockHash * 0.5) * (rockHash2 > 0.5 ? 1.0 : -1.0);

    float rockDist = efRock(pos, rockCenter, rockSize, rockRot, tension);

    if (rockDist < result.x) {
      result = vec2(rockDist, 1.0);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Normal estimation via central differences
// ═══════════════════════════════════════════════════════════

vec3 efNormal(vec3 pos, float bass, float energy, float drumOnset, float tension,
              float destructionLevel, float shakeAmp, float seismicPhase,
              float melodicPitch, float slowEnergy, float rotSpeed) {
  vec2 offset = vec2(0.003, 0.0);
  float dist = efMap(pos, bass, energy, drumOnset, tension, destructionLevel, shakeAmp, seismicPhase, melodicPitch, slowEnergy, rotSpeed).x;
  vec3 norm = vec3(
    efMap(pos + offset.xyy, bass, energy, drumOnset, tension, destructionLevel, shakeAmp, seismicPhase, melodicPitch, slowEnergy, rotSpeed).x - dist,
    efMap(pos + offset.yxy, bass, energy, drumOnset, tension, destructionLevel, shakeAmp, seismicPhase, melodicPitch, slowEnergy, rotSpeed).x - dist,
    efMap(pos + offset.yyx, bass, energy, drumOnset, tension, destructionLevel, shakeAmp, seismicPhase, melodicPitch, slowEnergy, rotSpeed).x - dist
  );
  return normalize(norm);
}

// ═══════════════════════════════════════════════════════════
// Dust/ember particles — procedural from noise
// ═══════════════════════════════════════════════════════════

float efEmber(vec3 pos, float flowTime) {
  // Rising particles: position wraps vertically
  vec3 pWrapped = pos;
  pWrapped.y = mod(pWrapped.y - flowTime * 1.5, 8.0) - 1.0;
  pWrapped.x += sin(pWrapped.y * 2.0 + flowTime) * 0.3;
  pWrapped.z += cos(pWrapped.y * 1.5 + flowTime * 0.7) * 0.2;

  // Particle field: sharp noise peaks = ember positions
  float particle = snoise(pWrapped * 4.0);
  particle = pow(max(0.0, particle), 12.0);
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
  float chromaHueMod = uChromaHue * 0.05;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section-driven modifiers
  float destructionMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.1, sSolo);
  float magmaIntensityMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.3, sChorus);
  float shakeMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.2, sChorus);

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === DERIVED PARAMETERS ===
  float destructionLevel = clamp((energy * 0.5 + bass * 0.3 + drumOnset * 0.2) * destructionMod
                                  + climaxBoost * 0.4 + aggressive * 0.15, 0.0, 1.0);
  float shakeAmp = (bass * 0.5 + drumOnset * 0.3 + beatSnap * 0.2) * shakeMod * (1.0 + climaxBoost * 0.5);
  float seismicPhase = uDynamicTime * (0.5 + drumOnset * 2.0);
  float rotSpeed = 0.2 + tension * 0.8 + climaxBoost * 0.3;
  float magmaPressure = (bass * 0.4 + energy * 0.3 + vocalPresence * 0.3) * magmaIntensityMod + climaxBoost * 0.3;
  magmaPressure = clamp(magmaPressure, 0.0, 1.2);
  float flowTime = uDynamicTime * (0.15 + slowEnergy * 0.1);

  // === PALETTE ===
  float hue1 = hsvToCosineHue(uPalettePrimary) + chordHue + chromaHueMod;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  vec3 rockTint = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  rockTint = mix(rockTint, vec3(0.35, 0.28, 0.22), 0.6); // push toward stone
  vec3 magmaTint = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === CAMERA (uses 3D camera system) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera shake: bass-driven micro-displacement
  float shakeX = sin(uDynamicTime * 15.0) * shakeAmp * 0.02;
  float shakeY = cos(uDynamicTime * 12.0 + 1.5) * shakeAmp * 0.015;
  ro.x += shakeX;
  ro.y += shakeY;

  // === RAYMARCH ===
  float totalDist = 0.0;
  float matId = -1.0;
  vec3 marchPos = ro;
  bool marchFound = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    vec2 mapResult = efMap(marchPos, bass, energy, drumOnset, tension,
                           destructionLevel, shakeAmp, seismicPhase,
                           melodicPitch, slowEnergy, rotSpeed);
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
  vec3 lightDir = normalize(vec3(0.3, -0.8, 0.4)); // from below/side (magma light)
  vec3 skyLight = normalize(vec3(-0.2, 1.0, -0.3));
  vec3 col = vec3(0.0);

  if (marchFound) {
    vec3 norm = efNormal(marchPos, bass, energy, drumOnset, tension,
                         destructionLevel, shakeAmp, seismicPhase,
                         melodicPitch, slowEnergy, rotSpeed);

    // === VORONOI DATA at surface point ===
    vec3 vor = efVoronoi(marchPos.xz * 2.5, 0.8 + tension * 0.2);
    float crackWidth = 0.04 + bass * 0.12 + drumOnset * 0.08;
    float nearCrack = smoothstep(crackWidth * 1.5, 0.0, vor.y);

    if (matId < 0.5) {
      // ──── GROUND MATERIAL ────
      // Base stone color with noise variation
      float stoneNoise = fbm3(vec3(marchPos.xz * 3.0, 0.0)) * 0.5 + 0.5;
      vec3 stoneColor = mix(vec3(0.12, 0.1, 0.08), vec3(0.25, 0.2, 0.16), stoneNoise);
      stoneColor = mix(stoneColor, rockTint * 0.3, 0.2);

      // Diffuse from magma below (warm uplight)
      float diffBelow = max(0.0, dot(norm, -lightDir));
      float diffSky = max(0.0, dot(norm, skyLight)) * 0.15;

      col = stoneColor * (0.08 + diffBelow * 0.2 + diffSky);

      // Rim light from magma below: strongest near cracks
      float rimBelow = pow(1.0 - max(0.0, dot(norm, vec3(0.0, 1.0, 0.0))), 3.0);
      vec3 magmaRim = efMagmaColor(magmaPressure * 0.7, uPalettePrimary + chromaHueMod) * rimBelow * nearCrack;
      col += magmaRim * 0.6 * magmaIntensityMod;

      // Crack glow: magma emission visible through fissures
      float crackGlow = smoothstep(crackWidth, 0.0, vor.y);
      float magmaTemp = efMagmaField(marchPos - vec3(0.0, 0.3, 0.0), flowTime, magmaPressure);
      vec3 crackEmission = efMagmaColor(magmaTemp * 0.8 + crackGlow * 0.3, uPalettePrimary + chromaHueMod);
      col += crackEmission * crackGlow * (1.5 + vocalPresence * 1.0 + climaxBoost * 0.8);

      // Seismic ripple highlight: bright lines on wave crests
      float rippleWave = efSeismicRipple(marchPos.xz, seismicPhase);
      float rippleHighlight = smoothstep(0.0, 0.05, rippleWave) * smoothstep(0.15, 0.05, rippleWave);
      col += vec3(0.5, 0.25, 0.1) * rippleHighlight * shakeAmp * 0.4;

      // Molten rivulets: noise-based emission lines on surface
      float rivulet = ridgedMultifractal(vec3(marchPos.xz * 5.0, flowTime * 0.2), 3, 2.5, 0.5);
      float rivuletMask = smoothstep(0.65, 0.75, rivulet) * nearCrack * magmaPressure;
      col += efMagmaColor(0.6 + rivuletMask * 0.3, uPalettePrimary + chromaHueMod) * rivuletMask * 0.5;

    } else {
      // ──── ROCK MATERIAL ────
      // Rough stone with noise displacement
      float rockNoise = fbm6(vec3(marchPos * 2.0)) * 0.5 + 0.5;
      float ridgeDetail = ridged4(marchPos * 3.0) * 0.3;
      vec3 rockColor = mix(vec3(0.18, 0.14, 0.11), vec3(0.35, 0.28, 0.22), rockNoise);
      rockColor = mix(rockColor, rockTint * 0.4, 0.25 + tension * 0.1);

      // Two-light system
      float diffMagma = max(0.0, dot(norm, -lightDir)) * 0.5; // magma below
      float diffSky = max(0.0, dot(norm, skyLight)) * 0.2;
      float ambOcc = 0.5 + 0.5 * rockNoise; // fake AO from noise

      col = rockColor * (0.1 + diffMagma + diffSky) * ambOcc;

      // Rim light from magma: underlit rocks glow at edges
      float rimMagma = pow(1.0 - abs(dot(norm, normalize(ro - marchPos))), 2.5);
      vec3 rimColor = efMagmaColor(magmaPressure * 0.6, uPalettePrimary + chromaHueMod);
      col += rimColor * rimMagma * 0.5 * magmaPressure;

      // Specular highlight from magma (looking up through rock)
      vec3 halfVec = normalize(-lightDir + normalize(ro - marchPos));
      float spec = pow(max(0.0, dot(norm, halfVec)), 16.0 + tension * 32.0);
      col += vec3(1.0, 0.7, 0.3) * spec * 0.2 * magmaPressure;

      // Molten veins on rock surfaces
      float rockRivulet = ridgedMultifractal(vec3(marchPos * 4.0), 4, 2.2, 0.55);
      float rockMelt = smoothstep(0.6, 0.75, rockRivulet) * energy * magmaPressure;
      col += efMagmaColor(0.5 + rockMelt * 0.4, uPalettePrimary + chromaHueMod) * rockMelt * 0.6;

      // Ridge detail adds geometric complexity
      col += vec3(0.05) * ridgeDetail * ambOcc;
    }

    // === DISTANCE FOG: smoky atmosphere ===
    float fogDist = totalDist;
    float fog = 1.0 - exp(-fogDist * 0.06);
    vec3 fogColor = mix(vec3(0.04, 0.02, 0.01), vec3(0.15, 0.06, 0.02), magmaPressure * 0.3);
    fogColor = mix(fogColor, magmaTint * 0.1, 0.15);
    col = mix(col, fogColor, fog);

  } else {
    // ──── SKY (no geometry hit) ────
    // Dark smoky sky with magma glow from below
    float skyGrad = smoothstep(-0.3, 0.4, rd.y);
    vec3 skyColor = mix(vec3(0.12, 0.04, 0.01), vec3(0.02, 0.01, 0.02), skyGrad);

    // Magma glow on underside of sky (horizon glow)
    float horizonGlow = smoothstep(0.1, -0.15, rd.y);
    skyColor += efMagmaColor(magmaPressure * 0.5, uPalettePrimary + chromaHueMod) * horizonGlow * 0.3 * magmaIntensityMod;

    // Smoke layers
    float smokeNoise = fbm3(vec3(rd.xz * 3.0 + flowTime * 0.2, rd.y * 2.0));
    skyColor += vec3(0.04, 0.02, 0.01) * (smokeNoise * 0.5 + 0.5) * (1.0 - skyGrad);

    col = skyColor;
  }

  // === VOLUMETRIC MAGMA GLOW (below ground, visible through cracks) ===
  // Secondary raymarch through magma layer: 8 steps for volumetric emission
  {
    float magmaAccum = 0.0;
    vec3 magmaColorAccum = vec3(0.0);
    for (int m = 0; m < 8; m++) {
      float mt = 1.0 + float(m) * 0.5;
      vec3 mpos = ro + rd * mt;
      if (mpos.y > 0.1) continue; // only below ground
      float mDensity = efMagmaField(mpos, flowTime, magmaPressure);
      if (mDensity > 0.01) {
        float mAlpha = mDensity * 0.08 * (1.0 - magmaAccum);
        vec3 mCol = efMagmaColor(mDensity, uPalettePrimary + chromaHueMod);
        magmaColorAccum += mCol * mAlpha;
        magmaAccum += mAlpha;
      }
    }
    col += magmaColorAccum * (1.0 + vocalPresence * 0.5 + climaxBoost * 0.4);
  }

  // === EMBER PARTICLES ===
  {
    float emberDensity = efEmber(ro + rd * 2.0, flowTime) * (0.5 + energy * 0.5);
    emberDensity += efEmber(ro + rd * 4.0 + 1.0, flowTime * 0.8) * 0.5;
    vec3 emberColor = efMagmaColor(0.6 + timbralBright * 0.3, uPalettePrimary + chromaHueMod);
    col += emberColor * emberDensity * (0.15 + climaxBoost * 0.2);
  }

  // === DUST HAZE from fissures ===
  {
    float dustNoise = fbm3(vec3(screenP * 3.0 + flowTime * 0.3, uDynamicTime * 0.1));
    float dustMask = smoothstep(0.2, 0.6, dustNoise) * energy * 0.08;
    col += vec3(0.2, 0.12, 0.06) * dustMask * shakeMod;
  }

  // === SEISMIC SHOCKWAVE PULSE on drum onset ===
  {
    float shockRadius = drumOnset * 3.0 + beatSnap * 1.5;
    float shockDist = length(screenP);
    float shockRing = smoothstep(shockRadius, shockRadius - 0.08, shockDist)
                    * smoothstep(shockRadius - 0.15, shockRadius - 0.08, shockDist);
    vec3 shockColor = efMagmaColor(0.7, uPalettePrimary + chromaHueMod);
    col += shockColor * shockRing * (drumOnset * 0.4 + beatSnap * 0.2);
  }

  // === BEAT SNAP PULSE ===
  col *= 1.0 + beatSnap * 0.15 * (1.0 + climaxBoost * 0.3);

  // === CLIMAX ERUPTION ===
  if (climaxBoost > 0.1) {
    // Ground fully fractures: magma everywhere
    float eruptionNoise = fbm3(vec3(screenP * 2.0, uDynamicTime * 0.5));
    float eruption = smoothstep(0.3, 0.8, eruptionNoise) * climaxBoost;
    col += efMagmaColor(eruption * 0.8 + 0.2, uPalettePrimary + chromaHueMod) * eruption * 0.3;

    // Radial light burst
    float burstDist = length(screenP);
    float burst = exp(-burstDist * 3.0) * climaxBoost * 0.2;
    col += vec3(1.0, 0.6, 0.2) * burst;
  }

  // === SPACE SCORE → AFTERMATH STILLNESS ===
  if (spaceScore > 0.3) {
    // Smoldering aftermath: desaturate, darken, add subtle ember glow
    float aftermath = smoothstep(0.3, 0.8, spaceScore);
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(luma) * vec3(1.0, 0.85, 0.7), aftermath * 0.4);
    col *= 1.0 - aftermath * 0.3;
  }

  // === DYNAMIC RANGE → MAGMA CONTRAST ===
  {
    float magmaContrast = mix(0.85, 1.3, dynRange);
    float lumaDR = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lumaDR), col, magmaContrast);
  }

  // === SDF ICON EMERGENCE ===
  {
    float iconNoise = fbm3(vec3(screenP * 2.0, uDynamicTime * 0.1));
    vec3 iconC1 = efMagmaColor(0.7, uPalettePrimary + chromaHueMod);
    vec3 iconC2 = efMagmaColor(0.4, uPaletteSecondary + chromaHueMod);
    col += iconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, iconC1, iconC2, iconNoise, uSectionIndex);
  }

  // === VIGNETTE ===
  {
    float vigScale = mix(0.32, 0.22, energy);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    // Magma-tinted vignette edges
    vec3 vigColor = mix(vec3(0.02, 0.005, 0.0), vec3(0.0), 1.0 - magmaPressure * 0.3);
    col = mix(vigColor, col, vignette);
  }

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
