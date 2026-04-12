/**
 * Ember Meadow — golden hour wildflower meadow with bioluminescent bloom.
 * Bridge shader between Inferno (fire) and Nature (organic) families.
 * MID energy + WARM + ORGANIC. Tall wildflower silhouettes lit from within
 * by warm amber/gold/pink-orange bioluminescence. Gentle wind sway, floating
 * embers drifting upward like warm fireflies, distant tree silhouettes, soft
 * heat haze, sun setting on horizon. For Casey Jones, Sugar Magnolia, and
 * mid-energy warm organic moments.
 *
 * Audio reactivity (16+ uniforms):
 *   uEnergy          -> flower glow intensity + ember count
 *   uSlowEnergy      -> wind sway amplitude
 *   uBass            -> flower size pulse
 *   uChromaHue       -> warmth temperature shift
 *   uBeatDecay       -> (via uOnsetSnap/uBeatSnap) ember spawn rate + flower pulse
 *   uVocalEnergy     -> central golden glow
 *   uMids            -> flower color saturation
 *   uHighs           -> ember sparkle brightness
 *   uSectionType     -> jam/space/chorus/solo behavior
 *   uMelodicPitch    -> sun height + flower tilt
 *   uMelodicDirection-> wind direction bias
 *   uHarmonicTension -> sky warmth shift (tension = more orange)
 *   uBeatStability   -> steadiness of sway
 *   uClimaxPhase     -> full golden bloom
 *   uCoherence       -> meadow calmness
 *   uChordIndex      -> micro flower hue rotation
 *   uVocalPitch      -> central glow vertical position
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const emberMeadowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const emberMeadowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: false,
  lightLeakEnabled: true,
  dofEnabled: false,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ---- Hash for deterministic random per-flower / per-ember ----
float emHash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}
vec2 emHash22(float n) {
  return vec2(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 311.7) * 43758.5453)
  );
}

// ---- Stem SDF: vertical soft capsule with taper ----
float emStem(vec2 p, vec2 base, float height, float width, float sway) {
  // Apply sway curve along height
  float t = clamp((p.y - base.y) / height, 0.0, 1.0);
  float swayX = sway * t * t; // quadratic sway, pinned at base
  vec2 q = p - vec2(base.x + swayX, base.y);
  // Taper from base to tip
  float w = width * (1.0 - t * 0.65);
  float dx = abs(q.x) - w;
  float dy = max(0.0, q.y - height) + max(0.0, -q.y);
  return length(vec2(max(dx, 0.0), dy)) - 0.001;
}

// ---- Flower head SDF: 5-petal rosette ----
float emFlowerHead(vec2 p, vec2 center, float radius, float rotation) {
  vec2 q = p - center;
  float r = length(q);
  float a = atan(q.y, q.x) + rotation;
  // 5-petal rose curve
  float petals = abs(cos(a * 2.5)) * radius * 1.15;
  float core = r - radius * 0.35;
  float rose = r - petals;
  return min(core, rose);
}

// ---- Soft glow falloff from a point ----
float emSoftGlow(vec2 p, vec2 c, float radius) {
  float d = length(p - c);
  return exp(-d * d / (radius * radius * 0.5));
}

// ---- Ember particle: returns intensity at uv for a single ember ----
float emEmber(vec2 uv, float seed, float time, float driftBoost) {
  vec2 h = emHash22(seed);
  // Horizontal starting position
  float x = h.x;
  // Vertical rise: loops through the screen
  float riseSpeed = 0.06 + h.y * 0.05;
  float life = fract(time * riseSpeed * driftBoost + h.x * 13.37);
  // Gentle horizontal drift via sin
  float driftX = sin(time * 0.6 + seed * 4.7) * 0.025 * (0.5 + h.y);
  // Map life to vertical position (bottom -> top)
  float y = life;
  vec2 pos = vec2(x + driftX, y);
  // Size varies
  float size = mix(0.0012, 0.0032, h.y);
  float d = length((uv - pos) * vec2(1.0, 1.0));
  // Core dot + soft halo
  float core = exp(-d * d / (size * size));
  float halo = exp(-d * d / (size * size * 12.0)) * 0.45;
  // Fade in/out over lifespan
  float fade = smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.8, life);
  // Slight flicker
  float flicker = 0.8 + 0.2 * sin(time * 12.0 + seed * 7.3);
  return (core + halo) * fade * flicker;
}

// ---- Rolling hill horizon ----
float emHorizon(float x, float time) {
  float h = 0.28;
  h += sin(x * 3.2 + 0.7) * 0.015;
  h += sin(x * 7.5 + 2.3) * 0.008;
  h += fbm(vec2(x * 2.0, time * 0.02)) * 0.02;
  return h;
}

// ---- Distant tree silhouette (soft blob cluster) ----
float emDistantTrees(vec2 uv, float horizonY) {
  float treeMask = 0.0;
  // Small cluster of blobs just above horizon on the left
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float tx = -0.35 + fi * 0.08;
    float ty = horizonY + 0.02 + sin(fi * 1.7) * 0.008;
    float tr = 0.025 + emHash11(fi * 3.1) * 0.01;
    float d = length((uv - vec2(tx, ty)) * vec2(1.0, 1.8));
    treeMask = max(treeMask, smoothstep(tr, tr * 0.6, d));
  }
  // Right cluster
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float tx = 0.15 + fi * 0.08;
    float ty = horizonY + 0.018 + sin(fi * 2.1 + 1.0) * 0.01;
    float tr = 0.02 + emHash11(fi * 5.7 + 13.0) * 0.012;
    float d = length((uv - vec2(tx, ty)) * vec2(1.0, 1.8));
    treeMask = max(treeMask, smoothstep(tr, tr * 0.6, d));
  }
  return treeMask;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio clamping ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float vocal = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalPitch = clamp(uVocalPitch, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.10;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.06 * chordConf;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.5;
  float windTime = uDynamicTime * 0.8;

  // ---- Section modulation ----
  float sectionT = uSectionType;
  float sJam    = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace  = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo   = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float swayBoost   = mix(1.0, 1.45, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.15, sChorus);
  float glowBoost   = mix(1.0, 1.20, sJam) * mix(1.0, 0.80, sSpace) * mix(1.0, 1.30, sChorus) * mix(1.0, 1.20, sSolo);
  float emberBoost  = mix(1.0, 1.35, sJam) * mix(1.0, 0.55, sSpace) * mix(1.0, 1.25, sChorus);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Warmth temperature (chroma hue shifts between amber/rose/peach) ----
  float warmth = 0.5 + chromaHueMod + tension * 0.12;
  warmth = clamp(warmth, 0.0, 1.0);

  // ---- Sky gradient: warm orange -> pink -> violet ----
  // Sun height controlled by melodicPitch (higher pitch = higher sun)
  float sunY = 0.32 + melodicPitch * 0.08;
  float skyT = smoothstep(0.15, 1.0, uv.y);

  // Horizon color (warm orange)
  vec3 horizonCol = mix(
    vec3(1.00, 0.55, 0.22),  // deep orange
    vec3(1.00, 0.68, 0.28),  // amber
    warmth
  );
  // Mid sky (pink / peach)
  vec3 midSkyCol = mix(
    vec3(0.95, 0.45, 0.42),  // coral pink
    vec3(0.98, 0.58, 0.38),  // salmon
    warmth
  );
  // High sky (violet -> dusky purple)
  vec3 highSkyCol = mix(
    vec3(0.38, 0.22, 0.48),  // violet
    vec3(0.52, 0.28, 0.45),  // dusky magenta
    warmth
  );

  vec3 sky;
  if (skyT < 0.4) {
    sky = mix(horizonCol, midSkyCol, skyT / 0.4);
  } else {
    sky = mix(midSkyCol, highSkyCol, (skyT - 0.4) / 0.6);
  }

  // Subtle sky texture (clouds / haze bands)
  float cloudBand = fbm(vec2(uv.x * 3.0 + slowTime * 0.02, uv.y * 5.0)) * 0.15;
  sky += vec3(0.08, 0.05, 0.04) * cloudBand * smoothstep(0.35, 0.8, uv.y);

  // ---- Sun ----
  vec2 sunPos = vec2(0.5 + melodicDir * 0.08, sunY);
  float sunDist = length((uv - sunPos) * vec2(aspect.x, 1.0));
  float sunCore = exp(-sunDist * sunDist * 180.0);
  float sunHalo = exp(-sunDist * sunDist * 12.0) * 0.55;
  float sunBloom = exp(-sunDist * sunDist * 1.5) * 0.20;
  vec3 sunColor = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.92, 0.68), warmth);
  sky += sunColor * (sunCore * 2.0 + sunHalo) * (1.0 + vocal * 0.6 + climaxBoost * 0.4);
  sky += sunColor * sunBloom * (0.8 + slowE * 0.4);

  // ---- Horizon glow (bright band at horizon) ----
  float horizonBand = exp(-abs(uv.y - sunY + 0.05) * 8.0) * 0.45;
  sky += sunColor * horizonBand * (0.6 + energy * 0.4);

  vec3 col = sky;

  // ---- Distant tree silhouettes ----
  float horizonY = sunY - 0.02;
  float treeMask = emDistantTrees(uv, horizonY);
  vec3 treeCol = mix(vec3(0.10, 0.04, 0.06), vec3(0.18, 0.08, 0.10), warmth);
  col = mix(col, treeCol, treeMask * 0.92);

  // ---- Ground ----
  float groundT = smoothstep(horizonY - 0.01, horizonY + 0.02, horizonY + 0.01 - uv.y);
  groundT = clamp(groundT, 0.0, 1.0);
  // Ground color: warm earth darkening toward foreground
  vec3 groundNear = mix(vec3(0.08, 0.04, 0.03), vec3(0.12, 0.06, 0.04), warmth);
  vec3 groundFar  = mix(vec3(0.22, 0.10, 0.08), vec3(0.28, 0.13, 0.08), warmth);
  float distFromHorizon = max(0.0, horizonY - uv.y);
  vec3 groundCol = mix(groundFar, groundNear, smoothstep(0.0, 0.3, distFromHorizon));

  // Ground grass texture
  float grassTex = fbm(vec2(uv.x * 40.0, uv.y * 80.0 + slowTime * 0.05));
  groundCol += vec3(0.03, 0.015, 0.01) * grassTex;

  col = mix(col, groundCol, groundT);

  // ---- Heat haze rising from ground ----
  if (uv.y > horizonY - 0.08 && uv.y < horizonY + 0.12) {
    float hazeNoise = fbm(vec2(uv.x * 6.0 + windTime * 0.15, uv.y * 20.0 - windTime * 0.3));
    float hazeBand = smoothstep(horizonY + 0.10, horizonY - 0.05, uv.y);
    float haze = hazeNoise * hazeBand * 0.12 * (0.6 + slowE * 0.4);
    vec3 hazeCol = mix(vec3(0.95, 0.55, 0.35), vec3(1.0, 0.75, 0.45), warmth);
    col += hazeCol * haze;
  }

  // ---- Wildflowers (6 flowers, scattered across foreground) ----
  float flowerAccum = 0.0;
  vec3 flowerGlowCol = vec3(0.0);

  const int NUM_FLOWERS = 6;
  for (int f = 0; f < NUM_FLOWERS; f++) {
    float fi = float(f);
    float seed = fi * 1.618 + 0.3;

    // Flower base position (spread across the bottom)
    float baseX = mix(0.08, 0.92, fi / float(NUM_FLOWERS - 1));
    baseX += (emHash11(seed) - 0.5) * 0.04;
    float baseY = horizonY - 0.02 - emHash11(seed * 3.1) * 0.06;

    // Flower height: taller flowers toward center
    float centerDist = abs(baseX - 0.5);
    float height = mix(0.22, 0.32, 1.0 - centerDist) + emHash11(seed * 7.3) * 0.04;
    // Bass pulse
    height *= 1.0 + bass * 0.20 + effectiveBeat * 0.05;

    // Wind sway: phase-offset per flower
    float swayPhase = fi * 0.7 + windTime * (1.2 + melodicDir * 0.2);
    float swayAmp = (0.025 + slowE * 0.10) * swayBoost;
    swayAmp *= mix(0.6, 1.0, stability);
    swayAmp += onset * 0.015;
    float sway = sin(swayPhase) * swayAmp + sin(swayPhase * 1.7 + 0.5) * swayAmp * 0.3;

    float stemWidth = 0.004 + emHash11(seed * 11.1) * 0.002;

    // Stem
    vec2 stemBase = vec2(baseX, baseY);
    float stemDist = emStem(uv, stemBase, height, stemWidth, sway);

    // Leaf nodes (small bumps along stem)
    for (int lf = 0; lf < 2; lf++) {
      float lfi = float(lf);
      float lfT = 0.3 + lfi * 0.25;
      float lfSway = sway * lfT * lfT;
      vec2 lfPos = vec2(baseX + lfSway, baseY + height * lfT);
      float lfSize = 0.008 + emHash11(seed * 17.0 + lfi) * 0.004;
      float side = (lfi < 0.5) ? 1.0 : -1.0;
      vec2 lfOffset = vec2(side * 0.012, 0.0);
      float lfDist = length((uv - lfPos - lfOffset) * vec2(1.0, 1.8)) - lfSize;
      stemDist = min(stemDist, lfDist);
    }

    // Flower head position (top of stem, with sway)
    vec2 headPos = vec2(baseX + sway, baseY + height);
    float headRadius = 0.018 + emHash11(seed * 23.0) * 0.008;
    headRadius *= 1.0 + bass * 0.12 + effectiveBeat * 0.08;

    float headDist = emFlowerHead(uv, headPos, headRadius, fi * 0.8 + windTime * 0.1);

    // Combined silhouette
    float silhouette = min(stemDist, headDist);
    float silhouetteMask = smoothstep(0.002, -0.001, silhouette);
    flowerAccum = max(flowerAccum, silhouetteMask);

    // ---- Inner glow (bioluminescence from within the head) ----
    float glowRadius = headRadius * 3.2;
    float innerGlow = emSoftGlow(uv, headPos, glowRadius);
    // Pulse with bass / beat
    float pulse = 1.0 + bass * 0.45 + effectiveBeat * 0.35 + sin(windTime * 2.5 + fi * 1.7) * 0.08;
    innerGlow *= pulse;

    // Per-flower glow color: amber, gold, pink-orange
    float colorPick = emHash11(seed * 41.0);
    vec3 glowBase;
    if (colorPick < 0.33) {
      glowBase = vec3(1.0, 0.72, 0.28);  // warm amber
    } else if (colorPick < 0.66) {
      glowBase = vec3(1.0, 0.86, 0.42);  // soft gold
    } else {
      glowBase = vec3(1.0, 0.58, 0.38);  // pink-orange
    }

    // Chord / chroma hue micro-shift
    glowBase = mix(glowBase, glowBase.gbr, chordHue * 2.0);

    // Saturation tied to mids
    float glowSat = mix(0.7, 1.0, mids);
    glowBase = mix(vec3(dot(glowBase, vec3(0.33))), glowBase, glowSat);

    // Intensity tied to energy + glow boost
    float glowIntensity = (0.5 + energy * 1.2) * glowBoost;
    glowIntensity *= 1.0 + climaxBoost * 0.8;
    glowIntensity *= 1.0 + vocal * 0.3;

    // Silhouette core glows brightest (the "light from within")
    float coreGlow = smoothstep(headRadius * 1.4, 0.0, length(uv - headPos));
    innerGlow += coreGlow * 2.0;

    flowerGlowCol += glowBase * innerGlow * glowIntensity * 0.35;

    // Silhouette is lit from within: mix silhouette with a warm glow color
    vec3 litSilhouette = mix(vec3(0.03, 0.015, 0.01), glowBase * 0.8, coreGlow);
    col = mix(col, litSilhouette, silhouetteMask);
  }

  // Add accumulated flower glow (bloom halo around flowers)
  col += flowerGlowCol;

  // ---- Floating ember particles ----
  // Count scales with energy + ember boost
  int numEmbers = int(mix(14.0, 42.0, energy * emberBoost));
  numEmbers = int(clamp(float(numEmbers), 8.0, 48.0));

  float driftBoost = 1.0 + slowE * 0.5 + highs * 0.3;

  vec3 emberAccum = vec3(0.0);
  for (int e = 0; e < 48; e++) {
    if (e >= numEmbers) break;
    float fe = float(e);
    float seed = fe * 2.311 + 0.7;
    float intensity = emEmber(uv, seed, windTime, driftBoost);

    // Ember color: warmer at bottom, fading to softer amber at top
    float h = emHash11(seed * 5.1);
    vec3 emberCol;
    if (h < 0.4) {
      emberCol = vec3(1.0, 0.65, 0.22);   // deep amber
    } else if (h < 0.75) {
      emberCol = vec3(1.0, 0.82, 0.38);   // gold
    } else {
      emberCol = vec3(1.0, 0.55, 0.32);   // warm peach
    }
    emberCol *= 1.0 + highs * 0.5 + onset * 0.4;
    emberAccum += emberCol * intensity;
  }
  col += emberAccum * (0.8 + energy * 0.6) * emberBoost;

  // ---- Central golden glow (vocal-driven) ----
  if (vocal > 0.01) {
    vec2 centerPos = vec2(0.5, horizonY + 0.15 + vocalPitch * 0.1);
    float centerDist = length((uv - centerPos) * vec2(aspect.x, 1.0));
    float centralGlow = exp(-centerDist * centerDist * 8.0);
    float centralBloom = exp(-centerDist * centerDist * 0.8) * 0.4;
    vec3 centralCol = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.92, 0.62), warmth);
    col += centralCol * (centralGlow + centralBloom) * vocal * 0.9;
  }

  // ---- Coherence tint (high coherence = calmer, more unified warmth) ----
  if (coherence > 0.5) {
    float cTint = (coherence - 0.5) * 2.0;
    vec3 unifyCol = mix(vec3(1.0), vec3(1.05, 0.95, 0.85), cTint);
    col *= unifyCol;
  }

  // ---- Climax boost: golden bloom everywhere ----
  if (climaxBoost > 0.01) {
    vec3 climaxCol = vec3(1.04, 0.96, 0.78);
    col = mix(col, col * climaxCol, climaxBoost * 0.5);
    col += vec3(0.08, 0.05, 0.02) * climaxBoost;
  }

  // ---- SDF icon emergence ----
  {
    float nf = fbm(vec2(screenP * 2.0));
    vec3 c1 = vec3(1.0, 0.78, 0.38);
    vec3 c2 = vec3(1.0, 0.55, 0.32);
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.45;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Atmospheric depth haze ----
  float depthHaze = smoothstep(horizonY - 0.05, horizonY + 0.05, uv.y) * 0.0
                  + smoothstep(horizonY, horizonY - 0.3, uv.y) * 0.0;
  // Soft warm haze lift near horizon
  float horizonHaze = exp(-abs(uv.y - horizonY) * 12.0) * 0.15;
  col += vec3(1.0, 0.6, 0.32) * horizonHaze * (0.6 + slowE * 0.4);

  // ---- Vignette ----
  float vigScale = mix(0.26, 0.20, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.04, 0.02, 0.03), col, vignette);

  // ---- Post-processing (includes temporal blend) ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
