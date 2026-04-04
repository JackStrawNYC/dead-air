/**
 * Blacklight Glow — UV blacklight reactive visuals.
 * Dark purple-black background with vivid neon glowing organic shapes
 * (amoeba blobs, mushroom caps, spore particles) that pulse with the music.
 * Like walking into a Dead show venue with blacklights illuminating
 * fluorescent posters and body paint.
 *
 * Visual aesthetic:
 *   - Quiet: faint neon shapes barely visible against deep purple-black void
 *   - Building: shapes glow brighter, more visible, slow organic drift
 *   - Peak: full neon eruption, all layers active, intense halos
 *   - Release: shapes dim, particles linger, glow contracts
 *
 * Audio reactivity:
 *   uEnergy          → glow intensity + number of visible shapes
 *   uBass            → pulsing glow radius (shapes breathe on bass hits)
 *   uHighs           → tiny particle sparkle layer intensity
 *   uOnsetSnap       → new bloom/pulse of light from random positions
 *   uBeatSnap        → flash intensification of all glowing elements
 *   uHarmonicTension → color saturation shift, halo spread
 *   uBeatStability   → high = steady glow, low = flickering organic wobble
 *   uMelodicPitch    → vertical drift of shape centers
 *   uChromaHue       → hue shift across neon palette
 *   uChordIndex      → micro-rotate hue per chord
 *   uFFTTexture      → per-shape glow modulation
 *   uClimaxPhase     → full neon eruption, maximum glow
 *   uPalettePrimary/Secondary → base and accent neon colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const blacklightGlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const blacklightGlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- Mushroom cap SDF: hemisphere with rounded base ---
float sdMushroomCap(vec2 p, float r) {
  // Upper hemisphere
  float top = length(p - vec2(0.0, r * 0.2)) - r;
  // Flatten below the equator
  float cut = p.y + r * 0.1;
  return max(top, -cut);
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
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  float slowTime = uDynamicTime * 0.03;

  // --- Domain warping + energy-responsive detail ---
  vec2 domainWarpOff = vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: more shapes, faster drift. Space: minimal, slow breathing. Solo: intense glow. Chorus: vivid.
  float sectionDriftSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.3, sSolo);
  float sectionGlowMult = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.5, sSolo) * mix(1.0, 1.4, sChorus);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: stable shapes, steady glow
  // Low coherence: flickering, shapes morph unpredictably
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.3, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Deep purple-black background ---
  vec3 col = vec3(0.02, 0.01, 0.04);
  // Subtle gradient: slightly lighter at center for depth
  col += vec3(0.01, 0.005, 0.02) * (1.0 - length(p) * 0.6);

  // --- Melodic vertical drift ---
  float vertShift = (melodicPitch - 0.5) * 0.06;

  // --- Palette neon colors ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.7, 1.0, energy) * uPaletteSaturation;

  // Fixed neon accent hues (blacklight palette)
  float neonGreenHue = 0.33;   // electric green
  float neonPinkHue = 0.92;    // hot pink
  float neonBlueHue = 0.65;    // electric blue
  float neonOrangeHue = 0.08;  // orange

  // Climax state
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);

  // --- LAYER 1: Large neon amoeba blobs (FBM noise thresholding) ---
  {
    float blobCount = 3.0 + energy * 4.0 + climaxBoost * 3.0; // 3 to 10 blobs
    float bassBreathe = 1.0 + bass * 0.25 + bp * 0.15;

    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      if (fi >= blobCount) break;

      // Each blob has a unique position from noise
      float seedX = fi * 1.7 + 3.14;
      float seedY = fi * 2.3 + 7.91;
      float driftSpeed = slowTime * 0.4 * sectionDriftSpeed;

      vec2 center = vec2(
        snoise(vec3(seedX, driftSpeed, 0.0)) * 0.6,
        snoise(vec3(seedY, driftSpeed, 0.0)) * 0.4 + vertShift
      );

      vec2 dp = p - center;

      // FBM noise field for organic shape
      float warpStr = (1.0 - stability) * 0.15 * coherenceWarpMult;
      vec2 warp = vec2(
        snoise(vec3(dp * 2.5 + fi * 10.0, slowTime * 0.3)),
        snoise(vec3(dp * 2.5 + fi * 10.0 + 50.0, slowTime * 0.3))
      ) * warpStr;

      float noiseField = fbm6(vec3((dp + warp) * 4.0 * detailMod, slowTime * 0.2 + fi * 5.0));
      noiseField = noiseField * 0.5 + 0.5; // remap to 0-1

      // Threshold to create shape boundaries
      float blobRadius = (0.08 + energy * 0.06) * bassBreathe;
      float dist = length(dp);
      float shape = smoothstep(blobRadius + 0.04, blobRadius - 0.02, dist) * smoothstep(0.35, 0.55, noiseField);

      // FFT modulation per blob
      float fftSample = texture2D(uFFTTexture, vec2(fi / 7.0, 0.5)).r;
      shape *= 1.0 + fftSample * 0.3;

      // Neon color: cycle through blacklight palette mixed with song palette
      float blobHue = mix(
        mix(neonGreenHue, neonPinkHue, mod(fi, 2.0)),
        mix(hue1, hue2, fi / 6.0),
        0.5
      );
      blobHue = fract(blobHue + chromaHueMod * 0.5);
      vec3 neonColor = hsv2rgb(vec3(blobHue, sat, 1.0));

      // Bright core
      float core = shape * (0.6 + energy * 0.6) * sectionGlowMult;
      col += neonColor * core;

      // Exponential falloff halo (the blacklight glow effect)
      float haloRadius = blobRadius * bassBreathe * (1.5 + tension * 0.5);
      float halo = exp(-dist * dist / (haloRadius * haloRadius * 0.15)) * shape * 0.4;
      halo += exp(-dist / (haloRadius * 2.0)) * 0.08 * energy; // wider soft glow
      col += neonColor * halo * sectionGlowMult;

      // Vocal glow adds warmth to halos
      col += neonColor * halo * vocalGlow * 0.5;
    }
  }

  // --- LAYER 2: Mushroom cap shapes (hemisphere SDF with noise edge) ---
  {
    float mushroomCount = 2.0 + energy * 3.0 + climaxBoost * 2.0;
    float bassPulse = 1.0 + bass * 0.2;

    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (fi >= mushroomCount) break;

      float seedX = fi * 3.1 + 17.5;
      float seedY = fi * 2.7 + 23.8;
      float driftSpeed = slowTime * 0.6 * sectionDriftSpeed;

      vec2 center = vec2(
        snoise(vec3(seedX, driftSpeed, 10.0)) * 0.55,
        snoise(vec3(seedY, driftSpeed, 10.0)) * 0.35 + vertShift
      );

      vec2 dp = p - center;

      // Slight rotation per mushroom
      float rot = slowTime * 0.3 * (fi - 2.0) * 0.1;
      float cr = cos(rot);
      float sr = sin(rot);
      dp = mat2(cr, -sr, sr, cr) * dp;

      // Noise-warped edge
      float edgeNoise = snoise(vec3(dp * 8.0, slowTime * 0.4 + fi * 20.0)) * 0.02 * coherenceWarpMult;
      float capRadius = (0.04 + energy * 0.03) * bassPulse;
      float sdf = sdMushroomCap(dp, capRadius + edgeNoise);

      // Glow from SDF
      float edge = smoothstep(0.01, -0.005, sdf);
      float glow = exp(-max(sdf, 0.0) * 30.0) * 0.5;

      // Neon color: alternate through palette
      float mushHue;
      if (i == 0) mushHue = neonBlueHue;
      else if (i == 1) mushHue = neonOrangeHue;
      else if (i == 2) mushHue = neonPinkHue;
      else if (i == 3) mushHue = neonGreenHue;
      else mushHue = hue1;
      mushHue = fract(mushHue + chordHue);

      vec3 mushColor = hsv2rgb(vec3(mushHue, sat, 1.0));

      // FFT modulation
      float fftSample = texture2D(uFFTTexture, vec2((fi + 3.0) / 8.0, 0.5)).r;

      col += mushColor * edge * (0.5 + energy * 0.5 + fftSample * 0.3) * sectionGlowMult;
      col += mushColor * glow * (0.3 + bass * 0.4) * sectionGlowMult;
    }
  }

  // --- LAYER 3: Tiny bright spore/particle dots ---
  {
    float particleIntensity = (0.2 + highs * 0.8) * (0.5 + energy * 0.5);
    float sparkle = 0.0;
    vec3 particleCol = vec3(0.0);

    for (int i = 0; i < 12; i++) {
      float fi = float(i);

      // Pseudo-random position from noise
      float px = snoise(vec3(fi * 5.3, 1.0, slowTime * 0.2 * sectionDriftSpeed)) * 0.7;
      float py = snoise(vec3(fi * 7.1, 2.0, slowTime * 0.2 * sectionDriftSpeed)) * 0.5;
      vec2 particlePos = vec2(px, py + vertShift * 0.5);

      float dist = length(p - particlePos);

      // Tiny bright dot with exponential falloff
      float dot_glow = exp(-dist * dist * 800.0) * particleIntensity;

      // Flickering: each particle has its own flicker phase
      float flicker = snoise(vec3(fi * 13.7, slowTime * 2.0, 0.0));
      flicker = smoothstep(-0.2, 0.5, flicker);
      dot_glow *= flicker;

      // Random neon color per particle
      float partHue = fract(fi * 0.17 + hue1 * 0.3 + chromaHueMod);
      vec3 pCol = hsv2rgb(vec3(partHue, 0.9, 1.0));

      particleCol += pCol * dot_glow;
    }

    col += particleCol;
  }

  // --- Onset flash: new bloom pulse from random position ---
  if (onset > 0.1) {
    vec2 onsetPos = vec2(
      snoise(vec3(uTime * 3.0, 0.0, 0.0)) * 0.4,
      snoise(vec3(0.0, uTime * 3.0, 0.0)) * 0.3
    );
    float onsetDist = length(p - onsetPos);
    float onsetBloom = exp(-onsetDist * onsetDist * 8.0) * onset * 1.5;

    float onsetHue = fract(hue1 + uTime * 0.1);
    vec3 onsetColor = hsv2rgb(vec3(onsetHue, 0.8, 1.0));
    col += onsetColor * onsetBloom;
  }

  // --- Beat flash: intensify all glowing elements ---
  col *= 1.0 + effectiveBeat * 0.4;

  // --- Climax boost ---
  col *= 1.0 + climaxBoost * 0.6;

  // --- Vignette (tight, to keep edges very dark) ---
  float vigScale = mix(0.35, 0.25, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.04), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // --- Feedback trails: section-type-aware decay ---
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.92, 0.92 - 0.07, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback
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
