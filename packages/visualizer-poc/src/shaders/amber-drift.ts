/**
 * Amber Drift — volumetric warm amber fog bridge shader.
 *
 * A quiet, contemplative scene: golden amber mist fills the frame while
 * slow-drifting orbs of warm light float through layered depth fog. Each
 * orb has a soft halo; tiny catch-light pinpoints drift between them. A
 * horizon glow sits at the bottom like distant hearth warmth.
 *
 * Designed as the Veneta routing bridge between bioluminescent water and
 * warm nebulae — low energy, warm palette, volumetric, nostalgic.
 *
 * Audio reactivity (16 uniforms):
 *   uEnergy           -> master opacity + orb brightness
 *   uSlowEnergy       -> fog density + scene breathing
 *   uChromaHue        -> warmth temperature (gold <-> amber, always warm)
 *   uBeatDecay        -> orb pulse sync (uBeatSnap * uBeatConfidence)
 *   uBass             -> orb size variation
 *   uVocalEnergy      -> central area brighten when vocals present
 *   uVocalPresence    -> vocal halo intensity
 *   uSectionType      -> verse=stable, jam=more flow, space=slowest
 *   uSlowEnergy       -> drift speed
 *   uHighs            -> catch-light sparkle
 *   uMids             -> mid-layer mist brightness
 *   uClimaxPhase      -> full luminosity (rare in bridge role)
 *   uCoherence        -> orb arrangement coherence
 *   uPalettePrimary   -> base warmth hue
 *   uPaletteSecondary -> highlight hue
 *   uShowWarmth       -> show-level warmth bias
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const amberDriftVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const amberDriftFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define ORB_COUNT 16

// ---- Deterministic hash for orb positions ----
vec2 adHash2(float i) {
  return vec2(
    fract(sin(i * 12.9898) * 43758.5453),
    fract(sin(i * 78.2330) * 12453.9812)
  );
}

float adHash1(float i) {
  return fract(sin(i * 91.3458) * 24631.7531);
}

// ---- Single orb position (slow drift with depth) ----
vec3 adOrbPosition(float idx, float time) {
  vec2 seed = adHash2(idx);
  float seed2 = adHash1(idx + 11.0);
  float seed3 = adHash1(idx + 23.0);

  // Base position in screen space [-1.4, 1.4] x [-1.0, 1.0]
  float baseX = (seed.x * 2.0 - 1.0) * 1.3;
  float baseY = (seed.y * 2.0 - 1.0) * 0.9;

  // Slow contemplative motion — Lissajous-like drift
  float driftPhase = seed2 * TAU;
  float driftRate = 0.04 + seed3 * 0.05;
  float x = baseX + sin(time * driftRate + driftPhase) * 0.18;
  float y = baseY + cos(time * driftRate * 0.73 + driftPhase * 1.3) * 0.12;

  // Depth [0.3, 1.0] — smaller value = further away
  float depth = 0.35 + seed2 * 0.65;

  return vec3(x, y, depth);
}

// ---- Soft orb disc with halo ----
float adOrbDisc(vec2 p, vec2 center, float radius) {
  float d = length(p - center);
  return exp(-d * d / (radius * radius));
}

float adOrbHalo(vec2 p, vec2 center, float radius) {
  float d = length(p - center);
  return exp(-d * d / (radius * radius * 12.0));
}

// ---- Layered fog density ----
float adFogLayer(vec2 p, float time, float scale, float offset) {
  return fbm3(vec3(p * scale + vec2(time * 0.015, time * 0.008), offset));
}

// ---- Catch-light pinpoint field ----
float adCatchLights(vec2 p, float time, float highs) {
  vec2 grid = p * 28.0;
  vec2 cell = floor(grid);
  vec2 fr = fract(grid) - 0.5;

  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 28475.9123);

  // Only sparse cells are lit
  float lit = step(0.93, h);

  // Twinkling phase per cell
  float twinkle = 0.5 + 0.5 * sin(time * (0.8 + h2 * 1.4) + h * TAU);

  float dist = length(fr);
  float pinpoint = smoothstep(0.08, 0.0, dist);

  return lit * pinpoint * twinkle * (0.3 + highs * 0.7);
}

// ---- Horizon glow at bottom of frame ----
float adHorizonGlow(vec2 uv, float slowE) {
  // Ramps up from bottom of frame
  float h = 1.0 - uv.y;
  float glow = smoothstep(0.0, 0.55, h) * smoothstep(1.0, 0.35, h);
  // Soft wavy variation across horizon
  float wave = sin(uv.x * 3.2 + uDynamicTime * 0.06) * 0.5 + 0.5;
  glow *= 0.75 + wave * 0.25;
  return glow * (0.6 + slowE * 0.4);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio inputs ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float vocalEnergy = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float beatDecay = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueShift = uChromaHue * 0.08; // small warmth shift only
  float showWarmth = clamp(uShowWarmth, 0.0, 1.0);
  float e2 = energy * energy;

  // ---- Section modulation ----
  float sectionT = uSectionType;
  float sVerse  = smoothstep(0.5, 1.5, sectionT) * (1.0 - step(1.5, sectionT));
  float sJam    = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace  = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  // Jam = more flow, space = slowest, verse = stable
  float sectionDrift = mix(1.0, 1.4, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 0.9, sVerse);
  float sectionOrbCount = mix(1.0, 1.2, sJam) * mix(1.0, 0.75, sSpace);
  float sectionBright = mix(1.0, 1.1, sChorus) * mix(1.0, 0.85, sSpace);

  // ---- Climax (rare for a bridge shader) ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity * 0.3;

  // ---- Time (slow and contemplative) ----
  float slowTime = uDynamicTime * 0.18 * sectionDrift;

  // ---- Warm palette ----
  // Always warm: deep amber, honey, golden cream, pale yellow
  float deepAmberHue  = 0.075; // deep amber
  float honeyHue      = 0.095; // honey
  float goldenHue     = 0.115; // golden cream
  float paleYellowHue = 0.135; // pale yellow

  // Slight palette-driven micro shift (stays warm)
  float baseShift = chromaHueShift + uPalettePrimary * 0.02 + showWarmth * 0.01;
  float sat = mix(0.55, 0.78, e2) * uPaletteSaturation;

  vec3 cDeepAmber  = hsv2rgb(vec3(deepAmberHue  + baseShift, sat * 0.95, 0.55));
  vec3 cHoney      = hsv2rgb(vec3(honeyHue      + baseShift, sat * 0.88, 0.85));
  vec3 cGoldenCrm  = hsv2rgb(vec3(goldenHue     + baseShift, sat * 0.72, 1.00));
  vec3 cPaleYellow = hsv2rgb(vec3(paleYellowHue + baseShift, sat * 0.52, 1.05));

  // ---- Background base: deep amber darkness ----
  // Vertical gradient — darker at top, warmer near horizon
  float vertGrad = smoothstep(0.0, 1.0, uv.y);
  vec3 col = mix(cDeepAmber * 0.55, cDeepAmber * 0.18, vertGrad);

  // ---- Fog layers (3 depths) ----
  // Back layer — broad, slow, deep amber
  float fogBack = adFogLayer(screenP, slowTime, 0.6, 0.0);
  fogBack = smoothstep(0.2, 0.8, fogBack);
  col = mix(col, cHoney * 0.45, fogBack * (0.35 + slowE * 0.25));

  // Mid layer — medium scale, honey-toned
  float fogMid = adFogLayer(screenP + vec2(0.5, 0.2), slowTime * 1.2, 1.1, 1.7);
  fogMid = smoothstep(0.25, 0.85, fogMid);
  col = mix(col, cHoney * 0.75 + cGoldenCrm * 0.15, fogMid * (0.25 + slowE * 0.3 + mids * 0.1));

  // Front layer — finer, warmer highlights
  float fogFront = adFogLayer(screenP + vec2(-0.3, 0.4), slowTime * 0.85, 1.8, 3.3);
  fogFront = smoothstep(0.35, 0.9, fogFront);
  col = mix(col, cGoldenCrm * 0.6, fogFront * (0.18 + slowE * 0.22) * sectionBright);

  // ---- Breathing modulation (slowE drives whole-scene pulse) ----
  float breathe = 0.85 + 0.15 * sin(uDynamicTime * 0.3) * (0.5 + slowE * 0.5);
  col *= breathe;

  // ---- Horizon glow at bottom ----
  float horizon = adHorizonGlow(uv, slowE);
  col += mix(cHoney, cGoldenCrm, 0.6) * horizon * (0.45 + vocalEnergy * 0.2);

  // ---- Central vocal brightening ----
  float centerDist = length(screenP);
  float vocalCenter = exp(-centerDist * centerDist * 1.8) * vocalEnergy;
  col += cGoldenCrm * vocalCenter * 0.35 * (0.6 + vocalPresence * 0.4);

  // ---- Drifting orbs ----
  vec3 orbAccum = vec3(0.0);
  int orbCount = int(float(ORB_COUNT) * sectionOrbCount);
  orbCount = min(orbCount, ORB_COUNT);

  for (int i = 0; i < ORB_COUNT; i++) {
    if (i >= orbCount) break;
    float fi = float(i);
    vec3 orbPos = adOrbPosition(fi, slowTime);
    vec2 orbXY = orbPos.xy;
    float depth = orbPos.z;

    // Orb properties
    float seedR = adHash1(fi + 41.0);
    float baseRadius = mix(0.018, 0.042, seedR) * depth;
    // Bass pulsation in size
    float radius = baseRadius * (1.0 + bass * 0.25 + beatDecay * 0.2);
    // Slight pulse per-orb phase
    float orbPhase = adHash1(fi + 57.0) * TAU;
    radius *= 0.92 + 0.08 * sin(uDynamicTime * 0.6 + orbPhase);

    // Main disc
    float disc = adOrbDisc(screenP, orbXY, radius);
    // Soft halo
    float halo = adOrbHalo(screenP, orbXY, radius);

    // Depth-based color: deeper orbs are amber, closer ones are golden
    vec3 orbCol = mix(cDeepAmber * 1.4, cGoldenCrm, depth);
    orbCol = mix(orbCol, cPaleYellow, smoothstep(0.7, 1.0, depth));

    // Brightness: depth + energy + beat
    float brightness = depth * (0.55 + energy * 0.45) * (1.0 + beatDecay * 0.3);
    brightness *= (0.85 + slowE * 0.3);

    // Halo is warmer and softer
    vec3 haloCol = mix(cHoney, cGoldenCrm, 0.55) * 0.6;

    orbAccum += orbCol * disc * brightness;
    orbAccum += haloCol * halo * brightness * 0.4;

    // Coherence: when coherence high, orbs have subtle inter-glow
    float coherenceGlow = coherence * 0.15;
    orbAccum += orbCol * halo * halo * coherenceGlow;
  }

  // Orb brightness master = energy-driven
  col += orbAccum * (0.6 + e2 * 0.6) * (0.9 + vocalEnergy * 0.3);

  // ---- Catch-light pinpoints ----
  float catchLights = adCatchLights(screenP, uDynamicTime * 0.5, highs);
  col += mix(cPaleYellow, cGoldenCrm, 0.3) * catchLights * 0.9;

  // Secondary sparser pinpoint layer (different scale)
  float catchLights2 = adCatchLights(screenP * 1.7 + vec2(3.1, 1.7), uDynamicTime * 0.35, highs);
  col += cGoldenCrm * catchLights2 * 0.55;

  // ---- Subtle radial warmth from center ----
  float radialWarmth = exp(-centerDist * centerDist * 0.45);
  col += cDeepAmber * radialWarmth * 0.12 * (0.7 + slowE * 0.3);

  // ---- Depth fog (atmospheric perspective) ----
  float depthFogNoise = fbm3(vec3(screenP * 0.7, slowTime * 0.5));
  float depthFog = 0.25 + depthFogNoise * 0.2;
  vec3 fogTint = mix(cDeepAmber * 0.4, cHoney * 0.5, vertGrad);
  col = mix(col, fogTint, depthFog * (0.55 - slowE * 0.25));

  // ---- Climax boost (rare) ----
  col *= 1.0 + climaxBoost;

  // ---- Always-warm tint finalization ----
  // Ensure red >= green >= blue for warm guarantee
  col.r = max(col.r, col.g * 0.95);
  col.b = min(col.b, col.g * 0.92);

  // ---- Master opacity from energy ----
  float masterOpacity = 0.78 + energy * 0.22;
  col *= masterOpacity;

  // ---- SDF icon emergence (low prominence for bridge role) ----
  {
    float nf = fbm3(vec3(screenP * 1.5, slowTime));
    vec3 c1 = mix(cHoney, cGoldenCrm, 0.5);
    vec3 c2 = cDeepAmber;
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.3;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex) * 0.7;
  }

  // ---- Soft vignette (warm) ----
  float vigScale = mix(0.32, 0.26, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigCol = cDeepAmber * 0.12;
  col = mix(vigCol, col, vignette);

  // ---- Post-processing ----
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
