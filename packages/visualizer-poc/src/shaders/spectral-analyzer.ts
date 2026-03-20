/**
 * Spectral Analyzer — FFT frequency bar visualization.
 * Classic concert VJ staple: vertical bars representing 7 frequency bands,
 * each mapped to a hue from the palette. Bars pulse with energy, glow
 * at edges, and reflect off a glossy floor.
 *
 * Audio reactivity:
 *   uContrast0/uContrast1  → 7-band spectral energy drives bar heights
 *   uBass        → floor reflection intensity, bar thickness
 *   uEnergy      → overall brightness, background glow
 *   uOnsetSnap   → sharp bar spike on transients
 *   uBeatSnap    → bar width pulse on beats
 *   uDrumOnset   → floor shake, bar jitter
 *   uPalettePrimary   → bar color base hue
 *   uPaletteSecondary → bar edge glow hue
 *   uMusicalTime      → beat-locked pulsation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const spectralAnalyzerVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const spectralAnalyzerFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, bloomThresholdOffset: -0.08, crtEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define NUM_BARS 7

// Get contrast band value by index (0-6)
float getBand(int i) {
  if (i < 4) {
    if (i == 0) return uContrast0.x;
    if (i == 1) return uContrast0.y;
    if (i == 2) return uContrast0.z;
    return uContrast0.w;
  }
  if (i == 4) return uContrast1.x;
  if (i == 5) return uContrast1.y;
  return uContrast1.z;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.10 * chordConf;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: wider bars, taller, more glow. Space: narrow, short, dim. Chorus: bright, wide spread.
  float sectionBarWidth = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.2, sChorus);
  float sectionBarHeight = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.15, sChorus);
  float sectionGlow = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  // Background: deep dark with subtle gradient
  vec3 bgColor = mix(
    vec3(0.02, 0.01, 0.04),
    vec3(0.06, 0.04, 0.08),
    uv.y
  );
  // Energy-driven background glow
  bgColor += vec3(0.02, 0.01, 0.03) * energy;

  vec3 col = bgColor;

  // Bar geometry
  float barWidth = (0.06 + uBeatSnap * 0.015) * sectionBarWidth;
  float barSpacing = aspect.x / float(NUM_BARS);
  float barStart = -aspect.x * 0.5 + barSpacing * 0.5;
  float floorY = -0.35;

  // Beat pulse for bar height boost
  float bp = beatPulse(uMusicalTime);

  for (int i = 0; i < NUM_BARS; i++) {
    float fi = float(i);
    float centerX = barStart + fi * barSpacing;

    // Distance from bar center
    float dx = abs(p.x - centerX);
    if (dx > barWidth * 2.0) continue; // early skip

    // Band energy with onset spike + stem drums amplify transients
    float bandEnergy = getBand(i);
    bandEnergy += onset * 0.3 + stemDrums * 0.15;
    bandEnergy += bp * 0.15;
    bandEnergy = clamp(bandEnergy, 0.0, 1.0);

    // Bar height (section-modulated)
    float barHeight = bandEnergy * 0.65 * sectionBarHeight;

    // Bar shape: soft rectangle
    float barMask = smoothstep(barWidth, barWidth - 0.008, dx);
    float barBottom = floorY;
    float barTop = floorY + barHeight;
    float barY = smoothstep(barBottom - 0.005, barBottom, p.y)
               * smoothstep(barTop, barTop - 0.005, p.y);
    float bar = barMask * barY;

    // Color: hue mapped across frequency spectrum using palette + chord shift
    float hue = mix(uPalettePrimary, uPaletteSecondary, fi / float(NUM_BARS - 1)) + chordHue;
    float sat = mix(0.7, 1.0, bandEnergy) * uPaletteSaturation + tension * 0.1;
    vec3 barColor = hsv2rgb(vec3(hue, sat, 1.0));

    // Brightness: brighter at top of bar (energy peak), melodic pitch warms top
    float heightGrad = (p.y - barBottom) / max(barHeight, 0.001);
    float brightness = mix(0.5, 1.2 + melodicPitch * 0.2, clamp(heightGrad, 0.0, 1.0));
    brightness *= 0.6 + bandEnergy * 0.6;

    col += barColor * bar * brightness;

    // Edge glow: soft bloom around each bar
    float glowDist = max(dx - barWidth, 0.0);
    float glowY = smoothstep(barBottom - 0.02, barBottom, p.y)
                * smoothstep(barTop + 0.08, barTop - 0.02, p.y);
    float glow = exp(-glowDist * 30.0) * glowY * bandEnergy * 0.35 * sectionGlow;
    vec3 glowColor = hsv2rgb(vec3(hue + 0.05, sat * 0.6, 1.0));
    col += glowColor * glow;

    // Floor reflection (below floorY): mirrored, dimmed, fading
    if (p.y < floorY) {
      float reflDist = floorY - p.y;
      float reflFade = exp(-reflDist * 5.0) * 0.35 * bass;
      float reflBarY = smoothstep(floorY, floorY - barHeight * 0.6, p.y);
      float reflBar = barMask * reflBarY * reflFade;
      col += barColor * reflBar * 0.4;
    }
  }

  // Horizontal scan line (concert LED look)
  float scanline = sin(p.y * 200.0 + uDynamicTime * 2.0) * 0.02;
  col *= 1.0 + scanline * energy;

  // Floor line: glossy reflective surface
  float floorLine = smoothstep(0.005, 0.0, abs(p.y - floorY));
  col += vec3(0.15, 0.12, 0.2) * floorLine * (0.3 + energy * 0.4);

  // Drum jitter: micro-displacement of whole scene
  float jitter = drumOnset * sin(uTime * 50.0) * 0.002;
  col += col * jitter;

  // Vignette
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.03), col, vignette);

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  vec3 _ic1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 0.9));
  vec3 _ic2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 0.9));
  col += iconEmergence(p, uTime, energy, uBass, _ic1, _ic2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, _ic1, _ic2, _nf, uSectionIndex);

  // Post-processing
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
