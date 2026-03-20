/**
 * Electric Arc — Tesla coil lightning field.
 * Branching electric arcs between attraction points via layered ridgedMultifractal
 * noise along directional paths. Drum hits spawn new arcs. Vocal presence
 * creates "singing Tesla coil" color shifting.
 *
 * Feedback: Yes (arc persistence trails via uPrevFrame)
 *
 * Audio reactivity:
 *   uDrumOnset      → spawn new arc branches
 *   uBass           → arc trunk thickness
 *   uMids           → branching factor
 *   uMelodicPitch   → arc color (low=red, high=blue)
 *   uBeatStability  → arc straightness (stable=straight, unstable=chaotic)
 *   uVocalPresence  → "singing Tesla coil" color shift
 *   uEnergy         → overall arc count + brightness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const electricArcVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const electricArcFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  caEnabled: true,
  thermalShimmerEnabled: true,
  halationEnabled: true,
  bloomThresholdOffset: -0.15,
  grainStrength: "light",
})}

varying vec2 vUv;

#define PI 3.14159265

// Lightning bolt SDF along a directional path
float lightningBolt(vec2 p, vec2 start, vec2 end, float thickness, float chaos, float time) {
  vec2 dir = end - start;
  float len = length(dir);
  if (len < 0.001) return 10.0;
  vec2 n = dir / len;

  // Project point onto bolt axis
  vec2 toP = p - start;
  float t = clamp(dot(toP, n), 0.0, len);
  vec2 closest = start + n * t;
  float perpDist = length(p - closest);

  // Fractal displacement perpendicular to bolt direction
  float frac = t / len;
  float displacement = ridged4(vec3(frac * 8.0, time * 2.0, 0.0)) * chaos * 0.08;
  displacement += ridged4(vec3(frac * 16.0, time * 3.7, 5.0)) * chaos * 0.03;

  // Modify perp distance by displacement
  float adjustedDist = abs(perpDist - displacement);

  // Taper at ends
  float taper = smoothstep(0.0, 0.1, frac) * smoothstep(1.0, 0.9, frac);
  float effectiveThickness = thickness * taper;

  return adjustedDist - effectiveThickness;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);

  // 7-band spectral: sub, low, low-mid, mid, upper-mid, presence, brilliance
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.08;
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: more arcs, thicker, more chaos. Space: single dim arc. Solo: focused bright arcs.
  float sectionArcMod = mix(0.0, 3.0, sJam) + mix(0.0, -2.0, sSpace) + mix(0.0, 1.0, sSolo);
  float sectionChaosMod = mix(0.0, 0.5, sJam) + mix(0.0, -0.3, sSpace);

  // --- Arc parameters (section-modulated, FFT-driven) ---
  // FFT bass → arc thickness, FFT mids → branching, FFT highs → flash intensity
  float arcThickness = 0.004 + bass * 0.008 + sJam * 0.003 + fftBass * 0.004;
  float chaos = mix(0.5, 2.0, 1.0 - stability) + sectionChaosMod + fftMid * 0.3 + tension * 0.4;

  // --- Number of arcs from energy + drum onset (section-modulated) ---
  float arcDensity = 1.0 + uJamDensity * 0.5;
  int arcCount = max(1, int(float(3 + int(energy * 4.0) + int(drumOnset * 3.0) + int(sectionArcMod) + int(fftHigh * 2.0)) * arcDensity));

  // --- Arc color from melodic pitch ---
  float arcHue = mix(0.0, 0.65, melodicPitch) + chromaHueMod + chordHue;

  // Vocal presence shifts color ("singing Tesla coil")
  if (vocalPres > 0.2) {
    arcHue += vocalPres * 0.15 * sin(slowTime * 4.0);
  }

  float sat = mix(0.4, 0.9, energy) * uPaletteSaturation;

  // --- Background: dark with subtle ambient ---
  vec3 col = vec3(0.005, 0.005, 0.015);
  col += vec3(0.01, 0.005, 0.02) * (1.0 - length(p) * 0.5);

  // --- Render arcs ---
  for (int i = 0; i < 10; i++) {
    if (i >= arcCount) break;
    float fi = float(i);

    // Attraction points: slowly drifting endpoints
    float angle1 = slowTime * 0.3 + fi * 1.3;
    float angle2 = slowTime * 0.4 + fi * 2.1 + PI;
    float r1 = 0.3 + 0.15 * sin(slowTime * 0.7 + fi);
    float r2 = 0.35 + 0.15 * cos(slowTime * 0.5 + fi * 1.5);

    vec2 start = vec2(cos(angle1) * r1, sin(angle1) * r1);
    vec2 end = vec2(cos(angle2) * r2, sin(angle2) * r2);

    // Time offset per arc for variety
    float arcTime = slowTime + fi * 7.3;

    float d = lightningBolt(p, start, end, arcThickness, chaos, arcTime);

    // Arc glow
    float arcMask = 1.0 - smoothstep(0.0, 0.003, d);
    float glowMask = 1.0 - smoothstep(0.0, 0.04 + bass * 0.03, d);

    // Per-arc color variation
    float perArcHue = arcHue + fi * 0.05;
    float brightness = 0.8 + energy * 0.2;
    vec3 arcColor = hsv2rgb(vec3(perArcHue, sat, brightness));
    vec3 glowColor = hsv2rgb(vec3(perArcHue + 0.05, sat * 0.6, brightness * 0.5));

    col += arcColor * arcMask * 1.5;
    col += glowColor * glowMask * 0.4;

    // Branch arcs (from midpoint, shorter)
    if (mids > 0.3 && i < 5) {
      vec2 mid = (start + end) * 0.5;
      vec2 branchEnd = mid + vec2(
        cos(arcTime * 2.0 + fi * 3.0) * 0.15,
        sin(arcTime * 1.7 + fi * 2.5) * 0.12
      );
      float bd = lightningBolt(p, mid, branchEnd, arcThickness * 0.5, chaos * 1.3, arcTime + 10.0);
      float branchMask = 1.0 - smoothstep(0.0, 0.003, bd);
      float branchGlow = 1.0 - smoothstep(0.0, 0.025, bd);
      col += arcColor * branchMask * mids * 0.8;
      col += glowColor * branchGlow * mids * 0.2;
    }
  }

  // --- Drum onset flash (confidence-gated) ---
  if (drumOnset > 0.5) {
    col += vec3(0.3, 0.25, 0.4) * drumOnset * 0.4 * smoothstep(0.3, 0.7, uBeatConfidence);
  }

  // --- Feedback trail (persistence) ---
  vec3 prevColor = texture2D(uPrevFrame, uv).rgb;
  float decayRate = 0.92 + bass * 0.04;
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    decayRate += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    decayRate = clamp(decayRate, 0.80, 0.97);
  }
  col = max(col, prevColor * decayRate);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.6;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(arcHue, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(arcHue + 0.3, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.25, 0.18, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
