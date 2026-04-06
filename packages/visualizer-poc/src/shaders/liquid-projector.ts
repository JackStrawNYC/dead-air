/**
 * Liquid Projector — colored oils mixing on an overhead projector glass.
 * The ACTUAL visual technology used at Dead shows 1966-1995.
 * Bill Ham and Glenn McKay pioneered this: colored mineral oils, water,
 * and dyes on a heated glass plate projected onto a wall.
 * Bubbles form, colors bleed, layers separate and merge.
 *
 * Multi-layer oil simulation with bubble formation, surface tension,
 * heat convection, and warm amber projector bulb base tone.
 * Very organic, warm, analog — the opposite of digital/computational.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const liquidProjectorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const liquidProjectorFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;


${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, halationEnabled: true, lightLeakEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Bubble shape: threshold FBM into circular bubble forms ---
float bubbleShape(float noiseVal, float threshold, float sharpness) {
  float raw = smoothstep(threshold - sharpness, threshold + sharpness * 0.3, noiseVal);
  return raw * raw; // squared for rounder bubble edges
}

// --- Surface tension lines: sharp edges where oil layers meet ---
float surfaceTension(float field1, float field2, float lineWidth) {
  float interface_ = abs(field1 - field2);
  return smoothstep(lineWidth, lineWidth * 0.15, interface_);
}

// --- Bubble edge highlight: bright rim from light refraction ---
float bubbleRim(float bubbleField, float rimWidth) {
  float edge = abs(bubbleField - 0.5);
  return smoothstep(rimWidth, rimWidth * 0.2, edge);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Uniform clamping ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tempoScale = uLocalTempo / 120.0;
  float sectionSeed = uSectionIndex * 5.7;

  // --- Energy-squared for brightness scaling (quiet = very dark) ---
  float energySq = energy * energy;

  // --- Section type modulation ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: faster convection, more bubbles. Space: nearly frozen, minimal.
  // Chorus: vivid colors, active. Solo: dramatic contrasts.
  float convectMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.2, sChorus);
  float bubbleRateMod = mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.3, sChorus);
  float satMod = mix(1.0, 1.15, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.25, sChorus) * mix(1.0, 1.1, sSolo);
  float peakMod = 1.0 + uPeakApproaching * 0.3;

  // --- Coherence morphology: coherent=stable, incoherent=chaotic ---
  float coherenceMix = clamp(uCoherence, 0.0, 1.0);
  float driftSpeed = mix(0.04, 0.015, coherenceMix); // halved: incoherent = faster drift
  float bubbleThresholdShift = mix(0.05, -0.02, coherenceMix); // incoherent = more bubbles

  // Time: very slow — oils drift, they don't snap (halved for contemplative pacing)
  float t = uDynamicTime * 0.02 * tempoScale * convectMod * peakMod;

  // --- Domain warping + energy-responsive detail (halved time multipliers) ---
  vec2 domainWarpOff = vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.025)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.025))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // --- Audio integration ---
  float vocalWarmth = uVocalPresence * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float tensionDrive = uHarmonicTension * 0.2;
  float directionDrift = uMelodicDirection * 0.015;

  // --- Heat convection: bass drives vertical drift (hot oil rises) ---
  float heatPulse = uBass * 0.02 + uFastBass * 0.01;
  vec2 convection = vec2(
    snoise(vec3(p.x * 2.0, uDynamicTime * 0.025, sectionSeed)) * 0.005,
    -(heatPulse + directionDrift) * convectMod
  );

  // --- Heat shimmer: gentle UV displacement from projector bulb heat (halved) ---
  float shimmerX = snoise(vec3(p * 3.0, uDynamicTime * 0.075)) * 0.008;
  float shimmerY = snoise(vec3(p * 3.0 + 5.0, uDynamicTime * 0.06)) * 0.01;
  vec2 shimmer = vec2(shimmerX, shimmerY) * (0.5 + energy * 0.5);
  p += shimmer;

  // ===========================================================
  // LAYER 1: Large slow-moving oil blobs (mineral oil base)
  // ===========================================================
  vec3 layer1Pos = vec3(p * 0.4 + convection * 0.5, t * 0.2 + sectionSeed);
  // Domain warp for organic flow
  float w1a = fbm6(layer1Pos + vec3(2.3, 8.1, 0.0));
  float w1b = fbm6(layer1Pos + vec3(7.4, 1.6, 0.0));
  vec3 warped1 = vec3(p + vec2(w1a, w1b) * (0.5 + slowE * 0.3), t * 0.15);
  // Curl noise advection — oil flows, doesn't teleport
  warped1.xy += curlNoise(vec3(warped1.xy * 0.8, uDynamicTime * driftSpeed)).xy * 0.12;

  float layer1Raw = fbm6(warped1 * 0.6);
  float layer1 = bubbleShape(layer1Raw, 0.08 + bubbleThresholdShift, 0.12 / bubbleRateMod);

  // Color: primary palette with warm amber bias (brightness scales with energy^2)
  float hue1 = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.2 + chordHue;
  vec3 col1 = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  col1 *= mix(0.04, 0.9, energySq);

  // ===========================================================
  // LAYER 2: Medium bubble formations (dye drops)
  // ===========================================================
  vec3 layer2Pos = vec3(p * 0.7 + vec2(0.3, -0.15) + convection, t * 0.3 + sectionSeed * 0.6);
  float w2a = fbm3(layer2Pos + vec3(4.2, 6.3, 0.0));
  float w2b = fbm3(layer2Pos + vec3(9.1, 3.5, 0.0));
  vec3 warped2 = vec3(p + vec2(w2a, w2b) * (0.35 + uMids * 0.15 + tensionDrive), t * 0.25);
  warped2.xy += curlNoise(vec3(warped2.xy * 1.2 + 3.0, uDynamicTime * driftSpeed * 1.3)).xy * 0.08;

  float layer2Raw = fbm3(warped2 * 0.9);
  float layer2 = bubbleShape(layer2Raw, 0.12 + bubbleThresholdShift, 0.09 / bubbleRateMod);

  // Color: secondary palette (brightness scales with energy^2)
  float hue2 = hsvToCosineHue(uPaletteSecondary) + uChromaHue * 0.15 + 0.1;
  vec3 col2 = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  col2 *= mix(0.03, 0.8, energySq);

  // ===========================================================
  // LAYER 3: Fine surface tension ripples (water/oil interface)
  // ===========================================================
  vec3 layer3Pos = vec3(p * 1.8 + vec2(-0.2, 0.1) + convection * 2.0, t * 0.5 + sectionSeed * 1.4);
  float w3a = snoise(layer3Pos + vec3(1.5, 5.8, 0.0));
  float w3b = snoise(layer3Pos + vec3(6.3, 2.4, 0.0));
  vec3 warped3 = vec3(p + vec2(w3a, w3b) * (0.15 + uHighs * 0.1), t * 0.4);

  float layer3Raw = fbm3(warped3 * 2.0);
  float layer3 = bubbleShape(layer3Raw, 0.15 + bubbleThresholdShift, 0.07 / bubbleRateMod);

  // Color: mix of primary and secondary (tertiary dye) (brightness scales with energy^2)
  float hue3 = mix(hsvToCosineHue(uPalettePrimary), hsvToCosineHue(uPaletteSecondary), 0.5) + 0.25;
  vec3 col3 = 0.5 + 0.5 * cos(6.28318 * vec3(hue3, hue3 + 0.33, hue3 + 0.67));
  col3 *= mix(0.03, 0.7, energySq);

  // ===========================================================
  // COMPOSITE: warm amber projector base + additive oil layers
  // ===========================================================

  // Projector bulb base: warm dark amber, nearly invisible at low energy
  vec3 bulbColor = vec3(0.03, 0.02, 0.01) * (0.3 + energySq * 0.7);
  vec3 col = bulbColor;

  // Additive blending: like real projected light, colors ADD
  col += col1 * layer1 * 0.55;
  col += col2 * layer2 * 0.45;
  col += col3 * layer3 * 0.30;

  // Where layers OVERLAP, boost brightness (light mixing on projection surface)
  float overlap12 = layer1 * layer2;
  float overlap23 = layer2 * layer3;
  float overlap13 = layer1 * layer3;
  float overlapAll = layer1 * layer2 * layer3;

  vec3 overlapColor = mix(col1, col2, 0.5) * 0.15 * overlap12
                    + mix(col2, col3, 0.5) * 0.12 * overlap23
                    + mix(col1, col3, 0.5) * 0.12 * overlap13
                    + vec3(1.0, 0.95, 0.85) * 0.08 * overlapAll; // white-hot triple overlap
  col += overlapColor * (0.5 + energySq * 0.5);

  // ===========================================================
  // BUBBLE FORMATION: threshold noise into circular bubble shapes
  // ===========================================================
  {
    // Small bubbles form from heat — bass drives rate (halved time)
    float bubbleNoise = fbm3(vec3(p * 4.0 + convection * 8.0, uDynamicTime * 0.1 * bubbleRateMod));
    float bubbleThreshold = 0.35 - uBass * 0.08 - energy * 0.05;
    float bubbles = smoothstep(bubbleThreshold, bubbleThreshold + 0.03, bubbleNoise);
    // Bubble bright edges (light refracts through curved oil surface)
    float bubbleEdge = smoothstep(0.04, 0.01, abs(bubbleNoise - bubbleThreshold)) * 0.2;
    col += bubbles * vec3(0.04, 0.03, 0.02) * col1 * energySq;
    col += bubbleEdge * vec3(1.0, 0.95, 0.85) * (0.1 + energySq * 0.5);
  }

  // ===========================================================
  // SURFACE TENSION: fine lines where oil layers meet
  // ===========================================================
  {
    float lineWidth = mix(0.12, 0.06, uHighs); // highs make lines sharper
    float tension12 = surfaceTension(layer1Raw, layer2Raw, lineWidth);
    float tension23 = surfaceTension(layer2Raw, layer3Raw, lineWidth * 1.2);
    float tension13 = surfaceTension(layer1Raw, layer3Raw, lineWidth * 0.9);
    float tensionTotal = (tension12 + tension23 * 0.8 + tension13 * 0.7) * 0.06;
    // Surface tension lines catch the projector light — bright warm highlights
    col += tensionTotal * vec3(1.0, 0.92, 0.78) * (0.2 + energySq * 0.8) * uHighs;
  }

  // ===========================================================
  // BUBBLE RIM HIGHLIGHTS: bright edges on oil blobs
  // ===========================================================
  {
    float rim1 = bubbleRim(layer1, 0.08) * 0.12;
    float rim2 = bubbleRim(layer2, 0.07) * 0.10;
    float rim3 = bubbleRim(layer3, 0.06) * 0.08;
    vec3 rimLight = vec3(1.0, 0.95, 0.85); // projector bulb color on rims
    col += rimLight * (rim1 + rim2 + rim3) * (0.2 + energySq * 0.8);
  }

  // ===========================================================
  // BEAT: bubble pop/merge events (sudden seed perturbation)
  // ===========================================================
  {
    float beatEvent = max(uBeatSnap, uDrumBeat);
    // Beat creates a ripple outward from random center
    float beatSeed = floor(uMusicalTime * 4.0); // quantized to beats
    vec2 beatCenter = vec2(
      snoise(vec3(beatSeed, 0.0, 0.0)) * 0.3,
      snoise(vec3(0.0, beatSeed, 0.0)) * 0.3
    );
    float beatDist = length(p - beatCenter);
    float beatRing = smoothstep(0.02, 0.0, abs(beatDist - beatEvent * 0.4)) * beatEvent * 0.15;
    col += beatRing * vec3(1.0, 0.95, 0.85) * energySq;
  }

  // ===========================================================
  // ONSET: color bloom (new dye drop hitting the glass)
  // ===========================================================
  {
    float onsetPulse = step(0.4, uOnsetSnap) * uOnsetSnap;
    if (onsetPulse > 0.01) {
      // Dye drop: saturated color bloom from a focal point
      float dropSeed = floor(uMusicalTime * 2.0 + 0.5);
      vec2 dropCenter = vec2(
        snoise(vec3(dropSeed * 3.7, 1.0, 0.0)) * 0.35,
        snoise(vec3(1.0, dropSeed * 3.7, 0.0)) * 0.35
      );
      float dropDist = length(p - dropCenter);
      float dropBloom = smoothstep(0.25, 0.0, dropDist) * onsetPulse;
      // Fresh dye: highly saturated primary color
      float dropHue = hsvToCosineHue(uPalettePrimary) + dropSeed * 0.1;
      vec3 dyeColor = 0.5 + 0.5 * cos(6.28318 * vec3(dropHue, dropHue + 0.33, dropHue + 0.67));
      col += dyeColor * dropBloom * 0.4 * energySq;
    }
  }

  // ===========================================================
  // VOCAL WARMTH: vocals add golden amber tint (singer = projector operator)
  // ===========================================================
  col += vec3(0.08, 0.05, 0.02) * vocalWarmth * energySq;

  // ===========================================================
  // CLIMAX REACTIVITY
  // ===========================================================
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Climax: all oils intensify, overlap zones go white-hot
  col *= 1.0 + climaxBoost * 0.25;
  col += overlapAll * climaxBoost * vec3(0.15, 0.12, 0.08);

  // Beat brightness pulse (section-modulated)
  col *= 1.0 + uBeatSnap * 0.2 * (1.0 + climaxBoost * 0.4);

  // ===========================================================
  // PALETTE SATURATION (energy-dependent: quiet = near-monochrome)
  // ===========================================================
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(lum);
  // At low energy, saturation drops to 0.35 (near-monochrome). At high energy, full vivid.
  float energySat = mix(0.35, 1.1, energySq);
  col = mix(gray, col, energySat * mix(0.75, 1.1, uPaletteSaturation) * satMod);

  // ===========================================================
  // COLOR AFTERGLOW
  // ===========================================================
  float afterglowStr = smoothstep(0.3, 0.6, energy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  col += afterglowCol * afterglowStr;

  // ===========================================================
  // WARM AMBER BASE TONE: everything gets a projector bulb tint
  // ===========================================================
  // Real overhead projectors have warm-white halogen bulbs
  vec3 warmTint = vec3(1.08, 0.98, 0.85);
  col *= warmTint;

  // ===========================================================
  // ATMOSPHERIC DEPTH: fog recedes with energy
  // ===========================================================
  float fogNoise = fbm3(vec3(p * 0.5, uDynamicTime * 0.012));
  float fogDensity = mix(0.35, 0.02, energy);
  vec3 fogColor = vec3(0.02, 0.015, 0.01);
  col = mix(col, fogColor, fogDensity * (0.4 + fogNoise * 0.6));

  // ===========================================================
  // VIGNETTE: circular lens falloff (projector optics)
  // ===========================================================
  float lensDist = length(p);
  float vigScale = mix(0.32, 0.26, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);

  // Colored vignette: warm amber at edges (lens chromatic falloff)
  vec3 vigTint = vec3(0.03, 0.02, 0.01);
  col = mix(vigTint, col, vignette);

  // ===========================================================
  // MULTI-CHROMA DOMAIN: additional chroma influence
  // ===========================================================
  vec3 chromaInfluence = chromaColor(p * 0.5, uChroma0, uChroma1, uChroma2, energy);
  col = mix(col, col + chromaInfluence * 0.4, 0.15);

  // ===========================================================
  // POST-PROCESSING (shared chain)
  // ===========================================================
  col = applyPostProcess(col, vUv, p);

  // ===========================================================
  // ONSET SATURATION PULSE: push colors away from gray
  // ===========================================================
  float onsetPulse2 = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse2 * 0.8);
  col *= 1.0 + onsetPulse2 * 0.1;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.12;
    col = applyCA(col, vUv, caAmt);
  }

  // ===========================================================
  // ANIMATED STAGE FLOOD: flowing palette noise in dark areas
  // ===========================================================
  col = stageFloodFill(col, p, uDynamicTime, energy, uPalettePrimary, uPaletteSecondary);

  // ===========================================================
  // LOWERED BLACK FLOOR (build-phase-aware)
  // ===========================================================
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  col = max(col, vec3(0.015, 0.012, 0.01) * liftMult); // dark warm black floor

  // ===========================================================
  // FEEDBACK TRAILS: oils don't snap, they flow slowly
  // ===========================================================
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  // High base decay: oils persist (0.94 base = very slow fade)
  float baseDecay = mix(0.94, 0.94 - 0.06, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.03 + sSpace_fb * 0.05 - sChorus_fb * 0.04;
  feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  // Jam phase feedback
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.02 + jpBuild * 0.01 + jpPeak * 0.04 - jpResolve * 0.03;
    feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
