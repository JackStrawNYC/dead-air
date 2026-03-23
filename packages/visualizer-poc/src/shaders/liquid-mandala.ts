/**
 * Liquid Mandala — psychedelic concentric color-shifting rings in polar coordinates.
 * FBM domain warp on ring edges creates organic breathing motion.
 *
 * Visual aesthetic:
 *   - Quiet: soft glowing center, faint outer rings
 *   - Building: rings multiply, colors intensify
 *   - Peak: dense ring field with vivid palette cycling
 *   - Release: rings dissolve outward
 *
 * Audio reactivity:
 *   uEnergy          → ring count and brightness
 *   uBass            → ring pulse radius
 *   uHighs           → edge sharpness
 *   uOnsetSnap       → flash pulse on ring edges
 *   uBeatSnap        → ring expansion pulse
 *   uChromaHue       → hue cycling across rings
 *   uChordIndex      → micro-hue rotation
 *   uHarmonicTension → inner pattern complexity
 *   uBeatStability   → clean rings (high) vs warped (low)
 *   uMelodicPitch    → vertical drift
 *   uSectionType     → section-aware modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const liquidMandalaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const liquidMandalaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, paletteCycleEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

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

  float slowTime = uDynamicTime * 0.03;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;

  // --- Section type modulation ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section modulates rotation speed and ring count
  float sectionRotSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.3, sChorus);
  float sectionRingMult = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  // --- Melodic vertical drift ---
  float vertShift = (melodicPitch - 0.5) * 0.06;
  p.y -= vertShift;

  // --- Background ---
  vec3 col = mix(
    vec3(0.01, 0.005, 0.02),
    vec3(0.02, 0.01, 0.03),
    uv.y
  );

  // --- Polar coordinates ---
  float r = length(p);
  float theta = atan(p.y, p.x);

  // --- Slow global rotation (section-modulated) ---
  float globalAngle = slowTime * 0.4 * sectionRotSpeed;
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);
  globalAngle += bp * 0.03;
  theta += globalAngle;

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.15, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.8, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- FBM domain warp on ring radii ---
  float warpAmount = (1.0 - stability) * 0.08 * coherenceWarpMult;
  float warp = snoise(vec3(
    cos(theta) * 2.0 + slowTime * 0.3,
    sin(theta) * 2.0 + slowTime * 0.3,
    r * 3.0
  )) * warpAmount;

  float warpedR = r + warp;

  // --- Ring parameters ---
  float ringCount = (4.0 + energy * 12.0 + tension * 6.0) * sectionRingMult;
  float ringPulse = 1.0 + bass * 0.12 + effectiveBeat * 0.06;
  float ringSpacing = 0.5 / (ringCount * 0.5 + 1.0);

  // --- Edge sharpness from stability + coherence ---
  float px = 1.0 / uResolution.y;
  float edgeWidth = px * mix(4.0, 1.5, stability * smoothstep(0.3, 0.7, coherence));

  // --- Palette colors ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;

  // --- Climax state ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  ringCount = mix(ringCount, ringCount * 1.5, climaxBoost);

  // --- Draw concentric rings ---
  float ringField = 0.0;

  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    if (fi >= ringCount) break;

    // Ring radius with pulse
    float ringR = (fi + 1.0) * ringSpacing * ringPulse;

    // Per-ring FBM edge wobble
    float edgeWobble = snoise(vec3(theta * 3.0 + fi * 1.7, slowTime * 0.5, fi * 0.3)) * 0.015 * (1.0 - stability);

    // SDF ring
    float sdf = abs(warpedR - ringR + edgeWobble) - 0.003;

    // Ring edge with variable sharpness
    float edge = smoothstep(edgeWidth, 0.0, sdf);

    // Per-ring hue cycling
    float ringHue = fract(hue1 + fi * 0.06 + slowTime * 0.15 + theta / TAU * 0.3);
    vec3 ringColor = hsv2rgb(vec3(ringHue, sat, 0.9 + energy * 0.1));

    // Inner glow
    float glow = exp(-abs(warpedR - ringR) * 25.0) * 0.25;

    // FFT modulation per ring
    float fftSample = texture2D(uFFTTexture, vec2(fi / ringCount, 0.5)).r;
    float fftBright = 1.0 + fftSample * 0.3;

    col += ringColor * edge * (0.5 + energy * 0.6) * fftBright;
    col += ringColor * glow * (0.2 + bass * 0.3 + vocalGlow);

    ringField = max(ringField, edge);
  }

  // --- Angular radiance at higher energy ---
  if (energy > 0.3) {
    float angularReveal = smoothstep(0.3, 0.8, energy);
    float angularCount = 6.0 + tension * 6.0;
    float angularPattern = 0.5 + 0.5 * sin(theta * angularCount + slowTime * 2.0);
    angularPattern *= angularReveal;

    vec3 angularColor = hsv2rgb(vec3(fract(hue2 + theta / TAU), sat * 0.8, 0.7));
    col += angularColor * angularPattern * exp(-r * 4.0) * 0.2;
  }

  // --- Center glow ---
  float centerGlow = exp(-r * r * 15.0) * (0.3 + slowE * 0.5 + climaxBoost * 0.3);
  vec3 centerColor = hsv2rgb(vec3(fract(hue1 + slowTime * 0.1), sat * 0.6, 1.0));
  col += centerColor * centerGlow;

  // --- Onset flash ---
  col += vec3(1.0, 0.97, 0.92) * ringField * onset * 1.5;

  // --- Climax boost ---
  col *= 1.0 + climaxBoost * 0.5;

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
  col = mix(vec3(0.01, 0.005, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // --- Feedback trails ---
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.92, 0.85, energy);
  float feedbackDecay = baseDecay + sJam * 0.04 + sSpace * 0.06 - sChorus * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
