/**
 * Inferno — volumetric fire raymarching shader.
 * Camera looking upward through rising flames with embers and heat shimmer.
 * Primary mode for Fire on the Mountain.
 *
 * Audio reactivity:
 *   uBass       → flame intensity/density, heat shimmer
 *   uEnergy     → ember count/brightness, overall blaze level
 *   uSlowEnergy → smoke wisp density (ambient drift signal)
 *   uOnsetSnap  → heat shimmer distortion pulses
 *   uHighs      → spark detail, ember sharpness
 *   uPalettePrimary   → flame body color
 *   uPaletteSecondary → ember/core glow color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const infernoVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const infernoFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ halationEnabled: true, bloomThresholdOffset: -0.10, stageFloodEnabled: false })}

varying vec2 vUv;

#define PI 3.14159265
#define MAX_STEPS_LIMIT 50
#define MAX_DIST 8.0

// --- Flame FBM with noise displacement (XT95 technique) ---
// Octave count modulated by jam density: sparse fire (3) → detailed blaze (6)
float flameFBM(vec3 p, float bassAmp, float detailAmp) {
  int octaves = int(mix(3.0, 6.0, uJamDensity));
  p.y *= 0.5;
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float octaveBoost = 1.0;
    if (i < 2) {
      octaveBoost += bassAmp * 0.6;
    } else if (i > 2) {
      octaveBoost += detailAmp * 0.5;
    }
    value += amplitude * octaveBoost * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- Flame SDF: stretched sphere with noise displacement ---
float flameSDF(vec3 p, float bass, float highs, float onset) {
  // Bass stretches flame wider and flatter
  vec3 q = p;
  q.x += bass * 0.3 * sin(uDynamicTime * 1.5); // lateral flame lean
  q.x *= mix(1.0, 0.7, bass);   // wider with bass
  q.y *= mix(1.0, 1.4, bass);   // taller with bass
  q.z *= mix(1.0, 0.7, bass);

  // Base sphere distance
  float d = length(q) - 1.0;

  // Noise displacement for fire shape
  vec3 np = p * 1.5;
  np.y -= uDynamicTime * (1.2 + bass * 0.8);  // rise speed from bass
  // Onset churns domain
  np.xy += onset * 0.3 * vec2(
    sin(p.z * 3.0 + uDynamicTime * 2.0),
    cos(p.x * 3.0 + uDynamicTime * 2.0)
  );
  float noiseVal = flameFBM(np, bass, highs);
  d += noiseVal * 0.5;

  return d;
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

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === HEAT SHIMMER: UV distortion from onset hits ===
  vec2 shimmerUv = p;
  float shimmerStrength = onset * 0.08 + bass * 0.02 + uBeatSnap * 0.05 + uFastEnergy * 0.06;
  shimmerUv += shimmerStrength * vec2(
    snoise(vec3(p * 8.0, uDynamicTime * 2.0)),
    snoise(vec3(p * 8.0 + 50.0, uDynamicTime * 2.0 + 30.0))
  );

  // === CAMERA: looking upward through flames ===
  vec3 camPos = vec3(0.0, -1.5, 0.0);
  vec3 camDir = normalize(vec3(shimmerUv.x * 0.8, 1.0, shimmerUv.y * 0.8));

  // === FLAME COLORS from palette ===
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 flameColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  // Warm bias: blend toward fire orange but let palette tint through
  flameColor = mix(flameColor, vec3(1.0, 0.5, 0.1), 0.25);

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 coreColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  // No warm override — let secondary palette color (purple) show in hot cores

  // === GLOW ACCUMULATION RAYMARCHING (XT95 Flame technique) ===
  // Track how deep ray penetrates fire volume, accumulate glow
  // Jam density modulates step count: sparse fire during exploration (20), intense at peak (50)
  // At neutral density (0.5) this produces 40 steps, matching original MAX_STEPS behavior.
  int maxSteps = int(mix(20.0, 60.0, uJamDensity));
  vec3 accColor = vec3(0.0);
  float glow = 0.0;
  float glowPower = mix(1.2, 2.0, energy);  // softer falloff for visible fire edges

  for (int i = 0; i < MAX_STEPS_LIMIT; i++) {
    if (i >= maxSteps) break;
    float t = float(i) * 0.15 + 0.05;
    if (t > MAX_DIST) break;

    vec3 pos = camPos + camDir * t;
    float d = flameSDF(pos, bass, highs, max(onset, uDrumOnset));

    // Accumulate glow based on proximity to fire surface
    // Tighter proximity zone (0.5) for defined fire shape with dark background
    if (d < 0.5) {
      float proximity = 1.0 - smoothstep(0.0, 0.5, d);
      glow += proximity * 0.02;

      // Color based on depth into flame: core=secondary palette, edge=primary palette
      float depthInFlame = max(0.0, -d);
      float coreStrength = smoothstep(0.0, 0.25, depthInFlame);
      float depthT = t / MAX_DIST;
      vec3 localColor = mix(flameColor, coreColor, coreStrength);
      localColor = mix(localColor, flameColor * 0.7, depthT * 0.6);
      accColor += localColor * proximity * 0.02;
    }
  }

  // Punchy emission: pow(glow*2, glowPower) — the XT95 signature
  // glowPower lower for softer falloff: fire edges visible, not just core
  float emission = pow(clamp(glow * 2.0, 0.0, 1.0), glowPower);
  vec3 col = accColor * emission * 3.5;

  // Add core bloom from emission — secondary palette color in hottest areas
  col += coreColor * pow(emission, 1.5) * 0.8;

  // === BEAT PULSE: tempo-locked flame intensity ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.30 + climaxBoost * bp * 0.15;

  // === BEAT SNAP: sharp flame flare on transients ===
  col *= 1.0 + uBeatSnap * 0.25 * (1.0 + climaxBoost * 0.5);

  // === RISING EMBERS: particle field (beat-reactive) ===
  float emberCount = 5.0 + energy * 20.0 + uBeatSnap * 8.0;
  for (int j = 0; j < 8; j++) {
    float fj = float(j);
    float seed = fj * 7.13;
    vec2 emberPos = vec2(
      snoise(vec3(seed, 0.0, uDynamicTime * 0.1)) * 0.8,
      fract(seed * 0.37 + uDynamicTime * (0.05 + energy * 0.08)) * 2.0 - 0.5
    );
    float dist = length(p - emberPos);
    float size = 0.003 + highs * 0.002;
    float ember = smoothstep(size, size * 0.3, dist);
    float flicker = 0.5 + 0.5 * snoise(vec3(seed * 3.0, uDynamicTime * 4.0, 0.0));
    col += coreColor * ember * flicker * energy * 0.6;
  }

  // === SMOKE WISPS: slow drifting layer from slowEnergy ===
  float smokeOpacity = slowE * 0.4 * (1.0 - energy * 0.6);
  if (smokeOpacity > 0.01) {
    vec3 smokePos = vec3(p * 1.5, uDynamicTime * 0.03);
    float smoke = fbm3(smokePos) * 0.5 + 0.5;
    smoke *= smokeOpacity;
    vec3 smokeColor = flameColor * 0.15 + vec3(0.05, 0.03, 0.02);
    col = mix(col, smokeColor, smoke * 0.5);
  }

  // === BROAD FIRELIGHT: warm FBM wash filling the entire frame ===
  // The fire SDF only hits at specific angles — most of the screen misses it.
  // This wide noise-based glow ensures every pixel reads as warm firelight.
  // Must produce col > 0.5 to dominate over screen-blended overlays.
  float fireNoise1 = fbm3(vec3(p * 0.6, uDynamicTime * 0.05)) * 0.5 + 0.5;
  float fireNoise2 = snoise(vec3(p * 2.0 + 20.0, uDynamicTime * 0.08)) * 0.5 + 0.5;
  vec3 warmBase = mix(flameColor, coreColor, fireNoise2 * 0.3);
  // Ambient firelight: subtle warmth, not a wash
  float fireLightStr = (0.06 + energy * 0.12) * (0.70 + fireNoise1 * 0.30);
  fireLightStr *= 1.0 + bass * 0.10;
  col += warmBase * fireLightStr;

  // === VIGNETTE (strong — fire falls off dramatically at edges) ===
  float vigScale = mix(0.49, 0.34, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 0.8, vignette);
  vec3 vigTint = max(flameColor * 0.03, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vignette);

  // === POST-PROCESSING (shared chain: bloom, flare, halation, grade, grain) ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
