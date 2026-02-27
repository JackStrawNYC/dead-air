/**
 * FluidLight — parametric GLSL fragment shaders.
 *
 * 6 variants of liquid light projector effects, each with different domain-warping,
 * color palettes, and energy response. All share the same uniform interface
 * provided by FullscreenQuad/AudioReactiveCanvas.
 *
 * Each variant is a function that returns the complete fragment shader string,
 * accepting variant-specific parameters embedded as constants.
 */

import { noiseGLSL } from "../../shaders/noise";

/** Shared vertex shader for all FluidLight variants */
export const fluidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Build a parametric fragment shader */
function buildFragmentShader(params: {
  warpPasses: number;
  warpStrength: number;
  fbmOctaves: number;
  timeScale: number;
  saturation: number;
  vignette: number;
  /** Cosine palette vectors: offset, amplitude, frequency, phase (each vec3) */
  paletteA: [number, number, number];
  paletteB: [number, number, number];
  paletteC: [number, number, number];
  paletteD: [number, number, number];
}): string {
  const { warpPasses, warpStrength, fbmOctaves, timeScale, saturation, vignette, paletteA, paletteB, paletteC, paletteD } = params;

  return /* glsl */ `
precision highp float;

${noiseGLSL}

varying vec2 vUv;

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
uniform float uChromaHue;
uniform float uFlatness;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uAfterglowHue;
uniform vec4 uContrast0;
uniform vec4 uContrast1;

// Cosine palette (Inigo Quilez)
vec3 cosPalette(float t) {
  vec3 a = vec3(${paletteA.join(", ")});
  vec3 b = vec3(${paletteB.join(", ")});
  vec3 c = vec3(${paletteC.join(", ")});
  vec3 d = vec3(${paletteD.join(", ")});
  // Blend with song palette hue
  float hueShift = uPalettePrimary * 6.2832;
  d += vec3(hueShift * 0.15, hueShift * 0.1, hueShift * 0.05);
  return a + b * cos(6.2832 * (c * t + d));
}

// Variable octave FBM
float fbmVar(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < ${fbmOctaves}; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * ${timeScale.toFixed(2)};

  // Domain warping
  vec2 q = p;
  float warpAmt = ${warpStrength.toFixed(2)} * (0.5 + uEnergy * 1.5);

  ${Array.from({ length: warpPasses }, (_, i) => `
  {
    float n1 = fbmVar(vec3(q * ${(1.5 + i * 0.5).toFixed(1)}, t * ${(0.3 + i * 0.15).toFixed(2)} + ${(i * 2.1).toFixed(1)}));
    float n2 = fbmVar(vec3(q * ${(1.8 + i * 0.4).toFixed(1)} + 5.0, t * ${(0.25 + i * 0.1).toFixed(2)} + ${(i * 3.7).toFixed(1)}));
    q += vec2(n1, n2) * warpAmt * ${(1.0 / (i + 1)).toFixed(2)};
  }
  `).join("")}

  // Main FBM with warped coordinates
  float n = fbmVar(vec3(q * 2.0, t * 0.2));

  // Color mapping via cosine palette
  float colorT = n * 0.5 + 0.5 + uChromaHue * 0.3;
  vec3 col = cosPalette(colorT);

  // Energy-responsive brightness
  col *= 0.6 + uEnergy * 0.8;

  // Bass-driven low-frequency pulse
  col *= 1.0 + uBass * 0.3 * sin(t * 0.5);

  // Onset flash
  col += vec3(uOnsetSnap * 0.15);

  // Beat pulse
  col *= 1.0 + uBeatSnap * 0.2;

  // Saturation control
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, ${saturation.toFixed(2)} * uPaletteSaturation);

  // Vignette
  float vig = 1.0 - length(p) * ${vignette.toFixed(2)};
  vig = smoothstep(0.0, 1.0, vig);
  col *= vig;

  // Film grain (2-frame hold)
  float grainTime = floor(uTime * 15.0) / 15.0;
  col += filmGrain(uv, grainTime) * 0.03;

  // S-curve grade
  col = sCurveGrade(col, uEnergy);

  // Lifted blacks
  col = max(col, vec3(0.03, 0.025, 0.035));

  gl_FragColor = vec4(col, 1.0);
}
`;
}

// ─── 6 Variant Shader Strings ───

/** Oil-glass projector: warm, flowing, 2-pass warp */
export const oilGlassFrag = buildFragmentShader({
  warpPasses: 2,
  warpStrength: 0.8,
  fbmOctaves: 5,
  timeScale: 0.12,
  saturation: 1.1,
  vignette: 0.4,
  paletteA: [0.5, 0.5, 0.5],
  paletteB: [0.5, 0.5, 0.5],
  paletteC: [1.0, 1.0, 1.0],
  paletteD: [0.0, 0.33, 0.67],
});

/** Lava flow: hot, slow, 3-pass warp with warm colors */
export const lavaFlowFrag = buildFragmentShader({
  warpPasses: 3,
  warpStrength: 1.2,
  fbmOctaves: 4,
  timeScale: 0.06,
  saturation: 1.3,
  vignette: 0.35,
  paletteA: [0.5, 0.3, 0.2],
  paletteB: [0.5, 0.3, 0.2],
  paletteC: [1.0, 0.7, 0.4],
  paletteD: [0.0, 0.15, 0.2],
});

/** Aurora: cool greens/purples, gentle 1-pass warp */
export const auroraFrag = buildFragmentShader({
  warpPasses: 1,
  warpStrength: 0.6,
  fbmOctaves: 6,
  timeScale: 0.08,
  saturation: 1.2,
  vignette: 0.3,
  paletteA: [0.3, 0.5, 0.5],
  paletteB: [0.3, 0.5, 0.3],
  paletteC: [1.0, 1.0, 0.5],
  paletteD: [0.8, 0.9, 0.3],
});

/** Smoke wisps: desaturated, ethereal, 2-pass */
export const smokeWispsFrag = buildFragmentShader({
  warpPasses: 2,
  warpStrength: 0.5,
  fbmOctaves: 5,
  timeScale: 0.1,
  saturation: 0.6,
  vignette: 0.45,
  paletteA: [0.4, 0.4, 0.45],
  paletteB: [0.2, 0.2, 0.25],
  paletteC: [1.0, 1.0, 1.0],
  paletteD: [0.0, 0.1, 0.2],
});

/** Plasma field: vivid, fast, 3-pass warp */
export const plasmaFieldFrag = buildFragmentShader({
  warpPasses: 3,
  warpStrength: 1.0,
  fbmOctaves: 4,
  timeScale: 0.18,
  saturation: 1.4,
  vignette: 0.3,
  paletteA: [0.5, 0.5, 0.5],
  paletteB: [0.5, 0.5, 0.5],
  paletteC: [2.0, 1.0, 0.0],
  paletteD: [0.5, 0.2, 0.25],
});

/** Ink in water: slow diffusion, muted 1-pass */
export const inkWaterFrag = buildFragmentShader({
  warpPasses: 1,
  warpStrength: 0.4,
  fbmOctaves: 6,
  timeScale: 0.05,
  saturation: 0.9,
  vignette: 0.35,
  paletteA: [0.2, 0.2, 0.3],
  paletteB: [0.4, 0.3, 0.5],
  paletteC: [1.0, 1.0, 1.5],
  paletteD: [0.25, 0.4, 0.55],
});
