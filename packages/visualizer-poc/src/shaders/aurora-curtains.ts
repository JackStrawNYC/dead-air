/**
 * Aurora Curtains — multi-layer aurora borealis.
 * Layered aurora with magnetic field line curvature. FBM-driven shimmer,
 * chroma-tinted bands.
 *
 * Audio reactivity:
 *   uMelodicPitch     → curtain height
 *   uMelodicDirection → wave direction
 *   uHarmonicTension  → fold complexity
 *   uChromaHue        → aurora color
 *   uSlowEnergy       → brightness
 *   uBass             → ground glow intensity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const auroraCurtainsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const auroraCurtainsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  paletteCycleEnabled: true,
  grainStrength: "light",
  temporalBlendEnabled: false,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Aurora curtain layer: vertical ribbons with wave displacement
float auroraCurtain(vec2 p, float time, float freq, float amplitude, float speed, float phase) {
  // Horizontal wave displacement
  float wave = sin(p.x * freq + time * speed + phase) * amplitude;
  wave += sin(p.x * freq * 2.3 + time * speed * 0.7 + phase * 1.5) * amplitude * 0.3;

  // Vertical extent with soft falloff
  float curtainY = 0.1 + wave;
  float dist = p.y - curtainY;

  // Soft vertical gradient (brighter at top, fades toward bottom)
  float vGrad = smoothstep(-0.3, 0.1, dist) * smoothstep(0.5, 0.0, dist);

  return vGrad;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection + 1.0, 0.0, 2.0) * 0.5; // remap -1..1 to 0..1
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.25;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float slowTime = uDynamicTime * 0.03 * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);

  // --- Sky background gradient ---
  float skyGrad = smoothstep(-0.5, 0.3, p.y);
  vec3 skyLow = vec3(0.005, 0.008, 0.02);
  vec3 skyHigh = vec3(0.01, 0.015, 0.04);
  vec3 col = mix(skyLow, skyHigh, skyGrad);

  // --- Multi-layer aurora curtains ---
  float curtainHeight = mix(0.05, 0.15, melodicPitch);
  float foldComplexity = 3.0 + tension * 5.0;
  float waveDir = mix(-0.5, 0.5, melodicDir);

  // Layer 1: main curtain
  float c1 = auroraCurtain(p, slowTime, foldComplexity, curtainHeight, 0.3 + waveDir, 0.0);
  float n1 = fbm3(vec3(p * 3.0, slowTime * 0.5)) * 0.5 + 0.5;
  float hue1 = uPalettePrimary + chromaHueMod;
  vec3 layer1 = hsv2rgb(vec3(hue1, mix(0.5, 0.9, energy) * uPaletteSaturation, c1 * n1 * slowEnergy));

  // Layer 2: secondary curtain (offset)
  float c2 = auroraCurtain(p + vec2(0.1, -0.05), slowTime * 0.8, foldComplexity * 1.3, curtainHeight * 0.7, 0.2 - waveDir * 0.5, PI * 0.5);
  float n2 = fbm3(vec3(p * 4.0 + 10.0, slowTime * 0.4)) * 0.5 + 0.5;
  float hue2 = uPaletteSecondary + chromaHueMod * 0.5;
  vec3 layer2 = hsv2rgb(vec3(hue2, mix(0.4, 0.85, energy) * uPaletteSaturation, c2 * n2 * slowEnergy * 0.8));

  // Layer 3: subtle background shimmer
  float c3 = auroraCurtain(p + vec2(-0.15, 0.03), slowTime * 0.6, foldComplexity * 0.7, curtainHeight * 1.2, 0.15, PI);
  float n3 = fbm(p * 2.0 + slowTime * 0.2) * 0.5 + 0.5;
  float hue3 = mix(hue1, hue2, 0.5) + 0.1;
  vec3 layer3 = hsv2rgb(vec3(hue3, 0.4 * uPaletteSaturation, c3 * n3 * slowEnergy * 0.4));

  col += layer1 + layer2 + layer3;

  // --- Magnetic field line shimmer ---
  float fieldLines = sin(p.x * 20.0 + p.y * 5.0 + slowTime * 2.0) * 0.5 + 0.5;
  fieldLines *= smoothstep(-0.1, 0.2, p.y) * smoothstep(0.5, 0.1, p.y);
  col += vec3(fieldLines * 0.03) * energy;

  // --- Ground glow ---
  float groundGlow = exp(-max(-p.y - 0.3, 0.0) * 8.0) * bass * 0.15;
  vec3 glowColor = hsv2rgb(vec3(uPalettePrimary + 0.05, 0.6, groundGlow));
  col += glowColor;

  // --- Star field in dark sky ---
  float starNoise = snoise(vec3(p * 100.0, 0.0));
  float stars = smoothstep(0.97, 1.0, starNoise) * 0.5;
  stars *= smoothstep(0.0, 0.3, p.y); // only in upper sky
  col += vec3(stars);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 ic1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 ic2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    col += iconEmergence(p, uTime, energy, bass, ic1, ic2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.005, 0.012), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
