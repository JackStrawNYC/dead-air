/**
 * Liquid Light — fullscreen fragment shader.
 * Oil-on-glass aesthetic via multi-pass FBM domain warping.
 *
 * v6 additions: beat rings, dust motes, warp trails, key change flash,
 *   color afterglow, waveform ring, dynamic letterboxing (CSS).
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const liquidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const liquidLightFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', flareEnabled: true, halationEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- FBM with flatness-controlled octave damping ---
// Octave count modulated by jam density: sparse exploration (3) → dense peak (6)
// At neutral density (0.5) this produces 5 octaves, matching the original behavior.
float fbmFlat(vec3 p, float smoothness) {
  int octaves = int(mix(3.0, 7.0, uJamDensity));
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5 * pow(smoothness, float(i) * 0.3);
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Bass camera shake (energy-gated: silent during quiet, punchy during loud)
  float shakeGate = smoothstep(0.25, 0.55, uEnergy);
  float shakeX = snoise(vec3(uTime * 8.0, 0.0, 0.0)) * uFastBass * 0.015 * shakeGate;
  float shakeY = snoise(vec3(0.0, uTime * 8.0, 0.0)) * uFastBass * 0.015 * shakeGate;
  p += vec2(shakeX, shakeY);

  float energy = clamp(uEnergy, 0.0, 1.0);

  // === PATTERN STABILITY: FBM domain uses ONLY dynamicTime and slowEnergy ===
  // Audio-reactive features (bass, highs, onset) only affect post-FBM rendering.
  // This prevents frame-to-frame audio jitter from moving the FBM pattern.
  float slowE = clamp(uSlowEnergy, 0.0, 1.0); // 6-second smoothed, no jitter

  // Bass-driven horizontal sweep: uses slowEnergy for smooth amplitude
  float bassAmp = slowE * 0.08;
  float bassWave = sin(p.x * 3.0 + uDynamicTime * 2.0) * bassAmp;
  p.y += bassWave;
  p.x += sin(p.y * 2.0 + uDynamicTime * 1.5) * bassAmp * 0.6;
  float complexity = mix(0.5, 1.0, slowE);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 7.3;
  float sectionWarp = 1.0 + (uSectionProgress - 0.5) * 0.3;
  // FBM time: only dynamicTime (already energy-scaled), no per-frame audio jitter
  float t = uDynamicTime * 0.25 * tempoScale;
  float smoothness = 1.0 - uFlatness * 0.6;

  // --- Phase 1: New uniform integrations ---
  // Melodic pitch shifts warp center vertically
  p.y += (uMelodicPitch - 0.5) * 0.06;
  // Melodic direction biases drift: +1=upward, -1=downward
  float driftBias = uMelodicDirection * 0.02;
  p.y += driftBias * slowE;
  // Chord changes micro-rotate palette hue
  float chordHueShift = float(int(uChordIndex)) / 24.0 * 0.15;
  // Harmonic tension drives warp strength
  float tensionWarp = 1.0 + uHarmonicTension * 0.3;
  // Section type modifies FBM behavior: 0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space
  float sectionMod = uSectionType > 6.5 ? 0.4 : (uSectionType > 4.5 && uSectionType < 5.5 ? 1.2 : 1.0);
  // Energy forecast: anticipatory bloom widening
  float forecastBloom = uEnergyForecast * 0.08;
  // Peak approaching: pre-burst desaturation
  float peakDesat = uPeakApproaching * 0.15;
  // Beat stability: high=geometric, low=organic drift
  float stabilityMix = uBeatStability;
  // Stem: guitar intensity drives foreground
  float guitarDrive = uOtherEnergy * 0.5;
  // Stem: guitar temperature shifts warm/cool
  float guitarTemp = uOtherCentroid;
  // Energy acceleration for warp speed
  float accelWarp = 1.0 + uEnergyAccel * 0.2;
  // Energy trend for color temperature drift
  float trendTemp = uEnergyTrend * 0.05;
  // Local tempo replaces hardcoded tempo scale
  tempoScale = uLocalTempo / 120.0;

  // Spectral contrast: constant spatial variation (no per-frame jitter)
  float contrastWarp = 0.8;

  // ============ LAYER 1: Background ============
  vec3 bgQ = vec3(p * 0.4, t * 0.03 + sectionSeed);
  float bgNoise = fbm3(bgQ);
  float bgHue = hsvToCosineHue(uPaletteSecondary) + bgNoise * 0.15;
  vec3 bgCol = palette(bgHue, vec3(0.4), vec3(0.3), vec3(1.0), vec3(bgHue, bgHue + 0.33, bgHue + 0.67));
  bgCol *= mix(0.45, 0.72, energy);

  // ============ LAYER 2: Midground (hero) ============
  float warpStrength = (0.65 + slowE * 0.55) * complexity * tensionWarp * accelWarp * sectionMod;
  float tFlux = t * 0.2 + sectionSeed;
  vec3 q = vec3(p * 1.2 * sectionWarp, tFlux);
  float warpX = fbmFlat(q + vec3(1.7, 9.2, 0.0), smoothness);
  float warpY = fbmFlat(q + vec3(8.3, 2.8, 0.0), smoothness);
  vec2 warp1 = vec2(warpX, warpY) * warpStrength;

  vec2 warped = p + warp1;

  float n = fbmFlat(vec3(warped * 0.9, t * 0.15 + sectionSeed * 0.3), smoothness);

  // === CHROMATIC ABERRATION (aggressive) ===
  float caAmount = uBass * 0.08 + length(p) * 0.025 + uOnsetSnap * 0.06 + uDrumOnset * 0.10;
  float hue = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.25 + chordHueShift + t * 0.05 + trendTemp;

  // Palette compression: at quiet, raise floor so valleys have visible color (no black gaps).
  // At peak, full contrast range for vivid psychedelic color.
  vec3 palA = vec3(mix(0.55, 0.50, energy));
  vec3 palB = vec3(mix(0.32, 0.50, energy), mix(0.32, 0.50, energy), mix(0.26, 0.40, energy));
  vec3 palC = vec3(1.0, 0.8, 0.7);

  // G channel: center hue (wider n multiplier for more color variation)
  vec3 dG = vec3(hue, hue + 0.33, hue + 0.67);
  vec3 midColG = palette(n * 1.2 + hue, palA, palB, palC, dG);

  // R channel: hue shifted inward
  float hueR = hue - caAmount;
  vec3 dR = vec3(hueR, hueR + 0.33, hueR + 0.67);
  vec3 midColR = palette(n * 1.2 + hueR, palA, palB, palC, dR);

  // B channel: hue shifted outward
  float hueB = hue + caAmount;
  vec3 dB = vec3(hueB, hueB + 0.33, hueB + 0.67);
  vec3 midColB = palette(n * 1.2 + hueB, palA, palB, palC, dB);

  // Composite: R from red-shifted, G from center, B from blue-shifted
  vec3 midCol = vec3(midColR.r, midColG.g, midColB.b);

  // Multi-chroma domain warping
  vec3 chromaInfluence = chromaColor(warped * 0.5, uChroma0, uChroma1, uChroma2, energy);
  midCol = mix(midCol, midCol + chromaInfluence * 0.6, 0.2);

  // Palette saturation — vivid, not washed out (with peak approaching desaturation)
  float sat = mix(0.92, 1.25, energy) * uPaletteSaturation * (1.0 - uFlatness * 0.08) * (1.0 - peakDesat);
  vec3 midGray = vec3(dot(midCol, vec3(0.299, 0.587, 0.114)));
  midCol = mix(midGray, midCol, sat);

  // Color temperature (warm at peaks, cool at rest + guitar brightness influence)
  vec3 warmShift = vec3(1.10, 0.95, 0.88);
  vec3 coolShift = vec3(0.90, 0.97, 1.10);
  midCol *= mix(coolShift, warmShift, energy + guitarTemp * 0.15);
  // Vocal warmth tint
  midCol += vec3(0.08, 0.04, 0.0) * uVocalEnergy * 0.15;

  float brightness = mix(0.60, 1.15, energy) + uFastEnergy * 0.15;
  midCol *= brightness;

  // ============ LAYER 3: Foreground ============
  float fgNoise = fbm3(vec3(warped * 3.0, t * 0.2 + sectionSeed * 1.7));
  float fgIntensity = (uHighs * 0.18 + guitarDrive * 0.12) * complexity;
  vec3 fgCol = vec3(fgNoise * 0.5 + 0.5) * vec3(0.8, 0.9, 1.0) * fgIntensity;

  // ============ COMPOSITE (hero-dominant) ============
  float bgMix = mix(0.35, 0.18, energy);
  float midMix = mix(0.55, 0.72, energy);
  float fgMix = mix(0.10, 0.18, energy);
  vec3 col = bgCol * bgMix + midCol * midMix + fgCol * fgMix;

  // Flatness grain
  float grainAmount = uFlatness * 0.12;
  float grain = snoise(vec3(p * 40.0, t * 2.0)) * grainAmount;
  col += grain * vec3(0.9, 0.85, 0.8);

  // Shimmer
  float shimmer = snoise(vec3(warped * 6.0, t * 1.0)) * 0.5 + 0.5;
  col += shimmer * uHighs * 0.05 * vec3(0.8, 0.9, 1.0);

  // === DUST MOTES: gentle floating particles during quiet passages ===
  float dustIntensity = smoothstep(0.35, 0.1, energy) * 0.1;
  if (dustIntensity > 0.001) {
    float dust1 = snoise(vec3(p * 15.0 + uDynamicTime * 0.05, uDynamicTime * 0.1));
    float dust2 = snoise(vec3(p * 20.0 - uDynamicTime * 0.03, uDynamicTime * 0.15 + 5.0));
    float dustParticle = max(0.0, dust1 * dust2 - 0.3) * 4.0;
    col += dustParticle * dustIntensity * vec3(1.0, 0.95, 0.85);
  }

  // === WARP SPEED TRAILS: radial lines during sustained peaks ===
  float warpIntensity = smoothstep(0.6, 0.9, energy) * 0.12;
  if (warpIntensity > 0.001) {
    float warpAngle = atan(p.y, p.x);
    float radialNoise = snoise(vec3(warpAngle * 10.0, length(p) * 3.0, uDynamicTime * 2.0));
    float trail = max(0.0, radialNoise - 0.5) * 2.0;
    float radialFade = smoothstep(0.1, 0.5, length(p));
    col += trail * warpIntensity * radialFade * vec3(0.9, 0.95, 1.0);
  }

  // === COLOR AFTERGLOW: lingering color from recent peaks ===
  float afterglowStrength = smoothstep(0.3, 0.7, energy) * 0.05;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowColor = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  col += afterglowColor * afterglowStrength;

  // === WAVEFORM RING: subtle spectrum circle ===
  float wfAngle = atan(p.y, p.x);
  float wfR = length(p);
  float baseWfRadius = 0.3 + uRms * 0.1;
  float normAngle = (wfAngle + PI) / (2.0 * PI);
  float bandVal = 0.0;
  float bandIdx = normAngle * 7.0;
  int band = int(floor(bandIdx));
  if (band == 0) bandVal = uContrast0.x;
  else if (band == 1) bandVal = uContrast0.y;
  else if (band == 2) bandVal = uContrast0.z;
  else if (band == 3) bandVal = uContrast0.w;
  else if (band == 4) bandVal = uContrast1.x;
  else if (band == 5) bandVal = uContrast1.y;
  else bandVal = uContrast1.z;
  float wfRadius = baseWfRadius + bandVal * 0.08;
  float wfRing = smoothstep(0.006, 0.0, abs(wfR - wfRadius)) * 0.08 * energy;
  float wfHue = hsvToCosineHue(uPalettePrimary);
  vec3 wfColor = 0.5 + 0.5 * cos(6.28318 * vec3(wfHue, wfHue + 0.33, wfHue + 0.67));
  col += wfRing * wfColor;

  // === SDF STEALIE: emerges from the liquid light ===
  {
    float stHue1 = hsvToCosineHue(uPalettePrimary);
    float stHue2 = hsvToCosineHue(uPaletteSecondary);
    vec3 palCol1 = 0.5 + 0.5 * cos(6.28318 * vec3(stHue1, stHue1 + 0.33, stHue1 + 0.67));
    vec3 palCol2 = 0.5 + 0.5 * cos(6.28318 * vec3(stHue2, stHue2 + 0.33, stHue2 + 0.67));
    float nf = fbm3(vec3(p * 2.0, uDynamicTime * 0.1));
    col += stealieEmergence(p, uTime, energy, uBass, palCol1, palCol2, nf, uClimaxPhase);
    col += heroIconEmergence(p, uTime, energy, uBass, palCol1, palCol2, nf, uSectionIndex);
  }

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === BEAT SNAP: onset-reactive color saturation surge ===
  float beatKick = max(uBeatSnap, uDrumBeat) * 0.25 * (1.0 + climaxBoost * 0.5);
  col *= 1.0 + beatKick;

  // Section transition bloom
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float sectionBloom = smoothstep(0.06, 0.0, edgeDist) * 0.1;
  col += sectionBloom * vec3(1.0, 0.98, 0.94);

  // Vignette (energy-driven)
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);

  // Colored vignette edges
  float vigHue = hsvToCosineHue(uPaletteSecondary);
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(vigHue, vigHue + 0.33, vigHue + 0.67));
  vigTint = max(vigTint * 0.03, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vignette);

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.93, 0.93 - 0.07, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
