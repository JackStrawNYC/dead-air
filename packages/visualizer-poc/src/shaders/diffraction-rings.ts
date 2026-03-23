/**
 * Newton's Rings / Diffraction — thin-film interference patterns.
 * Multiple interference sources create overlapping rainbow rings via
 * wavelength-to-RGB spectral mapping (380-780nm visible range).
 *
 * Visual aesthetic:
 *   - Quiet: sparse, slowly drifting iridescent rings
 *   - Building: sources multiply, rings tighten, colors saturate
 *   - Peak: dense overlapping interference with bright spectral highlights
 *   - Release: sources recede, rings widen, colors fade
 *
 * Audio reactivity:
 *   uBass            → ring spacing (wider at high bass)
 *   uEnergy          → source count + separation
 *   uOnsetSnap       → ripple injection (new interference source)
 *   uMelodicPitch    → film thickness (shifts spectral response)
 *   uHarmonicTension → turbulence in source positions
 *   uChordIndex      → base wavelength offset
 *   uSlowEnergy      → overall brightness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const diffractionRingsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const diffractionRingsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Approximate wavelength (nm) to RGB
// Maps 380-780nm visible spectrum to sRGB
vec3 wavelengthToRGB(float wavelength) {
  float w = clamp(wavelength, 380.0, 780.0);
  vec3 rgb;

  if (w < 440.0) {
    rgb = vec3(-(w - 440.0) / 60.0, 0.0, 1.0);
  } else if (w < 490.0) {
    rgb = vec3(0.0, (w - 440.0) / 50.0, 1.0);
  } else if (w < 510.0) {
    rgb = vec3(0.0, 1.0, -(w - 510.0) / 20.0);
  } else if (w < 580.0) {
    rgb = vec3((w - 510.0) / 70.0, 1.0, 0.0);
  } else if (w < 645.0) {
    rgb = vec3(1.0, -(w - 645.0) / 65.0, 0.0);
  } else {
    rgb = vec3(1.0, 0.0, 0.0);
  }

  // Intensity falloff at edges of visible spectrum
  float factor;
  if (w < 420.0) {
    factor = 0.3 + 0.7 * (w - 380.0) / 40.0;
  } else if (w > 700.0) {
    factor = 0.3 + 0.7 * (780.0 - w) / 80.0;
  } else {
    factor = 1.0;
  }

  return rgb * factor;
}

// Thin-film interference: convert path difference to spectral color
vec3 thinFilmColor(float pathDiff, float filmThickness) {
  // Interference: constructive when path difference = n * wavelength
  // Sample multiple wavelengths for full spectral response
  vec3 col = vec3(0.0);
  float numSamples = 8.0;

  for (float i = 0.0; i < 8.0; i++) {
    float wavelength = 380.0 + (400.0 * i / numSamples); // 380-780nm
    float phase = pathDiff * TAU / (wavelength * 0.001 * filmThickness);
    float intensity = 0.5 + 0.5 * cos(phase);
    col += wavelengthToRGB(wavelength) * intensity;
  }

  return col / numSamples;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.03;
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0;
  float accelBoost = 1.0 + uEnergyAccel * 0.1;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float ringSpacingMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.1, sChorus);
  float sourceCountMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);
  float rippleSpeedMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.15, sChorus);

  // --- Background ---
  vec3 col = vec3(0.01, 0.008, 0.015);

  // --- Interference source positions ---
  // Number of sources scales with energy (3-5, section-modulated)
  float numSources = (3.0 + energy * 2.0) * sourceCountMod;

  // Ring spacing from bass (wider rings at high bass, section-modulated)
  float ringSpacing = (0.5 + bass * 1.5) * ringSpacingMod;

  // Film thickness from melodic pitch
  float filmThickness = 0.8 + melodicPitch * 1.2;

  // Base wavelength offset from chord
  float waveOffset = chordHue * 100.0;

  // Source 1: center, slowly drifting
  {
    vec2 srcPos = vec2(
      sin(slowTime * 0.5) * 0.15,
      cos(slowTime * 0.4) * 0.12
    );
    // Turbulence from tension
    if (tension > 0.1) {
      srcPos += vec2(
        snoise(vec3(srcPos * 3.0, slowTime * 2.0)),
        snoise(vec3(srcPos * 3.0 + 5.0, slowTime * 2.0))
      ) * tension * 0.08;
    }
    float dist = length(p - srcPos);
    float pathDiff = dist * ringSpacing * 50.0 + waveOffset;
    vec3 rings = thinFilmColor(pathDiff, filmThickness);
    float falloff = 1.0 / (1.0 + dist * dist * 4.0);
    col += rings * falloff * (0.5 + slowE * 0.5);
  }

  // Source 2: orbiting
  {
    float orbitAngle = slowTime * 0.7;
    float orbitRadius = 0.25 + energy * 0.15;
    vec2 srcPos = vec2(cos(orbitAngle), sin(orbitAngle)) * orbitRadius;
    float dist = length(p - srcPos);
    float pathDiff = dist * ringSpacing * 45.0 + waveOffset + 50.0;
    vec3 rings = thinFilmColor(pathDiff, filmThickness * 1.1);
    float falloff = 1.0 / (1.0 + dist * dist * 5.0);
    col += rings * falloff * (0.4 + slowE * 0.4);
  }

  // Source 3: counter-orbiting
  {
    float orbitAngle = -slowTime * 0.5 + 2.0;
    float orbitRadius = 0.3 + energy * 0.1;
    vec2 srcPos = vec2(cos(orbitAngle), sin(orbitAngle)) * orbitRadius;
    float dist = length(p - srcPos);
    float pathDiff = dist * ringSpacing * 55.0 + waveOffset + 100.0;
    vec3 rings = thinFilmColor(pathDiff, filmThickness * 0.9);
    float falloff = 1.0 / (1.0 + dist * dist * 5.0);
    col += rings * falloff * (0.35 + slowE * 0.35);
  }

  // Source 4: energy-gated
  if (numSources > 3.5) {
    vec2 srcPos = vec2(
      sin(slowTime * 1.1 + 3.0) * 0.35,
      cos(slowTime * 0.8 + 1.5) * 0.25
    );
    float dist = length(p - srcPos);
    float pathDiff = dist * ringSpacing * 48.0 + waveOffset + 150.0;
    vec3 rings = thinFilmColor(pathDiff, filmThickness * 1.2);
    float falloff = 1.0 / (1.0 + dist * dist * 6.0);
    float gate = smoothstep(3.5, 4.0, numSources);
    col += rings * falloff * 0.3 * gate;
  }

  // Source 5: high-energy only
  if (numSources > 4.5) {
    vec2 srcPos = vec2(
      cos(slowTime * 0.9 + 5.0) * 0.2,
      sin(slowTime * 1.3 + 4.0) * 0.3
    );
    float dist = length(p - srcPos);
    float pathDiff = dist * ringSpacing * 52.0 + waveOffset + 200.0;
    vec3 rings = thinFilmColor(pathDiff, filmThickness * 0.8);
    float falloff = 1.0 / (1.0 + dist * dist * 6.0);
    float gate = smoothstep(4.5, 5.0, numSources);
    col += rings * falloff * 0.25 * gate;
  }

  // --- Onset ripple injection ---
  if (onset > 0.2) {
    float rippleDist = length(p);
    float ripple = sin(rippleDist * 30.0 - uTime * 8.0 * rippleSpeedMod) * exp(-rippleDist * 2.0);
    vec3 rippleColor = thinFilmColor(rippleDist * 60.0, filmThickness);
    col += rippleColor * ripple * onset * 0.5;
  }

  // --- Palette tinting ---
  float hue1 = uPalettePrimary + chromaHueMod;
  float hue2 = uPaletteSecondary;
  float sat = uPaletteSaturation;
  vec3 tint = hsv2rgb(vec3(hue1, sat * 0.3, 1.0));
  col *= mix(vec3(1.0), tint, 0.2);

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
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col *= vignette;

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
