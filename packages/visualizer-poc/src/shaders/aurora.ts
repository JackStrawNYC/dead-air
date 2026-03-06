/**
 * Aurora — northern lights / atmospheric curtains of luminous color.
 * Vertical ribbons ripple and fold across a dark starfield sky.
 * Designed for tender, contemplative songs (Stella Blue, Loser, Wharf Rat).
 *
 * Movement is always slow and organic — never frantic. Quiet passages
 * show faint distant shimmer; peaks flood the sky with curtains of light.
 *
 * Audio reactivity:
 *   uBass       → curtain sway amplitude, low-frequency ripple
 *   uEnergy     → curtain brightness, vertical coverage (quiet=faint, loud=full sky)
 *   uHighs      → fine ribbon detail, edge sharpness
 *   uOnsetSnap  → brief brightness pulse through curtains
 *   uSlowEnergy → overall drift speed, color saturation (ambient signal)
 *   uChromaHue  → shifts curtain color over time with harmonic content
 *   uPalettePrimary   → dominant curtain color
 *   uPaletteSecondary → secondary curtain/edge glow color
 */

import { noiseGLSL } from "./noise";

export const auroraVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const auroraFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform float uTime;
uniform float uBass;
uniform float uRms;
uniform float uCentroid;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uMids;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uChromaHue;
uniform float uFlatness;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uSlowEnergy;
uniform vec4 uContrast0;
uniform vec4 uContrast1;

varying vec2 vUv;

#define PI 3.14159265

// --- HSV to RGB conversion ---
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// --- Starfield: simple procedural stars ---
float stars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  // Pseudo-random star position within cell
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  // Only ~30% of cells have a star
  float hasStar = step(0.7, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.03, 0.005, dist);
}

