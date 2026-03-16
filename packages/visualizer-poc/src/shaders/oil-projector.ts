/**
 * Oil Projector — overhead projector oil-lamp aesthetic.
 * Large colorful blobs morphing slowly, high saturation, 1960s light show feel.
 * Best for classic-era shows and mid-energy psychedelic passages.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const oilProjectorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const oilProjectorFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal' })}

varying vec2 vUv;

#define PI 3.14159265

// Oil blob: smooth step threshold of FBM creates distinct blob edges
float oilBlob(vec3 p, float threshold) {
  float n = fbm6(p);
  return smoothstep(threshold - 0.08, threshold + 0.08, n);
}

// Voronoi glass imperfection: subtle refractive warping
vec2 glassWarp(vec2 uv, float time) {
  // Simple 2D Voronoi distance for glass cell boundaries
  vec2 cell = floor(uv * 3.0);
  vec2 f = fract(uv * 3.0);
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = cell + neighbor;
      float h = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453);
      vec2 point = neighbor + vec2(h, h2) + 0.1 * sin(time * 0.3 + h * 6.28) - f;
      float d = length(point);
      minDist = min(minDist, d);
    }
  }
  // Return distortion direction + edge distance
  return vec2(minDist, smoothstep(0.0, 0.15, minDist));
}

// Edge highlight: Fresnel-like glow at blob boundaries
float blobEdgeGlow(float blobField, float energy) {
  float edge = abs(blobField - 0.5);
  edge = smoothstep(0.08, 0.01, edge);
  return edge * (0.15 + energy * 0.20);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 4.3;
  float t = uDynamicTime * 0.06 * tempoScale; // Oil moves with purpose

  // Bass camera shake (gentle — projector on a table)
  float shakeX = snoise(vec3(uTime * 4.0, 0.0, sectionSeed)) * uBass * 0.002;
  float shakeY = snoise(vec3(0.0, uTime * 4.0, sectionSeed)) * uBass * 0.002;
  p += vec2(shakeX, shakeY);

  // === GLASS IMPERFECTION: Voronoi-based refractive warp ===
  vec2 glassInfo = glassWarp(p * 1.5 + 0.5, uDynamicTime);
  p += (glassInfo.x - 0.5) * 0.015; // subtle UV warp from glass texture

  // === LAYER 1: Dark warm base (overhead projector glass) ===
  vec3 col = vec3(0.02, 0.015, 0.01);

  // === LAYER 2: Primary oil blob (largest, slowest — with slow rotation + curl advection) ===
  float orbitAngle1 = uDynamicTime * 0.02;
  vec2 orbit1 = vec2(cos(orbitAngle1), sin(orbitAngle1)) * 0.08;
  // Curl noise advection for organic, fluid blob motion
  orbit1 += curlNoise(vec3(orbit1, uDynamicTime * 0.1)).xy * 0.2;
  vec3 blob1Pos = vec3(p * 0.5 + orbit1 + vec2(0.0, -uDynamicTime * 0.008), t * 0.3 + sectionSeed);
  // Warp for organic movement
  float w1x = fbm(blob1Pos + vec3(3.1, 7.2, 0.0));
  float w1y = fbm(blob1Pos + vec3(8.4, 1.9, 0.0));
  vec3 warped1 = vec3(p + vec2(w1x, w1y) * (0.4 + uBass * 0.2 + uFastBass * 0.15), t * 0.25);

  float blob1 = oilBlob(warped1 * 0.7, 0.05);
  float hue1 = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.2;
  vec3 col1 = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  col1 *= mix(0.40, 0.95, energy);

  // === LAYER 3: Secondary oil blob (smaller, offset — with counter-rotation + curl advection) ===
  float orbitAngle2 = -uDynamicTime * 0.025;
  vec2 orbit2 = vec2(cos(orbitAngle2), sin(orbitAngle2)) * 0.06;
  // Curl noise advection for organic, fluid blob motion
  orbit2 += curlNoise(vec3(orbit2 + 5.0, uDynamicTime * 0.1)).xy * 0.2;
  vec3 blob2Pos = vec3(p * 0.6 + orbit2 + vec2(0.3, -0.2 - uDynamicTime * 0.005), t * 0.35 + sectionSeed * 0.7);
  float w2x = fbm(blob2Pos + vec3(5.5, 2.1, 0.0));
  float w2y = fbm(blob2Pos + vec3(1.3, 6.8, 0.0));
  vec3 warped2 = vec3(p + vec2(w2x, w2y) * (0.35 + uMids * 0.15), t * 0.3);

  float blob2 = oilBlob(warped2 * 0.8, 0.1);
  float hue2 = hsvToCosineHue(uPaletteSecondary) + uChromaHue * 0.15 + 0.15;
  vec3 col2 = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  col2 *= mix(0.35, 0.85, energy);

  // === LAYER 4: Tertiary blob (smallest, fastest, accent + curl advection) ===
  vec2 blob3Offset = vec2(-0.15, 0.25);
  // Curl noise advection for organic, fluid blob motion
  blob3Offset += curlNoise(vec3(blob3Offset + 10.0, uDynamicTime * 0.1)).xy * 0.2;
  vec3 blob3Pos = vec3(p * 0.8 + blob3Offset, t * 0.45 + sectionSeed * 1.3);
  float w3x = fbm3(blob3Pos + vec3(2.7, 4.4, 0.0));
  float w3y = fbm3(blob3Pos + vec3(7.1, 3.2, 0.0));
  vec3 warped3 = vec3(p + vec2(w3x, w3y) * (0.25 + uHighs * 0.1), t * 0.4);

  float blob3 = oilBlob(warped3 * 1.0, 0.15);
  float hue3 = hsvToCosineHue(uPalettePrimary) + 0.5; // Complementary
  vec3 col3 = 0.5 + 0.5 * cos(6.28318 * vec3(hue3, hue3 + 0.33, hue3 + 0.67));
  col3 *= mix(0.28, 0.78, energy);

  // === COMPOSITE: additive blending (like real oil projector) ===
  col += col1 * blob1 * 0.5;
  col += col2 * blob2 * 0.4;
  col += col3 * blob3 * 0.3;

  // === KELVIN-HELMHOLTZ INSTABILITY: wavy mixing at blob interfaces ===
  // Where two blobs of different colors meet, add ridged-noise turbulent mixing
  {
    // Blob 1-2 interface
    float interface12 = blob1 - blob2;
    float khWave12 = ridged4(vec3(p * 8.0, uDynamicTime * 0.3));
    float mixZone12 = smoothstep(-0.05, 0.05, interface12 + khWave12 * 0.08);
    float interfaceStrength12 = smoothstep(0.3, 0.0, abs(interface12)) * 0.15;
    col += mix(col2, col1, mixZone12) * interfaceStrength12;

    // Blob 2-3 interface
    float interface23 = blob2 - blob3;
    float khWave23 = ridged4(vec3(p * 8.0 + 3.7, uDynamicTime * 0.3));
    float mixZone23 = smoothstep(-0.05, 0.05, interface23 + khWave23 * 0.08);
    float interfaceStrength23 = smoothstep(0.3, 0.0, abs(interface23)) * 0.12;
    col += mix(col3, col2, mixZone23) * interfaceStrength23;

    // Blob 1-3 interface
    float interface13 = blob1 - blob3;
    float khWave13 = ridged4(vec3(p * 8.0 + 7.1, uDynamicTime * 0.3));
    float mixZone13 = smoothstep(-0.05, 0.05, interface13 + khWave13 * 0.08);
    float interfaceStrength13 = smoothstep(0.3, 0.0, abs(interface13)) * 0.12;
    col += mix(col3, col1, mixZone13) * interfaceStrength13;
  }

  // === EDGE HIGHLIGHTS: light-catching blob boundaries ===
  float edgeGlow1 = blobEdgeGlow(blob1, energy);
  float edgeGlow2 = blobEdgeGlow(blob2, energy);
  float edgeGlow3 = blobEdgeGlow(blob3, energy);
  vec3 edgeColor = mix(col1, vec3(1.0, 0.95, 0.85), 0.5);
  col += edgeColor * (edgeGlow1 * 0.4 + edgeGlow2 * 0.3 + edgeGlow3 * 0.2);

  // === GLASS TEXTURE: subtle Voronoi cell edges ===
  float glassEdge = smoothstep(0.15, 0.05, glassInfo.x) * 0.03;
  col += glassEdge * vec3(1.0, 0.95, 0.9);

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Blob overlap creates white-hot regions (additive)
  float bp = beatPulse(uMusicalTime);
  float overlap = blob1 * blob2 * 0.15 + blob2 * blob3 * 0.1 + blob1 * blob3 * 0.1;
  col += overlap * vec3(1.0, 0.95, 0.85) * energy * (1.0 + bp * 0.35 + climaxBoost * 0.20);

  // === BEAT SNAP: blob brightness pulse ===
  col *= 1.0 + uBeatSnap * 0.25 * (1.0 + climaxBoost * 0.4);

  // Palette saturation
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(lum);
  col = mix(gray, col, mix(0.7, 1.0, uPaletteSaturation));

  // === EDGE DARKENING: circular mask (projector lens falloff) ===
  float lensDist = length(p);
  float lensFalloff = smoothstep(0.7, 0.3, lensDist);
  col *= lensFalloff;

  // === GLASS TEXTURE: subtle refractive noise ===
  float glassTex = snoise(vec3(p * 8.0, uDynamicTime * 0.05)) * 0.02;
  col += glassTex * vec3(0.9, 0.85, 0.8);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.6, energy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  col += afterglowCol * afterglowStr;

  // Light leak
  col += lightLeak(p, uDynamicTime, energy * 0.6, uOnsetSnap) + uDrumOnset * 0.12 * vec3(1.0, 0.95, 0.85);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uDynamicTime, energy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  col = anamorphicFlare(vUv, col, energy, uOnsetSnap);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // Cinematic grade (ACES filmic tone mapping)
  col = cinematicGrade(col, energy);

  // Film grain (moderate)
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.08, 0.04, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
  col *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col = applyCA(col, vUv, caAmt);
  }

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  col = max(col, vec3(0.07, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(col, 1.0);
}
`;
