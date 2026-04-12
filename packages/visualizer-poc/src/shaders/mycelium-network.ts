/**
 * Mycelium Network — raymarched underground fungal network.
 * The Wood Wide Web in 3D: branching mycelium threads as cylinder SDFs
 * growing through dark soil, mushroom fruiting bodies pushing upward,
 * bioluminescent nutrient signals pulsing along the network.
 *
 * Full raymarched SDF with proper lighting: bioluminescent emission,
 * subsurface scattering approximation, ambient occlusion, soil texture.
 *
 * Audio reactivity:
 *   uBass               -> network pulse (thread throb + root glow)
 *   uEnergy             -> branch density / overall glow intensity
 *   uDrumOnset          -> nutrient signal burst (pulse wave along threads)
 *   uVocalPresence      -> bioluminescent warmth (subsurface glow color shift)
 *   uHarmonicTension    -> network complexity (branching depth + tangle)
 *   uSectionType        -> jam=rapid growth, space=dormant, chorus=full bloom, solo=dramatic
 *   uClimaxPhase        -> massive fruiting body eruption
 *   uSlowEnergy         -> drift speed of nutrient flow
 *   uMelodicPitch       -> mushroom cap height modulation
 *   uBeatSnap           -> rhythmic pulse along thread network
 *   uSpectralFlux       -> spore particle density
 *   uTimbralBrightness  -> emission color temperature
 *   uChordIndex         -> palette hue shift
 *   uImprovisationScore -> chaotic branching angles
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const myceliumNetworkVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.1,
  halationEnabled: true,
  grainStrength: "light",
  caEnabled: true,
  lightLeakEnabled: false,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
});

export const myceliumNetworkFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define MN_PI 3.14159265
#define MN_TAU 6.28318530
#define MN_MAX_DIST 30.0
#define MN_SURFACE_DIST 0.002
#define MN_MAX_STEPS 80

// ========================================================================
// SDF Primitives
// ========================================================================

// Capped cylinder SDF along arbitrary axis (thread segment)
float mnCylinder(vec3 pos, vec3 segA, vec3 segB, float radius) {
  vec3 ba = segB - segA;
  vec3 pa = pos - segA;
  float baba = dot(ba, ba);
  float paba = dot(pa, ba);
  float fraction = clamp(paba / baba, 0.0, 1.0);
  return length(pa - ba * fraction) - radius;
}

// Sphere SDF
float mnSphere(vec3 pos, vec3 center, float radius) {
  return length(pos - center) - radius;
}

// Rounded box for soil aggregate clumps
float mnRoundBox(vec3 pos, vec3 center, vec3 dims, float rounding) {
  vec3 q = abs(pos - center) - dims;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rounding;
}

// Smooth min for organic blending
float mnSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ========================================================================
// Mycelium Thread Network
// ========================================================================

// Hash for deterministic thread placement
vec3 mnHash3(float seed) {
  vec3 p = vec3(seed * 127.1, seed * 311.7, seed * 74.7);
  return fract(sin(p) * 43758.5453);
}

// Single thread segment distance + glow ID
// Returns: x = distance, y = glow intensity (nutrient signal)
vec2 mnThread(vec3 pos, float seed, float growthRate, float complexity, float networkPulse, float drumPulse) {
  vec3 hsh = mnHash3(seed);

  // Thread anchor point
  vec3 anchor = (hsh - 0.5) * vec3(6.0, 3.0, 6.0);
  anchor.y = anchor.y * 0.5 - 0.5; // bias downward (underground)

  // Growth direction influenced by noise field
  float angle1 = hsh.x * MN_TAU + complexity * snoise(vec3(anchor * 0.3 + seed));
  float angle2 = (hsh.y - 0.5) * MN_PI * 0.6;
  vec3 growDir = vec3(
    cos(angle1) * cos(angle2),
    sin(angle2) * 0.4 + 0.15, // slight upward bias
    sin(angle1) * cos(angle2)
  );

  // Thread length modulated by growth rate
  float threadLen = (1.2 + hsh.z * 2.0) * growthRate;

  vec3 endPt = anchor + growDir * threadLen;

  // Thread thickness: thicker at root, thinner at tip
  float baseRadius = 0.03 + networkPulse * 0.015;
  float dist = mnCylinder(pos, anchor, endPt, baseRadius);

  // Branching: secondary threads fork off
  float branchDist = MN_MAX_DIST;
  if (complexity > 0.3) {
    float branchT = 0.4 + hsh.y * 0.3;
    vec3 branchPt = mix(anchor, endPt, branchT);
    float brAngle = angle1 + 1.2 + complexity * 0.8;
    vec3 brDir = vec3(cos(brAngle), 0.2, sin(brAngle));
    vec3 brEnd = branchPt + brDir * threadLen * 0.5;
    branchDist = mnCylinder(pos, branchPt, brEnd, baseRadius * 0.6);
  }

  // Second branch at high complexity
  if (complexity > 0.6) {
    float branchT2 = 0.6 + hsh.z * 0.2;
    vec3 branchPt2 = mix(anchor, endPt, branchT2);
    float brAngle2 = angle1 - 1.5 + complexity;
    vec3 brDir2 = vec3(cos(brAngle2), -0.1, sin(brAngle2));
    vec3 brEnd2 = branchPt2 + brDir2 * threadLen * 0.35;
    float br2 = mnCylinder(pos, branchPt2, brEnd2, baseRadius * 0.4);
    branchDist = min(branchDist, br2);
  }

  float threadDist = mnSmin(dist, branchDist, 0.04);

  // Nutrient signal: traveling wave along thread
  vec3 toPos = pos - anchor;
  float along = dot(toPos, normalize(endPt - anchor));
  float normalizedAlong = along / max(threadLen, 0.01);
  float signalWave = sin(normalizedAlong * 12.0 - uDynamicTime * 3.0 - seed * 2.0) * 0.5 + 0.5;
  float glowIntensity = signalWave * smoothstep(0.08, 0.0, threadDist) * (0.3 + drumPulse * 0.7);

  return vec2(threadDist, glowIntensity);
}

// ========================================================================
// Mushroom Fruiting Bodies
// ========================================================================

// Single mushroom SDF: stipe (stem) + pileus (cap)
float mnMushroom(vec3 pos, vec3 base, float stemHeight, float capRadius, float bloomAmount) {
  // Stipe (stem) — thin cylinder going up
  float stipeRadius = capRadius * 0.2;
  vec3 stipeTop = base + vec3(0.0, stemHeight, 0.0);
  float stipe = mnCylinder(pos, base, stipeTop, stipeRadius);

  // Pileus (cap) — flattened sphere on top of stipe
  vec3 capCenter = stipeTop + vec3(0.0, capRadius * 0.3 * bloomAmount, 0.0);
  float capDist = mnSphere(pos, capCenter, capRadius * bloomAmount);

  // Flatten the cap (ellipsoid squash)
  vec3 capLocal = pos - capCenter;
  capLocal.y *= 2.0; // squash vertically
  float flatCap = length(capLocal) - capRadius * bloomAmount;

  // Underside gills: wavy displacement on bottom of cap
  float gillAngle = atan(capLocal.z, capLocal.x);
  float gillWave = sin(gillAngle * 16.0) * 0.003 * bloomAmount;
  flatCap += gillWave * step(0.0, -capLocal.y);

  return mnSmin(stipe, flatCap, 0.02);
}

// ========================================================================
// Soil Medium
// ========================================================================

// Soil is the bounding volume — everything exists within it
// Returns density for volumetric soil texture (not SDF)
float mnSoilDensity(vec3 pos, float depth) {
  float baseDensity = smoothstep(2.5, 0.0, pos.y); // denser below
  float grainNoise = fbm3(pos * 8.0) * 0.3;
  float rootNoise = ridged4(pos * 3.0) * 0.15;
  return baseDensity * (0.6 + grainNoise + rootNoise) * depth;
}

// ========================================================================
// Scene SDF: full network + mushrooms
// ========================================================================

// Returns vec3: x = distance, y = materialID (0=soil, 1=thread, 2=mushroom), z = glow
vec3 mnMap(vec3 pos, float growthRate, float complexity, float networkPulse,
           float drumPulse, float bloomFactor, float mushroomScale) {

  float minDist = MN_MAX_DIST;
  float matID = 0.0;
  float totalGlow = 0.0;

  // --- Mycelium thread network ---
  // Number of threads scales with energy/complexity
  int threadCount = 12 + int(complexity * 8.0);

  for (int idx = 0; idx < 20; idx++) {
    if (idx >= threadCount) break;
    float seed = float(idx) * 3.17 + 0.5;
    vec2 threadResult = mnThread(pos, seed, growthRate, complexity, networkPulse, drumPulse);
    if (threadResult.x < minDist) {
      minDist = threadResult.x;
      matID = 1.0;
    }
    totalGlow += threadResult.y;
  }

  // --- Mushroom fruiting bodies ---
  // More mushrooms during chorus/climax
  int shroomCount = int(2.0 + bloomFactor * 6.0);
  for (int mi = 0; mi < 8; mi++) {
    if (mi >= shroomCount) break;
    float mseed = float(mi) * 7.13 + 100.0;
    vec3 mh = mnHash3(mseed);
    vec3 mbase = vec3(
      (mh.x - 0.5) * 5.0,
      -0.3 + mh.y * 0.5,
      (mh.z - 0.5) * 5.0
    );
    float stemH = (0.3 + mh.y * 0.4) * mushroomScale;
    float capR = (0.08 + mh.z * 0.12) * mushroomScale;
    float mDist = mnMushroom(pos, mbase, stemH, capR, bloomFactor);

    if (mDist < minDist) {
      minDist = mDist;
      matID = 2.0;
    }
  }

  // --- Soil aggregate clumps (scattered rounded boxes) ---
  for (int si = 0; si < 6; si++) {
    float sseed = float(si) * 5.31 + 200.0;
    vec3 sh = mnHash3(sseed);
    vec3 spos = vec3(
      (sh.x - 0.5) * 8.0,
      -1.0 + sh.y * 1.5,
      (sh.z - 0.5) * 8.0
    );
    float sDist = mnRoundBox(pos, spos, vec3(0.15 + sh.z * 0.2), 0.05);
    if (sDist < minDist) {
      minDist = sDist;
      matID = 0.0;
    }
  }

  return vec3(minDist, matID, clamp(totalGlow, 0.0, 1.0));
}

// ========================================================================
// Ambient Occlusion
// ========================================================================

float mnAmbientOcclusion(vec3 pos, vec3 norm, float growthRate, float complexity,
                          float networkPulse, float drumPulse, float bloomFactor, float mushroomScale) {
  float occlusion = 0.0;
  float stepScale = 1.0;
  for (int occStep = 0; occStep < 5; occStep++) {
    float dist = 0.02 + 0.06 * float(occStep);
    vec3 sampleResult = mnMap(pos + norm * dist, growthRate, complexity, networkPulse,
                              drumPulse, bloomFactor, mushroomScale);
    occlusion += (dist - sampleResult.x) * stepScale;
    stepScale *= 0.7;
  }
  return clamp(1.0 - occlusion * 3.0, 0.0, 1.0);
}

// ========================================================================
// Normal estimation
// ========================================================================

vec3 mnNormal(vec3 pos, float growthRate, float complexity, float networkPulse,
              float drumPulse, float bloomFactor, float mushroomScale) {
  vec2 offset = vec2(0.001, 0.0);
  float base = mnMap(pos, growthRate, complexity, networkPulse, drumPulse, bloomFactor, mushroomScale).x;
  return normalize(vec3(
    mnMap(pos + offset.xyy, growthRate, complexity, networkPulse, drumPulse, bloomFactor, mushroomScale).x - base,
    mnMap(pos + offset.yxy, growthRate, complexity, networkPulse, drumPulse, bloomFactor, mushroomScale).x - base,
    mnMap(pos + offset.yyx, growthRate, complexity, networkPulse, drumPulse, bloomFactor, mushroomScale).x - base
  ));
}

// ========================================================================
// Subsurface Scattering Approximation
// ========================================================================

vec3 mnSubsurface(vec3 pos, vec3 norm, vec3 lightDir, vec3 sssColor, float thickness) {
  // Wrap lighting model for translucent organic material
  float wrapDiffuse = max(0.0, dot(norm, lightDir) * 0.5 + 0.5);
  // Back-illumination: light passing through thin material
  float backLight = max(0.0, dot(-norm, lightDir));
  backLight = pow(backLight, 2.0) * thickness;
  return sssColor * (wrapDiffuse * 0.4 + backLight * 0.6);
}

// ========================================================================
// Bioluminescent Emission
// ========================================================================

vec3 mnBioluminescence(vec3 pos, float glowAmount, float vocalWarmth, float timbralTemp,
                       float hue1, float hue2, float networkPulse) {
  // Base emission color: cool blue-green bioluminescence
  vec3 coolEmit = hsv2rgb(vec3(hue1 + 0.5, 0.7, 1.0));
  // Warm shift from vocal presence
  vec3 warmEmit = hsv2rgb(vec3(hue2 + 0.08, 0.6, 1.0));
  vec3 emitColor = mix(coolEmit, warmEmit, vocalWarmth * 0.6);

  // Timbral brightness shifts emission temperature
  emitColor = mix(emitColor, vec3(0.9, 0.95, 1.0), timbralTemp * 0.2);

  // Pulsing intensity from network pulse (bass)
  float pulseIntensity = 0.5 + networkPulse * 0.5;

  // Spatial variation: emission is stronger at thread junctions
  float spatialMod = smoothstep(0.3, 0.8, fbm3(pos * 4.0)) * 0.5 + 0.5;

  return emitColor * glowAmount * pulseIntensity * spatialMod;
}

// ========================================================================
// Main
// ========================================================================

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float improvisation = clamp(uImprovisationScore, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === DERIVED PARAMETERS ===
  // Network pulse from bass (threads throb)
  float networkPulse = bass * (0.6 + beatSnap * 0.4);

  // Growth rate: jam=rapid, space=dormant
  float growthRate = mix(0.6, 1.0, energy) * mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace);

  // Complexity: tension + improvisation drive branching depth
  float complexity = 0.3 + tension * 0.4 + improvisation * 0.3;
  complexity *= mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace);

  // Bloom factor: chorus = full bloom with mushrooms, climax = eruption
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;
  float bloomFactor = mix(0.2, 0.7, sChorus) + climaxBoost * 0.8 + sSolo * 0.3;
  bloomFactor = clamp(bloomFactor, 0.1, 1.5);

  // Mushroom scale: melodic pitch + climax
  float mushroomScale = 0.6 + melodicPitch * 0.4 + climaxBoost * 1.5;

  // Drum pulse: nutrient signal burst
  float drumPulse = drumOnset * (0.5 + energy * 0.5);

  // === PALETTE ===
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.9, energy) * uPaletteSaturation;

  // === RAY SETUP ===
  vec3 rayOrigin, rayDir;
  setupCameraRay(uv, aspect, rayOrigin, rayDir);

  // Gentle camera drift underground
  float driftTime = uDynamicTime * (0.05 + slowEnergy * 0.03);
  rayOrigin.x += sin(driftTime * 0.7) * 0.5;
  rayOrigin.z += cos(driftTime * 0.5) * 0.5;
  rayOrigin.y = mix(-0.3, 0.5, 0.5 + 0.5 * sin(driftTime * 0.3)); // gentle vertical bob

  // === SOIL BACKGROUND COLOR ===
  vec3 soilDark = vec3(0.015, 0.01, 0.008);
  vec3 soilMid = vec3(0.04, 0.025, 0.018);

  // === RAYMARCH ===
  float totalDist = 0.0;
  vec3 marchPos = rayOrigin;
  float marchMatID = 0.0;
  float marchGlow = 0.0;
  bool marchFound = false;
  float accumulatedGlow = 0.0; // volumetric glow along ray

  // Energy-adaptive step count
  int marchSteps = int(mix(48.0, 80.0, energy));

  for (int stepIdx = 0; stepIdx < MN_MAX_STEPS; stepIdx++) {
    if (stepIdx >= marchSteps) break;
    marchPos = rayOrigin + rayDir * totalDist;
    vec3 mapResult = mnMap(marchPos, growthRate, complexity, networkPulse,
                           drumPulse, bloomFactor, mushroomScale);
    float dist = mapResult.x;
    marchMatID = mapResult.y;
    marchGlow = mapResult.z;

    // Accumulate volumetric glow even when not on surface
    accumulatedGlow += marchGlow * 0.03 * smoothstep(0.5, 0.0, dist);

    if (dist < MN_SURFACE_DIST) {
      marchFound = true;
      break;
    }
    totalDist += dist * 0.8; // cautious stepping for thin threads
    if (totalDist > MN_MAX_DIST) break;
  }

  // === BACKGROUND: deep soil with subtle texture ===
  vec3 col = soilDark;
  {
    float soilNoise = fbm3(vec3(screenPos * 3.0, driftTime * 0.1));
    col = mix(soilDark, soilMid, soilNoise * 0.3);
    // Depth fog color
    float skyHint = smoothstep(0.0, 0.3, rayDir.y);
    col = mix(col, soilMid * 1.5, skyHint * 0.2);
  }

  if (marchFound) {
    // === NORMAL + AO ===
    vec3 norm = mnNormal(marchPos, growthRate, complexity, networkPulse,
                         drumPulse, bloomFactor, mushroomScale);
    float occlusionVal = mnAmbientOcclusion(marchPos, norm, growthRate, complexity,
                                            networkPulse, drumPulse, bloomFactor, mushroomScale);

    // === LIGHTING SETUP ===
    // Primary bioluminescent light source (moves with network pulse)
    vec3 bioLightPos = vec3(
      sin(driftTime * 1.3) * 2.0,
      1.0 + bass * 0.5,
      cos(driftTime * 0.9) * 2.0
    );
    vec3 bioLightDir = normalize(bioLightPos - marchPos);
    float bioLightDist = length(bioLightPos - marchPos);
    float bioAtten = 1.0 / (1.0 + bioLightDist * bioLightDist * 0.15);

    // Secondary fill light from below (root glow)
    vec3 fillDir = normalize(vec3(0.0, -1.0, 0.0) - marchPos * 0.1);
    float fillStrength = 0.15 + bass * 0.1;

    // === MATERIAL SHADING ===
    vec3 surfaceCol = vec3(0.0);

    if (marchMatID < 0.5) {
      // Soil: dark, earthy, rough
      float soilTex = fbm6(marchPos * 12.0) * 0.5 + 0.5;
      vec3 soilColor = mix(
        vec3(0.06, 0.04, 0.03),
        vec3(0.1, 0.07, 0.04),
        soilTex
      );
      float diffuse = max(0.0, dot(norm, bioLightDir)) * bioAtten;
      surfaceCol = soilColor * (0.1 + diffuse * 0.4);

    } else if (marchMatID < 1.5) {
      // Mycelium thread: translucent, bioluminescent
      vec3 threadBase = hsv2rgb(vec3(hue1, sat * 0.6, 0.4 + energy * 0.2));

      // Diffuse lighting
      float diffuse = max(0.0, dot(norm, bioLightDir)) * bioAtten;

      // Subsurface scattering: light passing through translucent threads
      vec3 sssColor = hsv2rgb(vec3(hue1 + 0.1, sat * 0.8, 0.8));
      vec3 sss = mnSubsurface(marchPos, norm, bioLightDir, sssColor, 0.6 + vocalPresence * 0.3);

      // Emission: bioluminescent glow
      vec3 emission = mnBioluminescence(marchPos, marchGlow, vocalPresence, timbralBright,
                                        hue1, hue2, networkPulse);

      // Fresnel rim glow
      float fresnelVal = 1.0 - abs(dot(norm, -rayDir));
      fresnelVal = pow(fresnelVal, 3.0);
      vec3 rimColor = hsv2rgb(vec3(hue2, sat * 0.5, 0.9));

      surfaceCol = threadBase * (0.08 + diffuse * 0.3);
      surfaceCol += sss * 0.5;
      surfaceCol += emission * (0.6 + energy * 0.4);
      surfaceCol += rimColor * fresnelVal * 0.25;

      // Fill light from below
      float fillDiffuse = max(0.0, dot(norm, fillDir));
      surfaceCol += threadBase * fillDiffuse * fillStrength;

    } else {
      // Mushroom fruiting body: warm, fleshy, subsurface-scattered
      vec3 capBase = hsv2rgb(vec3(hue2 + 0.05, sat * 0.9, 0.5 + energy * 0.2));
      vec3 gillColor = hsv2rgb(vec3(hue1, sat * 0.7, 0.7));

      float diffuse = max(0.0, dot(norm, bioLightDir)) * bioAtten;

      // Subsurface for fleshy mushroom cap
      vec3 sssMushroomColor = mix(capBase, vec3(0.9, 0.6, 0.3), 0.3);
      vec3 sssMushroom = mnSubsurface(marchPos, norm, bioLightDir, sssMushroomColor, 0.8);

      // Specular highlight on cap (wet/dewy look)
      vec3 halfVec = normalize(bioLightDir - rayDir);
      float specularVal = pow(max(0.0, dot(norm, halfVec)), 32.0);

      // Gill detail on underside
      float isUnderside = smoothstep(0.0, -0.3, norm.y);

      surfaceCol = mix(capBase, gillColor, isUnderside * 0.6);
      surfaceCol *= (0.12 + diffuse * 0.4);
      surfaceCol += sssMushroom * 0.4;
      surfaceCol += vec3(1.0, 0.95, 0.85) * specularVal * 0.3;

      // Bioluminescent cap glow during bloom
      float capGlow = bloomFactor * (0.3 + energy * 0.3);
      vec3 capEmit = hsv2rgb(vec3(hue2 + 0.15, 0.5, 1.0));
      surfaceCol += capEmit * capGlow * 0.4;

      // Fill light
      float fillDiffuse = max(0.0, dot(norm, fillDir));
      surfaceCol += capBase * fillDiffuse * fillStrength;
    }

    // Apply ambient occlusion
    surfaceCol *= mix(0.3, 1.0, occlusionVal);

    // Distance fog into soil
    float fogAmount = 1.0 - exp(-totalDist * 0.08);
    vec3 fogColor = mix(soilDark, soilMid, 0.3);
    surfaceCol = mix(surfaceCol, fogColor, fogAmount);

    col = surfaceCol;
  }

  // === VOLUMETRIC GLOW (accumulated along ray even on miss) ===
  {
    vec3 volGlowColor = hsv2rgb(vec3(hue1 + 0.5, 0.6, 1.0));
    volGlowColor = mix(volGlowColor, vec3(0.8, 0.9, 1.0), timbralBright * 0.3);
    col += volGlowColor * accumulatedGlow * (0.4 + energy * 0.6);
  }

  // === NUTRIENT SIGNAL BURST (drum onset pulse wave) ===
  if (drumPulse > 0.05) {
    float pulseRadius = fract(uDynamicTime * 0.8) * 8.0;
    float pulseDist = abs(length(marchPos - rayOrigin) - pulseRadius);
    float pulseRing = smoothstep(0.3, 0.0, pulseDist) * drumPulse;
    vec3 pulseColor = hsv2rgb(vec3(hue2 + 0.2, 0.8, 1.0));
    col += pulseColor * pulseRing * 0.3;
  }

  // === SPORE PARTICLES (spectral flux driven) ===
  float sporeDensity = spectralFlux * energy * 0.6;
  if (sporeDensity > 0.02) {
    for (int spIdx = 0; spIdx < 12; spIdx++) {
      float spSeed = float(spIdx) * 5.79 + floor(uDynamicTime * 1.5) * 11.0;
      vec3 spH = mnHash3(spSeed);
      vec2 sporeUV = (spH.xy - 0.5) * 1.2;
      float sporeDist = length(screenPos - sporeUV);
      float sporeGlow = smoothstep(0.015, 0.003, sporeDist);
      float sporePulse = 0.4 + 0.6 * sin(uDynamicTime * 2.5 + spH.z * MN_TAU);
      vec3 sporeColor = hsv2rgb(vec3(hue1 + spH.z * 0.1, sat * 0.4, 1.0));
      col += sporeColor * sporeGlow * sporePulse * sporeDensity * 0.25;
    }
  }

  // === CLIMAX: MASSIVE FRUITING ERUPTION ===
  if (climaxBoost > 0.1) {
    // Radial burst of light from below
    float eruptDist = length(screenPos);
    float eruptGlow = smoothstep(0.8, 0.0, eruptDist) * climaxBoost;
    vec3 eruptColor = hsv2rgb(vec3(hue2 + 0.1, 0.7, 1.0));
    col += eruptColor * eruptGlow * 0.5;

    // Extra volumetric intensity at climax
    col *= 1.0 + climaxBoost * 0.4;
  }

  // === BEAT PULSE (rhythmic brightness swell) ===
  col *= 1.0 + beatSnap * 0.08 * (1.0 + climaxBoost * 0.2);

  // === SDF ICON EMERGENCE ===
  {
    float iconNoise = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.08));
    vec3 iconCol1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 iconCol2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenPos, uTime, energy, bass, iconCol1, iconCol2,
                         iconNoise, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, iconCol1, iconCol2,
                             iconNoise, uSectionIndex);
  }

  // === VIGNETTE (underground darkness at edges) ===
  {
    float vigStr = mix(0.3, 0.22, energy);
    float vigMask = 1.0 - dot(screenPos * vigStr, screenPos * vigStr);
    vigMask = smoothstep(0.0, 1.0, vigMask);
    col = mix(soilDark, col, vigMask);
  }

  // === POST-PROCESSING ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
