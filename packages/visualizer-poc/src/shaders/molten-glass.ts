/**
 * Molten Glass — viscous refractive color fields with Voronoi cell boundaries.
 * Thick, slow-moving stained glass in a kiln. Replaces tie-dye.
 *
 * Audio reactivity:
 *   uBass       → cell boundary pulse, molten flow speed
 *   uEnergy     → refraction highlight intensity, overall luminance
 *   uHighs      → edge sharpness, highlight detail
 *   uOnsetSnap  → crack new cell boundaries
 *   uSlowEnergy → ambient drift speed
 *   uPalettePrimary   → dominant cell color
 *   uPaletteSecondary → secondary cell / highlight color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const moltenGlassVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const moltenGlassFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal' })}

varying vec2 vUv;

#define PI 3.14159265

// 3-layer Voronoi with smooth cell transitions
// Returns: x = min distance, y = second min, z = cell ID hash
vec3 voronoi3(vec2 uv, float time, float scale) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale);
  float minD = 10.0;
  float minD2 = 10.0;
  float cellId = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cid = id + neighbor;
      float h = fract(sin(dot(cid, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(cid, vec2(269.5, 183.3))) * 43758.5453);
      // Animate cell centers slowly
      vec2 point = neighbor + vec2(h, h2) + 0.3 * sin(time * 0.2 + vec2(h * 6.28, h2 * 6.28)) - f;
      float d = dot(point, point);
      if (d < minD) {
        minD2 = minD;
        minD = d;
        cellId = h;
      } else if (d < minD2) {
        minD2 = d;
      }
    }
  }
  return vec3(sqrt(minD), sqrt(minD2), cellId);
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

  // === BARREL DISTORTION: glass curvature ===
  vec2 distUv = barrelDistort(uv, 0.15);
  vec2 dp = (distUv - 0.5) * aspect;

  // === SLOW MOLTEN FLOW: bass drives flow speed ===
  float flowTime = uDynamicTime * (0.08 + bass * 0.04);
  float tempoScale = uTempo / 120.0;

  // Domain warping for organic molten movement
  vec2 warpedP = dp;
  float w1 = fbm3(vec3(dp * 1.5, flowTime * 0.3));
  float w2 = fbm3(vec3(dp * 1.5 + 5.0, flowTime * 0.25));
  warpedP += vec2(w1, w2) * (0.25 + slowE * 0.15);

  // === VORONOI LAYER 1: Large glass cells ===
  vec3 v1 = voronoi3(warpedP, flowTime, 3.0);
  float cellEdge1 = smoothstep(0.05, 0.02 + highs * 0.02, v1.y - v1.x);

  // === VORONOI LAYER 2: Medium cells ===
  vec3 v2 = voronoi3(warpedP + 2.0, flowTime * 1.3, 5.0);
  float cellEdge2 = smoothstep(0.06, 0.03, v2.y - v2.x);

  // === VORONOI LAYER 3: Fine detail ===
  vec3 v3 = voronoi3(warpedP + 5.0, flowTime * 0.8, 8.0);
  float cellEdge3 = smoothstep(0.08, 0.04, v3.y - v3.x);

  // === CELL COLORS: palette-driven per cell ===
  float hue1 = uPalettePrimary + v1.z * 0.3 + uChromaHue * 0.15;
  float hue2 = uPaletteSecondary + v2.z * 0.2;
  float sat = mix(0.6, 0.95, energy) * uPaletteSaturation;

  vec3 cellColor1 = hsv2rgb(vec3(hue1, sat, mix(0.35, 0.75, energy)));
  vec3 cellColor2 = hsv2rgb(vec3(hue2, sat * 0.9, mix(0.30, 0.65, energy)));
  vec3 cellColor3 = hsv2rgb(vec3(hue1 + 0.5, sat * 0.8, mix(0.25, 0.55, energy)));

  // Composite cell colors with smooth blending
  vec3 col = cellColor1 * (1.0 - cellEdge1 * 0.5);
  col = mix(col, cellColor2, v2.x * 0.3);
  col = mix(col, cellColor3, v3.x * 0.15);

  // === REFRACTION HIGHLIGHTS: light catching on cell edges ===
  // Approximate normal from Voronoi distance gradient
  float lightAngle = flowTime * 0.15;
  vec3 lightDir = normalize(vec3(cos(lightAngle), sin(lightAngle), 0.8));
  vec2 grad = vec2(
    voronoi3(warpedP + vec2(0.01, 0.0), flowTime, 3.0).x - v1.x,
    voronoi3(warpedP + vec2(0.0, 0.01), flowTime, 3.0).x - v1.x
  ) / 0.01;
  vec3 normal = normalize(vec3(-grad * 2.0, 1.0));
  float ndotl = max(0.0, dot(normal, lightDir));
  float specular = pow(ndotl, 12.0 + highs * 20.0);

  // Refraction highlights along cell edges
  float edgeHighlight = cellEdge1 * specular * (0.5 + energy * 0.5);
  col += vec3(1.0, 0.95, 0.85) * edgeHighlight * 0.6;

  // === BASS PULSE: cell boundaries glow on bass ===
  float bassPulse = bass * 0.3 + uFastBass * 0.2;
  col += cellEdge1 * bassPulse * cellColor1 * 0.4;
  col += cellEdge2 * bassPulse * 0.5 * cellColor2 * 0.3;

  // === ONSET CRACKS: bright flash on transients ===
  float crackFlash = onset * 0.6 * cellEdge1 + uDrumOnset * 0.4 * cellEdge2;
  col += crackFlash * vec3(1.0, 0.9, 0.7);

  // === SDF STEALIE: emerges from the molten glass ===
  {
    vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    float nf = w1;
    col += stealieEmergence(dp, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase);
  }

  // === VIGNETTE ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(dp * vigScale, dp * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.05, 0.04, 0.06), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
