/**
 * Video Feedback Recursion — infinite-regress tunnel effect via frame feedback.
 * Reads uPrevFrame, scales UV inward, rotates slightly, composites with a
 * seed pattern. Classic 1960s-70s video synthesizer aesthetic.
 *
 * Visual aesthetic:
 *   - Quiet: gentle slow tunnel, warm ambient colors
 *   - Building: tunnel deepens, rotation increases, seed pattern brightens
 *   - Peak: deep recursive zoom with saturated color injection
 *   - Release: tunnel widens, colors desaturate, gentle drift
 *
 * Audio reactivity:
 *   uEnergy          → inward scale factor (deeper tunnel at high energy)
 *   uBass            → rotation amount (bass drives twist)
 *   uOnsetSnap       → color injection burst
 *   uMelodicPitch    → twist center offset (drifting origin)
 *   uHarmonicTension → barrel distortion of recursion
 *   uBeatStability   → recursion regularity (stable = clean, unstable = chaotic)
 *   uSlowEnergy      → seed pattern brightness
 *   uChromaHue       → hue modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const feedbackRecursionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const feedbackRecursionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, caEnabled: true, halationEnabled: true, dofEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  // 7-band spectral: sub, low, low-mid, mid, upper-mid, presence, brilliance
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.05;
  float chromaHueMod = uChromaHue * 0.2;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15 * chordConf;
  float vocalWarmth = uVocalEnergy * 0.1;
  float accelBoost = 1.0 + uEnergyAccel * 0.12;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: deeper recursion, more rotation. Space: shallow, slow. Solo: dramatic zoom.
  float sectionScaleMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.5, sSolo);
  float sectionRotMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace) * (1.0 + uPeakApproaching * 0.3);

  // --- Recursion parameters ---
  // Scale: zoom inward 2-5% per frame, driven by energy (section-modulated)
  // FFT bass → deeper tunnel zoom; FFT highs → longer trail decay
  float scaleAmount = 1.0 - (0.02 + energy * 0.03 + fftBass * 0.015) * accelBoost * sectionScaleMod;

  // Rotation: bass drives twist (section-modulated)
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float rotAmount = (bass * 0.03 + stemBass * 0.015 + 0.005) * sign(sin(slowTime * 0.2)) * sectionRotMod; // Phil's bass deepens the twist
  // Stability affects regularity: unstable = jittery rotation
  rotAmount += (1.0 - stability) * sin(uTime * 7.0) * 0.01;

  // --- Drifting center: melodic pitch shifts the recursion origin ---
  vec2 center = vec2(0.5) + vec2(
    sin(slowTime * 0.3) * 0.05 + (melodicPitch - 0.5) * 0.08,
    cos(slowTime * 0.4) * 0.04
  );

  // --- Secondary drifting seed point for asymmetry ---
  vec2 seedDrift = vec2(
    sin(slowTime * 0.7 + 1.5) * 0.15,
    cos(slowTime * 0.5 + 2.3) * 0.12
  );

  // --- Sample previous frame with scale + rotation ---
  vec2 feedbackUv = uv - center;

  // Apply barrel distortion (tension-driven)
  float r2 = dot(feedbackUv, feedbackUv);
  float barrel = 1.0 + tension * 0.3 * r2;
  feedbackUv *= barrel;

  // Scale inward
  feedbackUv *= scaleAmount;

  // Rotate
  float ca = cos(rotAmount); float sa = sin(rotAmount);
  feedbackUv = vec2(
    ca * feedbackUv.x - sa * feedbackUv.y,
    sa * feedbackUv.x + ca * feedbackUv.y
  );

  feedbackUv += center;

  // Clamp to valid UV range
  feedbackUv = clamp(feedbackUv, vec2(0.001), vec2(0.999));

  // Sample previous frame with decay
  float decayRate = mix(0.92, 0.98, slowE) + fftHigh * 0.02;
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    decayRate += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    decayRate = clamp(decayRate, 0.80, 0.97);
  }
  vec3 feedback = texture2D(uPrevFrame, feedbackUv).rgb * decayRate;

  // --- Current frame seed pattern ---
  // Radial gradient: bright center fading to dark edges
  float radialDist = length(p);
  float radialGlow = exp(-radialDist * radialDist * 3.0);

  // Concentric beat-synced rings
  float ringFreq = 8.0 + energy * 12.0;
  float rings = 0.5 + 0.5 * sin(radialDist * ringFreq - uMusicalTime * TAU);
  rings *= radialGlow;

  // Palette-colored seed
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  vec3 seedColor1 = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 seedColor2 = hsv2rgb(vec3(hue2, sat * 0.8, 0.8));

  // Noise texture for organic variation
  float noiseVal = fbm3(vec3(p * 4.0 + seedDrift, slowTime * 0.8));
  float patternMix = noiseVal * 0.5 + 0.5;

  vec3 seedPattern = mix(seedColor1, seedColor2, patternMix) * radialGlow * 0.3;
  seedPattern += seedColor1 * rings * 0.2;

  // Vocal warmth adds to seed
  seedPattern += seedColor2 * vocalWarmth * radialGlow;

  // --- Onset color injection ---
  if (onset > 0.1) {
    vec3 onsetColor = hsv2rgb(vec3(hue1 + 0.1, 1.0, 1.0));
    float onsetRing = 0.5 + 0.5 * sin(radialDist * 20.0 - uTime * 10.0);
    seedPattern += onsetColor * onset * onsetRing * 0.6;
  }

  // --- Composite: seed + feedback ---
  vec3 col = max(seedPattern, feedback);
  // Additive blend for bright areas
  col += seedPattern * 0.1;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // During climax, increase seed brightness for more recursive depth
  if (climaxBoost > 0.01) {
    col += seedPattern * climaxBoost * 0.3;
  }


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
  col *= vignette;

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
