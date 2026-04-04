/**
 * Bioluminescence — Growing glowing organisms with branching tendrils.
 * Feedback shader (uPrevFrame) with persistence trails of phosphorescent organisms.
 *
 * Visual aesthetic:
 *   - Dark void background with 8-12 glowing organisms
 *   - Each organism: central pulsing glow + 3-5 branching FBM tendrils
 *   - Cyan (#0ff) / green (#0f8) / magenta (#f0f) phosphorescence
 *   - Organisms leave glowing persistence trails via feedback
 *   - Quiet: few dim organisms, short tendrils
 *   - Building: organisms multiply, tendrils extend
 *   - Peak: full bioluminescent field, bright cascading flashes
 *   - Release: organisms fade, trails linger
 *
 * Audio reactivity:
 *   uEnergy          -> organism count and glow intensity
 *   uBass            -> central pulse size
 *   uHighs           -> tendril tip brightness
 *   uOnsetSnap       -> bioluminescent flash cascade
 *   uSlowEnergy      -> background ambient level
 *   uHarmonicTension -> tendril branching complexity
 *   uBeatStability   -> organism drift stability
 *   uMelodicPitch    -> vertical organism drift
 *   uChromaHue       -> hue shift across palette
 *   uChordIndex      -> micro-rotate hue per chord
 *   uFFTTexture      -> per-organism size modulation
 *   uClimaxPhase     -> full flash + all organisms at max
 *   uPalettePrimary/Secondary -> mixed with bioluminescent palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const bioluminescenceVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const bioluminescenceFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- Seeded hash for organism placement ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + 17.3));
}

// --- Bioluminescent organism glow ---
float organismGlow(vec2 p, vec2 center, float radius, float pulse) {
  float d = length(p - center);
  float core = exp(-d * d / (radius * radius * pulse));
  float halo = exp(-d / (radius * 3.0)) * 0.3;
  return core + halo;
}

// --- Tendril path via FBM ---
vec2 tendrilPath(vec2 origin, float angle, float t, float seed, float warp) {
  float x = origin.x + cos(angle) * t + snoise(vec3(seed, t * 4.0, seed * 7.0)) * warp * t;
  float y = origin.y + sin(angle) * t + snoise(vec3(seed + 100.0, t * 4.0, seed * 3.0)) * warp * t;
  return vec2(x, y);
}

// --- Distance to a tendril ---
float tendrilField(vec2 p, vec2 origin, float angle, float length_, float seed, float warp, float width) {
  float minDist = 1000.0;
  float steps = 20.0;
  for (int i = 0; i < 20; i++) {
    float t = float(i) / steps * length_;
    vec2 pt = tendrilPath(origin, angle, t, seed, warp);
    float d = length(p - pt);
    // Taper width along tendril
    float taper = width * (1.0 - float(i) / steps * 0.7);
    minDist = min(minDist, d / max(taper, 0.001));
  }
  return minDist;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  float slowTime = uDynamicTime * 0.04;

  // --- Domain warping + energy-responsive detail ---
  vec2 domainWarpOff = vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;

  // --- Dark background (near black void) ---
  vec3 col = mix(
    vec3(0.005, 0.008, 0.015),
    vec3(0.01, 0.015, 0.025),
    uv.y + snoise(vec3(uv * 2.0, slowTime * 0.3)) * 0.05
  );

  // --- Melodic vertical drift ---
  float vertShift = (melodicPitch - 0.5) * 0.06;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: more organisms, faster growth. Space: fewer, slow drift. Chorus: vibrant glow. Solo: dramatic pulses.
  float sectionDriftSpeed = mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.2, sSolo);
  float sectionGlowMult = mix(1.0, 1.3, sChorus) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.5, sSolo);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: stable organism positions, clean tendrils
  // Low coherence: chaotic drift, branching tendrils
  float coherenceWarp = coherence > 0.7 ? mix(1.0, 0.3, (coherence - 0.7) / 0.3)
                       : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                       : 1.0;

  // --- Climax detection ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // --- Palette colors mixed with bioluminescent palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // Bioluminescent base colors: cyan, green, magenta
  vec3 bioColorCyan = vec3(0.0, 1.0, 1.0);
  vec3 bioColorGreen = vec3(0.0, 1.0, 0.53);
  vec3 bioColorMagenta = vec3(1.0, 0.0, 1.0);

  // Blend bioluminescent palette with song palette
  vec3 paletteColor1 = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 paletteColor2 = hsv2rgb(vec3(hue2, sat, 1.0));
  vec3 mixedCyan = mix(bioColorCyan, paletteColor1, 0.3);
  vec3 mixedGreen = mix(bioColorGreen, paletteColor2, 0.25);
  vec3 mixedMagenta = mix(bioColorMagenta, mix(paletteColor1, paletteColor2, 0.5), 0.2);

  // --- Organism count: 4-12 based on energy + section ---
  float organismCount = 4.0 + energy * 8.0 + sJam * 3.0 - sSpace * 2.0;
  organismCount = clamp(organismCount, 3.0, 12.0);
  organismCount = mix(organismCount, 12.0, climaxBoost);

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);

  // --- Draw organisms ---
  for (int i = 0; i < 12; i++) {
    float fi = float(i);

    // Visibility based on organism count
    float visibility = smoothstep(fi - 0.3, fi + 0.5, organismCount);
    if (visibility < 0.001) continue;

    // Seeded position for this organism
    vec2 seed2 = vec2(fi * 7.13, fi * 3.71 + 42.0);
    vec2 basePos = (hash22(seed2) - 0.5) * aspect * 1.4;

    // Slow drift with stability influence
    float driftSpeed = 0.15 * sectionDriftSpeed * mix(1.0, 0.4, stability);
    basePos.x += sin(slowTime * driftSpeed + fi * 1.7) * 0.15;
    basePos.y += cos(slowTime * driftSpeed * 0.8 + fi * 2.3) * 0.12 + vertShift;

    // FFT-driven size modulation
    float fftSample = texture2D(uFFTTexture, vec2(fi / 12.0, 0.5)).r;

    // Central glow radius: bass-driven pulse
    float baseRadius = 0.03 + energy * 0.02 + fftSample * 0.015;
    float pulseRadius = baseRadius * (1.0 + bass * 0.4 + bp * 0.15);

    // Draw central organism glow
    float glow = organismGlow(p, basePos, pulseRadius, 1.0 + bass * 0.5) * sectionGlowMult;

    // Per-organism color cycling through bioluminescent palette
    float colorPhase = fract(fi * 0.33 + slowTime * 0.1 + chromaHueMod);
    vec3 orgColor;
    if (colorPhase < 0.333) {
      orgColor = mix(mixedCyan, mixedGreen, colorPhase * 3.0);
    } else if (colorPhase < 0.666) {
      orgColor = mix(mixedGreen, mixedMagenta, (colorPhase - 0.333) * 3.0);
    } else {
      orgColor = mix(mixedMagenta, mixedCyan, (colorPhase - 0.666) * 3.0);
    }

    // Accumulate organism glow
    col += orgColor * glow * visibility * (0.4 + energy * 0.6 + vocalGlow);

    // --- Tendrils: 3-5 branching per organism ---
    float tendrilCount = 3.0 + tension * 2.0;
    float tendrilLength = 0.08 + energy * 0.12 + sJam * 0.05 - sSpace * 0.04;
    tendrilLength *= mix(1.0, 1.5, climaxBoost);
    float tendrilWarp = 0.3 * coherenceWarp;
    float tendrilWidth = 0.006 + bass * 0.003;

    for (int j = 0; j < 5; j++) {
      float fj = float(j);
      if (fj >= tendrilCount) break;

      // Tendril angle: evenly spaced + slight noise wobble
      float tendrilAngle = fj / tendrilCount * TAU + snoise(vec3(fi, fj, slowTime * 0.2)) * 0.5;
      float tendrilSeed = fi * 13.0 + fj * 7.0;

      // Distance field for tendril
      float tf = tendrilField(p, basePos, tendrilAngle, tendrilLength, tendrilSeed, tendrilWarp, tendrilWidth);
      float tendrilGlow = exp(-tf * tf * 8.0) * 0.6;

      // Tip brightness from highs
      float tipBrightness = 1.0 + highs * 0.8;

      // Tendril color: slightly shifted from organism
      vec3 tendrilColor = orgColor * mix(0.7, tipBrightness, smoothstep(1.0, 0.0, tf));

      col += tendrilColor * tendrilGlow * visibility * sectionGlowMult;
    }

    // --- Onset flash cascade ---
    if (onset > 0.1) {
      float flashRadius = pulseRadius * 3.0 * onset;
      float flash = exp(-length(p - basePos) / flashRadius) * onset * 1.5;
      // Cascade: stagger flash by organism index
      float cascade = smoothstep(fi * 0.08, fi * 0.08 + 0.15, onset);
      col += vec3(0.8, 0.95, 1.0) * flash * cascade * visibility;
    }
  }

  // --- Ambient deep-water particles (slow floating specks) ---
  for (int k = 0; k < 20; k++) {
    float fk = float(k);
    vec2 particlePos = vec2(
      sin(slowTime * 0.3 + fk * 5.1) * 0.6 * aspect.x,
      cos(slowTime * 0.25 + fk * 3.7) * 0.5 + sin(fk * 2.0) * 0.3
    );
    float d = length(p - particlePos);
    float speck = exp(-d * d * 800.0) * (0.05 + slowE * 0.1);
    col += mixedCyan * speck * 0.4;
  }

  // --- Climax full-field flash ---
  col *= 1.0 + climaxBoost * 0.6;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.005, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.93, 0.93 - 0.07, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
