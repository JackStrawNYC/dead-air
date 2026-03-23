/**
 * Kaleidoscope — UV folding across N radial axes + FBM domain warp.
 * Segment count driven by uBeatStability (stable=clean 6-fold, free jazz=fractured).
 *
 * Visual aesthetic:
 *   - Quiet: gentle 6-fold symmetry, soft palette glow, slow warp drift
 *   - Building: segments sharpen, warp amplitude rises, color saturation climbs
 *   - Peak: full prismatic bloom, deep warp, onset fracture breaks symmetry
 *   - Release: segments decay, warp fades to gentle undulation
 *
 * Audio reactivity:
 *   uBeatStability   → segment count (stable=6-8 clean, unstable=3-4 fractured)
 *   uBass            → warp amplitude (low end drives spatial distortion)
 *   uEnergy          → brightness, color intensity, vignette width
 *   uOnsetSnap       → fracture/distortion burst (breaks fold symmetry)
 *   uHarmonicTension → warp complexity (more tension = more FBM octaves weight)
 *   uMelodicPitch    → warp center offset (melody drifts the origin)
 *   uMelodicDirection→ rotation direction (ascending=CW, descending=CCW)
 *   uPalettePrimary/Secondary → base color hues
 *   uChromaHue       → hue modulation overlay
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const kaleidoscopeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const kaleidoscopeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true, paletteCycleEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);

  // 7-band spectral: sub, low, low-mid, mid, upper-mid, presence, brilliance
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.08;

  // --- Phase 1 uniform integrations ---
  float vocalWarmth = uVocalEnergy * 0.12;
  float otherShimmer = uOtherEnergy * 0.15;
  float accelBoost = 1.0 + uEnergyAccel * 0.15;
  float chromaHueMod = uChromaHue * 0.2;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float forecastGlow = clamp(uEnergyForecast, 0.0, 1.0) * 0.1;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // --- Background: deep void ---
  vec3 col = mix(
    vec3(0.01, 0.008, 0.02),
    vec3(0.03, 0.02, 0.04),
    uv.y
  );

  // --- Segment count from beat stability ---
  // High stability (tight groove) = clean 6-8 fold symmetry
  // Low stability (free jazz, rubato) = fractured 3-4 segments
  float foldMod = 1.0 + uJamDensity * 0.3;
  float numSegments = mix(3.0, 8.0, stability) * foldMod;
  // Onset can temporarily fracture the segment count
  numSegments -= onset * 2.0;

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: lock segment count to nearest integer (stable kaleidoscope)
  if (coherence > 0.7) {
    numSegments = floor(numSegments + 0.5);
  }
  // Low coherence: add segment jitter (±0.5 sine wobble)
  if (coherence < 0.3) {
    float jitterAmt = (0.3 - coherence) / 0.3;
    numSegments += sin(slowTime * 7.0) * 0.5 * jitterAmt;
  }

  // --- Section type modulation ---
  // Mapping: 0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space
  float sectionT = uSectionType;
  float jamFactor = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  numSegments += jamFactor * 2.0;
  float spaceFactor = smoothstep(6.5, 7.5, sectionT);
  float chorusFactor = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float soloFactor = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  numSegments += chorusFactor * 1.0; // chorus: +1 segment for energy
  numSegments -= spaceFactor * 1.0;  // space: -1 segment for calm

  numSegments = max(numSegments, 2.0);
  float segAngle = TAU / numSegments;

  // --- Melodic pitch shifts the warp center ---
  vec2 warpCenter = vec2(
    (melodicPitch - 0.5) * 0.3,
    sin(slowTime * 0.5) * 0.1
  );
  vec2 centered = p - warpCenter;

  // Tempo derivative → kaleidoscope rotation rate
  float tempoAccel = 1.0 + uTempoDerivative * 0.4;

  // --- Rotation direction from melodic contour ---
  // Ascending melody = clockwise drift, descending = counter-clockwise
  float rotSpeed = (0.04 + energy * 0.03) * tempoAccel;
  // Section-driven speed: jam 1.3x, chorus 1.15x, solo 1.2x, space 0.5x
  rotSpeed *= mix(1.0, 1.3, jamFactor);
  rotSpeed *= mix(1.0, 0.5, spaceFactor);
  rotSpeed *= mix(1.0, 1.15, chorusFactor);
  rotSpeed *= mix(1.0, 1.2, soloFactor);
  float rotAngle = slowTime * rotSpeed * sign(melodicDir + 0.001);
  float cosR = cos(rotAngle);
  float sinR = sin(rotAngle);
  centered = vec2(
    cosR * centered.x - sinR * centered.y,
    sinR * centered.x + cosR * centered.y
  );

  // --- Radial UV folding ---
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);
  // Extra fold rotation on downbeat (measure start emphasis, confidence-gated)
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  angle += uDownbeat * smoothstep(0.3, 0.7, uBeatConfidence) * 0.3;

  // Mirror fold within each segment
  float a = mod(angle, segAngle);
  if (a > segAngle * 0.5) a = segAngle - a;

  // Reconstruct folded coordinates
  vec2 folded = vec2(cos(a), sin(a)) * radius;

  // --- FBM domain warp ---
  // Bass drives warp amplitude, tension drives complexity
  float warpAmp = (0.3 + bass * 0.8 + tension * 0.4) * accelBoost;
  float warpFreq = 2.0 + tension * 2.0 + otherShimmer;

  // Multi-layer domain warp: fold coordinates through noise space
  vec3 warpInput = vec3(folded * warpFreq, slowTime * 0.6);
  float warp1 = fbm(warpInput) * warpAmp;
  float warp2 = fbm(warpInput + vec3(warp1 * 1.5, warp1 * 0.7, 0.3)) * warpAmp * 0.6;

  vec2 warped = folded + vec2(warp1, warp2);

  // Onset fracture: violent noise displacement
  if (onset > 0.1) {
    vec3 fractureNoise = vec3(
      snoise(vec3(warped * 8.0, slowTime * 3.0)),
      snoise(vec3(warped * 8.0 + 50.0, slowTime * 3.0)),
      0.0
    );
    warped += fractureNoise.xy * onset * 0.15;
  }

  // --- Color generation from warped coordinates ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.4, 1.0, energy) * uPaletteSaturation;

  // Pattern layers: overlapping noise fields in warped space
  float pattern1 = fbm(vec3(warped * 3.0, slowTime * 0.4));
  float pattern2 = fbm3(vec3(warped * 5.0 + 20.0, slowTime * 0.7));
  float pattern3 = snoise(vec3(warped * 8.0 + 40.0, slowTime * 1.2));

  // Combine patterns into color field
  float colorMix = pattern1 * 0.5 + pattern2 * 0.3 + pattern3 * 0.2;
  float hue = mix(hue1, hue2, colorMix * 0.5 + 0.5);

  // Chroma hue modulation: live harmonic content colors the pattern
  hue += uChromaHue * 0.15 * sin(colorMix * TAU);

  float brightness = 0.4 + energy * 0.6 + forecastGlow + fftBass * 0.12;
  brightness *= accelBoost;
  vec3 patternColor = hsv2rgb(vec3(hue, sat, brightness));

  // Radial intensity: brighter near center, darker at edges
  float radialFade = exp(-radius * radius * 1.5);
  col += patternColor * radialFade;

  // --- Edge highlights: bright lines at fold boundaries ---
  float foldEdge = abs(a - segAngle * 0.5);
  float edgeThreshold = 0.03 - fftHigh * 0.015; // highs → sharper edges
  float edgeLine = smoothstep(max(edgeThreshold, 0.005), 0.0, foldEdge / max(radius, 0.01));
  vec3 edgeColor = hsv2rgb(vec3(hue2 + chromaHueMod, sat * 0.8, 1.0));
  col += edgeColor * edgeLine * (0.2 + energy * 0.4);

  // --- Center glow: pulsing core ---
  float centerGlow = exp(-radius * radius * 20.0);
  vec3 coreColor = hsv2rgb(vec3(hue1 + vocalWarmth, sat, 1.0));
  col += coreColor * centerGlow * (0.3 + bass * 0.5);

  // --- Ridged detail layer: sharp crystalline edges in the pattern ---
  float ridged = ridged4(vec3(warped * 4.0, slowTime * 0.3));
  col += patternColor * ridged * 0.15 * highs;

  // --- Onset flash: bright burst along fold lines ---
  float onsetFlash = onset * edgeLine * 3.0;
  col += vec3(1.0, 0.95, 0.9) * onsetFlash;

  // --- Peak approaching: anticipatory glow ---
  col *= 1.0 + peakApproach * 0.15;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // Climax: increase segment sharpness and warp intensity
  if (climaxBoost > 0.01) {
    float climaxPattern = fbm6(vec3(warped * 6.0, slowTime * 1.5));
    col += patternColor * climaxPattern * climaxBoost * 0.3;
  }


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.008, 0.02), col, vignette);

  // Semantic: psychedelic → increase fold depth + chromatic shift
  float psychBoost = uSemanticPsychedelic * 0.4;
  col = mix(col, col * vec3(1.0 + psychBoost * 0.2, 1.0, 1.0 + psychBoost * 0.15), psychBoost);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.92, 0.92 - 0.07, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
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
