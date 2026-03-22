/**
 * Ocean — vast seascape from just above the waterline, looking toward the horizon.
 * Layered sine-wave swells with FBM displacement create a convincing ocean surface.
 * Moon/sun on the horizon pulses with slow energy; reflections stretch in the water.
 *
 * MASSIVE dynamic range: glass-calm moonlit sea at rest → raging storm at full energy.
 *
 * Audio reactivity:
 *   uBass + uEnergy  → swell height (gentle ripples → massive waves)
 *   uOnsetSnap       → foam/spray on wave crests (white noise at peaks)
 *   uSlowEnergy      → moon/sun size pulse, overall atmosphere
 *   uStemVocalPresence→ bioluminescent glow scattered in water
 *   uMelodicPitch    → wave frequency modulation
 *   uSectionType     → jam=building swells, space=glass calm moonlit, solo=spotlight
 *   uChromaHue       → sky/water tint shift
 *   uPalettePrimary  → dominant water color hue
 *   uPaletteSecondary→ sky/horizon color hue
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const oceanVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const oceanFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, halationEnabled: true, flareEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ── Ocean wave height function ──
// Layered sine waves with FBM displacement for organic surface.
// Returns wave height at a given XZ position.
float oceanWave(vec2 pos, float time, float waveFreq, float waveAmp, float storminess) {
  float h = 0.0;
  float freq = waveFreq;
  float amp = waveAmp;
  // 5 octaves of directional waves
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    // Each wave layer travels in a rotated direction
    float wave = sin(pos.x * freq + time * (0.8 + float(i) * 0.15))
               + sin(pos.y * freq * 0.7 + time * (0.6 + float(i) * 0.1));
    h += wave * amp;
    // FBM displacement: add noise to break up regularity
    float nDisp = snoise(vec3(pos * freq * 0.3, time * 0.1 + float(i))) * amp * 0.4 * storminess;
    h += nDisp;
    pos = rot * pos;
    freq *= 1.8;
    amp *= 0.5;
  }
  return h;
}

// ── Foam: white noise at wave crests ──
float foam(vec2 pos, float waveH, float threshold, float time) {
  float foamMask = smoothstep(threshold * 0.7, threshold, waveH);
  float n = snoise(vec3(pos * 8.0, time * 2.0));
  float n2 = snoise(vec3(pos * 16.0, time * 3.0 + 10.0));
  float foamPattern = max(0.0, n * 0.6 + n2 * 0.4);
  return foamMask * foamPattern;
}

// ── Moon/Sun SDF ──
float celestialBody(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center) - radius;
  return smoothstep(0.005, -0.005, d);
}

// ── Celestial glow (halo around moon/sun) ──
float celestialGlow(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  return exp(-d * d / (radius * radius * 4.0));
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
  float mids = clamp(uMids, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === Derived parameters ===
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float harmonicTension = clamp(uHarmonicTension, 0.0, 1.0);
  float localTempoScale = uLocalTempo / 120.0;
  float bpH = beatPulseHalf(uMusicalTime);

  // === STORM INTENSITY: glass-calm → raging ===
  // Space sections force calm; jam sections amplify storm
  float storminess = mix(0.0, 1.0, energy + bass * 0.3 + fastE * 0.2)
                   * mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace)
                   + climaxBoost * 0.3;
  storminess = clamp(storminess, 0.0, 1.5);

  // === TIME ===
  float slowTime = uDynamicTime * 0.15;
  float waveTime = uDynamicTime * (0.3 + energy * 0.4) * mix(1.0, 0.3, sSpace);

  // === HORIZON LINE ===
  // At ~40% from top (0.6 in UV space), shifts slightly with bass
  float horizonY = 0.6 + bass * 0.02 - energy * 0.03;
  float horizonP = (horizonY - 0.5) * aspect.y; // in p-space

  // === WAVE PARAMETERS ===
  float waveFreq = mix(1.5, 4.0, energy) + melodicPitch * 2.0;
  float waveAmp = mix(0.01, 0.12, storminess);

  // ══════════════════════════════════════════════
  // SKY (above horizon)
  // ══════════════════════════════════════════════
  float skyMask = smoothstep(horizonP - 0.02, horizonP + 0.02, p.y);

  // Sky gradient: horizon color → deep space above
  float hue1 = uPaletteSecondary + chromaH * 0.08;
  float hue2 = uPalettePrimary + chromaH * 0.05;
  float sat = mix(0.5, 0.9, slowE) * uPaletteSaturation;

  vec3 horizonColor = hsv2rgb(vec3(hue1, sat * 0.6, mix(0.15, 0.35, slowE)));
  vec3 deepSkyColor = vec3(0.01, 0.01, 0.04); // near-black deep space
  // Calm moonlit: brighter horizon glow; storm: dark overcast
  horizonColor = mix(horizonColor, vec3(0.08, 0.06, 0.12), storminess * 0.5);
  float skyGradient = smoothstep(horizonP, horizonP + 0.8, p.y);
  vec3 skyCol = mix(horizonColor, deepSkyColor, skyGradient);

  // Stars: only visible during calm (low storminess)
  float starVisibility = smoothstep(0.4, 0.0, storminess);
  if (starVisibility > 0.01) {
    vec2 starUv = uv + slowTime * 0.005;
    float starCell = floor(starUv.x * 100.0 + starUv.y * 80.0 * 1000.0);
    float starH = fract(sin(dot(floor(starUv * 100.0), vec2(127.1, 311.7))) * 43758.5453);
    float starH2 = fract(sin(dot(floor(starUv * 100.0), vec2(269.5, 183.3))) * 43758.5453);
    vec2 starF = fract(starUv * 100.0);
    float starDist = length(starF - vec2(starH, starH2));
    float hasStar = step(0.75, starH);
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + starH * 50.0);
    float star = hasStar * twinkle * smoothstep(0.03, 0.005, starDist);
    skyCol += vec3(0.8, 0.85, 1.0) * star * 0.5 * starVisibility * skyMask;
  }

  // === MOON / SUN on horizon ===
  float celestialRadius = mix(0.04, 0.08, slowE) * (1.0 + bpH * 0.15);
  vec2 celestialPos = vec2(0.15 * aspect.x, horizonP + celestialRadius * 1.2);
  // Calm: bright moon; storm: dim, hidden
  float celestialBrightness = mix(0.9, 0.15, storminess);
  float body = celestialBody(p, celestialPos, celestialRadius) * celestialBrightness;
  float glow = celestialGlow(p, celestialPos, celestialRadius * 3.0) * celestialBrightness * 0.5;

  // Moon/sun color: warm amber in calm, pale in storm
  vec3 celestialCol = mix(vec3(1.0, 0.92, 0.7), vec3(0.6, 0.6, 0.7), storminess);
  skyCol += celestialCol * body * skyMask;
  skyCol += celestialCol * glow * 0.4 * skyMask;

  // Solo: spotlight effect on water — bright column from celestial body
  float spotlightMask = sSolo * (1.0 - storminess);

  // ══════════════════════════════════════════════
  // OCEAN (below horizon)
  // ══════════════════════════════════════════════
  float waterMask = 1.0 - skyMask;

  // Perspective: map UV below horizon to ocean surface coordinates
  // y=horizonY is infinity, y=0 is close
  float waterDepth = smoothstep(horizonP, horizonP - 0.8, p.y);
  float perspective = 1.0 / max(0.01, (horizonP - p.y) * 3.0 + 0.1);
  vec2 oceanPos = vec2(p.x * perspective * 2.0, perspective * 1.5);

  // Compute wave height
  float wH = oceanWave(oceanPos, waveTime, waveFreq, waveAmp, storminess);

  // Deep water color: midnight blue at rest → stormy green-gray at peaks
  vec3 calmDeep = hsv2rgb(vec3(hue2, sat, mix(0.06, 0.15, slowE)));
  vec3 stormDeep = vec3(0.08, 0.12, 0.10); // stormy green-gray
  vec3 waterColor = mix(calmDeep, stormDeep, storminess * 0.7);

  // Wave surface shading: lighter on crests, darker in troughs
  float surfaceShade = smoothstep(-waveAmp, waveAmp, wH);
  vec3 crestColor = mix(waterColor * 1.6, vec3(0.25, 0.35, 0.30), storminess * 0.3);
  vec3 troughColor = waterColor * 0.5;
  vec3 oceanCol = mix(troughColor, crestColor, surfaceShade);

  // Foam on crests from onset
  float foamThreshold = mix(0.06, 0.02, onset + storminess * 0.5);
  float foamAmount = foam(oceanPos, wH, foamThreshold, waveTime) * (onset * 0.8 + storminess * 0.5 + energy * 0.3);
  foamAmount = clamp(foamAmount, 0.0, 1.0);
  vec3 foamColor = vec3(0.85, 0.9, 0.95); // white foam
  oceanCol = mix(oceanCol, foamColor, foamAmount * 0.7);

  // === Bioluminescent glow during high vocal presence ===
  if (vocalPresence > 0.1) {
    float bioScale = 6.0 + waterDepth * 4.0;
    float bioN = snoise(vec3(oceanPos * bioScale, slowTime * 0.5));
    float bioN2 = snoise(vec3(oceanPos * bioScale * 2.3 + 30.0, slowTime * 0.8));
    float bioSpots = smoothstep(0.5, 0.8, bioN) * smoothstep(0.4, 0.7, bioN2);
    float bioGate = smoothstep(0.1, 0.5, vocalPresence) * (1.0 - storminess * 0.7);
    vec3 bioColor = mix(vec3(0.1, 0.5, 0.9), vec3(0.0, 0.8, 0.6), bioN * 0.5 + 0.5);
    oceanCol += bioColor * bioSpots * bioGate * 0.35;
  }

  // === Reflection of celestial body in water ===
  // Stretched vertically, broken by waves
  float reflectX = p.x - celestialPos.x;
  float reflectStretch = 8.0 + storminess * 12.0;
  float reflectDist = sqrt(reflectX * reflectX + pow((p.y - horizonP) * 0.3, 2.0));
  float reflectBase = exp(-reflectDist * reflectDist * reflectStretch) * celestialBrightness;
  // Break reflection with wave displacement
  float reflectWave = snoise(vec3(oceanPos * 3.0, waveTime * 0.5));
  float reflection = reflectBase * (0.5 + 0.5 * reflectWave) * waterMask;
  oceanCol += celestialCol * reflection * 0.5;

  // Solo spotlight: bright vertical band in the water
  if (spotlightMask > 0.01) {
    float spotX = abs(p.x - celestialPos.x);
    float spotFade = exp(-spotX * spotX * 15.0) * spotlightMask;
    // Rippling spotlight broken by waves
    float spotRipple = 0.7 + 0.3 * sin(oceanPos.y * 5.0 + waveTime);
    oceanCol += celestialCol * spotFade * spotRipple * 0.3 * waterMask;
  }

  // Distance fade: far water blends toward horizon color
  float distFade = smoothstep(0.0, 1.0, perspective * 0.15);
  oceanCol = mix(oceanCol, horizonColor * 0.8, clamp(distFade, 0.0, 0.7));

  // ══════════════════════════════════════════════
  // COMPOSITE
  // ══════════════════════════════════════════════
  vec3 col = mix(oceanCol, skyCol, skyMask);

  // === HORIZON GLOW: atmospheric scattering at waterline ===
  float horizonGlow = exp(-pow((p.y - horizonP) * 8.0, 2.0));
  vec3 glowColor = mix(celestialCol, horizonColor, 0.5) * mix(0.15, 0.05, storminess);
  col += glowColor * horizonGlow;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 2.0, slowTime));
    vec3 palCol1 = hsv2rgb(vec3(hue2, sat, 0.8));
    vec3 palCol2 = hsv2rgb(vec3(hue1, sat * 0.9, 0.7));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, palCol1, palCol2, nf, climaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === HERO ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 1.5, slowTime * 0.7));
    vec3 palCol1 = hsv2rgb(vec3(hue2, sat, 0.8));
    vec3 palCol2 = hsv2rgb(vec3(hue1, sat * 0.9, 0.7));
    vec3 heroLight = heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
    col += heroLight;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.25, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.02, 0.04), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
