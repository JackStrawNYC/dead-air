/**
 * Crystalline Growth — raymarched 3D crystal cluster growing from a seed point.
 *
 * Hexagonal prism crystals budding and extending outward in real time,
 * with proper faceted normals, internal refraction coloring, and
 * growth front emission. Camera orbits the growing cluster.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> crystal density, facet brightness
 *   uBass            -> crystal scale pulsation, resonance glow
 *   uHighs           -> prismatic dispersion (rainbow facet edges)
 *   uOnsetSnap       -> crystal fracture / new growth spawn
 *   uSlowEnergy      -> overall growth rate
 *   uClimaxPhase     -> full crystalline cathedral mode
 *   uVocalEnergy     -> inner crystal warmth glow
 *   uHarmonicTension -> fracture complexity, sub-crystal branching
 *   uBeatSnap        -> pulse along crystal growth axis
 *   uMelodicPitch    -> crystal growth direction bias
 *   uBeatStability   -> lattice regularity
 *   uChordIndex      -> palette hue shift
 *   uTimbralBrightness -> specular highlight intensity
 *   uDrumOnset       -> shatter pulse wave
 *   uPalettePrimary/Secondary -> crystal body/highlight colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const crystallineGrowthVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const crystallineGrowthFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define CG_MAX_STEPS 90
#define CG_MAX_DIST 30.0
#define CG_SURF_DIST 0.001
#define CG_NUM_CRYSTALS 9

// ─── Hexagonal prism SDF ───
float cgHexPrism(vec3 pos, float radius, float halfHeight) {
  vec3 absP = abs(pos);
  // Hexagonal cross-section distance
  float hexDist = max(absP.x * 0.866025 + absP.z * 0.5, absP.z) - radius;
  float heightDist = absP.y - halfHeight;
  return min(max(hexDist, heightDist), 0.0) + length(max(vec2(hexDist, heightDist), 0.0));
}

// ─── Rotate 2D helper ───
vec2 cgRot2D(vec2 coord, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  return vec2(cosA * coord.x - sinA * coord.y, sinA * coord.x + cosA * coord.y);
}

float cgSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Single crystal: hex prism oriented along an axis with tip ───
float cgCrystal(vec3 pos, vec3 origin, vec3 direction, float length2, float radius, float growthProg) {
  // Transform to crystal local space
  vec3 local = pos - origin;

  // Align Y axis to crystal direction
  vec3 forward = normalize(direction);
  vec3 worldUp = abs(forward.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 sideVec = normalize(cross(worldUp, forward));
  vec3 upVec = cross(forward, sideVec);

  vec3 aligned = vec3(
    dot(local, sideVec),
    dot(local, forward),
    dot(local, upVec)
  );

  // Crystal body length scaled by growth progress
  float effectiveLen = length2 * growthProg;

  // Main hex prism body
  float body = cgHexPrism(aligned, radius, effectiveLen * 0.5);

  // Pointed tip: tapered end
  vec3 tipPos = aligned;
  tipPos.y -= effectiveLen * 0.5;
  float tipScale = max(0.0, 1.0 - abs(tipPos.y) / (radius * 2.0));
  float tipR = radius * tipScale;
  float tipDist = length(vec2(max(length(tipPos.xz) - tipR, 0.0), max(-tipPos.y, 0.0)));

  return min(body, tipDist);
}

// ─── Crystal cluster: multiple crystals growing from center ───
// Returns vec2(dist, crystalID)
vec2 cgClusterMap(vec3 pos, float timeVal, float growthRate, float onset, float tension, float bass, float beatSnap2, float melodicPitch, float beatStab) {
  float result = CG_MAX_DIST;
  float crystalID = 0.0;

  // Growth progress: time-based with energy modulation
  float baseGrowth = fract(timeVal * growthRate * 0.03);

  // Central seed crystal
  float centerR = 0.3 + bass * 0.1;
  float centerH = 1.5 + onset * 0.5;
  float seed0 = cgCrystal(pos, vec3(0.0), vec3(0.0, 1.0, 0.0), centerH, centerR, min(baseGrowth * 3.0, 1.0));
  result = seed0;

  // Surrounding crystals
  for (int idx = 0; idx < CG_NUM_CRYSTALS; idx++) {
    float fi = float(idx);
    float seedVal = fi * 5.71 + 13.0;

    // Growth is staggered per crystal
    float crystalGrowth = clamp((baseGrowth - fi * 0.05) * 2.5, 0.0, 1.0);
    crystalGrowth += onset * 0.2; // onset triggers growth spurts

    if (crystalGrowth < 0.01) continue;

    // Crystal placement: radial + randomized
    float angle = fi * 2.399 + sin(seedVal) * 0.5; // golden angle offset
    float radialDist = 0.4 + fract(sin(seedVal) * 43758.5) * 0.8;

    vec3 crystalOrigin = vec3(
      cos(angle) * radialDist,
      sin(seedVal * 0.3) * 0.3 - 0.2,
      sin(angle) * radialDist
    );

    // Crystal growth direction: outward + upward, pitch-biased
    vec3 crystalDir = normalize(crystalOrigin + vec3(0.0, 0.5 + melodicPitch * 0.5, 0.0));

    // Per-crystal dimensions
    float crystalLen = (0.8 + fract(sin(seedVal + 1.0) * 23421.6) * 1.5) * (1.0 + tension * 0.4);
    float crystalRad = 0.08 + fract(sin(seedVal + 2.0) * 12345.6) * 0.15;
    crystalRad *= mix(0.8, 1.2, beatStab); // stability -> regular sizes

    // Beat pulse along growth axis
    float pulseMod = 1.0 + beatSnap2 * 0.15 * sin(fi * 3.0 + timeVal * 4.0);

    float d = cgCrystal(pos, crystalOrigin, crystalDir, crystalLen * pulseMod, crystalRad, crystalGrowth);

    if (d < result) {
      result = d;
      crystalID = fi + 1.0;
    }
  }

  // Sub-crystals budding from main crystals (tension-driven branching)
  if (tension > 0.3) {
    for (int bidx = 0; bidx < 5; bidx++) {
      float bfi = float(bidx);
      float bSeed = bfi * 13.37 + 77.0;
      float bAngle = bfi * 1.256 + timeVal * 0.05;
      float bRad = 0.8 + sin(bSeed) * 0.4;
      vec3 bOrigin = vec3(cos(bAngle) * bRad, 0.4 + bfi * 0.2, sin(bAngle) * bRad);
      vec3 bDir = normalize(vec3(cos(bAngle + 0.5), 0.3, sin(bAngle + 0.5)));
      float bLen = 0.5 * (tension - 0.3) * 3.0;
      float bGrowth = clamp(baseGrowth * 3.0 - 0.3, 0.0, 1.0);

      float bd = cgCrystal(pos, bOrigin, bDir, bLen, 0.05, bGrowth);
      if (bd < result) {
        result = bd;
        crystalID = bfi + 10.0;
      }
    }
  }

  return vec2(result, crystalID);
}

// ─── Wrapper for scene map (adds base rock) ───
vec2 cgSceneMap(vec3 pos, float timeVal, float growthRate, float onset, float tension, float bass, float beatSnap2, float melodicPitch, float beatStab) {
  vec2 cluster = cgClusterMap(pos, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab);

  // Base rock: noisy sphere at origin
  float rockDist = length(pos) - 0.6;
  rockDist += fbm3(vec3(pos * 3.0)) * 0.15;
  if (rockDist < cluster.x) {
    cluster = vec2(rockDist, -1.0);
  }

  return cluster;
}

// ─── Normal calculation ───
vec3 cgCalcNormal(vec3 pos, float timeVal, float growthRate, float onset, float tension, float bass, float beatSnap2, float melodicPitch, float beatStab) {
  vec2 off = vec2(0.002, 0.0);
  float d0 = cgSceneMap(pos, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x;
  return normalize(vec3(
    cgSceneMap(pos + off.xyy, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x - d0,
    cgSceneMap(pos + off.yxy, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x - d0,
    cgSceneMap(pos + off.yyx, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x - d0
  ));
}

// ─── Ambient occlusion ───
float cgCalcAO(vec3 pos, vec3 norm, float timeVal, float growthRate, float onset, float tension, float bass, float beatSnap2, float melodicPitch, float beatStab) {
  float occlusion = 0.0;
  float weight = 1.0;
  for (int idx = 0; idx < 5; idx++) {
    float dist = 0.01 + float(idx) * 0.04;
    float sdf = cgSceneMap(pos + norm * dist, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x;
    occlusion += (dist - sdf) * weight;
    weight *= 0.7;
  }
  return clamp(1.0 - occlusion * 5.0, 0.0, 1.0);
}

// ─── Soft shadow ───
float cgSoftShadow(vec3 shadowRo, vec3 shadowRd, float minT, float maxT, float kShadow, float timeVal, float growthRate, float onset, float tension, float bass, float beatSnap2, float melodicPitch, float beatStab) {
  float result = 1.0;
  float marchT = minT;
  for (int idx = 0; idx < 32; idx++) {
    if (marchT > maxT) break;
    float dist = cgSceneMap(shadowRo + shadowRd * marchT, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab).x;
    if (dist < 0.001) return 0.0;
    result = min(result, kShadow * dist / marchT);
    marchT += clamp(dist, 0.005, 0.3);
  }
  return clamp(result, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap2 = clamp(uBeatSnap, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);

  float timeVal = uDynamicTime;
  float growthRate = 1.0 + slowE * 0.5 + energy * 0.3;

  // Section modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float growthMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.1, sChorus);
  float emissionMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  growthRate *= growthMod;

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Palette
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Orbit camera around cluster
  float orbitAngle = timeVal * 0.04;
  float orbitR = 4.0 - energy * 0.5;
  ro += vec3(cos(orbitAngle) * orbitR, 1.0 + sin(timeVal * 0.03) * 0.5, sin(orbitAngle) * orbitR);

  // Lighting: two key lights for faceted look
  vec3 keyLight = normalize(vec3(2.0, 4.0, 3.0));
  vec3 fillLight = normalize(vec3(-1.5, 2.0, -2.0));

  // === PRIMARY RAYMARCH ===
  float marchDist = 0.0;
  vec2 marchResult = vec2(0.0);
  bool marchHitSurface = false;

  for (int idx = 0; idx < CG_MAX_STEPS; idx++) {
    vec3 marchPos = ro + rd * marchDist;
    marchResult = cgSceneMap(marchPos, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab);
    if (marchResult.x < CG_SURF_DIST) {
      marchHitSurface = true;
      break;
    }
    if (marchDist > CG_MAX_DIST) break;
    marchDist += marchResult.x * 0.7;
  }

  // Background: deep obsidian void
  vec3 bgColor = mix(vec3(0.01, 0.008, 0.02), vec3(0.03, 0.02, 0.05), screenP.y * 0.5 + 0.5);
  vec3 col = bgColor;

  if (marchHitSurface) {
    vec3 marchPos = ro + rd * marchDist;
    vec3 norm = cgCalcNormal(marchPos, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab);
    float matID = marchResult.y;

    float occl = cgCalcAO(marchPos, norm, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab);

    // Two-light illumination for dramatic facets
    float keyDiff = max(dot(norm, keyLight), 0.0);
    vec3 keyHalf = normalize(keyLight - rd);
    float keySpec = pow(max(dot(norm, keyHalf), 0.0), 64.0 + timbralBright * 64.0);

    float fillDiff = max(dot(norm, fillLight), 0.0);
    vec3 fillHalf = normalize(fillLight - rd);
    float fillSpec = pow(max(dot(norm, fillHalf), 0.0), 32.0);

    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 4.0);

    // Shadow from key light
    float shadow = cgSoftShadow(marchPos + norm * 0.01, keyLight, 0.02, 10.0, 16.0, timeVal, growthRate, onset, tension, bass, beatSnap2, melodicPitch, beatStab);

    if (matID < -0.5) {
      // Base rock: dark textured surface
      float rockTex = ridged4(vec3(marchPos * 4.0));
      vec3 rockCol = vec3(0.06, 0.05, 0.07) * (0.5 + rockTex * 0.5);
      col = rockCol * (keyDiff * 0.6 + fillDiff * 0.2 + 0.15) * occl * shadow;
    } else {
      // Crystal material
      float crystalIdx = matID;

      // Crystal body color from palette with per-crystal variation
      float crystalHue = mix(hue1, hue2, fract(crystalIdx * 0.13 + 0.3));
      vec3 crystalColor = hsv2rgb(vec3(crystalHue, sat, 1.0));

      // Prismatic edge dispersion: rainbow refraction at facet edges
      float facetEdge = 1.0 - abs(dot(norm, -rd));
      float prismHue = fract(facetEdge * 3.0 + timeVal * 0.05 + crystalIdx * 0.1);
      vec3 prismColor = hsv2rgb(vec3(prismHue, 0.9, 1.0));
      vec3 edgeRefraction = mix(crystalColor, prismColor, highs * facetEdge * 0.7);

      // Internal glow: translucent interior with vocal warmth
      float internalGlow = exp(-marchDist * 0.3) * 0.3;
      vec3 interiorColor = crystalColor * 0.5 + vec3(0.1, 0.06, 0.02) * vocalE;

      // Growth front emission: bright at crystal tips (recently grown)
      float growthFront = smoothstep(0.0, 0.3, fract(timeVal * growthRate * 0.03 - crystalIdx * 0.05));
      float tipGlow = growthFront * emissionMod * (0.3 + energy * 0.5);

      // Drum shatter pulse: bright flash along facets
      float shatterPulse = drumOnset * facetEdge * 2.0;

      // Compose crystal material
      vec3 ambient = crystalColor * 0.08 * occl;
      vec3 keyLightCol = edgeRefraction * keyDiff * shadow * 0.6;
      vec3 fillLightCol = crystalColor * fillDiff * 0.2;
      vec3 specCol = vec3(1.0, 0.98, 0.95) * (keySpec * 0.5 + fillSpec * 0.15) * shadow;
      vec3 fresnelCol = edgeRefraction * fresnel * 0.3;
      vec3 emitCol = crystalColor * tipGlow + interiorColor * internalGlow;

      col = ambient + keyLightCol + fillLightCol + specCol + fresnelCol + emitCol;
      col += vec3(1.0, 0.95, 0.9) * shatterPulse * 0.3;

      // Climax: everything intensifies
      col *= 1.0 + climaxBoost * 0.5;
    }

    // Distance fade
    float fogAmount = 1.0 - exp(-marchDist * 0.06);
    col = mix(col, bgColor, fogAmount);
  }

  // === AMBIENT GLOW: scattered crystal light ===
  {
    float glowField = fbm3(vec3(screenP * 2.0 + timeVal * 0.02, timeVal * 0.01));
    vec3 glowCol1 = hsv2rgb(vec3(hue1, sat * 0.4, 0.3));
    vec3 glowCol2 = hsv2rgb(vec3(hue2, sat * 0.3, 0.25));
    col += mix(glowCol1, glowCol2, glowField * 0.5 + 0.5) * max(0.0, glowField) * 0.05 * energy;
  }

  // Beat pulse brightness
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.08;

  // Bass resonance glow at base
  {
    float baseDist = length(screenP);
    float baseGlow = exp(-baseDist * baseDist * 4.0) * bass * 0.15;
    col += hsv2rgb(vec3(hue1, sat * 0.6, 1.0)) * baseGlow;
  }

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(screenP * 2.0, timeVal * 0.05));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
