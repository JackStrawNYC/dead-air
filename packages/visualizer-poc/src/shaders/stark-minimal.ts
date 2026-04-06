/**
 * Stark Minimal — raymarched 3D brutalist architecture.
 * Massive concrete slabs, sharp geometric voids, dramatic shadows. Tadao
 * Ando-inspired spaces with single shafts of light through narrow slots.
 * The beauty of emptiness and weight.
 *
 * Visual aesthetic:
 *   - Quiet: vast empty concrete hall, single shaft of light
 *   - Building: additional light slots open, shadows deepen
 *   - Peak: multiple shafts, concrete surfaces begin to glow at edges
 *   - Release: slots close, returning to solitary light
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           -> number of light shafts + shaft brightness
 *   uBass             -> concrete slab vibration (subtle displacement)
 *   uMids             -> surface detail / roughness visibility
 *   uHighs            -> specular sharpness on polished concrete
 *   uRms              -> ambient light level
 *   uOnsetSnap        -> light shaft flicker / new slot opening
 *   uBeatSnap         -> architecture pulse (subtle scale throb)
 *   uSlowEnergy       -> camera drift speed
 *   uClimaxPhase      -> void opens in center ceiling (2+)
 *   uClimaxIntensity  -> void aperture size
 *   uHarmonicTension  -> shadow contrast deepening
 *   uMelodicPitch     -> primary light angle
 *   uBeatStability    -> architectural precision (high=perfect geometry)
 *   uSectionType      -> jam=more complexity, space=minimal
 *   uVocalPresence    -> warm light tint
 *   uDynamicRange     -> contrast between light/shadow
 *   uCoherence        -> structural symmetry
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const starkMinimalVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const starkMinimalFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.04,
  caEnabled: false,
  halationEnabled: true,
  lensDistortionEnabled: true,
  dofEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define SM_MAX_STEPS 100
#define SM_MAX_DIST 40.0
#define SM_SURF_DIST 0.001

// ============================================================
// Utility
// ============================================================
mat2 smRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float smHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// ============================================================
// SDF primitives
// ============================================================
float smBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float smRoundBox(vec3 p, vec3 b, float r) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) - r + min(max(d.x, max(d.y, d.z)), 0.0);
}

float smCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ============================================================
// Concrete surface roughness
// ============================================================
float smConcreteRoughness(vec3 p, float detail) {
  float rough = snoise(p * 8.0) * 0.003;
  rough += snoise(p * 20.0) * 0.001 * detail;
  rough += snoise(p * 50.0) * 0.0004 * detail;
  return rough;
}

// ============================================================
// Scene: Brutalist hall with walls, columns, ceiling slits
// ============================================================
float smMap(vec3 p, float bassVib, float stability, float onset, float climaxAperture) {
  float minDist = SM_MAX_DIST;

  // Concrete roughness on all surfaces
  float rough = smConcreteRoughness(p, 1.0);

  // --- Main hall: large bounding box (inverted — camera inside) ---
  float hallWidth = 12.0;
  float hallHeight = 8.0;
  float hallDepth = 20.0;
  float hall = -smBox(p, vec3(hallWidth, hallHeight, hallDepth));
  hall += rough;
  minDist = min(minDist, hall);

  // --- Floor: thick concrete slab ---
  float floor = p.y + 3.5 + bassVib * 0.05;
  floor += rough;
  minDist = min(minDist, floor);

  // --- Ceiling: heavy concrete roof ---
  float ceiling = -(p.y - 7.0) + rough;
  minDist = min(minDist, ceiling);

  // --- Ceiling light slots: narrow rectangular voids ---
  // These cut through the ceiling to let light in
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float slotX = (fi - 2.0) * 4.0;
    // Slot width varies: thinner at edges (imperfect geometry from low stability)
    float slotWidth = 0.08 + (1.0 - stability) * 0.04;
    float slotDepth = mix(3.0, 8.0, fi / 4.0);
    vec3 slotP = p - vec3(slotX, 7.0, 0.0);
    float slot = smBox(slotP, vec3(slotWidth, 0.5, slotDepth));
    minDist = max(minDist, -slot); // subtract from ceiling
  }

  // --- Climax: circular void opening in center ceiling ---
  if (climaxAperture > 0.01) {
    float apertureR = climaxAperture * 3.0;
    float aperture = smCylinder(p - vec3(0.0, 7.0, 0.0), 1.0, apertureR);
    minDist = max(minDist, -aperture);
  }

  // --- Massive concrete columns ---
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float colZ = (fi - 2.5) * 6.0;
    // Left column
    vec3 colPL = p - vec3(-6.0, 1.75, colZ);
    colPL.y += bassVib * 0.02 * sin(fi * 2.3);
    float colL = smRoundBox(colPL, vec3(1.2, 5.25, 1.2), 0.02);
    colL += rough;
    minDist = min(minDist, colL);
    // Right column
    vec3 colPR = p - vec3(6.0, 1.75, colZ);
    colPR.y += bassVib * 0.02 * sin(fi * 3.1);
    float colR = smRoundBox(colPR, vec3(1.2, 5.25, 1.2), 0.02);
    colR += rough;
    minDist = min(minDist, colR);
  }

  // --- Horizontal concrete beam spanning between columns ---
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float beamZ = (fi - 1.0) * 8.0;
    vec3 beamP = p - vec3(0.0, 5.5, beamZ);
    float beam = smRoundBox(beamP, vec3(8.0, 0.6, 0.8), 0.01);
    beam += rough;
    minDist = min(minDist, beam);
  }

  // --- Wall alcove: recessed niche in back wall ---
  vec3 alcoveP = p - vec3(0.0, 1.0, -18.0);
  float alcove = smBox(alcoveP, vec3(3.0, 4.0, 2.0));
  float alcoveSubtract = smBox(alcoveP + vec3(0.0, 0.0, -0.5), vec3(2.5, 3.5, 1.5));
  float alcoveResult = max(alcove, -alcoveSubtract);
  alcoveResult += rough;
  minDist = min(minDist, alcoveResult);

  // --- Stepped platform (altar-like raised area) ---
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float stepW = 4.0 - fi * 0.8;
    float stepH = -3.0 + fi * 0.5;
    vec3 stepP = p - vec3(0.0, stepH, -14.0);
    float stepSlab = smBox(stepP, vec3(stepW, 0.25, 2.0 - fi * 0.3));
    stepSlab += rough;
    minDist = min(minDist, stepSlab);
  }

  return minDist;
}

// ============================================================
// Normal via central differences
// ============================================================
vec3 smNormal(vec3 p, float bassVib, float stability, float onset, float climaxAperture) {
  vec2 eps = vec2(0.002, 0.0);
  float d = smMap(p, bassVib, stability, onset, climaxAperture);
  return normalize(vec3(
    smMap(p + eps.xyy, bassVib, stability, onset, climaxAperture) - d,
    smMap(p + eps.yxy, bassVib, stability, onset, climaxAperture) - d,
    smMap(p + eps.yyx, bassVib, stability, onset, climaxAperture) - d
  ));
}

// ============================================================
// Ambient Occlusion (5-tap)
// ============================================================
float smAmbientOcclusion(vec3 p, vec3 n, float bassVib, float stability, float onset, float climaxAperture) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    float dist = fi * 0.12;
    float d = smMap(p + n * dist, bassVib, stability, onset, climaxAperture);
    occ += (dist - d) * weight;
    weight *= 0.55;
  }
  return clamp(1.0 - occ * 3.0, 0.0, 1.0);
}

// ============================================================
// Soft shadow
// ============================================================
float smSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k,
                    float bassVib, float stability, float onset, float climaxAperture) {
  float res = 1.0;
  float marchT = mint;
  for (int i = 0; i < 48; i++) {
    if (marchT > maxt) break;
    float d = smMap(ro + rd * marchT, bassVib, stability, onset, climaxAperture);
    if (d < 0.001) return 0.0;
    res = min(res, k * d / marchT);
    marchT += max(d, 0.01);
  }
  return clamp(res, 0.0, 1.0);
}

// ============================================================
// Volumetric light shafts through ceiling slots
// ============================================================
vec3 smLightShafts(vec3 ro, vec3 rd, float maxT, float energy, float onset,
                    vec3 shaftColor, float climaxAperture) {
  vec3 shafts = vec3(0.0);
  int shaftSteps = 40;
  float stepSize = min(maxT, 25.0) / float(shaftSteps);

  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float marchT = fi * stepSize + 0.2;
    vec3 pos = ro + rd * marchT;

    float inShaft = 0.0;

    // Check each ceiling slot
    int numSlots = 1 + int(energy * 4.0);
    for (int s = 0; s < 5; s++) {
      if (s >= numSlots) break;
      float fs = float(s);
      float slotX = (fs - 2.0) * 4.0;
      float slotWidth = 0.12;

      // Is this point below the slot and within its X/Z bounds?
      float inSlotX = smoothstep(slotWidth, 0.0, abs(pos.x - slotX));
      float slotDepth = mix(3.0, 8.0, fs / 4.0);
      float inSlotZ = smoothstep(slotDepth, slotDepth * 0.8, abs(pos.z));
      float belowCeiling = smoothstep(7.5, 6.5, pos.y);
      float aboveFloor = smoothstep(-4.0, -3.0, pos.y);

      inShaft += inSlotX * inSlotZ * belowCeiling * aboveFloor;
    }

    // Climax aperture: circular shaft from ceiling void
    if (climaxAperture > 0.01) {
      float apertureR = climaxAperture * 3.0;
      float distFromCenter = length(pos.xz);
      float inAperture = smoothstep(apertureR, apertureR * 0.5, distFromCenter);
      float belowCeiling = smoothstep(7.5, 6.0, pos.y);
      float aboveFloor = smoothstep(-4.0, -3.0, pos.y);
      inShaft += inAperture * belowCeiling * aboveFloor * 2.0;
    }

    // Dust in the shafts
    float dust = fbm3(vec3(pos * 0.8 + uDynamicTime * vec3(0.02, 0.05, 0.01)));
    dust = dust * 0.5 + 0.5;

    float depthAtten = exp(-marchT * 0.03);
    shafts += shaftColor * inShaft * dust * depthAtten * 0.006;
  }

  return shafts;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float rms = clamp(uRms, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float sectionT = uSectionType;

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float climaxAperture = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * uClimaxIntensity;

  float bassVib = bass * mix(1.0, 1.3, sJam) * mix(1.0, 0.2, sSpace);

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.1;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.08;
  float hue1 = hsvToCosineHue(uPalettePrimary) + chromaHueMod + chordHue;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  vec3 palColor1 = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  vec3 palColor2 = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Concrete color: mostly gray with subtle warm/cool variation
  vec3 concreteBase = vec3(0.25, 0.24, 0.23);
  vec3 concreteWarm = mix(concreteBase, concreteBase * vec3(1.05, 1.0, 0.92), vocalPresence * 0.3);

  // Light shaft color: warm white, palette-tinted
  vec3 shaftColor = mix(vec3(1.0, 0.95, 0.85), palColor1, 0.15);
  shaftColor = mix(shaftColor, vec3(1.0, 0.9, 0.7), vocalPresence * 0.2);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === RAYMARCH ===
  float marchT = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < SM_MAX_STEPS; i++) {
    marchPos = ro + rd * marchT;
    float d = smMap(marchPos, bassVib, beatStability, onset, climaxAperture);
    if (d < SM_SURF_DIST) {
      marchHit = true;
      break;
    }
    if (marchT > SM_MAX_DIST) break;
    marchT += d * 0.8;
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  // Background: dark gray void
  vec3 bgCol = vec3(0.02, 0.018, 0.025);

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = smNormal(pos, bassVib, beatStability, onset, climaxAperture);

    // Primary light: from above through slots, angle from melodicPitch
    float lightAngle = PI * 0.3 + melodicPitch * PI * 0.2;
    vec3 lightDir = normalize(vec3(sin(lightAngle) * 0.3, 1.0, cos(lightAngle) * 0.2));
    vec3 viewDir = normalize(ro - pos);
    vec3 halfVec = normalize(lightDir + viewDir);

    // === DIFFUSE ===
    float diff = max(dot(norm, lightDir), 0.0);

    // === SPECULAR (polished concrete) ===
    float specPow = 16.0 + highs * 64.0;
    float spec = pow(max(dot(norm, halfVec), 0.0), specPow);

    // === FRESNEL ===
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 4.0);

    // === AMBIENT OCCLUSION ===
    float occl = smAmbientOcclusion(pos, norm, bassVib, beatStability, onset, climaxAperture);

    // === SOFT SHADOW ===
    float shadow = smSoftShadow(pos + norm * 0.02, lightDir, 0.1, 15.0, 6.0,
                                 bassVib, beatStability, onset, climaxAperture);

    // === MATERIAL: concrete ===
    vec3 matCol = concreteWarm;

    // Surface detail: mids controls roughness visibility
    float surfNoise = snoise(pos * 12.0) * 0.04 * mids;
    matCol += vec3(surfNoise);

    // Formwork lines: faint horizontal bands on walls
    float formwork = smoothstep(0.02, 0.0, abs(fract(pos.y * 2.0) - 0.5) - 0.48);
    matCol *= 1.0 - formwork * 0.08;

    // Tie holes: small dark dots in grid
    float tieGrid = smoothstep(0.04, 0.0, length(fract(pos.xz * 0.5) - 0.5));
    matCol *= 1.0 - tieGrid * 0.15;

    // === COMPOSE LIGHTING ===
    float ambientLevel = 0.03 + rms * 0.04;
    vec3 ambient = matCol * ambientLevel;
    vec3 diffuseLight = matCol * diff * shaftColor * 0.6;
    vec3 specLight = shaftColor * spec * 0.2;
    vec3 fresnelLight = palColor2 * fresnel * 0.05;

    col = (ambient + diffuseLight + specLight + fresnelLight) * occl;

    // Shadow contrast: tension deepens shadows
    float shadowContrast = mix(0.4, 0.2, tension * 0.5);
    col *= shadowContrast + shadow * (1.0 - shadowContrast);

    // Dynamic range: adjust contrast between lit and shadow
    float lumaSurf = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * (0.5 + lumaSurf * 1.5), dynamicRange * 0.3);

    // Depth fog
    float depthFade = 1.0 - exp(-marchT * 0.025);
    col = mix(col, bgCol, depthFade);

    // Beat scale pulse: subtle geometry breathing
    col *= 1.0 + beatSnap * 0.02;
  } else {
    col = bgCol;
  }

  // === VOLUMETRIC LIGHT SHAFTS ===
  col += smLightShafts(ro, rd, min(marchT, SM_MAX_DIST), energy, onset,
                        shaftColor, climaxAperture);

  // === ACCENT COLOR (very subtle — this is brutalist) ===
  // Only during chorus: faint palette wash on light areas
  float accentGate = sChorus * 0.1 + climaxAperture * 0.2;
  if (accentGate > 0.01) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * palColor1 * 2.0, accentGate * smoothstep(0.1, 0.4, luma));
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = snoise(vec3(screenP * 2.0, uTime * 0.1));
    vec3 iconCol1 = mix(concreteWarm, palColor1, 0.5) * 2.0;
    vec3 iconCol2 = vec3(0.12, 0.10, 0.08);
    col += iconEmergence(screenP, uTime, energy, bass, iconCol1, iconCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, iconCol1, iconCol2, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, screenP);
  gl_FragColor = vec4(col, 1.0);
}
`;
