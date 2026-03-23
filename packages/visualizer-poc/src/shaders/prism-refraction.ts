/**
 * Prism Refraction — Prismatic light splitting into spectral components through crystal medium.
 * Rainbow dispersion, holographic iridescence, chromatic channel offsets.
 *
 * Visual aesthetic:
 *   - Quiet: dark scene with faint prism outline, subtle internal glow
 *   - Building: light beam appears, spectral bands begin to separate
 *   - Peak: full ROYGBIV dispersion fan, caustic reflections, holographic shimmer
 *   - Release: bands collapse, prism dims, iridescence lingers
 *
 * Audio reactivity:
 *   uEnergy          -> dispersion angle (wider spread at higher energy)
 *   uBass            -> prism pulse/scale, internal glow intensity
 *   uHighs           -> spectral band sharpness, edge crispness
 *   uOnsetSnap       -> bright flash through prism
 *   uHarmonicTension -> internal reflections (caustic patterns inside prism)
 *   uBeatStability   -> high = clean refraction lines, low = scattered light
 *   uMelodicPitch    -> vertical beam direction shift
 *   uChromaHue       -> hue shift across palette
 *   uChordIndex      -> micro-rotate hue per chord
 *   uFFTTexture      -> per-band brightness modulation
 *   uClimaxPhase     -> full intensity boost, maximum dispersion
 *   uPalettePrimary/Secondary -> base and accent colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const prismRefractionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const prismRefractionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, anaglyphEnabled: true, flareEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- SDF equilateral triangle (prism cross-section) ---
float sdTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// --- Thin-film interference (holographic iridescence) ---
vec3 thinFilmIridescence(float cosAngle, float thickness) {
  // Simulates thin-film optical path difference -> spectral color
  float delta = 2.0 * thickness * cosAngle;
  vec3 color;
  color.r = 0.5 + 0.5 * cos(TAU * (delta * 1.0 + 0.0));
  color.g = 0.5 + 0.5 * cos(TAU * (delta * 1.1 + 0.33));
  color.b = 0.5 + 0.5 * cos(TAU * (delta * 1.2 + 0.67));
  return color;
}

// --- Spectral rainbow: wavelength to RGB approximation ---
vec3 wavelengthToRGB(float t) {
  // t: 0.0 (red/violet) -> 1.0 (red/violet), maps through ROYGBIV
  vec3 c;
  float x = t * 6.0;
  c.r = smoothstep(0.0, 1.0, 1.0 - abs(x - 3.0) / 3.0) + smoothstep(5.0, 6.0, x) + smoothstep(1.0, 0.0, x);
  c.g = smoothstep(1.0, 2.0, x) - smoothstep(4.0, 5.0, x);
  c.b = smoothstep(3.0, 4.0, x) - smoothstep(5.5, 6.0, x);
  // Smoother mapping through spectral bands
  c = clamp(c, 0.0, 1.0);
  return c;
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

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: more dispersion, wider scatter. Space: frozen prismatic, still beams.
  // Chorus: vivid rainbow saturation. Solo: dramatic concentrated beams.
  float sectionDispersion = mix(1.0, 1.8, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 0.7, sSolo);
  float sectionVividness = mix(1.0, 1.4, sChorus) * mix(1.0, 1.2, sSolo);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: clean refraction lines. Low coherence: scattered prismatic light.
  float coherenceClarity = coherence > 0.7 ? mix(1.0, 1.5, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 0.4, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Background: deep dark with subtle gradient ---
  vec3 col = mix(
    vec3(0.008, 0.005, 0.018),
    vec3(0.02, 0.015, 0.035),
    uv.y * 0.8 + 0.1
  );

  // --- Melodic vertical shift ---
  float vertShift = (melodicPitch - 0.5) * 0.06;
  p.y -= vertShift;

  // --- Slow rotation ---
  float angle = slowTime * 0.3 + energy * 0.05;
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);
  angle += bp * 0.015;
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 rp = mat2(ca, -sa, sa, ca) * p;

  // --- Noise warp (stability-driven, coherence-modulated) ---
  float warpAmount = (1.0 - stability) * 0.04 / coherenceClarity;
  vec2 warp = vec2(
    snoise(vec3(rp * 3.5, slowTime * 0.4)),
    snoise(vec3(rp * 3.5 + 100.0, slowTime * 0.4))
  ) * warpAmount;
  vec2 wp = rp + warp;

  // --- Prism geometry ---
  float latticeDensity = 1.0 + uJamDensity * 0.2;
  float prismSize = (0.22 / latticeDensity) * (1.0 + bass * 0.1);
  float prismDist = sdTriangle(wp, prismSize);

  // Pixel size for anti-aliasing
  float px = 1.0 / uResolution.y;

  // --- Climax state ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // --- Palette colors ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;

  vec3 primaryColor = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 secondaryColor = hsv2rgb(vec3(hue2, sat, 1.0));

  // --- Dispersion angle: energy + section driven ---
  float dispAngle = (0.3 + energy * 0.7 + climaxBoost * 0.4) * sectionDispersion;

  // --- Light beam entry: from upper-left toward prism center ---
  vec2 beamDir = normalize(vec2(0.7, -0.5));
  float beamWidth = 0.015 + onset * 0.01;

  // Project point onto beam axis (perpendicular distance to beam line through origin)
  float beamDist = abs(dot(wp - vec2(-0.3, 0.2), vec2(-beamDir.y, beamDir.x)));
  // Only draw beam on the entry side (before prism)
  float beamSide = dot(wp - vec2(-0.05, 0.0), beamDir);
  float beam = smoothstep(beamWidth, 0.0, beamDist) * smoothstep(0.0, -0.05, beamSide);
  beam *= (0.3 + energy * 0.7 + onset * 0.5);

  // Beam color: warm white
  vec3 beamColor = vec3(1.0, 0.97, 0.92) * beam * 0.8;
  col += beamColor;

  // --- Spectral dispersion fan (exit side of prism) ---
  // 7 spectral bands (ROYGBIV) fan out from prism exit point
  vec2 exitPoint = vec2(0.08, -0.02);
  vec2 fromExit = wp - exitPoint;
  float exitAngle = atan(fromExit.y, fromExit.x);
  float exitDist = length(fromExit);

  // Fan spread: centered around base angle, spread by dispAngle
  float baseAngle = -0.3; // primary exit direction (right-downward)
  float fanHalf = dispAngle * 0.5;

  // Only draw on exit side
  float exitSide = dot(wp - exitPoint, vec2(1.0, 0.0));

  if (exitSide > 0.0 && exitDist > 0.02) {
    float normalizedAngle = (exitAngle - baseAngle + fanHalf) / (fanHalf * 2.0);
    normalizedAngle = clamp(normalizedAngle, 0.0, 1.0);

    // 7 spectral bands
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float bandCenter = (fi + 0.5) / 7.0;
      float bandWidth = 1.0 / 7.0;

      // FFT modulation per band
      float fftSample = texture2D(uFFTTexture, vec2(fi / 7.0, 0.5)).r;

      // Sharpness driven by highs + coherence
      float sharpness = mix(8.0, 25.0, highs * coherenceClarity);
      float bandStrength = exp(-pow((normalizedAngle - bandCenter) * sharpness, 2.0));

      // Spectral color for this band
      vec3 bandColor = wavelengthToRGB(fi / 6.0);
      bandColor *= sectionVividness;

      // Distance falloff: beams extend outward
      float falloff = exp(-exitDist * mix(3.0, 1.5, energy));
      falloff *= (1.0 + fftSample * 0.4);

      // Width of each band ray
      float bandIntensity = bandStrength * falloff * (0.4 + energy * 0.6 + climaxBoost * 0.3);
      bandIntensity *= coherenceClarity;

      col += bandColor * bandIntensity * 0.6;
    }
  }

  // --- Chromatic aberration: R,G,B sampled at offset UVs ---
  {
    float caStrength = (0.003 + energy * 0.008 + onset * 0.005) * sectionDispersion;
    caStrength *= coherenceClarity;
    vec2 caDir = normalize(wp + vec2(0.001));
    vec3 caCol;
    // Sample accumulated color with per-channel UV offsets
    float rSample = snoise(vec3((wp + caDir * caStrength) * 4.0, slowTime));
    float bSample = snoise(vec3((wp - caDir * caStrength) * 4.0, slowTime));
    float gSample = snoise(vec3(wp * 4.0, slowTime));
    caCol = vec3(rSample, gSample, bSample) * 0.02 * energy;
    col += caCol;
  }

  // --- Prism body rendering ---
  {
    // Prism edge glow
    float edgeGlow = smoothstep(px * 3.0, 0.0, abs(prismDist)) * (0.5 + energy * 0.5 + vocalGlow);
    vec3 edgeColor = mix(primaryColor, vec3(1.0, 0.98, 0.95), 0.4);
    col += edgeColor * edgeGlow * 0.6;

    // Prism interior
    if (prismDist < 0.0) {
      // Crystal interior: subtle refraction pattern
      float interiorGlow = smoothstep(0.0, -0.05, prismDist) * 0.15;

      // Caustic patterns inside prism (tension-driven)
      float caustic1 = abs(snoise(vec3(wp * 12.0, slowTime * 2.0)));
      float caustic2 = abs(snoise(vec3(wp * 18.0 + 50.0, slowTime * 1.5)));
      float caustics = (caustic1 * 0.6 + caustic2 * 0.4) * tension * coherenceClarity;

      // Internal reflections: more complex at high tension
      float internalReflect = 0.0;
      if (tension > 0.2) {
        float reflAngle = atan(wp.y, wp.x) * 3.0 + slowTime;
        internalReflect = pow(abs(sin(reflAngle * 2.0 + caustic1 * PI)), 4.0);
        internalReflect *= smoothstep(0.2, 0.6, tension) * 0.3;
      }

      vec3 crystalColor = mix(primaryColor, secondaryColor, caustics);
      crystalColor += vec3(0.6, 0.7, 1.0) * caustics * 0.4;
      col += crystalColor * (interiorGlow + caustics * 0.15 + internalReflect * 0.2);
      col += vec3(1.0, 0.97, 0.9) * bass * interiorGlow * 0.3;
    }

    // Outer crystal glow (wider, softer)
    float outerGlow = exp(-abs(prismDist) * 15.0) * (0.2 + energy * 0.3 + bass * 0.2);
    col += mix(primaryColor, secondaryColor, 0.5) * outerGlow * 0.15;
  }

  // --- Holographic iridescence: thin-film interference on prism surface ---
  {
    // Approximate view angle from screen position relative to prism
    float cosViewAngle = 1.0 - length(wp) * 0.8;
    cosViewAngle = clamp(cosViewAngle, 0.0, 1.0);

    // Film thickness varies with position and time
    float thickness = 2.0 + snoise(vec3(wp * 6.0, slowTime * 0.5)) * 0.5;
    thickness += energy * 0.3;

    vec3 iridescence = thinFilmIridescence(cosViewAngle, thickness);

    // Only apply near prism surface
    float iridescenceMask = exp(-abs(prismDist) * 20.0);
    iridescenceMask *= (0.15 + energy * 0.2 + highs * 0.15);
    // Space: frozen iridescence is more visible
    iridescenceMask *= mix(1.0, 1.5, sSpace);

    col += iridescence * iridescenceMask * 0.25;
  }

  // --- Scattered light (low stability / low coherence) ---
  {
    float scatter = (1.0 - stability) * (1.0 - coherence) * 0.15;
    if (scatter > 0.01) {
      float n1 = snoise(vec3(wp * 8.0, slowTime * 3.0));
      float n2 = snoise(vec3(wp * 15.0 + 40.0, slowTime * 2.0));
      float sparkle = pow(max(0.0, n1), 3.0) * 0.5 + pow(max(0.0, n2), 5.0) * 0.5;
      vec3 scatterColor = wavelengthToRGB(fract(n1 * 0.5 + 0.5 + chromaHueMod));
      col += scatterColor * sparkle * scatter * energy;
    }
  }

  // --- Onset flash through prism ---
  {
    float flashMask = exp(-abs(prismDist) * 8.0);
    col += vec3(1.0, 0.98, 0.94) * onset * flashMask * 1.2;
    // Also brighten spectral bands on onset
    col += vec3(0.3, 0.25, 0.2) * onset * 0.3;
  }

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
  col = mix(vec3(0.008, 0.005, 0.018), col, vignette);

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
