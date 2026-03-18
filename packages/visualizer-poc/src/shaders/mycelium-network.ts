/**
 * Mycelium Network — organic branching fungal growth with spore bursts.
 * Hyphal threads extend along FBM flow fields from beat nucleation sites.
 * Growth state persists in feedback RG channels (R = growth density, G = age).
 *
 * Feedback: Yes (simulation state in RG channels of uPrevFrame)
 *
 * Audio reactivity:
 *   uEnergy             → growth rate (evolution speed)
 *   uBass               → root depth / trunk thickness
 *   uMids               → branching frequency
 *   uBeatSnap           → spore burst nucleation
 *   uVocalPresence      → bioluminescent glow
 *   uSectionType        → growth pattern (radial vs linear vs clustered)
 *   uImprovisationScore → branching randomness
 *   uHarmonicTension    → growth vs decay balance
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const myceliumNetworkVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const myceliumNetworkFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Read growth state from previous frame
// R = growth density (0 = empty, 1 = mature hypha)
// G = age/nutrient (accumulates over time, decays naturally)
vec2 readState(vec2 uv) {
  vec4 prev = texture2D(uPrevFrame, uv);
  return prev.rg;
}

// Compute FBM-based flow field direction at a point
vec2 flowField(vec2 p, float t, float improvisation) {
  // Base curl-like flow from FBM gradients
  float eps = 0.01;
  float n1 = fbm3(vec3(p + vec2(eps, 0.0), t));
  float n2 = fbm3(vec3(p - vec2(eps, 0.0), t));
  float n3 = fbm3(vec3(p + vec2(0.0, eps), t));
  float n4 = fbm3(vec3(p - vec2(0.0, eps), t));
  // Perpendicular to gradient = divergence-free flow
  vec2 flow = vec2(n3 - n4, -(n1 - n2)) / (2.0 * eps);
  // Improvisation adds chaotic perturbation
  flow += improvisation * vec2(
    snoise(vec3(p * 8.0, t * 2.0)),
    snoise(vec3(p * 8.0 + 50.0, t * 2.0))
  ) * 0.4;
  return normalize(flow + vec2(0.001));
}

// Distance from a branching hyphal segment
float hyphalSegment(vec2 p, vec2 start, vec2 dir, float len, float thickness) {
  vec2 d = p - start;
  float t = clamp(dot(d, dir), 0.0, len);
  float dist = length(d - dir * t);
  return smoothstep(thickness, thickness * 0.3, dist);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float sectionType = clamp(uSectionType, 0.0, 7.0);
  float improvisation = clamp(uImprovisationScore, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.03;
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  // --- Read previous frame state ---
  vec2 texel = 1.0 / uResolution;
  vec2 state = readState(uv);
  float growth = state.x;   // growth density
  float age = state.y;      // nutrient / age

  // --- Growth propagation: sample neighbors along flow field ---
  vec2 flow = flowField(p, slowTime, improvisation);

  // Directional growth: sample upstream neighbor (growth flows along flow field)
  float growthRate = 0.3 + energy * 1.2;
  float branchFreq = 0.5 + mids * 1.5;

  // 8-neighbor growth sampling with flow-field bias
  float neighborGrowth = 0.0;
  float maxNeighbor = 0.0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      if (dx == 0 && dy == 0) continue;
      vec2 offset = vec2(float(dx), float(dy));
      vec2 neighborUv = uv + offset * texel * (1.0 + bass * 0.5);
      vec2 nState = readState(neighborUv);
      // Weight by flow field alignment (growth prefers flow direction)
      float flowAlign = dot(normalize(offset), flow) * 0.5 + 0.5;
      float weight = 0.125 + flowAlign * 0.2;
      neighborGrowth += nState.x * weight;
      maxNeighbor = max(maxNeighbor, nState.x);
    }
  }

  // --- Growth rules ---
  // Trunk thickness from bass: thicker root trunks when bass is heavy
  float trunkThickness = 0.02 + bass * 0.03;

  // Branching: new growth appears where neighbor density hits threshold
  float branchThreshold = mix(0.35, 0.15, branchFreq / 2.0);
  float canGrow = step(branchThreshold, neighborGrowth) * step(neighborGrowth, 0.8);

  // Growth vs decay balance from harmonic tension
  float decayRate = mix(0.005, 0.02, tension);
  float growthPush = canGrow * growthRate * 0.02;

  // Apply growth step
  float newGrowth = growth + growthPush - decayRate;

  // --- Section type drives growth pattern ---
  // 0=radial, 1=linear, 2=clustered, 3-7=mixed
  float sectionMod = mod(sectionType, 3.0);
  if (sectionMod < 1.0) {
    // Radial: growth radiates from center
    float radialBias = 1.0 - smoothstep(0.0, 0.5, length(p));
    newGrowth += growthPush * radialBias * 0.5;
  } else if (sectionMod < 2.0) {
    // Linear: growth flows horizontally
    float linearBias = 1.0 - abs(p.y) * 2.0;
    linearBias = clamp(linearBias, 0.0, 1.0);
    newGrowth += growthPush * linearBias * 0.3;
  } else {
    // Clustered: growth clumps around noise centers
    float clusterNoise = snoise(vec3(p * 4.0, slowTime * 0.5));
    float clusterBias = smoothstep(0.2, 0.6, clusterNoise);
    newGrowth += growthPush * clusterBias * 0.4;
  }

  // --- Beat snap: spore burst nucleation ---
  if (beatSnap > 0.5) {
    // Spore sites: random positions from noise
    float sporeNoise = snoise(vec3(p * 12.0, floor(uDynamicTime * 4.0)));
    if (sporeNoise > 0.6 - beatSnap * 0.3) {
      // Nucleate new growth point
      newGrowth = max(newGrowth, 0.6 + beatSnap * 0.3);
      age = 0.0; // fresh growth
    }
  }

  // --- Initialize on first frame ---
  vec4 rawPrev = texture2D(uPrevFrame, uv);
  if (rawPrev.a < 0.01) {
    // Seed: sparse random spore sites
    float seedNoise = snoise(vec3(p * 6.0, 0.0));
    if (seedNoise > 0.7) {
      newGrowth = 0.5;
      age = 0.0;
    } else {
      newGrowth = 0.0;
      age = 0.0;
    }
  }

  // Age accumulates where growth exists
  float newAge = age + step(0.1, newGrowth) * 0.005;

  // Clamp state
  newGrowth = clamp(newGrowth, 0.0, 1.0);
  newAge = clamp(newAge, 0.0, 1.0);

  // --- Hyphal thread rendering ---
  // Render visible structure from growth state
  float hyphaIntensity = smoothstep(0.1, 0.4, newGrowth);

  // Branching detail: FBM adds fine filament structure
  float filaments = fbm6(vec3(p * 25.0 + flow * 2.0, slowTime * 0.5));
  filaments = smoothstep(0.1, 0.5, filaments) * hyphaIntensity;

  // Trunk rendering: thicker near high-growth areas
  float trunkDensity = smoothstep(0.5, 0.9, newGrowth);
  float trunk = smoothstep(trunkThickness * 2.0, trunkThickness * 0.5, abs(filaments - 0.5)) * trunkDensity;

  // Branching tips: bright growing edges
  float tipGlow = smoothstep(0.2, 0.35, newGrowth) * (1.0 - smoothstep(0.35, 0.6, newGrowth));
  tipGlow *= 2.0;

  // --- Color palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.4, 0.85, energy) * uPaletteSaturation;

  // Base background: deep dark substrate
  float bgR = 0.01;
  float bgG = 0.008;
  float bgB = 0.02;
  vec3 col = vec3(bgR, bgG, bgB);

  // Mycelium body color: aged hyphae shift hue
  float ageHueShift = newAge * 0.1;
  vec3 hyphaColor = hsv2rgb(vec3(hue1 + ageHueShift, sat, 0.5 + energy * 0.3));
  vec3 tipColor = hsv2rgb(vec3(hue2, sat * 1.2, 0.9));
  vec3 trunkColor = hsv2rgb(vec3(hue1 - 0.05, sat * 0.7, 0.3 + bass * 0.2));

  // Compose mycelium structure
  col += hyphaColor * filaments * 0.6;
  col += trunkColor * trunk * 0.4;
  col += tipColor * tipGlow * 0.8;

  // --- Bioluminescent glow from vocal presence ---
  if (vocalPresence > 0.05) {
    // Glow emanates from mature growth areas
    float bioGlow = smoothstep(0.5, 0.9, newGrowth) * vocalPresence;
    float bioFlicker = 0.7 + 0.3 * sin(uDynamicTime * 3.0 + newAge * 10.0);
    vec3 bioColor = hsv2rgb(vec3(hue2 + 0.15, sat * 0.6, 1.0));
    col += bioColor * bioGlow * bioFlicker * 0.4;
  }

  // --- Spore particles: floating on beat ---
  float sporeVisibility = beatSnap * energy;
  if (sporeVisibility > 0.05) {
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float seed = fi * 7.31 + floor(uDynamicTime * 2.0) * 13.0;
      vec2 sporePos = vec2(
        snoise(vec3(seed, uDynamicTime * 0.3, 0.0)) * 0.6,
        snoise(vec3(0.0, seed, uDynamicTime * 0.25)) * 0.4
      );
      float dist = length(p - sporePos);
      float sporeGlow = smoothstep(0.025, 0.005, dist);
      float sporePulse = 0.5 + 0.5 * sin(uDynamicTime * 4.0 + fi * 2.0);
      vec3 sporeColor = hsv2rgb(vec3(hue1 + fi * 0.05, sat * 0.5, 1.0));
      col += sporeColor * sporeGlow * sporePulse * sporeVisibility * 0.3;
    }
  }

  // --- Nutrient network: subtle glowing veins under the surface ---
  float veinNoise = ridgedMultifractal(vec3(p * 10.0, slowTime * 0.2), 5, 2.2, 0.5);
  float veinMask = smoothstep(0.4, 0.7, veinNoise) * hyphaIntensity * 0.3;
  vec3 veinColor = hsv2rgb(vec3(hue1 + 0.3, sat * 0.4, 0.6));
  col += veinColor * veinMask;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.1;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(bgR, bgG, bgB), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Store state in RG channels, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor.r = mix(col.r, newGrowth, 0.5);
  gl_FragColor.g = mix(col.g, newAge, 0.5);
}
`;