// --- Aurora curtain function ---
// Returns intensity of a single curtain ribbon at position y
// given an x-offset and fold parameters.
float curtainRibbon(vec2 p, float xOffset, float fold, float width, float sharpness) {
  // Ribbon center: sine wave with noise-based folding
  float ribbonX = xOffset + sin(p.y * 2.0 + fold) * 0.15
                + snoise(vec3(p.y * 1.5, fold * 0.5, 0.0)) * 0.2;
  float dist = abs(p.x - ribbonX);
  // Width narrows with sharpness (highs)
  float w = width * mix(1.0, 0.5, sharpness);
  return smoothstep(w, w * 0.1, dist);
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
  float chromaH = clamp(uChromaHue, 0.0, 1.0);

  // === SLOW TIME: aurora should never feel rushed ===
  float slowTime = uTime * 0.08;
  float driftSpeed = 0.03 + slowE * 0.02;

  // === DARK SKY background ===
  // Gradient: darker at top, slightly lighter at horizon
  vec3 skyColor = mix(
    vec3(0.005, 0.008, 0.02),  // top: near black
    vec3(0.02, 0.03, 0.06),    // bottom: dark blue
    smoothstep(0.5, -0.3, p.y)
  );
  vec3 col = skyColor;

  // === STARS: visible through gaps in aurora ===
  float starLayer1 = stars(uv + slowTime * 0.01, 80.0);
  float starLayer2 = stars(uv + slowTime * 0.005 + 10.0, 120.0) * 0.6;
  // Subtle twinkle
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + uv.x * 50.0 + uv.y * 30.0);
  vec3 starColor = vec3(0.8, 0.85, 1.0) * (starLayer1 + starLayer2) * twinkle;
  col += starColor * 0.4;

  // === AURORA COLORS from palette + chromaHue shift ===
  float hue1 = uPalettePrimary + chromaH * 0.1;
  float hue2 = uPaletteSecondary + chromaH * 0.08;
  float sat = mix(0.5, 0.9, slowE) * uPaletteSaturation;

  vec3 auroraColor1 = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 auroraColor2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.9));
  // Classic aurora green-to-purple gradient as a mix target
  vec3 classicGreen = vec3(0.1, 0.9, 0.4);
  vec3 classicPurple = vec3(0.5, 0.2, 0.8);
  auroraColor1 = mix(auroraColor1, classicGreen, 0.25);
  auroraColor2 = mix(auroraColor2, classicPurple, 0.2);

  // === CURTAIN PARAMETERS ===
  // Bass controls sway amplitude
  float swayAmt = 0.1 + bass * 0.25;
  // Energy controls vertical extent: quiet = faint shimmer near top, peaks = full sky
  float verticalCoverage = mix(0.15, 0.7, energy);
  // Curtain base position: starts near top of screen
  float curtainBase = mix(0.35, 0.0, energy);
  // Brightness: quiet = faint, peaks = vivid
  float curtainBrightness = mix(0.15, 0.8, energy);
  // Onset pulse
  curtainBrightness += onset * 0.3;

  // === RENDER AURORA CURTAINS ===
  float auroraIntensity = 0.0;
  float colorMix = 0.0;

  // Multiple overlapping curtain ribbons for depth
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = fi * 2.37;

    // Each ribbon has its own sway phase and fold pattern
    float fold = slowTime * (0.5 + fi * 0.15) + seed * 3.0;
    float xOff = sin(seed * 5.0 + slowTime * 0.3) * 0.4 + (fi - 2.0) * 0.15;

    // Bass drives additional sway
    float bassSway = swayAmt * sin(uTime * 0.5 + fi * 1.2);
    xOff += bassSway;

    // Ribbon width varies per layer
    float width = 0.12 + fi * 0.02;
    float sharpness = highs;

    // Y-domain: curtain fades below curtainBase
    float yMask = smoothstep(curtainBase - 0.05, curtainBase + verticalCoverage, p.y + 0.5);
    // Also fade at very top
    float topFade = smoothstep(0.55, 0.45, p.y);
    yMask *= topFade;

    float ribbon = curtainRibbon(p, xOff, fold, width, sharpness);
    ribbon *= yMask;

    // Vertical brightness variation within curtain (brighter at lower edge)
    float vertBright = smoothstep(curtainBase + verticalCoverage, curtainBase, p.y + 0.5);
    vertBright = mix(0.4, 1.0, vertBright);
    ribbon *= vertBright;

    // Noise-based luminosity variation along the ribbon
    float lumNoise = snoise(vec3(p.x * 3.0 + seed, p.y * 2.0, slowTime + fi * 0.5));
    ribbon *= 0.6 + 0.4 * lumNoise;

    auroraIntensity += ribbon * (1.0 - fi * 0.12);
    colorMix += ribbon * fi * 0.25;
  }

  auroraIntensity = clamp(auroraIntensity, 0.0, 1.0);
  colorMix = clamp(colorMix, 0.0, 1.0);

  // Color the aurora: blend between primary and secondary
  vec3 auroraCol = mix(auroraColor1, auroraColor2, colorMix);
  // Add vertical color shift (green at bottom, purple at top — classic aurora)
  float vertColorShift = smoothstep(-0.2, 0.4, p.y);
  auroraCol = mix(auroraCol, auroraColor2, vertColorShift * 0.4);

  // Apply aurora to scene
  col += auroraCol * auroraIntensity * curtainBrightness;

  // === ATMOSPHERIC GLOW: diffuse light beneath curtains ===
  float glowY = smoothstep(curtainBase + verticalCoverage + 0.1, curtainBase - 0.1, p.y + 0.5);
  float glowStrength = auroraIntensity * energy * 0.15;
  vec3 glowColor = mix(auroraColor1, vec3(0.1, 0.2, 0.15), 0.5);
  col += glowColor * glowY * glowStrength;

  // === DIM STARS behind bright aurora ===
  // Aurora should obscure stars where it's bright
  col -= starColor * 0.4 * auroraIntensity * curtainBrightness;

  // === VIGNETTE ===
  float vigScale = mix(0.70, 0.62, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.0), col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy * 0.5, uOnsetSnap) * 0.7;

  // === BLOOM: soft ethereal glow ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.35, 0.25, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.0;
  vec3 bloomColor = mix(col, auroraColor1, 0.3);
  col += bloomColor * bloomAmount * 0.3;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.025, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // === LIFTED BLACKS (cold blue-green tint) ===
  col = max(col, vec3(0.02, 0.03, 0.05));

  gl_FragColor = vec4(col, 1.0);
}
`;
