/**
 * Voronoi Flow — cellular Voronoi with curl noise flow.
 * Animated Voronoi cells with centers advected by curl noise.
 * Glowing neon edges, chroma-tinted interiors. Cells split on onset,
 * merge during quiet. Stained-glass meets fluid dynamics.
 *
 * Audio reactivity:
 *   uBass            → border thickness/glow
 *   uEnergy          → cell count (more = smaller cells)
 *   uOnsetSnap       → cell center perturbation
 *   uSlowEnergy      → flow field speed
 *   uHarmonicTension → edge sharpness (smooth→jagged)
 *   uMelodicPitch    → interior hue shift
 *   uChordIndex      → palette variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const voronoiFlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const voronoiFlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  stageFloodEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
})}

varying vec2 vUv;

#define PI 3.14159265

// Hash for Voronoi cell center positions
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
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

  float slowTime = uDynamicTime * 0.05;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float accelBoost = 1.0 + uEnergyAccel * 0.1;

  // --- Cell density from energy ---
  float cellScale = mix(3.0, 8.0, energy);
  vec2 cellUv = p * cellScale;

  // --- Curl noise advection on cell lookup ---
  float flowSpeed = (0.3 + slowE * 1.2) * accelBoost;
  vec3 curl = curlNoise(vec3(p * 1.5, slowTime * flowSpeed));
  cellUv += curl.xy * 0.4;

  // --- Voronoi computation ---
  vec2 cellId = floor(cellUv);
  vec2 cellFract = fract(cellUv);

  float minDist = 10.0;
  float secondDist = 10.0;
  vec2 closestId = vec2(0.0);
  vec2 closestCenter = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22(cellId + neighbor);

      // Animate cell centers
      point = 0.5 + 0.5 * sin(slowTime * 0.8 + 6.2831 * point);

      // Onset perturbation
      if (onset > 0.2) {
        point += (hash22(cellId + neighbor + 100.0) - 0.5) * onset * 0.6;
      }

      vec2 diff = neighbor + point - cellFract;
      float dist = length(diff);

      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
        closestId = cellId + neighbor;
        closestCenter = diff;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }

  // --- Edge distance (Voronoi border) ---
  float edgeDist = secondDist - minDist;

  // --- Border thickness from bass ---
  float borderThickness = 0.02 + bass * 0.06;
  float edgeMask = 1.0 - smoothstep(0.0, borderThickness, edgeDist);

  // --- Edge sharpness from tension ---
  float sharpEdge = mix(0.015, 0.003, tension);
  float crispEdgeMask = 1.0 - smoothstep(0.0, sharpEdge, edgeDist);

  // --- Color ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // Interior color: tinted by cell ID + melodic pitch
  float cellHue = hue1 + hash22(closestId).x * 0.3 + melodicPitch * 0.15;
  float interiorBright = 0.15 + energy * 0.25 + minDist * 0.3;
  vec3 interior = hsv2rgb(vec3(cellHue, sat * 0.8, interiorBright));

  // Edge glow color
  float edgeHue = hue2 + hash22(closestId + 50.0).x * 0.1;
  vec3 edgeColor = hsv2rgb(vec3(edgeHue, sat, 0.8 + bass * 0.2));

  // Combine
  vec3 col = mix(interior, edgeColor, edgeMask);

  // Extra glow on sharp edges
  float glowMask = 1.0 - smoothstep(0.0, borderThickness * 3.0, edgeDist);
  col += edgeColor * glowMask * 0.2 * bass;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.12;

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
