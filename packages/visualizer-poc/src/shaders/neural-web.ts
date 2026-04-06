/**
 * Neural Web — raymarched 3D neural network.
 * Neuron cell bodies (sphere SDFs) connected by axon cylinders with synaptic
 * signal pulses. Dendritic trees branch outward. Network fires in patterns
 * synced to music. Wet membrane specular, synaptic emission glow, AO.
 *
 * Audio reactivity:
 *   uBass             → network-wide pulse (neuron inflation, axon throb)
 *   uEnergy           → firing rate, connection density, step count
 *   uDrumOnset        → massive synchronized firing (all neurons flash)
 *   uVocalPresence    → warm neural glow (membrane subsurface)
 *   uHarmonicTension  → network chaos (jitter, branching angle spread)
 *   uSectionType      → jam=rapid firing, space=resting state, chorus=sync waves
 *   uClimaxPhase      → cascade activation lighting up entire network
 *   uMelodicPitch     → signal hue shift along axons
 *   uBeatSnap         → synchronous pulse wave across network
 *   uTimbralBrightness→ specular sharpness on membranes
 *   uSpaceScore       → resting-state drift speed
 *   uSlowEnergy       → ambient neural hum
 *   uMids             → dendritic branching density
 *   uStemDrums        → cascade amplification
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const neuralWebVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  temporalBlendEnabled: true,
  dofEnabled: true,
});

export const neuralWebFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define NW_PI  3.14159265
#define NW_TAU 6.28318530
#define NW_MAX_DIST 40.0
#define NW_SURF_DIST 0.002
#define NW_EPS 0.001

// ─── Hashing ───

float nwHash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec3 nwHash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453);
}

// ─── SDF primitives ───

float nwSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float nwCapsule(vec3 pos, vec3 capA, vec3 capB, float radius) {
  vec3 pa = pos - capA;
  vec3 ba = capB - capA;
  float projection = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * projection) - radius;
}

float nwSmoothMin(float distA, float distB, float blend) {
  float halfDiff = clamp(0.5 + 0.5 * (distB - distA) / blend, 0.0, 1.0);
  return mix(distB, distA, halfDiff) - blend * halfDiff * (1.0 - halfDiff);
}

// ─── Neuron layout ───
// Returns world-space position of the i-th neuron in layer l.
// Network is arranged as a 3D lattice with organic displacement.

vec3 nwNeuronPos(float neuronId, float flowTime, float chaos) {
  vec3 seed = nwHash3(vec3(neuronId * 1.7, neuronId * 0.3 + 5.0, neuronId * 2.1 + 11.0));
  // Base lattice position mapped to a sphere-ish volume
  vec3 basePos = (seed - 0.5) * vec3(6.0, 4.0, 6.0);
  // Organic drift
  vec3 drift = vec3(
    sin(flowTime * 0.3 + seed.x * NW_TAU) * 0.3,
    cos(flowTime * 0.25 + seed.y * NW_TAU) * 0.25,
    sin(flowTime * 0.2 + seed.z * NW_TAU) * 0.3
  );
  // Chaos jitter from harmonic tension
  vec3 chaosJitter = (nwHash3(vec3(neuronId + flowTime * 0.5)) - 0.5) * chaos * 0.6;
  return basePos + drift + chaosJitter;
}

// ─── Neuron (cell body) SDF ───

float nwNeuron(vec3 pos, vec3 center, float radius, float bass, float firingStrength) {
  float baseDist = nwSphere(pos - center, radius);
  // Bass pulse inflates neuron bodies
  float pulseRadius = radius * (1.0 + bass * 0.25 + firingStrength * 0.3);
  float pulseDist = nwSphere(pos - center, pulseRadius);
  return mix(baseDist, pulseDist, 0.6);
}

// ─── Axon (connection) SDF with synaptic signal ───

float nwAxon(vec3 pos, vec3 nodeA, vec3 nodeB, float baseRadius, float bass) {
  float radius = baseRadius * (1.0 + bass * 0.3);
  return nwCapsule(pos, nodeA, nodeB, radius);
}

// ─── Synapse signal position along an axon (0-1 parameter) ───

float nwSynapseParam(float neuronIdA, float neuronIdB, float flowTime, float firingRate) {
  float phase = nwHash(neuronIdA * 13.7 + neuronIdB * 7.3);
  return fract(flowTime * firingRate * 0.4 + phase);
}

// ─── Dendrite branch SDF (smaller branching capsules off neuron) ───

float nwDendrite(vec3 pos, vec3 neuronCenter, float neuronId, float flowTime, float branchDensity) {
  float minDist = 1e5;
  for (int branch = 0; branch < 5; branch++) {
    float fb = float(branch);
    if (fb >= branchDensity * 5.0) break;
    vec3 seed = nwHash3(vec3(neuronId, fb, 42.0));
    vec3 direction = normalize(seed - 0.5);
    // Branches sway gently
    float sway = sin(flowTime * 0.5 + fb * 1.3) * 0.15;
    direction.xz += sway;
    direction = normalize(direction);
    float branchLen = 0.3 + seed.z * 0.4;
    vec3 tipPos = neuronCenter + direction * branchLen;
    float radius = 0.015 * (1.0 - fb / 5.0 * 0.6); // taper
    float dist = nwCapsule(pos, neuronCenter, tipPos, radius);
    minDist = min(minDist, dist);
  }
  return minDist;
}

// ─── Complete scene SDF ───

#define NW_NEURON_COUNT 12
#define NW_CONNECTION_COUNT 16

// Material IDs: 0=nothing, 1=neuron body, 2=axon, 3=dendrite, 4=synapse glow
struct NwResult {
  float dist;
  float matId;
  float firingStrength;
  float synapseGlow;
};

NwResult nwMap(vec3 pos, float flowTime, float bass, float energy, float chaos,
               float firingRate, float branchDensity, float drumSync) {
  NwResult result;
  result.dist = NW_MAX_DIST;
  result.matId = 0.0;
  result.firingStrength = 0.0;
  result.synapseGlow = 0.0;

  // ─── Neuron cell bodies ───
  for (int idx = 0; idx < NW_NEURON_COUNT; idx++) {
    float neuronId = float(idx);
    vec3 center = nwNeuronPos(neuronId, flowTime, chaos);

    // Per-neuron firing: hash-based threshold
    float fireThresh = nwHash(neuronId * 5.3 + floor(flowTime * firingRate));
    float isFiring = smoothstep(0.5, 0.7, fireThresh) + drumSync;
    isFiring = clamp(isFiring, 0.0, 1.0);

    float neuronRadius = 0.12 + nwHash(neuronId) * 0.06;
    float neuronDist = nwNeuron(pos, center, neuronRadius, bass, isFiring);

    // Dendrites
    float dendDist = nwDendrite(pos, center, neuronId, flowTime, branchDensity);

    float combined = nwSmoothMin(neuronDist, dendDist, 0.06);

    if (combined < result.dist) {
      result.dist = combined;
      result.matId = neuronDist < dendDist ? 1.0 : 3.0;
      result.firingStrength = isFiring;
    }
  }

  // ─── Axon connections ───
  for (int conn = 0; conn < NW_CONNECTION_COUNT; conn++) {
    float fc = float(conn);
    // Deterministic connection pairs
    float idA = mod(fc * 3.7, float(NW_NEURON_COUNT));
    float idB = mod(fc * 5.3 + 2.0, float(NW_NEURON_COUNT));
    // Skip self-connections
    if (abs(idA - idB) < 0.5) continue;

    vec3 posA = nwNeuronPos(floor(idA), flowTime, chaos);
    vec3 posB = nwNeuronPos(floor(idB), flowTime, chaos);

    // Only draw connections within a density radius (energy controls density)
    float connLen = length(posA - posB);
    float maxLen = 3.5 + energy * 3.0;
    if (connLen > maxLen) continue;

    float axonRadius = 0.018 + energy * 0.008;
    float axonDist = nwAxon(pos, posA, posB, axonRadius, bass);

    // Synapse glow: point of light traveling along axon
    float synParam = nwSynapseParam(floor(idA), floor(idB), flowTime, firingRate);
    vec3 synPos = mix(posA, posB, synParam);
    float synDist = length(pos - synPos);
    float synGlow = exp(-synDist * 12.0) * (0.5 + energy * 0.5);

    if (axonDist < result.dist) {
      result.dist = axonDist;
      result.matId = 2.0;
      result.firingStrength = 0.0;
    }
    // Synapse glow accumulates additively
    result.synapseGlow += synGlow;
  }

  return result;
}

// ─── Normal estimation (central differences) ───

vec3 nwNormal(vec3 pos, float flowTime, float bass, float energy, float chaos,
              float firingRate, float branchDensity, float drumSync) {
  vec2 offset = vec2(NW_EPS, 0.0);
  float distCenter = nwMap(pos, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync).dist;
  return normalize(vec3(
    nwMap(pos + offset.xyy, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync).dist - distCenter,
    nwMap(pos + offset.yxy, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync).dist - distCenter,
    nwMap(pos + offset.yyx, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync).dist - distCenter
  ));
}

// ─── Soft AO (ambient occlusion) ───

float nwOcclusion(vec3 pos, vec3 norm, float flowTime, float bass, float energy,
                  float chaos, float firingRate, float branchDensity, float drumSync) {
  float occl = 0.0;
  float weight = 1.0;
  for (int step = 0; step < 5; step++) {
    float sampleDist = 0.02 + float(step) * 0.06;
    float sampledScene = nwMap(pos + norm * sampleDist, flowTime, bass, energy, chaos,
                               firingRate, branchDensity, drumSync).dist;
    occl += weight * (sampleDist - sampledScene);
    weight *= 0.6;
  }
  return clamp(1.0 - occl * 3.0, 0.0, 1.0);
}

// ─── Main ───

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // Audio uniforms
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.12;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Derived parameters
  float firingRate = mix(1.0, 2.5, energy) * mix(1.0, 1.8, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.3, sChorus);
  float branchDensity = 0.4 + mids * 0.6;
  float chaos = tension * 0.8 + (1.0 - stability) * 0.2;
  float drumSync = (drumOnset + stemDrums * 0.4) * mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace);

  float flowTime = uDynamicTime * (0.06 + slowEnergy * 0.04) * mix(1.0, 1.3, sJam) * mix(1.0, 0.4, sSpace)
                   * (1.0 + spaceScore * 0.3);

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === PALETTE ===
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 palPrimary = 0.5 + 0.5 * cos(NW_TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 palSecondary = 0.5 + 0.5 * cos(NW_TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === CAMERA RAY ===
  vec3 rayOrigin, rayDir;
  setupCameraRay(uv, aspect, rayOrigin, rayDir);

  // === RAYMARCH ===
  int maxSteps = int(mix(60.0, 90.0, energy));
  float totalDist = 0.0;
  NwResult sceneResult;
  sceneResult.dist = NW_MAX_DIST;
  sceneResult.matId = 0.0;
  sceneResult.firingStrength = 0.0;
  sceneResult.synapseGlow = 0.0;

  bool surfaceFound = false;
  float accumulatedSynapseGlow = 0.0;

  for (int marchStep = 0; marchStep < 90; marchStep++) {
    if (marchStep >= maxSteps) break;
    vec3 marchPos = rayOrigin + rayDir * totalDist;
    sceneResult = nwMap(marchPos, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync);

    // Accumulate synapse glow along ray (volumetric)
    accumulatedSynapseGlow += sceneResult.synapseGlow * 0.015;

    if (sceneResult.dist < NW_SURF_DIST) {
      surfaceFound = true;
      break;
    }
    if (totalDist > NW_MAX_DIST) break;
    totalDist += sceneResult.dist * 0.8; // slight overshoot protection
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  // Background: deep neural void with subtle organic noise
  vec3 bgNoise = vec3(fbm3(vec3(screenPos * 1.5, flowTime * 0.05)));
  vec3 bgColor = vec3(0.008, 0.005, 0.018) + bgNoise * 0.015;
  // Resting-state shimmer during space sections
  bgColor += vec3(0.01, 0.008, 0.02) * sSpace * (0.5 + 0.5 * sin(flowTime * 0.3 + screenPos.x * 2.0));

  if (surfaceFound) {
    vec3 surfPos = rayOrigin + rayDir * totalDist;
    vec3 normal = nwNormal(surfPos, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync);
    float occl = nwOcclusion(surfPos, normal, flowTime, bass, energy, chaos, firingRate, branchDensity, drumSync);

    // Light directions
    vec3 lightDir1 = normalize(vec3(0.5, 1.0, 0.3));
    vec3 lightDir2 = normalize(vec3(-0.4, 0.3, -0.6));
    vec3 viewDir = normalize(rayOrigin - surfPos);

    // Diffuse
    float diffuse1 = max(dot(normal, lightDir1), 0.0);
    float diffuse2 = max(dot(normal, lightDir2), 0.0) * 0.4;

    // Wet membrane specular (Blinn-Phong with timbral brightness controlling sharpness)
    vec3 halfVec1 = normalize(lightDir1 + viewDir);
    float specPower = mix(16.0, 64.0, timbralBright);
    float specular1 = pow(max(dot(normal, halfVec1), 0.0), specPower);
    vec3 halfVec2 = normalize(lightDir2 + viewDir);
    float specular2 = pow(max(dot(normal, halfVec2), 0.0), specPower * 0.5) * 0.3;

    // Fresnel (rim glow for membrane feel)
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    // Material color based on matId
    vec3 matColor;
    float matEmission = 0.0;

    if (sceneResult.matId < 1.5) {
      // Neuron body: palette primary, firing = bright emission
      matColor = palPrimary * 0.6;
      matEmission = sceneResult.firingStrength * 1.5;
      // Vocal presence adds warm subsurface glow
      matColor += vec3(0.15, 0.08, 0.03) * vocalPresence * 0.5;
    } else if (sceneResult.matId < 2.5) {
      // Axon: darker, slightly translucent
      matColor = mix(palPrimary, palSecondary, 0.5) * 0.3;
      matColor += vec3(0.02, 0.04, 0.06); // slight blue tint
    } else {
      // Dendrite: secondary palette, organic
      matColor = palSecondary * 0.4;
      matColor += vec3(0.03, 0.02, 0.01) * mids;
    }

    // Melodic pitch shifts signal hue
    matColor = mix(matColor, matColor.gbr, melodicPitch * 0.2 + chromaHueMod);

    // Compose lighting
    vec3 ambient = matColor * 0.08 * occl;
    vec3 diffuseLight = matColor * (diffuse1 + diffuse2) * occl;
    vec3 specLight = vec3(0.7, 0.75, 0.9) * (specular1 + specular2) * (0.3 + timbralBright * 0.4);
    vec3 rimLight = palSecondary * fresnel * 0.35 * (1.0 + energy * 0.5);

    // Emission from firing neurons
    vec3 fireEmission = vec3(0.0);
    if (matEmission > 0.01) {
      vec3 fireColor = mix(palPrimary, vec3(1.0, 0.9, 0.7), 0.4) * matEmission;
      fireEmission = fireColor * (1.0 + climaxIntensity * 1.5);
    }

    col = ambient + diffuseLight + specLight + rimLight + fireEmission;

    // Vocal warm glow: subsurface-like contribution
    col += matColor * vocalPresence * 0.15 * occl;

    // Distance fog for depth
    float fogFactor = 1.0 - exp(-totalDist * 0.04);
    col = mix(col, bgColor, fogFactor * 0.6);
  } else {
    col = bgColor;
  }

  // === VOLUMETRIC SYNAPSE GLOW (accumulated along ray) ===
  vec3 synapseColor = mix(palPrimary, palSecondary, 0.5 + 0.5 * sin(flowTime * 0.4));
  synapseColor = mix(synapseColor, vec3(1.0, 0.95, 0.8), 0.3); // warm bias
  col += synapseColor * accumulatedSynapseGlow * (0.8 + energy * 0.6);

  // === DRUM ONSET: synchronized firing flash ===
  if (drumOnset > 0.3) {
    float flashStr = (drumOnset - 0.3) * 1.43;
    // Radial pulse wave from center
    float pulseWave = exp(-abs(totalDist - flowTime * 4.0) * 0.5) * flashStr;
    vec3 flashColor = mix(palPrimary, vec3(1.0, 0.95, 0.85), 0.5);
    col += flashColor * (flashStr * 0.15 + pulseWave * 0.2);
  }

  // === BEAT SNAP: synchronous wave ===
  {
    float syncWave = beatSnap * 0.12 * (1.0 + climaxIntensity * 0.4);
    col *= 1.0 + syncWave;
  }

  // === CHORUS: synchronized traveling waves ===
  if (sChorus > 0.01) {
    float wavePhase = sin(screenPos.x * 4.0 + flowTime * 2.0) * 0.5 + 0.5;
    col += palSecondary * wavePhase * sChorus * 0.06 * energy;
  }

  // === JAM PHASE FEEDBACK ===
  {
    vec4 prevFrame = texture2D(uPrevFrame, vUv);
    float feedbackDecay = 0.92;
    if (uJamPhase >= 0.0) {
      float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
      float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
      float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
      float jpResolve = step(2.5, uJamPhase);
      feedbackDecay += jpExplore * 0.03 + jpBuild * 0.02 + jpPeak * 0.04 - jpResolve * 0.06;
      feedbackDecay = clamp(feedbackDecay, 0.80, 0.96);
    }
    col = mix(col, max(col, prevFrame.rgb * 0.9), feedbackDecay * 0.3);
  }

  // === CLIMAX: cascade activation ===
  if (climaxIntensity > 0.01) {
    // Entire network lights up: bright emission wash
    float cascadeNoise = fbm3(vec3(screenPos * 3.0, flowTime * 0.5));
    vec3 cascadeColor = mix(palPrimary, palSecondary, cascadeNoise * 0.5 + 0.5);
    cascadeColor = mix(cascadeColor, vec3(1.0, 0.95, 0.9), 0.3);
    col += cascadeColor * climaxIntensity * 0.2 * (0.5 + cascadeNoise * 0.5);
    // Bloom boost
    col *= 1.0 + climaxIntensity * 0.4;
  }

  // === SOLO: dramatic spotlight ===
  if (sSolo > 0.01) {
    float spotDist = length(screenPos);
    float spotlight = exp(-spotDist * spotDist * 3.0) * sSolo;
    col *= 1.0 + spotlight * 0.3;
  }

  // === SEMANTIC MODULATION ===
  col *= 1.0 + uSemanticCosmic * 0.12;
  col *= 1.0 + uSemanticPsychedelic * 0.08;
  // Tender → warmer tint
  col = mix(col, col * vec3(1.05, 1.0, 0.92), uSemanticTender * 0.15);

  // === SDF ICON EMERGENCE ===
  {
    float iconNoise = fbm3(vec3(screenPos * 2.0, uTime * 0.1));
    vec3 iconCol1 = palPrimary;
    vec3 iconCol2 = palSecondary;
    col += iconEmergence(screenPos, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, uv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
