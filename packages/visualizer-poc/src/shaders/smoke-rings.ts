/**
 * Smoke Rings — toroidal vortex rings.
 * SDF-based torus rings rising and colliding. Volumetric scattering at edges.
 *
 * Audio reactivity:
 *   uBass          → ring scale
 *   uEnergy        → ring count
 *   uVocalPresence → ring color shift
 *   uStemBass      → ring thickness
 *   uChromaHue     → hue modulation
 *   uSlowEnergy    → rise speed
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const smokeRingsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const smokeRingsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_RINGS 6

// 2D torus ring SDF (ring in XY plane viewed from front)
float torusSDF(vec2 p, vec2 center, float majorR, float minorR) {
  vec2 q = p - center;
  float d = length(q) - majorR;
  return abs(d) - minorR;
}

// Smooth torus field with FBM displacement
float smokeRingField(vec2 p, vec2 center, float majorR, float minorR, float time) {
  float d = torusSDF(p, center, majorR, minorR);
  // FBM displacement for smoke-like edges
  float disp = fbm3(vec3(p * 4.0, time * 0.5)) * 0.03;
  d += disp;
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float otherEnergy = clamp(uOtherEnergy, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.2;

  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float stability = clamp(uBeatStability, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.05;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: faster rise, more rings, denser. Space: slow drift, sparse. Chorus: wider, brighter rings.
  float sectionRiseSpeed = mix(1.0, 1.4, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionRingCount = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace);
  float sectionRingScale = mix(1.0, 1.3, sJam) * mix(1.0, 0.7, sSpace) * mix(1.0, 1.2, sChorus);
  float sectionCollision = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace);

  float riseSpeed = (0.03 + slowEnergy * 0.04) * sectionRiseSpeed;

  vec3 col = vec3(0.008, 0.006, 0.012); // dark background

  // --- Ring parameters ---
  int ringCount = 3 + int(energy * 3.0 * sectionRingCount); // 3-6 rings, section-modulated
  float ringScale = (0.08 + bass * 0.06) * sectionRingScale;
  float ringThickness = 0.006 + stemBass * 0.008 + (1.0 - stability) * 0.004; // unstable beats widen rings

  // --- Draw rings ---
  for (int i = 0; i < MAX_RINGS; i++) {
    if (i >= ringCount) break;
    float fi = float(i);

    // Each ring rises at a different phase
    float phase = fract(slowTime * riseSpeed + fi * 0.167);

    // Ring center: rises from bottom, drifts horizontally
    vec2 center = vec2(
      sin(fi * 2.7 + slowTime * 0.3) * 0.15,
      -0.4 + phase * 0.8
    );

    // Ring scales as it rises (perspective)
    float perspective = 0.6 + phase * 0.4;
    float majorR = ringScale * perspective * (1.0 + fi * 0.08);
    float minorR = ringThickness * perspective;

    // Torus field — tension warps ring shape
    float tensionWarp = tension * sin(slowTime * 2.0 + fi * 3.14) * 0.01;
    float d = smokeRingField(p, center + vec2(tensionWarp), majorR, minorR, slowTime + fi);

    // Volumetric glow
    float glow = exp(-max(d, 0.0) * 30.0) * 0.5;
    float edge = smoothstep(0.01, 0.0, d) * 0.7;

    // Color per ring
    float hue = uPalettePrimary + fi * 0.05 + chromaHueMod + vocalPresence * 0.1 + chordHue; // chord shifts ring hue
    float sat = mix(0.3, 0.8, energy) * uPaletteSaturation;
    float val = (glow + edge) * perspective;

    // Fade in/out at extremes
    float fadeMask = smoothstep(0.0, 0.15, phase) * smoothstep(1.0, 0.85, phase);
    val *= fadeMask;

    vec3 ringColor = hsv2rgb(vec3(hue, sat, val));

    // Scattering at edges — brighter at ring boundary
    float scatter = exp(-abs(d) * 50.0) * 0.3;
    vec3 scatterColor = hsv2rgb(vec3(uPaletteSecondary + fi * 0.03, sat * 0.5, scatter));

    col += ringColor + scatterColor;
  }

  // --- Background fog ---
  float fog = fbm(p * 2.0 + vec2(slowTime * 0.1, 0.0)) * 0.08;
  col += vec3(fog * 0.3, fog * 0.2, fog * 0.4) * (energy + otherEnergy * 0.15);

  // --- Collision glow at ring intersections ---
  float collisionGlow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float phase1 = fract(slowTime * riseSpeed + fi * 0.167);
    float phase2 = fract(slowTime * riseSpeed + (fi + 1.0) * 0.167);
    vec2 c1 = vec2(sin(fi * 2.7 + slowTime * 0.3) * 0.15, -0.4 + phase1 * 0.8);
    vec2 c2 = vec2(sin((fi + 1.0) * 2.7 + slowTime * 0.3) * 0.15, -0.4 + phase2 * 0.8);
    float overlap = max(0.0, 0.1 - length(c1 - c2));
    float nearBoth = exp(-length(p - mix(c1, c2, 0.5)) * 15.0);
    collisionGlow += overlap * nearBoth * 10.0;
  }
  col += hsv2rgb(vec3(uPaletteSecondary, 0.6, collisionGlow * energy * 0.5 * sectionCollision));

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.008), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
