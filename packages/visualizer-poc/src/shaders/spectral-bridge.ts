/**
 * Spectral Bridge — universal transition bridge shader.
 * Flowing horizontal bands of color that span the full HSL spectrum. The
 * spectrum rotates continuously through the rainbow with sinusoidal flow,
 * soft gradients between bands, particle accents, and a breathing quality.
 * Neutral palette that morphs through the entire HSL space — ideal for
 * songs that arc through multiple moods, or transitions between different
 * shader families. MID energy, CALM but visually rich.
 *
 * Audio reactivity (17+ uniforms):
 *   uEnergy          -> band saturation + brightness
 *   uChromaHue       -> drives the spectrum rotation phase
 *   uBeatDecay       -> (via uOnsetSnap/uBeatSnap) particle accent pulse
 *   uBass            -> band thickness
 *   uHighs           -> particle density
 *   uSlowEnergy      -> breathing rate of the whole scene
 *   uMelodicDirection -> spectrum rotation direction
 *   uSectionType     -> behavior changes (jam/space/chorus/solo)
 *   uTempo           -> flow speed
 *   uMids            -> mid-band luminance push
 *   uOnsetSnap       -> accent burst intensity
 *   uBeatSnap        -> beat-synced particle pulse
 *   uHarmonicTension -> undulation amplitude
 *   uCoherence       -> band coherence / sharpness
 *   uClimaxPhase     -> climax boost
 *   uVocalEnergy     -> warm glow in mid-bands
 *   uChordIndex      -> micro hue offset
 *   uBeatStability   -> wave regularity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const spectralBridgeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const spectralBridgeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ---- Hash helpers for particles ----
float sbHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 sbHash2(vec2 p) {
  return fract(sin(vec2(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3))
  )) * 43758.5453123);
}

// ---- Smooth soft band gradient ----
// Returns a normalized 0..1 band coordinate with smooth falloff across bands.
float sbBandWeight(float y, float center, float halfWidth, float softness) {
  float d = abs(y - center);
  return 1.0 - smoothstep(halfWidth - softness, halfWidth + softness, d);
}

// ---- Sinusoidal undulation for band positions ----
float sbUndulate(float x, float time, float freq, float amp, float phase) {
  return sin(x * freq + time + phase) * amp;
}

// ---- Breathing curve: smooth in/out around a slow oscillation ----
float sbBreathe(float time, float rate) {
  float s = sin(time * rate);
  return 0.5 + 0.5 * s * s * sign(s); // smooth but with gentle non-linearity
}

// ---- Particle field: bright dots flowing through bands ----
vec3 sbParticles(vec2 p, float time, float density, float pulse, float flowSpeed) {
  vec3 accum = vec3(0.0);
  // 3 layers of particles at different scales for parallax
  for (int layer = 0; layer < 3; layer++) {
    float lf = float(layer);
    float scale = mix(18.0, 42.0, lf / 2.0);
    float speed = mix(0.35, 0.9, lf / 2.0) * flowSpeed;

    vec2 q = p * scale;
    q.x -= time * speed;
    vec2 cell = floor(q);
    vec2 fr = fract(q) - 0.5;

    vec2 rnd = sbHash2(cell + vec2(lf * 17.0, lf * 23.0));
    vec2 offset = (rnd - 0.5) * 0.7;
    float radius = mix(0.04, 0.12, rnd.x);
    float dist = length(fr - offset);

    // Density gate: only some cells have particles
    float alive = step(1.0 - density * mix(0.4, 0.85, lf / 2.0), rnd.y);

    float dot = exp(-dist * dist / (radius * radius)) * alive;

    // Each particle takes its local band hue
    float bandY = p.y + sin(time * 0.5 + rnd.x * TAU) * 0.02;
    float hue = fract(bandY * 1.2 + time * 0.03);
    vec3 particleColor = hsv2rgb(vec3(hue, 0.45, 1.0));

    // Pulse on beat
    float pulseScale = 1.0 + pulse * 0.8;

    accum += particleColor * dot * pulseScale * (0.35 + lf * 0.25);
  }
  return accum;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio clamping ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0) * smoothstep(0.3, 0.7, uBeatConfidence);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 2.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float vocalGlow = clamp(uVocalEnergy, 0.0, 1.0);
  float tempoNorm = clamp(uTempo / 160.0, 0.3, 1.6);
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.08 * chordConf;

  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.01;

  // ---- Section modulation ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionFlow = mix(1.0, 1.4, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.15, sChorus);
  float sectionBright = mix(1.0, 1.1, sJam) * mix(1.0, 0.7, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.1, sSolo);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Breathing: whole scene subtly expands/contracts ----
  float breatheRate = mix(0.35, 0.9, slowE) * sectionFlow;
  float breathe = sbBreathe(uDynamicTime, breatheRate);
  float breatheScale = 1.0 + (breathe - 0.5) * 0.07; // +/- 3.5%
  float breatheBright = 1.0 + (breathe - 0.5) * 0.18;

  // ---- Flow speed (tempo-driven) ----
  float flowSpeed = tempoNorm * mix(0.6, 1.3, slowE) * sectionFlow;
  float flowTime = uDynamicTime * 0.08 * flowSpeed;

  // ---- Spectrum rotation phase ----
  // Continuous HSL rotation driven by time + chroma hue + direction
  float rotationDir = sign(melodicDir + 0.01); // small bias so never exactly 0
  float rotationSpeed = mix(0.008, 0.025, slowE) * abs(melodicDir) * 2.0 + 0.01;
  float spectrumPhase = uDynamicTime * rotationSpeed * rotationDir
                      + uChromaHue * 0.5
                      + chordHue;

  // ---- Breathing-scaled sample position ----
  // Apply the breathing scale uniformly from screen center for expand/contract feel
  vec2 bp = screenP / breatheScale;
  float y = bp.y; // -0.5..0.5 roughly
  float x = bp.x;

  // ---- Band parameters ----
  // Number of visible bands scales slightly with bass (thicker = fewer)
  float numBands = mix(7.0, 5.0, bass); // 5 thick → 7 thinner
  float bandHalfHeight = 0.5 / numBands;
  float bandThickness = bandHalfHeight * mix(0.7, 1.2, bass);
  float bandSoftness = bandHalfHeight * mix(0.45, 0.85, 1.0 - coherence);

  // ---- Compute the horizontal bands ----
  vec3 col = vec3(0.0);

  // Undulation: each band y-position gently waves horizontally
  float undulateFreq = mix(1.8, 3.5, tension);
  float undulateAmp = mix(0.012, 0.045, tension) * (0.5 + stability * 0.8);

  // Saturation and brightness driven by energy
  float bandSat = mix(0.35, 0.85, e2) * uPaletteSaturation;
  float bandVal = mix(0.55, 1.0, energy) * sectionBright * breatheBright;

  // Accumulate band colors with soft gradients
  float totalWeight = 0.0;
  vec3 bandColor = vec3(0.0);

  for (int b = 0; b < 9; b++) {
    float fb = float(b);
    if (fb >= numBands) break;

    // Evenly spaced band centers across vertical axis
    float baseCenter = (fb + 0.5) / numBands - 0.5;

    // Undulation per-band with phase offset
    float phase = fb * 0.8;
    float wave = sbUndulate(x, flowTime * 1.2, undulateFreq, undulateAmp, phase);
    float wave2 = sbUndulate(x, flowTime * 0.7, undulateFreq * 1.6, undulateAmp * 0.6, phase * 1.3);
    float center = baseCenter + wave + wave2;

    // Soft band weight
    float w = sbBandWeight(y, center, bandThickness, bandSoftness);
    if (w < 0.001) continue;

    // Each band gets a hue derived from its index + rotation phase
    float bandHue = fract(fb / numBands + spectrumPhase);

    // Saturation variance: middle bands slightly punchier
    float centerDist = abs(fb - (numBands - 1.0) * 0.5) / numBands;
    float bSat = bandSat * (1.0 - centerDist * 0.15);

    vec3 bandRgb = hsv2rgb(vec3(bandHue, bSat, bandVal));

    // Subtle noise variance inside band for organic feel
    float n = snoise(vec3(x * 2.5, center * 3.0, flowTime * 1.2)) * 0.5 + 0.5;
    bandRgb *= 0.85 + n * 0.25;

    // Mid-band vocal warmth
    float midBandProx = 1.0 - centerDist * 2.0;
    bandRgb += vec3(0.25, 0.15, 0.08) * vocalGlow * max(midBandProx, 0.0) * 0.25;

    bandColor += bandRgb * w;
    totalWeight += w;
  }

  // Normalize blended bands (avoid over-bright overlaps)
  if (totalWeight > 0.001) {
    bandColor /= max(totalWeight, 1.0);
  }

  // ---- Background: soft gradient that complements the dominant band ----
  // Take the hue at the band closest to the screen center
  float dominantHue = fract(0.5 + spectrumPhase);
  vec3 bgWarm = hsv2rgb(vec3(dominantHue, 0.25, 0.12));
  vec3 bgCool = hsv2rgb(vec3(fract(dominantHue + 0.5), 0.28, 0.08));
  // Vertical gradient from complementary cool to warm
  float bgGrad = smoothstep(-0.6, 0.6, y);
  vec3 bgColor = mix(bgCool, bgWarm, bgGrad);
  // Radial softness
  float bgRadial = 1.0 - length(screenP) * 0.6;
  bgColor *= clamp(bgRadial, 0.4, 1.0);
  // Faint noise for depth
  float bgNoise = fbm3(vec3(screenP * 1.2, slowTime * 0.6)) * 0.5 + 0.5;
  bgColor *= 0.8 + bgNoise * 0.35;

  // Compose background with bands — bands are the hero, bg bleeds through gaps
  col = mix(bgColor, bandColor, clamp(totalWeight, 0.0, 1.0));
  // Let bands' own glow bleed softly into background
  col += bandColor * (1.0 - clamp(totalWeight, 0.0, 1.0)) * 0.18;

  // ---- Particle accents flowing through the bands ----
  float particleDensity = mix(0.15, 0.75, highs) * (0.5 + e2 * 0.5);
  float particlePulse = max(onset, beatSnap) * (0.5 + e2 * 0.5);
  vec3 particles = sbParticles(bp, flowTime, particleDensity, particlePulse, flowSpeed);
  col += particles * (0.8 + climaxBoost * 0.6);

  // ---- Onset flash: full-frame soft spectrum wash ----
  float flash = onset * 0.12 * e2;
  if (flash > 0.001) {
    float flashHue = fract(spectrumPhase + 0.25);
    col += hsv2rgb(vec3(flashHue, 0.6, 1.0)) * flash;
  }

  // ---- Breathing glow overlay (subtle) ----
  float glow = breathe * 0.08 * (0.5 + energy * 0.5);
  vec3 glowCol = hsv2rgb(vec3(dominantHue, 0.4, 1.0));
  col += glowCol * glow * (1.0 - length(screenP));

  // ---- Climax wash ----
  col *= 1.0 + climaxBoost * 0.25;

  // ---- SDF icon emergence (bridges are transitional — subtle icons) ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    float hue1 = fract(spectrumPhase);
    float hue2 = fract(spectrumPhase + 0.5);
    vec3 c1 = hsv2rgb(vec3(hue1, bandSat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, bandSat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.35;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Atmospheric haze ----
  float hazeNoise = fbm3(vec3(screenP * 0.45, uDynamicTime * 0.01));
  float hazeDensity = mix(0.25, 0.05, energy);
  vec3 hazeColor = bgColor * 0.5;
  col = mix(col, hazeColor, hazeDensity * (0.5 + hazeNoise * 0.5));

  // ---- Vignette ----
  float vigScale = mix(0.26, 0.18, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.006, 0.005, 0.008), col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
