/**
 * Ink Wash — Sumi-e inspired watercolor bleeding with calligraphic strokes.
 * Ink droplets bleed into wet paper. Mountain silhouettes form from pooling.
 * Negative space is as important as positive. Ultra-slow decay (paper absorbs ink).
 *
 * Feedback: Yes (ultra-slow decay 0.985 — paper absorbing ink)
 * State: R = ink density, G = wetness (controls bleed speed)
 *
 * Audio reactivity:
 *   uEnergy           → ink density / opacity
 *   uBass             → ink drop size
 *   uOnsetSnap        → new ink drops
 *   uSlowEnergy       → bleed speed (wet paper diffusion rate)
 *   uVocalPresence    → calligraphic stroke pressure
 *   uMelodicDirection → brush stroke direction
 *   uPeakApproaching  → ink gathering before release
 *   uChromaHue        → subtle ink tint shifts
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const inkWashVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const inkWashFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;


${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: false,
  halationEnabled: false,
  grainStrength: "heavy",
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// Read ink state from previous frame
// R = ink density (0 = white paper, 1 = saturated black)
// G = wetness (controls bleed speed: 1 = wet, 0 = dry)
vec2 readInkState(vec2 uv) {
  vec4 prev = texture2D(uPrevFrame, uv);
  return prev.rg;
}

// Paper texture: subtle fibrous noise (fixed, not time-varying)
float paperTexture(vec2 p) {
  float fibers = fbm6(vec3(p * 40.0, 0.0)) * 0.5 + 0.5;
  float weave = abs(sin(p.x * 120.0) * sin(p.y * 120.0)) * 0.1;
  return fibers * 0.8 + weave * 0.2;
}

// Ink bleed kernel: anisotropic diffusion along paper grain
float bleedKernel(vec2 uv, vec2 texel, float wetness) {
  float totalInk = 0.0;
  float totalWeight = 0.0;

  // Paper grain direction: horizontal bias with subtle noise variation
  vec2 grainDir = normalize(vec2(1.0, 0.3 + snoise(vec3(uv * 5.0, 0.0)) * 0.4));

  for (int dx = -2; dx <= 2; dx++) {
    for (int dy = -2; dy <= 2; dy++) {
      if (dx == 0 && dy == 0) continue;
      vec2 offset = vec2(float(dx), float(dy));
      vec2 sampleUv = uv + offset * texel;

      vec2 nState = readInkState(sampleUv);

      // Weight: favor paper grain direction + gravity (downward)
      float grainAlign = abs(dot(normalize(offset), grainDir));
      float gravityBias = 1.0 + max(0.0, -offset.y) * 0.3; // ink bleeds down
      float dist = length(offset);
      float weight = (0.5 + grainAlign * 0.5) * gravityBias / (dist * dist);

      // Only bleed from wetter neighbors
      weight *= nState.y; // neighbor wetness

      totalInk += nState.x * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0.0 ? totalInk / totalWeight : 0.0;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.02;
  float chromaHueMod = uChromaHue * 0.08;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.05;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float bleedRateMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.1, sChorus);
  float strokeSpeedMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.15, sChorus);
  float mountainSpeedMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.1, sChorus);

  vec2 texel = 1.0 / uResolution;

  // --- Read previous frame state ---
  vec2 state = readInkState(uv);
  float inkDensity = state.x;
  float wetness = state.y;

  // --- Paper absorption: ultra-slow decay (paper absorbs ink over time) ---
  // 0.985 decay means ink persists for a very long time
  float decayRate = 0.985;
  float newInk = inkDensity * decayRate;

  // --- Ink diffusion / bleeding ---
  float bleedSpeed = (0.02 + slowE * 0.04) * bleedRateMod;
  float neighborInk = bleedKernel(uv, texel, wetness);

  // Bleed: ink moves from dense areas to sparse areas (diffusion)
  float bleedAmount = (neighborInk - newInk) * bleedSpeed * wetness;
  newInk += bleedAmount;

  // --- Wetness dynamics ---
  // Paper dries over time, gets rewet by new drops
  float newWetness = wetness * 0.99; // slow drying
  newWetness += slowE * 0.005; // ambient humidity from slow energy

  // --- New ink drops on onset ---
  if (onset > 0.3) {
    // Drop position: seeded from musical time for variety
    float dropSeed = floor(uMusicalTime * 4.0) + uSectionIndex * 100.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float seed = dropSeed + fi * 17.3;
      vec2 dropPos = vec2(
        fract(sin(seed * 12.9898) * 43758.5453) * 1.2 - 0.6,
        fract(sin(seed * 78.233) * 43758.5453) * 0.8 - 0.4
      );

      float dropSize = (0.03 + bass * 0.06) * (1.0 + fi * 0.3);
      float dist = length(p - dropPos);
      float dropMask = smoothstep(dropSize, dropSize * 0.2, dist);

      // Ink splatter: irregular edge from noise
      float splatterNoise = snoise(vec3((p - dropPos) * 30.0 / dropSize, seed));
      dropMask *= smoothstep(-0.2, 0.3, splatterNoise);

      float dropIntensity = onset * (0.5 + energy * 0.5);
      newInk = max(newInk, dropMask * dropIntensity);
      newWetness = max(newWetness, dropMask * 0.8); // fresh drops are wet
    }
  }

  // --- Calligraphic strokes from vocal presence ---
  if (vocalPresence > 0.1) {
    // Stroke follows melodic direction
    float strokeAngle = melodicDir * PI * 0.25 + slowTime * 0.5 * strokeSpeedMod;
    vec2 strokeDir = vec2(cos(strokeAngle), sin(strokeAngle));

    // Stroke position drifts slowly
    vec2 strokeCenter = vec2(
      sin(slowTime * 1.5) * 0.3,
      cos(slowTime * 1.1) * 0.2
    );

    // Distance to stroke line
    vec2 toStroke = p - strokeCenter;
    float alongStroke = dot(toStroke, strokeDir);
    float perpDist = abs(dot(toStroke, vec2(-strokeDir.y, strokeDir.x)));

    // Pressure variation: thicker in middle, tapers at ends
    float pressure = vocalPresence * (1.0 - smoothstep(0.0, 0.3, abs(alongStroke)));
    float strokeWidth = 0.01 + pressure * 0.02;

    // Ink deposition from brush
    float strokeMask = smoothstep(strokeWidth, strokeWidth * 0.3, perpDist);
    strokeMask *= smoothstep(0.4, 0.0, abs(alongStroke)); // taper ends

    // Dry brush texture: gaps in the stroke from paper grain
    float dryBrush = paperTexture(p * 3.0);
    strokeMask *= smoothstep(0.2, 0.5, dryBrush + pressure * 0.3);

    newInk = max(newInk, strokeMask * vocalPresence * 0.6);
    newWetness = max(newWetness, strokeMask * 0.5);
  }

  // --- Peak approaching: ink gathers (darkens edges) ---
  if (peakApproach > 0.1) {
    float edgeDarken = smoothstep(0.3, 0.6, length(p)) * peakApproach * 0.15;
    newInk += edgeDarken;
    newWetness += peakApproach * 0.02;
  }

  // --- Mountain silhouettes from ink pooling ---
  // Low-frequency noise creates distant mountain shapes
  float mountainNoise = fbm(vec3(p.x * 2.0, 0.0, slowTime * 0.1 * mountainSpeedMod));
  float mountainLine = smoothstep(0.02, 0.0, abs(p.y - mountainNoise * 0.3 + 0.1));
  float mountainFill = smoothstep(0.0, -0.15, p.y - mountainNoise * 0.3 + 0.1);
  float mountainInk = (mountainLine * 0.3 + mountainFill * 0.1) * slowE;
  newInk = max(newInk, mountainInk);

  // --- Initialize on first frame ---
  vec4 rawPrev = texture2D(uPrevFrame, uv);
  if (rawPrev.a < 0.01) {
    // Start with mostly clean paper, a few seed spots
    float seedNoise = snoise(vec3(p * 4.0, 0.0));
    if (seedNoise > 0.8) {
      newInk = 0.3;
      newWetness = 0.5;
    } else {
      newInk = 0.0;
      newWetness = 0.1;
    }
  }

  // Clamp state
  newInk = clamp(newInk, 0.0, 1.0);
  newWetness = clamp(newWetness, 0.0, 1.0);

  // --- Visual rendering ---

  // Paper base: warm off-white with texture
  float paper = paperTexture(p);
  vec3 paperColor = vec3(0.95, 0.92, 0.87) * (0.9 + paper * 0.1);

  // Ink color: near-black with subtle warm/cool shifts
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.05, 0.15, energy) * uPaletteSaturation;

  // Traditional sumi-e ink: mostly black with very slight hue
  vec3 inkColor = hsv2rgb(vec3(hue1, sat * 0.3, 0.05));
  // Diluted ink reveals more color (like watercolor)
  vec3 dilutedInk = hsv2rgb(vec3(hue2 + 0.05, sat * 1.5, 0.25));

  // Mix based on ink density: light wash vs saturated black
  float inkOpacity = smoothstep(0.0, 0.8, newInk);
  float isSaturated = smoothstep(0.5, 0.9, newInk);
  vec3 inkBlend = mix(dilutedInk, inkColor, isSaturated);

  // Wet areas show slightly darker paper (water stain)
  vec3 wetPaper = paperColor * (1.0 - newWetness * 0.08);

  // Final composite: paper shows through where ink is sparse
  vec3 col = mix(wetPaper, inkBlend, inkOpacity);

  // --- Ink edge effects: darker concentration at bleed borders ---
  float edgeDetect = 0.0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      if (dx == 0 && dy == 0) continue;
      vec2 nUv = uv + vec2(float(dx), float(dy)) * texel;
      float nInk = readInkState(nUv).x;
      edgeDetect += abs(nInk - newInk);
    }
  }
  edgeDetect /= 8.0;
  // Darken edges where ink concentration changes rapidly
  col -= vec3(edgeDetect * 0.4) * inkOpacity;

  // --- Negative space shimmer: faint energy in empty areas ---
  float emptySpace = 1.0 - inkOpacity;
  float shimmer = snoise(vec3(p * 8.0, uDynamicTime * 0.5)) * 0.02;
  col += vec3(shimmer * emptySpace * energy);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float bgR = 0.95;
  float bgG = 0.92;
  float bgB = 0.87;
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(bgR, bgG, bgB) * 0.3, col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Store state in RG channels, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor.r = mix(col.r, newInk, 0.5);
  gl_FragColor.g = mix(col.g, newWetness, 0.5);
}
`;
