/**
 * Sacred Geometry — SDF circles on hex lattice (Flower of Life / Metatron's Cube).
 * Progressive construction driven by energy: quiet builds from center seed,
 * peak reveals the full Flower of Life with Metatron's Cube connecting lines.
 *
 * Visual aesthetic:
 *   - Quiet: single glowing center circle, faint outer hints
 *   - Building: surrounding circles fade in, edges brighten
 *   - Peak: full 7-circle Flower of Life + Metatron connecting lines + inner patterns
 *   - Release: geometry softens, lines dissolve
 *
 * Audio reactivity:
 *   uEnergy          → progressive circle reveal (1 center → all 7+)
 *   uBass            → ring radius pulse, glow intensity
 *   uHighs           → line brightness, edge sharpness
 *   uOnsetSnap       → flash pulse on circle edges
 *   uHarmonicTension → inner pattern complexity (nested circles, triangles)
 *   uBeatStability   → high = clean geometry, low = noise-warped distortion
 *   uMelodicPitch    → vertical pattern shift
 *   uChromaHue       → hue shift across palette
 *   uChordIndex      → micro-rotate hue per chord
 *   uFFTTexture      → per-circle radius modulation
 *   uClimaxPhase     → full intensity boost, Metatron's Cube activates
 *   uPalettePrimary/Secondary → base and accent colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const sacredGeometryVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const sacredGeometryFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- SDF circle ---
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// --- SDF line segment ---
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
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

  float slowTime = uDynamicTime * 0.04;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float vocalGlow = uVocalEnergy * 0.1;

  // --- Background ---
  vec3 col = mix(
    vec3(0.01, 0.008, 0.02),
    vec3(0.025, 0.02, 0.04),
    uv.y
  );

  // --- Melodic vertical shift ---
  float vertShift = (melodicPitch - 0.5) * 0.08;
  p.y -= vertShift;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: faster rotation, looser edges. Space: near-still, sharp sacred forms. Solo: pulsing radii.
  float sectionRotSpeed = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.2, sSolo);

  // --- Slow rotation (section-modulated) ---
  float angle = slowTime * 0.5 * sectionRotSpeed + energy * 0.1;
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);
  angle += bp * 0.02;
  float ca = cos(angle);
  float sa = sin(angle);
  p = mat2(ca, -sa, sa, ca) * p;

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: sharp edges, perfect circle placement (reduce warp)
  // Low coherence: wobbly placement, soft edges (amplify warp)
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.2, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.5, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Noise warp (low stability = more distortion, coherence modulates) ---
  float warpAmount = (1.0 - stability) * 0.06 * coherenceWarpMult;
  vec2 warp = vec2(
    snoise(vec3(p * 3.0, slowTime * 0.5)),
    snoise(vec3(p * 3.0 + 100.0, slowTime * 0.5))
  ) * warpAmount;
  vec2 wp = p + warp;

  // --- Flower of Life: 7 circle centers on hex lattice ---
  float latticeDensity = 1.0 + uJamDensity * 0.3;
  float baseRadius = 0.2 / latticeDensity;
  float hexR = baseRadius; // distance from center to surrounding circle centers

  // Center + 6 surrounding positions
  vec2 centers[7];
  centers[0] = vec2(0.0, 0.0); // center
  for (int i = 0; i < 6; i++) {
    float a = float(i) * TAU / 6.0;
    centers[i + 1] = vec2(cos(a), sin(a)) * hexR;
  }

  // --- FFT-driven radius modulation per circle ---
  float px = 1.0 / uResolution.y; // pixel size for anti-aliasing
  // Coherence sharpness: high = crisp edges, low = soft/wobbly edges
  float edgeWidth = px * mix(3.0, 1.5, smoothstep(0.3, 0.7, coherence));

  // Bass pulse on radius
  float radiusPulse = 1.0 + bass * 0.08 + sSolo * 0.06; // solo: extra pulsing radii
  edgeWidth *= mix(1.0, 1.5, sJam) * mix(1.0, 0.6, sSpace); // jam: softer, space: sharper

  // --- Progressive construction: energy controls visibility ---
  // energy 0.0 → only center circle (index 0)
  // energy 0.5 → center + 3 surrounding
  // energy 1.0 → all 7
  float revealCount = 1.0 + energy * 6.0; // 1.0 to 7.0

  // Climax state
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // In climax, always reveal all
  revealCount = mix(revealCount, 7.0, climaxBoost);

  // --- Palette colors ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.4, 0.9, energy) * uPaletteSaturation;

  vec3 primaryColor = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 secondaryColor = hsv2rgb(vec3(hue2, sat, 1.0));

  // --- Draw circles ---
  float circleField = 0.0;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);

    // Fade in based on reveal count
    float visibility = smoothstep(fi - 0.3, fi + 0.3, revealCount);
    if (visibility < 0.001) continue;

    // FFT modulation: sample texture at different positions per circle
    float fftSample = texture2D(uFFTTexture, vec2(fi / 7.0, 0.5)).r;
    float modRadius = baseRadius * radiusPulse * (1.0 + fftSample * 0.12);

    // SDF circle
    float sdf = sdCircle(wp - centers[i], modRadius);

    // Bright edge line (coherence controls sharpness)
    float edge = smoothstep(edgeWidth, 0.0, abs(sdf)) * visibility;

    // Per-circle hue variation
    float circleHue = mix(hue1, hue2, fi / 6.0);
    vec3 circleColor = hsv2rgb(vec3(circleHue, sat, 1.0));

    // Edge glow
    float glow = exp(-abs(sdf) * 20.0) * visibility * 0.3;

    col += circleColor * edge * (0.6 + energy * 0.6 + highs * 0.3);
    col += circleColor * glow * (0.3 + bass * 0.3 + vocalGlow);

    circleField = max(circleField, edge);
  }

  // --- Metatron's Cube: connecting lines between circle centers ---
  // Activate at higher energy + climax
  float metatronReveal = smoothstep(0.5, 0.85, energy) + climaxBoost * 0.5;
  metatronReveal = clamp(metatronReveal, 0.0, 1.0);

  if (metatronReveal > 0.01) {
    float lineField = 0.0;

    // Connect center to all 6 surrounding
    for (int i = 1; i < 7; i++) {
      float d = sdSegment(wp, centers[0], centers[i]);
      lineField += smoothstep(px * 2.5, 0.0, d - 0.002);
    }

    // Connect adjacent surrounding circles
    for (int i = 1; i < 7; i++) {
      int next = i < 6 ? i + 1 : 1;
      float d = sdSegment(wp, centers[i], centers[next]);
      lineField += smoothstep(px * 2.5, 0.0, d - 0.002);
    }

    // Connect opposite surrounding circles (star pattern)
    for (int i = 1; i <= 3; i++) {
      float d = sdSegment(wp, centers[i], centers[i + 3]);
      lineField += smoothstep(px * 2.5, 0.0, d - 0.002);
    }

    lineField = clamp(lineField, 0.0, 1.0);
    vec3 lineColor = mix(primaryColor, secondaryColor, 0.5);
    col += lineColor * lineField * metatronReveal * (0.3 + highs * 0.3);
  }

  // --- Inner patterns at high tension ---
  if (tension > 0.2) {
    float innerReveal = smoothstep(0.2, 0.8, tension);

    // Inner circles at half radius within each visible circle
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float visibility = smoothstep(fi - 0.3, fi + 0.3, revealCount);
      if (visibility < 0.001) continue;

      float innerR = baseRadius * 0.5;
      float sdf = sdCircle(wp - centers[i], innerR);
      float edge = smoothstep(px * 2.0, 0.0, abs(sdf));

      float innerHue = fract(hue1 + fi * 0.08 + slowTime * 0.1);
      vec3 innerCol = hsv2rgb(vec3(innerHue, sat * 0.8, 0.9));
      col += innerCol * edge * innerReveal * visibility * 0.3;
    }

    // Vesica piscis highlights at intersection points (high tension)
    if (tension > 0.5) {
      float vesicaReveal = smoothstep(0.5, 1.0, tension);
      for (int i = 1; i < 7; i++) {
        // Midpoint between center and surrounding circle
        vec2 mid = centers[i] * 0.5;
        float d = length(wp - mid);
        float spot = exp(-d * d * 200.0);
        col += primaryColor * spot * vesicaReveal * 0.4;
      }
    }
  }

  // --- Onset flash on geometry ---
  col += vec3(1.0, 0.97, 0.92) * circleField * onset * 1.5;

  // --- Climax boost ---
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.008, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.91, 0.91 - 0.07, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
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
