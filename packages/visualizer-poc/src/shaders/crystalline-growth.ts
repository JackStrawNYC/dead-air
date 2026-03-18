/**
 * Crystalline Growth — procedural crystal formations with recursive geometry.
 * Voronoi-based crystal lattice that grows and fractures with energy.
 * Faceted surfaces catch light, creating prismatic rainbow reflections.
 *
 * Visual aesthetic:
 *   - Quiet: sparse, glowing crystal seeds in darkness
 *   - Building: crystal branches extend, facets multiply
 *   - Peak: full crystalline cathedral, prismatic light scattering
 *   - Release: crystals shatter and dissolve
 *
 * Audio reactivity:
 *   uEnergy       → crystal density, facet count, light intensity
 *   uBass         → crystal scale pulsation, resonance glow
 *   uHighs        → prismatic dispersion (rainbow edge effects)
 *   uOnsetSnap    → crystal fracture / new growth spawn
 *   uSlowEnergy   → overall growth rate
 *   uClimaxPhase  → cathedral mode (full crystalline fill)
 *   uPalettePrimary/Secondary → crystal body/highlight colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const crystallineGrowthVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const crystallineGrowthFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// Voronoi distance function: returns (cellDist, edgeDist, cellID)
vec3 voronoi(vec2 p, float jitter) {
  vec2 cell = floor(p);
  vec2 f = fract(p);

  float minDist = 10.0;
  float secondDist = 10.0;
  float cellId = 0.0;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(float(i), float(j));
      vec2 neighbor = cell + offset;
      // Hash for cell point
      float h = fract(sin(dot(neighbor, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(neighbor, vec2(269.5, 183.3))) * 43758.5453);
      vec2 point = vec2(h, h2) * jitter + (1.0 - jitter) * 0.5;

      float dist = length(f - offset - point);
      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
        cellId = h * 100.0 + h2;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }

  float edgeDist = secondDist - minDist;
  return vec3(minDist, edgeDist, cellId);
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.06;

  // --- Phase 1: New uniform integrations ---
  float vocalGlow = uVocalEnergy * 0.15;         // vocal warmth in crystal glow
  float guitarGrowth = uOtherEnergy * 0.2;        // guitar drives growth rate
  float accelGrowth = 1.0 + uEnergyAccel * 0.2;   // energy acceleration
  float tensionFracture = uHarmonicTension * 0.3;  // tension drives fracture complexity
  float stabilityLattice = uBeatStability;          // lattice regularity
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // Background: deep obsidian
  vec3 col = mix(
    vec3(0.015, 0.01, 0.025),
    vec3(0.04, 0.03, 0.06),
    uv.y
  );

  // Crystal lattice scale: energy-driven density (accel + guitar boost)
  float crystalScale = mix(3.0, 8.0, energy + slowE * 0.3 + guitarGrowth) * accelGrowth;

  // Crystal growth offset (slowly shifts the voronoi pattern)
  vec2 growthOffset = vec2(
    sin(slowTime * 0.7) * 0.5,
    cos(slowTime * 0.5) * 0.3
  );

  // Bass pulse: crystals breathe
  float pulse = 1.0 + bass * 0.15;
  vec2 crystalUv = p * crystalScale * pulse + growthOffset;

  // Multi-layer voronoi crystals
  vec3 v1 = voronoi(crystalUv, 0.9);
  vec3 v2 = voronoi(crystalUv * 1.7 + 3.0, 0.85);

  // Crystal facet shading: bright at edges, dark in centers
  float facetEdge = smoothstep(0.06, 0.0, v1.y); // bright edges
  float facetBody = smoothstep(0.0, 0.25, v1.x); // dim centers

  // Second layer adds complexity
  float facetEdge2 = smoothstep(0.08, 0.0, v2.y) * 0.5;

  // Crystal colors from palette
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // Per-cell color variation
  float cellHue = mix(hue1, hue2, fract(v1.z * 0.17));
  vec3 crystalColor = hsv2rgb(vec3(cellHue, sat, 1.0));

  // Prismatic edge dispersion: rainbow at crystal boundaries
  // Highs control the prismatic intensity
  float prismHue = fract(v1.y * 8.0 + slowTime * 0.2);
  vec3 prismColor = hsv2rgb(vec3(prismHue, 0.8, 1.0));
  vec3 edgeColor = mix(crystalColor, prismColor, highs * 0.6);

  // Crystal body: fill with faceted color
  float bodyBrightness = (0.15 + energy * 0.35) * facetBody;
  col += crystalColor * bodyBrightness;

  // Crystal edges: bright fracture lines
  float edgeBrightness = (0.5 + energy * 1.0) * (facetEdge + facetEdge2);
  col += edgeColor * edgeBrightness;

  // Inner glow: energy seeping through crystal structure
  float innerGlow = exp(-v1.x * 4.0) * energy * 0.4;
  col += crystalColor * innerGlow * (1.0 + bass * 0.5);

  // Onset fracture: bright flash along crystal edges (tension amplifies)
  float fractureFlash = onset * facetEdge * (2.0 + tensionFracture);
  col += vec3(1.0, 0.95, 0.9) * fractureFlash;

  // Deep noise layer: organic growth texture within crystals
  float growthNoise = fbm3(vec3(crystalUv * 0.5, slowTime * 0.8));
  col += crystalColor * max(0.0, growthNoise) * 0.1 * slowE;

  // Climax: crystalline cathedral mode (amplified everything)
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.4;


  // SDF icon emergence
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // Vignette
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.015, 0.01, 0.025), col, vignette);

  // Post-processing
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
