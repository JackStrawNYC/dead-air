/**
 * Particle Nebula — raymarched volumetric nebula cloud with embedded star
 * clusters and particle filaments. Full emission+absorption volumetric
 * rendering with ridged multifractal density.
 *
 * Audio reactivity:
 *   uBass            → nebula density / thickness
 *   uEnergy          → step count (32-64), overall brightness
 *   uDrumOnset       → brightness flash (supernova pulse)
 *   uVocalPresence   → warm emission tint shift
 *   uHarmonicTension → color saturation (low=monochrome, high=vivid)
 *   uMelodicPitch    → nebula scale (high=fine filaments, low=broad clouds)
 *   uSectionType     → jam=dense swirling, space=thin/starry, chorus=bright
 *   uClimaxPhase     → supernova burst (radial bloom + density explosion)
 *   uSlowEnergy      → drift speed
 *   uSpaceScore      → nebula expansion / thinning
 *   uTimbralBrightness → emission temperature (cool→hot)
 *   uDynamicRange    → contrast between dense/sparse regions
 *   uBeatStability   → filament coherence (stable=sharp, unstable=diffuse)
 *   uPalettePrimary  → nebula tint
 *   uPaletteSecondary → star / emission color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const particleNebulaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.12,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  temporalBlendEnabled: false,
});

export const particleNebulaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── pn-prefixed helper functions ───

// Hash-based star field: point lights scattered in 3D cells
float pnStars(vec3 pos) {
  vec3 cell = floor(pos * 10.0);
  vec3 f = fract(pos * 10.0) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  // ~12% of cells contain a star
  float star = step(0.88, h);
  float dist = length(f);
  // Tight point-like falloff
  float brightness = h * star * smoothstep(0.06, 0.005, dist);
  return brightness;
}

// Background star layer (farfield, no volume interaction)
float pnBgStars(vec3 dir) {
  vec3 cell = floor(dir * 30.0);
  vec3 f = fract(dir * 30.0) - 0.5;
  float h = fract(sin(dot(cell, vec3(91.3, 157.9, 233.1))) * 43758.5453);
  float star = step(0.92, h);
  float dist = length(f);
  // Twinkle: time-varying brightness
  float twinkle = 0.7 + 0.3 * sin(h * TAU + uDynamicTime * (1.0 + h * 3.0));
  return h * star * smoothstep(0.04, 0.002, dist) * twinkle;
}

// Nebula density field: ridged multifractal + FBM blend with curl advection
float pnDensity(vec3 pos, float flowTime, float nebulaScale, float bassBoost, float jamMod) {
  // Curl advection: swirl the sample position for organic motion
  vec3 curl = curlNoise(pos * 0.3 + flowTime * 0.05) * (0.3 + jamMod * 0.4);
  vec3 advected = pos + curl;

  // Primary structure: ridged multifractal for sharp filaments
  float ridged = ridgedMultifractal(advected * nebulaScale, 5, 2.2, 0.45);

  // Broad volumetric fill: low-frequency FBM
  float broad = fbm3(advected * nebulaScale * 0.4 + vec3(0.0, flowTime * 0.06, flowTime * 0.03));

  // Fine filament detail: high-frequency noise
  float fine = snoise(advected * nebulaScale * 3.0 + flowTime * 0.12) * 0.5 + 0.5;

  // Blend layers: ridged filaments + broad clouds + fine detail
  float density = ridged * 0.5 + broad * 0.35 + fine * 0.15;

  // Bass thickens the nebula
  density *= 0.55 + bassBoost * 0.55;

  return density;
}

// Nebula emission color at a given density sample
vec3 pnEmission(float density, float ridgeFactor, float depth01,
                vec3 nebulaColor, vec3 starColor, float vocalWarmth,
                float tension, float timbralHeat, float chorusBright) {
  // Base emission from nebula tint, modulated by ridged structure
  vec3 emission = mix(nebulaColor, starColor * 0.9, ridgeFactor * tension);

  // Vocal presence warms the emission toward amber
  vec3 warmTint = vec3(1.15, 0.92, 0.72);
  emission = mix(emission, emission * warmTint, vocalWarmth * 0.5);

  // Timbral brightness shifts emission temperature (cool blue → hot white-gold)
  vec3 coolEmit = emission * vec3(0.7, 0.8, 1.2);
  vec3 hotEmit = emission * vec3(1.3, 1.1, 0.85);
  emission = mix(coolEmit, hotEmit, timbralHeat);

  // Self-illumination: denser regions glow more
  emission *= 1.0 + density * 6.0;

  // Depth coloring: warm near camera, cool in the distance
  emission = mix(emission, emission * vec3(0.55, 0.65, 1.0), depth01);

  // Chorus brightness boost
  emission *= 1.0 + chorusBright * 0.3;

  return emission;
}

// Volumetric raymarch: emission + absorption model
vec3 pnMarch(vec3 ro, vec3 rd, float energy, float bass, float drumOnset,
             float flowTime, float nebulaScale, vec3 nebulaColor, vec3 starColor,
             float vocalWarmth, float tension, float timbralHeat,
             float jamMod, float spaceMod, float chorusBright,
             float climaxBoost, float dynamicRange, float beatStab,
             out float totalAlpha) {
  // Energy-adaptive step count: 32 at rest, 64 at full energy
  float stepFloat = mix(32.0, 64.0, smoothstep(0.15, 0.55, energy));
  int steps = int(stepFloat);
  float stepSize = mix(0.14, 0.10, energy); // tighter steps at high energy

  vec3 accumColor = vec3(0.0);
  totalAlpha = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    if (totalAlpha > 0.96) break; // early exit at near-opaque

    float fi = float(i);
    float depth = 0.4 + fi * stepSize;
    vec3 pos = ro + rd * depth;

    // Density evaluation
    float density = pnDensity(pos, flowTime, nebulaScale, bass, jamMod);

    // Space mode thins the nebula
    density *= 1.0 - spaceMod * 0.45;

    // Dynamic range: push contrast between dense/sparse
    density = pow(max(density, 0.0), mix(1.0, 1.4, dynamicRange));

    // Beat stability: sharp filaments when stable, diffuse when unstable
    float sharpness = mix(0.7, 1.0, beatStab);
    density = pow(max(density, 0.0), sharpness);

    // Drum onset flash: brightness surge in near-field
    float onsetFlash = drumOnset * 0.35 * exp(-fi * 0.06);
    density += onsetFlash;

    // Climax supernova: density explosion
    density += climaxBoost * 0.25 * exp(-fi * 0.04);

    // Scale to absorption coefficient
    density *= 0.06;

    if (density > 0.001) {
      float alpha = density * (1.0 - totalAlpha);
      float depth01 = fi / stepFloat;

      // Ridged factor for emission coloring (recalculate cheaply)
      float ridgeFactor = ridged4(pos * nebulaScale + flowTime * 0.08);

      vec3 emission = pnEmission(density, ridgeFactor, depth01,
                                  nebulaColor, starColor, vocalWarmth,
                                  tension, timbralHeat, chorusBright);

      // Climax supernova: radial bloom intensifies emission
      emission *= 1.0 + climaxBoost * 0.6 * (1.0 - depth01);

      accumColor += emission * alpha;
      totalAlpha += alpha;
    }

    // Embedded star clusters: visible through thin nebula
    float star = pnStars(pos + vec3(flowTime * 0.015));
    if (star > 0.005) {
      float starVis = (1.0 - totalAlpha) * star;
      vec3 sColor = mix(vec3(0.92, 0.94, 1.0), starColor, 0.25);
      // Stars flicker with energy
      sColor *= 0.8 + energy * 0.4;
      accumColor += sColor * starVis * 0.6;
    }
  }

  return accumColor;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === AUDIO CLAMPS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float vocalWarmth = clamp(uVocalPresence, 0.0, 1.0);
  float timbralHeat = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);

  // === SECTION-TYPE GATES ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Composite modifiers
  float jamMod = sJam;
  float spaceMod = max(sSpace, spaceScore * 0.6);
  float chorusBright = sChorus;

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === FLOW TIME ===
  float flowTime = uDynamicTime * (0.025 + slowE * 0.02)
                   * (1.0 + sJam * 0.6 - sSpace * 0.5 + sSolo * 0.3);

  // === PALETTE ===
  float hue1 = uPalettePrimary;
  vec3 nebulaColor = paletteHueColor(hue1, 0.78, 0.92);

  float hue2 = uPaletteSecondary;
  vec3 starColor = paletteHueColor(hue2, 0.85, 0.98);

  // Tension → color saturation: low=desaturated blue, high=vivid palette
  vec3 lowTensionBase = vec3(0.12, 0.15, 0.30);
  vec3 highTensionBase = nebulaColor * vec3(1.15, 0.65, 1.05);
  nebulaColor = mix(lowTensionBase, highTensionBase, tension);

  // Saturation from harmonic tension
  float palSat = mix(0.5, 1.0, tension) * uPaletteSaturation;
  vec3 nebulaGray = vec3(dot(nebulaColor, vec3(0.299, 0.587, 0.114)));
  nebulaColor = mix(nebulaGray, nebulaColor, palSat);

  // === NEBULA SCALE ===
  // High pitch → fine filament detail; low pitch → broad sweeping clouds
  float nebulaScale = mix(0.35, 1.1, 1.0 - pitch)
                      * (1.0 + sJam * 0.35 - sSpace * 0.25 + sSolo * 0.15)
                      / (1.0 + spaceScore * 0.3);

  // === RAY SETUP (3D camera system) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === VOLUMETRIC RAYMARCH ===
  float totalAlpha;
  vec3 col = pnMarch(ro, rd, energy, bass, drumOnset, flowTime, nebulaScale,
                     nebulaColor, starColor, vocalWarmth, tension, timbralHeat,
                     jamMod, spaceMod, chorusBright, climaxBoost, dynamicRange,
                     beatStab, totalAlpha);

  // === BACKGROUND STARS (far-field, behind the nebula) ===
  float bgStar = pnBgStars(rd * 15.0 + vec3(flowTime * 0.008));
  vec3 bgColor = vec3(0.015, 0.015, 0.04)
               + vec3(0.82, 0.88, 1.0) * bgStar * 0.35 * (1.0 - totalAlpha);
  // Space mode: more star visibility
  bgColor *= 1.0 + spaceMod * 0.3;
  col = mix(bgColor, col, totalAlpha);

  // === SECONDARY GLOW HAZE (palette-tinted emission fog) ===
  float glowNoise = fbm3(vec3(p * 1.8, flowTime * 0.12));
  vec3 glowCol = mix(nebulaColor, starColor, glowNoise * 0.5 + 0.5) * 0.04;
  col += glowCol * (0.25 + energy * 0.25);

  // === BEAT + CLIMAX RESPONSE ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.05 * smoothstep(0.3, 0.7, uBeatConfidence);
  col *= 1.0 + climaxBoost * 0.25;
  col *= 1.0 + uBeatSnap * 0.08 * (1.0 + climaxBoost * 0.4);

  // === ONSET SATURATION PULSE ===
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.8);
  col *= 1.0 + onsetPulse * 0.10;

  // === SEMANTIC: cosmic → nebula glow boost ===
  col *= 1.0 + uSemanticCosmic * 0.20;
  col *= 1.0 + uSemanticPsychedelic * 0.10;

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, nebulaColor, starColor, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, nebulaColor, starColor, _nf, uSectionIndex);

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
