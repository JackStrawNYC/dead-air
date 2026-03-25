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
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const auroraVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const auroraFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', flareEnabled: false, halationEnabled: false, caEnabled: false })}

varying vec2 vUv;

#define PI 3.14159265

// --- Starfield: simple procedural stars ---
float stars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.7, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.03, 0.005, dist);
}

// --- Volumetric Aurora FBM (nimitz-inspired) ---
// Rotation matrix per octave for organic swirl
mat2 m2 = mat2(0.80, 0.60, -0.60, 0.80);

// Octave count modulated by jam density: sparse exploration (3) → dense peak (6)
// At neutral density (0.5) this produces 5 octaves, matching the original behavior.
float auroraFBM(vec3 p, float turbulence) {
  int octaves = int(mix(3.0, 7.0, uJamDensity));
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    val += amp * snoise(p * freq);
    // Rotate XZ per octave for organic swirl (nimitz technique)
    p.xz = m2 * p.xz;
    p.y *= 1.1;
    // Turbulence from onset adds extra displacement per octave
    p.x += turbulence * 0.2 * float(i);
    freq *= 2.1;
    amp *= 0.5;
  }
  return val;
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

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Phase 1: New uniform integrations ---
  float vocalWarmth = uVocalEnergy * 0.12;
  float vocalSpot = uVocalPresence;
  float guitarActivity = uOtherEnergy * 0.2;
  float guitarTemp = uOtherCentroid;
  float trendDrift = uEnergyTrend * 0.03;
  float pitchCurtain = uMelodicPitch * 0.15;
  float directionDrift = uMelodicDirection * 0.02;
  float tensionTurb = uHarmonicTension * 0.3;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float localTempoScale = uLocalTempo / 120.0;
  float beatStability = clamp(uBeatStability, 0.0, 1.0);

  // === SLOW TIME: aurora should never feel rushed ===
  float slowTime = uDynamicTime * 0.08;
  float driftSpeed = (0.03 + slowE * 0.02 + trendDrift) * mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.15, sChorus) * (1.0 + uPeakApproaching * 0.3);

  // === SKY background (dim but visible, not pitch black) ===
  vec3 skyColor = mix(
    vec3(0.015, 0.02, 0.05),
    vec3(0.04, 0.05, 0.10),
    smoothstep(0.5, -0.3, p.y)
  );
  vec3 col = skyColor;

  // === STARS: visible through gaps in aurora ===
  float starLayer1 = stars(uv + slowTime * 0.01, 80.0);
  float starLayer2 = stars(uv + slowTime * 0.005 + 10.0, 120.0) * 0.6;
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + uv.x * 50.0 + uv.y * 30.0);
  vec3 starColor = vec3(0.8, 0.85, 1.0) * (starLayer1 + starLayer2) * twinkle;
  col += starColor * 0.4;

  // === AURORA COLORS from palette + chromaHue shift ===
  float hue1 = uPalettePrimary + chromaH * 0.1 + chordHue;
  float hue2 = uPaletteSecondary + chromaH * 0.08 + chordHue * 0.5;
  float sat = mix(0.7, 1.0, slowE) * uPaletteSaturation;

  vec3 auroraColor1 = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 auroraColor2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.9));
  vec3 classicGreen = vec3(0.1, 0.9, 0.4);
  vec3 classicPurple = vec3(0.5, 0.2, 0.8);
  auroraColor1 = mix(auroraColor1, classicGreen, 0.25);
  auroraColor2 = mix(auroraColor2, classicPurple, 0.2);

  // === VOLUMETRIC AURORA RAYMARCHING (nimitz-inspired) ===
  // Energy controls step count (24-32 range) and vertical coverage
  // Jam density expands step budget and coverage during peak jams
  // At neutral density (0.5) this produces 24 base steps, matching original behavior.
  int maxSteps = int(mix(16.0, 32.0, uJamDensity)) + int(energy * 8.0);
  float verticalCoverage = mix(0.15, 0.7, energy + uFastEnergy * 0.15) * mix(0.8, 1.2, uJamDensity) * mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace);
  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  float stemVocals = clamp(uVocalEnergy, 0.0, 1.0);
  // Space score → aurora spread (must be declared before use in curtainBrightness)
  float spaceSpread = 1.0 + uSpaceScore * 0.4;
  float curtainBrightness = mix(0.25, 0.80, energy) * mix(0.7, 1.3, uJamDensity) * spaceSpread + sChorus * 0.15 + sSolo * 0.10 - sSpace * 0.15;
  curtainBrightness += onset * 0.5;
  curtainBrightness += stemVocals * 0.20; // vocal presence lifts aurora brightness
  float bpH = beatPulseHalf(uMusicalTime);
  curtainBrightness += bpH * 0.20 + max(uBeatSnap, uDrumBeat) * 0.25;
  curtainBrightness += climaxBoost * 0.25;

  // Ray setup: looking upward into aurora band
  vec3 rd = normalize(vec3(p.x, 0.6 + p.y * 0.8, -1.0));

  // Volumetric accumulation
  vec4 auroraAcc = vec4(0.0);
  float stepSize = mix(0.15, 0.1, energy);

  // Vocal pitch → aurora vertical lift
  float vocalLift = (uVocalPitch - 0.5) * 0.3;

  // Aurora exists in a constrained vertical band
  // Melodic pitch lifts the curtain higher; melodic direction drifts band position; vocal pitch lifts
  float bandLow = mix(2.0, 1.0, energy) - pitchCurtain + vocalLift;
  float bandHigh = mix(3.5, 5.0, energy) + pitchCurtain + directionDrift + vocalLift;

  for (int i = 0; i < 40; i++) {
    if (i >= maxSteps) break;
    if (auroraAcc.a > 0.95) break;   // Early exit at near-opaque

    float t = float(i) * stepSize + 0.5;
    vec3 pos = rd * t;

    // Constrain to aurora band (skip steps outside)
    if (pos.y < bandLow || pos.y > bandHigh) continue;

    // Curtain sway from bass (dampened by beat stability: tight groove=steady curtains)
    float swayAmt = (bass * 0.4 + uFastBass * 0.25) * mix(1.0, 0.4, beatStability);
    pos.x += swayAmt * sin(pos.y * 2.0 + slowTime * 0.5);
    pos.z += swayAmt * 0.5 * cos(pos.y * 1.5 + slowTime * 0.3);

    // Slow ambient drift
    pos.x += slowTime * driftSpeed * 10.0;
    pos.z += slowTime * driftSpeed * 5.0;

    // FBM density with onset turbulence + harmonic tension
    float density = auroraFBM(pos * 0.3, max(onset, uDrumOnset) * 1.25 + tensionTurb);

    // Threshold: must exceed 0 to be visible
    density = smoothstep(-0.1, 0.4, density);

    // Vertical falloff: fade at edges of band
    float bandFade = smoothstep(bandLow, bandLow + 0.5, pos.y)
                   * smoothstep(bandHigh, bandHigh - 0.5, pos.y);
    density *= bandFade;

    if (density > 0.01) {
      // Color varies with height (green at bottom, purple at top)
      float heightMix = smoothstep(bandLow, bandHigh, pos.y);
      vec3 auroraCol = mix(auroraColor1, auroraColor2, heightMix);

      // Noise-based luminosity variation for shimmer
      float lumNoise = snoise(vec3(pos.x * 2.0, pos.y * 3.0, slowTime * 0.5));
      density *= 0.6 + 0.4 * lumNoise;

      // Front-to-back alpha compositing
      float alpha = density * stepSize * 3.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - auroraAcc.a);

      auroraAcc.rgb += auroraCol * curtainBrightness * weight;
      auroraAcc.a += weight;
    }
  }

  float auroraIntensity = auroraAcc.a;

  // Apply aurora to scene
  col += auroraAcc.rgb;

  // === SDF STEALIE: subtler emergence in aurora (scale 0.7) ===
  {
    float nf = auroraFBM(vec3(p * 2.0, slowTime), 0.0);
    vec3 stLight = stealieEmergence(p, uTime, energy, bass, auroraColor1, auroraColor2, nf, uClimaxPhase) * 0.7;
    col += stLight;
  }

  // === ATMOSPHERIC GLOW: diffuse light beneath aurora ===
  float glowY = smoothstep(0.3, -0.2, p.y);
  float glowStrength = auroraIntensity * (0.08 + energy * 0.12);
  vec3 glowColor = mix(auroraColor1, vec3(0.1, 0.2, 0.15), 0.5);
  col += glowColor * glowY * glowStrength;

  // === DIM STARS behind bright aurora ===
  col -= starColor * 0.4 * auroraIntensity * curtainBrightness;

  // === VIGNETTE ===
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.04, 0.03, 0.05), col, vignette);

  // Semantic: ambient → pastel desaturation
  float ambientDesat = uSemanticAmbient * 0.15;
  float ambLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(ambLuma) * vec3(0.95, 0.98, 1.0), ambientDesat);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
