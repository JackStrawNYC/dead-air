/**
 * Lava Flow — viscous fluid with cooling crust.
 * Hot core beneath cracking surface. Drum hits crack the crust, revealing magma.
 *
 * Audio reactivity:
 *   uBass            → magma pressure
 *   uEnergy          → surface temperature
 *   uDrumOnset       → crust crack events
 *   uHarmonicTension → viscosity
 *   uStemBass        → deep rumble flow speed
 *   uChromaHue       → lava color shift
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const lavaFlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const lavaFlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
})}

varying vec2 vUv;

#define PI 3.14159265

// Voronoi for crust crack pattern
vec2 voronoiHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float voronoi(vec2 p, out float edgeDist) {
  vec2 cell = floor(p);
  vec2 f = fract(p);

  float minDist = 1.0;
  float secondDist = 1.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = voronoiHash(cell + neighbor);
      vec2 diff = neighbor + point - f;
      float d = length(diff);
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  edgeDist = secondDist - minDist;
  return minDist;
}

// Magma temperature color (black → red → orange → yellow → white)
vec3 magmaColor(float temp, float hueShift) {
  float h = 0.0 + hueShift; // base red
  float s = mix(1.0, 0.3, smoothstep(0.6, 1.0, temp));
  float v = smoothstep(0.0, 0.5, temp);

  // Shift from red to orange to yellow as temperature rises
  h += temp * 0.08;

  vec3 col = hsv2rgb(vec3(h, s, v));

  // Add white-hot core
  col += vec3(smoothstep(0.8, 1.0, temp) * 0.5);

  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.05;
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.03;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float crackFreqMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.1, sChorus);
  float magmaPressureMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);
  float flowSpeedMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.15, sChorus);

  float flowSpeed = (0.02 + stemBass * 0.04) * flowSpeedMod;
  float viscosity = mix(1.0, 0.3, tension);

  // --- Feedback: previous frame provides cooling/persistence ---
  vec4 prev = texture2D(uPrevFrame, vUv);

  // --- Flow displacement ---
  vec2 flowP = p + vec2(
    fbm3(vec3(p * 2.0, slowTime * flowSpeed)) * 0.1,
    fbm3(vec3(p * 2.0 + 50.0, slowTime * flowSpeed)) * 0.1
  ) * viscosity;

  // --- Magma layer (underneath) ---
  float magmaNoise = fbm6(vec3(flowP * 3.0, slowTime * 0.5));
  float magmaPressure = (bass * 0.6 + energy * 0.4) * magmaPressureMod;
  float magmaTemp = magmaNoise * 0.5 + magmaPressure * 0.5 + melodicPitch * 0.15;
  magmaTemp = clamp(magmaTemp, 0.0, 1.0);

  float hueShift = uPalettePrimary - 0.0 + chromaHueMod;
  vec3 magma = magmaColor(magmaTemp, hueShift);

  // --- Crust layer ---
  float edgeDist;
  float crustScale = (4.0 + tension * 3.0) * crackFreqMod * mix(0.8, 1.2, beatStability);
  float crustCell = voronoi(flowP * crustScale + slowTime * 0.1, edgeDist);

  // Cracks: thin lines between voronoi cells
  float crackWidth = 0.02 + drumOnset * 0.05;
  float cracks = smoothstep(crackWidth, 0.0, edgeDist);

  // Crust cooling: darker, cooler surface
  float crustTemp = mix(0.1, 0.4, energy);
  vec3 crustColor = vec3(crustTemp * 0.15, crustTemp * 0.08, crustTemp * 0.05);

  // Drum onset cracks the crust open
  float crackReveal = cracks + drumOnset * 0.5;
  crackReveal = clamp(crackReveal, 0.0, 1.0);

  // Mix magma visible through cracks, crust elsewhere
  vec3 col = mix(crustColor, magma, crackReveal);

  // --- Crack glow emission ---
  float crackGlow = exp(-edgeDist * 30.0) * magmaPressure;
  col += magmaColor(crackGlow * 0.8 + 0.2, hueShift) * crackGlow * 0.5;

  // --- Surface heat shimmer ---
  float shimmer = sin(p.x * 30.0 + slowTime * 5.0 + fbm(p * 5.0) * 10.0) * 0.5 + 0.5;
  shimmer *= energy * 0.1;
  col += vec3(shimmer * 0.3, shimmer * 0.15, 0.0);

  // --- Drum hit eruption flash ---
  if (drumOnset > 0.5) {
    float eruptionStrength = (drumOnset - 0.5) * 2.0;
    // Bright flash centered on random crack point
    float eruptNoise = snoise(vec3(p * 5.0, slowTime * 10.0));
    float eruption = smoothstep(0.3, 1.0, eruptNoise) * eruptionStrength;
    col += magmaColor(0.9, hueShift) * eruption * 0.4;
  }

  // --- Feedback blending (cooling persistence) ---
  float decay = 0.96;
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    decay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    decay = clamp(decay, 0.80, 0.97);
  }
  col = max(col, prev.rgb * decay * 0.7);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;
  // Climax: more cracks open
  if (isClimax > 0.5) {
    col = mix(col, magma, 0.3 * uClimaxIntensity);
  }


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.9, 1.0));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.9, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.003, 0.0), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
