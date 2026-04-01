/**
 * Cosmic Dust — starfield with slow cosmic drift and nebula clouds.
 * Works well for Space/quiet passages. Deep, contemplative visuals.
 * Audio-reactive: energy brightens stars, onset creates shooting stars.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const cosmicDustVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const cosmicDustFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// Hash for star positions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// Star field layer
float starField(vec2 uv, float scale, float brightness) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;

  float stars = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      float h = hash(cellId);
      if (h > 0.92) { // ~8% of cells have stars
        vec2 starPos = neighbor + vec2(hash(cellId + 0.1), hash(cellId + 0.2)) - 0.5 - f;
        float d = length(starPos);
        float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + h * 3.0) + h * 100.0);
        float star = smoothstep(0.05 * brightness, 0.0, d) * twinkle;
        // Color variation
        float colorVar = hash(cellId + 0.3);
        stars += star * (0.5 + colorVar * 0.5);
      }
    }
  }
  return stars;
}

// Nebula cloud (FBM-based)
float nebula(vec2 uv, float t) {
  float v = 0.0;
  float a = 0.5;
  vec3 p = vec3(uv, t * 0.05);
  for (int i = 0; i < 5; i++) {
    v += a * (snoise(p) * 0.5 + 0.5);
    p = p * 2.1 + vec3(0.0, 0.0, t * 0.02);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float t = uDynamicTime * 0.08;
  float energy = clamp(uEnergy, 0.0, 1.0);

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float driftSpeedMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.1, sChorus);
  float starBrightMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.2, sChorus);
  float shootFreqMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.15, sChorus);

  // Slow cosmic drift (melodic direction shifts drift)
  float melDir = uMelodicDirection * 0.02;
  vec2 drift = vec2(t * 0.1 * driftSpeedMod + melDir, t * 0.05 * driftSpeedMod);
  vec2 starUv = uv + drift;

  // Star layers at different depths (parallax: different speeds per layer)
  float stars = 0.0;
  vec2 parallax1 = starUv;
  vec2 parallax2 = starUv * 1.1 + drift * 0.3 + 5.0;  // medium depth — slower
  vec2 parallax3 = starUv * 0.8 + drift * 0.1 + 10.0;  // far depth — slowest
  stars += starField(parallax1, 30.0, 1.0) * 0.6;
  stars += starField(parallax2, 50.0, 0.7) * 0.3;
  stars += starField(parallax3, 80.0, 0.5) * 0.15;

  // Beat stability (must be before star shimmer)
  float beatStability = clamp(uBeatStability, 0.0, 1.0);

  // Energy brightens stars (section-modulated)
  stars *= (0.7 + uEnergy * 0.6 + uFastEnergy * 0.2) * starBrightMod;
  // Beat stability: unstable → star shimmer boost
  stars *= 1.0 + (1.0 - beatStability) * 0.2 * sin(uTime * 8.0 + uv.x * 30.0);

  // === STAR GLOW: diffraction spikes (4-point cross) on bright stars ===
  float spikeStar = starField(parallax1, 30.0, 1.0);
  if (spikeStar > 0.3) {
    // Find approximate star center from grid
    vec2 spikeCenter = (floor(parallax1 * 30.0) + 0.5) / 30.0;
    vec2 toStar = uv - spikeCenter;
    // 4-point cross spikes
    float spikeH = exp(-abs(toStar.y) * 200.0) * exp(-abs(toStar.x) * 20.0);
    float spikeV = exp(-abs(toStar.x) * 200.0) * exp(-abs(toStar.y) * 20.0);
    float spikes = (spikeH + spikeV) * spikeStar * 0.15;
    stars += spikes;
  }

  // === VOLUMETRIC NEBULA: raymarched dust clouds (4-step accumulation) ===
  // --- Phase 1: New uniform integrations ---
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float pitchBright = uMelodicPitch * 0.15;
  float tensionDensity = clamp(uHarmonicTension, 0.0, 1.0) * 0.15;
  float peakGlow = clamp(uPeakApproaching, 0.0, 1.0) * 0.12;

  vec3 nebColor1 = hsv2rgb(vec3(uPalettePrimary + chromaHueMod + chordHue, 0.6 * uPaletteSaturation, 0.25 + pitchBright));
  vec3 nebColor2 = hsv2rgb(vec3(uPaletteSecondary, 0.5 * uPaletteSaturation, 0.20 + peakGlow));

  vec3 nebulaMix = vec3(0.0);
  float nebAlpha = 0.0;
  for (int s = 0; s < 4; s++) {
    float fs = float(s);
    float depth = 0.8 + fs * 0.4;
    vec2 sampleUv = uv * (0.6 + fs * 0.15) + drift * (0.5 - fs * 0.1);
    float density = nebula(sampleUv, uDynamicTime + fs * 50.0);
    density = smoothstep(0.25 - tensionDensity, 0.7, density);
    float layerAlpha = density * 0.3 * (1.0 - nebAlpha);
    vec3 layerColor = mix(nebColor1, nebColor2, fs / 3.0 + density * 0.2);
    // Depth-dependent brightness (further = dimmer)
    layerColor *= 1.0 / depth;
    nebulaMix += layerColor * layerAlpha;
    nebAlpha += layerAlpha;
  }

  // Bass makes nebula pulse
  nebulaMix *= 0.8 + uBass * 0.5;

  // Background deep space gradient
  float bgGrad = smoothstep(1.5, 0.0, length(uv));
  vec3 bgColor = hsv2rgb(vec3(uPalettePrimary + 0.15, 0.3, 0.03)) * bgGrad;

  // Combine layers
  vec3 color = bgColor + nebulaMix + vec3(stars);

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset: shooting star flash (amplified, section-modulated)
  float shootAngle = uTime * 0.5 * shootFreqMod + uSectionIndex * 2.0;
  vec2 shootDir = vec2(cos(shootAngle), sin(shootAngle));
  float shootTrail = smoothstep(0.02, 0.0, abs(dot(uv - shootDir * 0.3, vec2(-shootDir.y, shootDir.x))));
  shootTrail *= smoothstep(0.8, 0.0, length(uv - shootDir * 0.3));
  color += shootTrail * uOnsetSnap * 0.8 * (1.0 + climaxBoost * 0.5);

  color *= 1.0 + climaxBoost * 0.05;
  color *= 1.0 + max(uBeatSnap, uDrumBeat) * 0.20 * (1.0 + climaxBoost * 0.4);

  // Vignette — subtle
  float vig = 1.0 - smoothstep(0.8, 1.6, length(uv));
  color *= 0.3 + vig * 0.7;

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(uv * 2.0, uTime * 0.1));
  color += iconEmergence(uv, uTime, energy, uBass, nebColor1, nebColor2, _nf, uClimaxPhase, uSectionIndex);
  color += heroIconEmergence(uv, uTime, energy, uBass, nebColor1, nebColor2, _nf, uSectionIndex);

  // === POST-PROCESSING (shared chain) ===
  color = applyPostProcess(color, vUv, uv);

  gl_FragColor = vec4(color, 1.0);
}
`;
