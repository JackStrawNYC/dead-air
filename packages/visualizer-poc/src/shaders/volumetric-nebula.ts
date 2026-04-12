/**
 * Volumetric Nebula — cosmic gas clouds with embedded stars.
 * Any energy affinity: cosmic immersion at all levels.
 *
 * Audio reactivity:
 *   uBass            → nebula density
 *   uEnergy          → step count (32-64), overall brightness
 *   uHarmonicTension → color saturation (low=monochrome blue, high=saturated reds/purples)
 *   uMelodicPitch    → nebula scale (high pitch=fine detail, low=broad)
 *   uDrumOnset       → brightness flash
 *   uSlowEnergy      → drift speed
 *   uPalettePrimary   → nebula tint
 *   uPaletteSecondary → star / emission color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const volumetricNebulaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({ bloomThresholdOffset: -0.1, caEnabled: true, dofEnabled: true, temporalBlendEnabled: false });

export const volumetricNebulaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// Star field: hash-based point lights
float starField(vec3 p) {
  vec3 cell = floor(p * 8.0);
  vec3 frac = fract(p * 8.0) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  // Only ~15% of cells have stars
  float star = step(0.85, h);
  float dist = length(frac);
  float brightness = h * star * smoothstep(0.08, 0.01, dist);
  return brightness;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);

  // Stem reactivity
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);

  // Section-type gates
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Stem drums accelerate gas churn
  float flowTime = uDynamicTime * (0.03 + slowE * 0.02 + stemDrums * 0.01) * (1.0 + sJam * 0.5 - sSpace * 0.4);

  // === PALETTE ===
  float hue1 = uPalettePrimary;
  vec3 nebulaTint = paletteHueColor(hue1, 0.78, 0.92);

  float hue2 = uPaletteSecondary;
  vec3 emissionTint = paletteHueColor(hue2, 0.85, 0.98);

  // Tension → color saturation
  // Low tension: monochrome blue; High tension: saturated reds/purples
  vec3 lowTensionColor = vec3(0.15, 0.18, 0.35);
  vec3 highTensionColor = nebulaTint * vec3(1.2, 0.5, 1.0); // reds/purples
  vec3 nebulaBaseColor = mix(lowTensionColor, highTensionColor, tension);

  // Space score → nebula expansion
  float spaceExpand = 1.0 + uSpaceScore * 0.3;

  // Pitch → nebula scale (high pitch = fine detail, low = broad)
  float nebulaScale = mix(0.4, 1.2, 1.0 - pitch) * (1.0 + sJam * 0.3 - sSpace * 0.3 + sSolo * 0.2) / spaceExpand;

  // === RAY SETUP (from 3D camera uniforms) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === VOLUMETRIC NEBULA RAYMARCH (32-64 steps) ===
  // Emission + absorption model: accumulate color AND opacity separately
  float energyDetail = 1.0 + energy * 0.5;
  int steps = int(mix(32.0, 64.0, smoothstep(0.2, 0.6, energy)) * energyDetail * 0.8);
  float stepSize = 0.12;

  vec3 nebulaAccum = vec3(0.0);
  float nebulaAlpha = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    if (nebulaAlpha > 0.95) break; // early exit when opaque
    float fi = float(i);
    float t = 0.5 + fi * stepSize;
    vec3 pos = ro + rd * t;

    // ridgedMultifractal for sharp nebula filaments
    float ridged = ridged4(pos * nebulaScale + vec3(flowTime * 0.1, 0.0, flowTime * 0.05));

    // Broad FBM for volume
    float broad = fbm3(pos * nebulaScale * 0.5 + vec3(0.0, flowTime * 0.08, 0.0));

    float density = ridged * 0.6 + broad * 0.4;

    // Bass density boost + section modulation
    density += sJam * 0.15 - sSpace * 0.1;
    // Stem bass deepens nebula density
    density *= 0.6 + bass * 0.5 + stemBass * 0.2;

    // Drum onset flash
    density += drumOnset * 0.2 * exp(-fi * 0.08);

    density *= 0.05;

    if (density > 0.001) {
      float alpha = density * (1.0 - nebulaAlpha);

      // Emission color varies with depth and ridged pattern
      vec3 emission = mix(nebulaBaseColor, emissionTint * 0.8, ridged * tension) * (1.0 + sChorus * 0.25);

      // Self-illumination: denser regions glow
      emission *= (1.0 + density * 8.0 * energy);

      // Depth coloring: warm near, cool far
      emission = mix(emission, emission * vec3(0.6, 0.7, 1.0), fi / float(steps));

      nebulaAccum += emission * alpha;
      nebulaAlpha += alpha;
    }

    // === EMBEDDED STARS ===
    float star = starField(pos + vec3(flowTime * 0.02));
    if (star > 0.01) {
      // Stars visible through thin nebula regions
      float starVisibility = (1.0 - nebulaAlpha) * star;
      vec3 starColor = mix(vec3(0.9, 0.92, 1.0), emissionTint, 0.2);
      nebulaAccum += starColor * starVisibility * 0.5;
    }
  }

  vec3 col = nebulaAccum;

  // === BACKGROUND STARS (for empty regions) ===
  float bgStars = starField(rd * 20.0 + vec3(flowTime * 0.01));
  vec3 bgColor = vec3(0.02, 0.02, 0.05) + vec3(0.8, 0.85, 1.0) * bgStars * 0.3 * (1.0 - nebulaAlpha);
  col = mix(bgColor, col, nebulaAlpha);

  // --- Secondary glow layer: palette-tinted emission haze ---
  float glowNoise = fbm3(vec3(p * 2.0, flowTime * 0.15));
  vec3 glowCol = mix(nebulaTint, emissionTint, glowNoise * 0.5 + 0.5) * 0.05;
  col += glowCol * (0.3 + energy * 0.2);

  // Vocal warmth: warm color bands in nebula
  col += vec3(0.08, 0.04, 0.02) * vocalE * 0.2 * nebulaAlpha;

  // Beat + climax
  col *= 1.0 + climaxBoost * 0.2;
  col *= 1.0 + uBeatSnap * 0.10 * (1.0 + climaxBoost * 0.3);

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, nebulaTint, emissionTint, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, nebulaTint, emissionTint, _nf, uSectionIndex);

  // Semantic: cosmic → expand nebula brightness
  col *= 1.0 + uSemanticCosmic * 0.18;

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
