/**
 * Truchet Tiling — quarter-circle arc tiling with SDF rendering.
 * Grid of cells with 2 orientations per cell (hash-based), creating
 * flowing maze-like patterns at multiple scales.
 *
 * Visual aesthetic:
 *   - Quiet: slow flowing arcs, thin lines, subtle palette
 *   - Building: arcs thicken, flow accelerates, detail layers emerge
 *   - Peak: dense multi-scale maze with bright flowing highlights
 *   - Release: lines thin, speed drops, pattern simplifies
 *
 * Audio reactivity:
 *   uBass            → line thickness
 *   uEnergy          → flow speed + grid density
 *   uOnsetSnap       → orientation flips (pattern disruption)
 *   uHarmonicTension → curl noise grid distortion
 *   uMelodicPitch    → color shift per scale layer
 *   uChordIndex      → palette selection
 *   uSlowEnergy      → macro scale visibility
 *   uBeatStability   → pattern coherence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const truchetTilingVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const truchetTilingFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Hash function for cell orientation
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Truchet arc SDF: quarter-circle arc in a unit cell
// Returns distance to arc, given cell-local UV (0-1)
float truchetArc(vec2 cellUv, float orient, float thickness) {
  // 2 orientations: connect (0,0)-(1,1) or (1,0)-(0,1)
  vec2 center1, center2;
  if (orient < 0.5) {
    center1 = vec2(0.0, 0.0);
    center2 = vec2(1.0, 1.0);
  } else {
    center1 = vec2(1.0, 0.0);
    center2 = vec2(0.0, 1.0);
  }

  // Distance to quarter-circle arcs from corners
  float d1 = abs(length(cellUv - center1) - 0.5) - thickness;
  float d2 = abs(length(cellUv - center2) - 0.5) - thickness;

  return min(d1, d2);
}

// Render one Truchet grid layer
vec3 truchetLayer(vec2 uv, float gridScale, float flowSeed, float thickness,
                  float hue, float sat, float brightness, float energy, float onset) {
  vec2 gridUv = uv * gridScale;
  vec2 cellId = floor(gridUv);
  vec2 cellUv = fract(gridUv);

  // Cell orientation from hash (slowly evolving with flow)
  float orient = step(0.5, hash21(cellId + floor(flowSeed)));

  // Onset can flip orientation for disruption
  if (onset > 0.5) {
    float flipChance = hash21(cellId + 99.0);
    if (flipChance < onset * 0.3) {
      orient = 1.0 - orient;
    }
  }

  // SDF distance to arc
  float d = truchetArc(cellUv, orient, thickness);

  // Anti-aliased arc rendering
  float arcMask = 1.0 - smoothstep(0.0, 0.015, d);

  // Edge glow
  float glowMask = 1.0 - smoothstep(0.0, 0.08, d);

  // Color with flow-based variation
  float flowHue = hue + hash21(cellId) * 0.15;
  vec3 arcColor = hsv2rgb(vec3(flowHue, sat, brightness));
  vec3 glowColor = hsv2rgb(vec3(flowHue + 0.1, sat * 0.7, brightness * 0.5));

  return arcColor * arcMask + glowColor * glowMask * 0.3;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.04;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float accelBoost = 1.0 + uEnergyAccel * 0.12;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: faster flow, thicker arcs, denser cells. Space: slow, thin, sparse. Chorus: vibrant, moderate.
  float sectionFlowSpeed = mix(1.0, 1.5, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.15, sChorus);
  float sectionThickness = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionDensity = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace);

  // --- Domain warp from harmonic tension ---
  vec2 warped = p;
  if (tension > 0.1) {
    vec3 curl = curlNoise(vec3(p * 2.0, slowTime * 0.5));
    warped += curl.xy * tension * 0.08;
  }

  // --- Line thickness from bass (section-modulated) ---
  float baseThickness = (0.02 + bass * 0.04) * sectionThickness;

  // --- Flow speed from energy (section-modulated) ---
  float flowSpeed = (0.3 + energy * 1.5) * accelBoost * sectionFlowSpeed;
  float flowSeed = slowTime * flowSpeed;

  // --- Palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // --- Background ---
  vec3 col = mix(
    vec3(0.01, 0.01, 0.02),
    vec3(0.03, 0.02, 0.04),
    uv.y
  );

  // --- Layer 1: Primary grid (section-modulated density) ---
  float gridDensity = mix(6.0, 14.0, energy) * sectionDensity;
  vec3 layer1 = truchetLayer(warped, gridDensity, flowSeed,
    baseThickness, hue1, sat, 0.7 + energy * 0.3, energy, onset);
  col += layer1;

  // --- Layer 2: Detail (2x density) ---
  float detailHue = hue2 + melodicPitch * 0.2;
  vec3 layer2 = truchetLayer(warped, gridDensity * 2.0, flowSeed * 1.3 + 7.0,
    baseThickness * 0.6, detailHue, sat * 0.8, 0.5 + energy * 0.3, energy, onset);
  col += layer2 * 0.5;

  // --- Layer 3: Macro (0.5x density) ---
  if (slowE > 0.2) {
    float macroHue = mix(hue1, hue2, 0.5) + melodicPitch * 0.15;
    vec3 layer3 = truchetLayer(warped, gridDensity * 0.5, flowSeed * 0.7 + 15.0,
      baseThickness * 1.5, macroHue, sat * 0.6, 0.3 + slowE * 0.3, energy, onset);
    col += layer3 * 0.3 * smoothstep(0.2, 0.5, slowE);
  }

  // --- Onset flash at flow junctions ---
  if (onset > 0.3) {
    float junctionGlow = onset * 0.4;
    col += vec3(1.0, 0.95, 0.9) * junctionGlow * (1.0 - length(p) * 0.5);
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.008, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
