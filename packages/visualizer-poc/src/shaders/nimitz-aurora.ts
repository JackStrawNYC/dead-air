/**
 * Auroras — ported from nimitz (Shadertoy)
 * Source: https://www.shadertoy.com/view/XtGGRt
 * License: CC BY-NC-SA 3.0
 *
 * Aurora borealis curtains using a custom triangle-wave noise function.
 * Non-smooth, curtain-like variation from tri() layering with rotation.
 * Stars in background, atmospheric sky gradient, dome-projected aurora columns.
 *
 * Audio reactivity:
 *   uEnergy          → aurora brightness and curtain height
 *   uBass            → curtain sway amplitude
 *   uSlowEnergy      → drift speed
 *   uHighs           → star field brightness
 *   uOnsetSnap       → aurora brightness flash
 *   uMelodicPitch    → dominant aurora color (green→blue→purple→red)
 *   uVocalPresence   → aurora intensity boost (singing brightens the sky)
 *   uClimaxIntensity → full-sky aurora coverage
 *   uSpectralFlux    → color shifting speed
 *   uSpaceScore      → stars more prominent
 *   uHarmonicTension → curtain fold complexity
 *   uTimbralBrightness → aurora sharpness/definition
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const nimitzAuroraVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  caEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  paletteCycleEnabled: true,
});

export const nimitzAuroraFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Nimitz Aurora core ───
// https://www.shadertoy.com/view/XtGGRt — CC BY-NC-SA 3.0

// Triangle wave — the signature of nimitz aurora (non-smooth, curtain-like)
float _na_tri(float x) {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

vec2 _na_tri2(vec2 p) {
  return vec2(_na_tri(p.x + _na_tri(p.y * 1.8)), _na_tri(p.y + _na_tri(p.x * 1.8)));
}

// 2x2 rotation for octave variation
mat2 _na_rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

// Triangle-wave noise for aurora curtains (nimitz technique)
// Non-smooth layering creates the distinctive curtain folds
float _na_triNoise2d(vec2 p, float spd, float bassAmp, float complexity) {
  float z = 1.8;
  float rz = 0.0;
  vec2 bp = p;

  // 5 octaves of triangle-wave noise with rotation between layers
  for (int i = 0; i < 5; i++) {
    vec2 dg = _na_tri2(p * (0.85 + complexity * 0.15)) * 0.75;
    dg *= _na_rot2(uDynamicTime * spd * 0.15 + float(i) * 0.5);

    p += dg / z;

    // Bass drives sway: displace layers differentially
    p += bassAmp * 0.05 * vec2(sin(float(i) * 1.5 + uDynamicTime * 0.3), 0.0) / z;

    bp *= 1.6;
    z *= 1.8;
    p *= 1.25;
    p *= _na_rot2(0.4 + float(i) * 0.13);
    p += uDynamicTime * spd * 0.06;
  }
  return rz = clamp(1.0 / pow(0.5 + pow(abs(snoise(vec3(p * 0.2, 0.0)) * 0.5 + _na_tri(p.x) + _na_tri(p.y)), 1.3) * 0.7, 1.4), 0.0, 1.0);
}

// Improved triangle noise for aurora density — proper nimitz accumulation
float _na_triNoise2dPure(vec2 p, float spd, float bassAmp) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  vec2 bp = p;
  for (int i = 0; i < 5; i++) {
    vec2 dg = _na_tri2(p * 2.0) * 0.8;
    dg *= _na_rot2(uDynamicTime * spd + float(i) * 0.6);
    p -= dg / z2;
    z2 *= 0.6;

    p += bassAmp * 0.04 * vec2(sin(float(i) * 1.7 + uDynamicTime * 0.25), 0.0);

    bp *= 1.6;
    z *= 1.7;
    p *= 1.2;
    p *= _na_rot2(0.5);
    rz += _na_tri(p.x + _na_tri(p.y)) / z;
    p += uDynamicTime * spd * 0.04;
  }
  return rz;
}

// ─── Star field ───
float _na_stars(vec2 p, float brightness) {
  // Hash-based point field (different from noise.ts)
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float star = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = ip + neighbor;

      // Deterministic random star position
      vec2 h = fract(sin(vec2(
        dot(cellId, vec2(127.1, 311.7)),
        dot(cellId, vec2(269.5, 183.3))
      )) * 43758.5453);

      vec2 diff = neighbor + h - fp;
      float dist = length(diff);

      // Only some cells have bright stars
      float mag = fract(sin(dot(cellId, vec2(41.0, 289.0))) * 9137.41);
      float threshold = 0.85;
      if (mag > threshold) {
        float starSize = (mag - threshold) / (1.0 - threshold); // 0-1 brightness
        float glow = exp(-dist * dist * (200.0 - starSize * 150.0));
        // Twinkle
        float twinkle = 0.7 + 0.3 * sin(uDynamicTime * (2.0 + starSize * 3.0) + mag * TAU);
        star += glow * starSize * twinkle;
      }
    }
  }
  return star * brightness;
}

// ─── Aurora color from melodic pitch + palette ───
// pitch maps through green → blue → purple → red aurora
vec3 _na_auroraColor(float pitch, float palHue1, float palHue2, float flux, float sat) {
  // Natural aurora hue: green (0.33) → blue (0.55) → purple (0.75) → red (0.0)
  float baseHue = mix(0.33, 0.0, pitch);
  // Spectral flux shifts the color
  baseHue += flux * 0.08;
  // Blend toward palette
  float palMix = 0.3;
  float h = mix(baseHue, palHue1, palMix);

  vec3 col = hsv2rgb(vec3(fract(h), sat, 1.0));
  return col;
}

// ─── Aurora sampling along dome ray ───
vec4 _na_aurora(vec3 rd, float bassAmp, float energyLevel, float driftSpeed,
                float pitch, float hue1, float hue2, float flux, float palSat,
                float complexity, float sharpness, float climaxCover) {
  vec4 col = vec4(0.0);
  vec4 avgCol = vec4(0.0);

  // Step along ray intersecting a dome above the viewer
  // More steps = smoother but more expensive
  for (int i = 0; i < 50; i++) {
    float fi = float(i);
    // Height along the dome
    float ht = (0.2 + fi * 0.035);
    // Adjust coverage: climax fills more sky
    ht *= mix(1.0, 0.7, climaxCover);

    // Point on dome
    vec3 pos = rd * ht;

    // Aurora curtain exists in a horizontal band
    // Convert to 2D for the triangle noise
    vec2 auroraSample = pos.xz * (2.0 + fi * 0.08);

    // Two noise layers for richness
    float rzt = _na_triNoise2dPure(auroraSample, driftSpeed, bassAmp);
    float rzt2 = _na_triNoise2dPure(auroraSample * 1.3 + vec2(1.4, -0.7), driftSpeed * 0.7, bassAmp * 0.5);

    // Combined noise with sharpness control
    float noiseVal = mix(rzt, rzt2, 0.5);
    noiseVal = pow(noiseVal, mix(2.0, 1.0, sharpness)); // sharper = less pow

    // Vertical falloff: aurora lives in upper hemisphere
    float vertFalloff = smoothstep(-0.1, 0.5, rd.y);
    // Horizontal extent: curtains have width
    float horizExtent = 1.0 - smoothstep(0.5, 1.5, abs(pos.x));

    float density = noiseVal * vertFalloff * horizExtent;
    density *= energyLevel;

    if (density > 0.01) {
      // Aurora color varies along the curtain and with height
      float localPitch = pitch + fi * 0.01 + noiseVal * 0.1;
      vec3 auroraCol = _na_auroraColor(clamp(localPitch, 0.0, 1.0), hue1, hue2, flux, palSat);

      // Height-dependent color shift: greens at bottom, blues/purples higher
      auroraCol = mix(auroraCol, hsv2rgb(vec3(fract(hue2 + 0.15), palSat * 0.9, 1.0)), fi * 0.015);

      // Brightness from density
      float brightness = density * (0.5 + energyLevel * 0.5);

      vec4 contribution = vec4(auroraCol * brightness, brightness);

      // Front-to-back compositing
      col += contribution * (1.0 - col.a) * 0.12;
      avgCol += contribution;
    }
  }

  // Normalize average for stable color
  if (avgCol.a > 0.01) {
    avgCol.rgb /= avgCol.a;
  }

  col.rgb = mix(col.rgb, avgCol.rgb * col.a, 0.3);
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio inputs ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beat = clamp(uBeatSnap, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float vocal = clamp(uVocalPresence, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float space = clamp(uSpaceScore, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float tBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float effectiveBeat = beat * smoothstep(0.3, 0.7, uBeatConfidence);

  // ─── Palette ───
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.08;
  hue1 += chromaHueMod + chordHue;
  hue2 += chromaHueMod * 0.5;
  float palSat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  vec3 palCol1 = hsv2rgb(vec3(hue1, palSat, 1.0));
  vec3 palCol2 = hsv2rgb(vec3(hue2, palSat, 1.0));

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: faster drift, brighter. Space: slow majestic curtains, more stars. Chorus: vibrant. Solo: dramatic.
  float sectionDrift = mix(1.0, 1.6, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionBright = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.4, sChorus) * mix(1.0, 1.2, sSolo);
  float sectionStars = mix(1.0, 0.6, sJam) * mix(1.0, 2.0, sSpace); // space = more stars
  sectionDrift *= 1.0 + uPeakApproaching * 0.3;

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  float climaxCover = climaxBoost * 0.5; // how much sky the aurora fills

  // ─── Sky gradient ───
  // Night sky: dark blue-black at top, deep navy at horizon, warm glow at very bottom
  float skyY = p.y + 0.5; // 0 at bottom, 1 at top
  vec3 skyTop = vec3(0.005, 0.005, 0.015);
  vec3 skyMid = vec3(0.008, 0.01, 0.03);
  vec3 skyHorizon = vec3(0.012, 0.015, 0.025);
  vec3 skyGlow = vec3(0.015, 0.02, 0.03); // subtle horizon glow

  vec3 sky;
  if (skyY > 0.5) {
    sky = mix(skyMid, skyTop, (skyY - 0.5) * 2.0);
  } else {
    sky = mix(skyGlow, skyMid, skyY * 2.0);
  }

  // Subtle palette tint to the sky
  sky += palCol1 * 0.005 + palCol2 * 0.003;

  // ─── Star field ───
  // Denser stars when quiet or in space sections
  float starBright = (0.3 + highs * 0.7) * sectionStars;
  starBright *= mix(1.0, 1.5, space); // space score boosts stars
  starBright *= mix(1.0, 0.3, climaxBoost); // aurora overwhelms stars during climax

  // Multiple star layers at different densities
  float stars = 0.0;
  stars += _na_stars(p * 80.0, starBright * 0.6);
  stars += _na_stars(p * 140.0 + vec2(100.0, 50.0), starBright * 0.4);
  stars += _na_stars(p * 250.0 + vec2(-70.0, 130.0), starBright * 0.2);

  // Stars only in upper sky
  stars *= smoothstep(-0.1, 0.15, p.y);

  vec3 col = sky + vec3(stars);

  // ─── Construct view ray for aurora dome ───
  // Camera looking up at the sky
  vec3 rd = normalize(vec3(p.x, p.y + 0.4, -1.0));

  // Gentle camera sway from bass
  float sway = bass * 0.20;
  rd.xz *= _na_rot2(sin(uDynamicTime * 0.15) * sway);
  rd.yz *= _na_rot2(cos(uDynamicTime * 0.12) * sway * 0.5);

  // ─── Compute aurora ───
  float driftSpeed = (0.3 + slowE * 0.8) * sectionDrift;
  float auroraEnergy = (0.4 + energy * 0.6) * sectionBright;
  auroraEnergy += vocal * vocalE * 0.25; // vocal presence brightens aurora
  auroraEnergy += climaxBoost * 0.4; // climax intensifies
  auroraEnergy = clamp(auroraEnergy, 0.0, 1.8);

  float complexity = 0.5 + tension * 0.5; // harmonic tension → fold complexity
  float sharpness = tBright; // timbral brightness → aurora definition

  vec4 aurora = _na_aurora(rd, bass, auroraEnergy, driftSpeed,
                            pitch, hue1, hue2, flux, palSat,
                            complexity, sharpness, climaxCover);

  // Additive blend aurora onto sky
  col += aurora.rgb * 1.3;

  // ─── Onset flash: aurora brightens sharply ───
  col += aurora.rgb * onset * 0.4;
  // Also flash the whole sky subtly
  col += palCol1 * onset * 0.03;

  // ─── Ground reflection: aurora light reflected on terrain/water below ───
  float groundY = -p.y - 0.35;
  if (groundY > 0.0) {
    float reflFalloff = exp(-groundY * 6.0);
    // Mirror the aurora color downward, dimmed and blurred
    vec3 reflColor = aurora.rgb * reflFalloff * 0.25;
    // Add noise for water/ground texture
    float groundNoise = fbm3(vec3(p.x * 3.0, groundY * 2.0, uDynamicTime * 0.05));
    reflColor *= 0.7 + groundNoise * 0.3;
    // Ripple effect on the reflection
    float ripple = sin(p.x * 30.0 + uDynamicTime * 0.5 + groundNoise * 5.0) * 0.5 + 0.5;
    reflColor *= 0.8 + ripple * 0.2;
    col += reflColor;

    // Dark ground base
    col = mix(col, vec3(0.005, 0.008, 0.01), smoothstep(0.0, 0.3, groundY) * 0.5);
  }

  // ─── Horizon glow from aurora light ───
  float horizonBand = exp(-abs(p.y + 0.3) * 12.0);
  vec3 horizGlow = aurora.rgb * horizonBand * 0.15 * energy;
  col += horizGlow;

  // ─── Beat pulse ───
  col *= 1.0 + effectiveBeat * 0.1;

  // ─── Climax: sky ablaze ───
  col *= 1.0 + climaxBoost * 0.3;

  // ─── Dynamic range → sky contrast ───
  float skyContrast = mix(0.85, 1.2, dynRange);
  vec3 luma = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
  col = mix(luma, col, skyContrast);

  // ─── Chroma hue modulation ───
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + uChromaHue * 0.1);
    col = hsv2rgb(hsvCol);
  }

  // ─── Semantic modulation ───
  col *= 1.0 + uSemanticCosmic * 0.15;
  col *= 1.0 + uSemanticPsychedelic * 0.1;
  col *= mix(1.0, 1.1, uSemanticAmbient);

  // ─── Dead iconography ───
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);

  // ─── Vignette: subtle, keeps focus on aurora ───
  float vigScale = mix(0.22, 0.16, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.002, 0.003, 0.008), col, vignette);

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
