/**
 * Desert Road — endless highway through desert landscape.
 * Perspective road vanishing to horizon, mesa silhouettes, heat shimmer,
 * dust, desert sky gradient. Warm, cinematic, expansive.
 *
 * Audio reactivity:
 *   uEnergy        → travel speed, dust intensity, heat shimmer
 *   uBass          → ground rumble, heat distortion
 *   uOnsetSnap     → dust puffs, road markings flash
 *   uChromaHue     → sky color shift (sunset tones)
 *   uSlowEnergy    → sky warmth, ambient light
 *   uMelodicPitch  → mesa height variation
 *   uSectionType   → jam=fast driving, space=still desert, chorus=golden hour
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const desertRoadGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const desertRoadGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  stageFloodEnabled: true,
  thermalShimmerEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Mesa silhouette profile ---
float mesaProfile(float x, float seed, float height, float width) {
  float cx = (x - seed) / width;
  // Flat-topped with slightly eroded edges
  float flatTop = smoothstep(1.0, 0.8, abs(cx));
  float erosion = snoise(vec3(cx * 4.0 + seed * 10.0, seed * 7.3, 0.0)) * 0.15;
  return flatTop * height + erosion * height * 0.5;
}

// --- Road perspective ---
float roadMask(vec2 uv, float horizon) {
  float below = step(uv.y, horizon);
  float depth = (horizon - uv.y) / horizon;
  // Road narrows toward horizon (perspective)
  float roadWidth = mix(0.005, 0.25, depth * depth);
  float centerX = 0.5 + sin(depth * 2.0) * 0.03; // slight curve
  float road = smoothstep(roadWidth, roadWidth - 0.003, abs(uv.x - centerX));
  return road * below;
}

// --- Dashed center line ---
float dashLine(vec2 uv, float horizon, float time, float energy) {
  float depth = (horizon - uv.y) / horizon;
  float centerX = 0.5 + sin(depth * 2.0) * 0.03;
  float lineWidth = mix(0.0005, 0.008, depth * depth);
  float onLine = smoothstep(lineWidth, lineWidth * 0.3, abs(uv.x - centerX));

  // Dashes: periodic in perspective depth
  float perspZ = 1.0 / max(0.001, depth);
  float dashPattern = step(0.5, fract(perspZ * 0.3 - time * energy * 2.0));

  return onLine * dashPattern * step(0.01, depth);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float hueShift = uChromaHue;
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float t = uDynamicTime;

  // Section modulation
  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);
  float spaceMod = smoothstep(6.5, 7.5, sType);
  float chorusMod = smoothstep(1.5, 2.5, sType) * (1.0 - smoothstep(2.5, 3.5, sType));

  float speed = energy * (1.0 + jamMod * 0.5) * (1.0 - spaceMod * 0.8);
  float horizon = 0.45 + pitch * 0.05;

  // --- Domain warping + palette ---
  vec2 warpedP = p + vec2(fbm3(vec3(p * 0.5, t * 0.05)), fbm3(vec3(p * 0.5 + 100.0, t * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;
  vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary + hueShift * 0.1, 0.7 * uPaletteSaturation, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary + hueShift * 0.08, 0.6 * uPaletteSaturation, 0.85));

  // --- Heat shimmer (UV distortion below horizon) ---
  float shimmerAmt = bass * 0.006 + energy * 0.003;
  float depthFromHorizon = max(0.0, horizon - uv.y);
  vec2 shimmerUV = uv;
  shimmerUV.x += sin(uv.y * 80.0 + t * 3.0) * shimmerAmt * depthFromHorizon * 5.0;
  shimmerUV.y += cos(uv.x * 60.0 + t * 2.0) * shimmerAmt * depthFromHorizon * 3.0;

  // --- Sky gradient ---
  float skyT = smoothstep(horizon - 0.02, 0.95, uv.y);
  vec3 skyLow = vec3(0.85 + slowE * 0.1, 0.55 + slowE * 0.1, 0.25); // warm horizon
  vec3 skyMid = vec3(0.35, 0.45, 0.65 + hueShift * 0.2);
  vec3 skyHigh = vec3(0.15, 0.2, 0.45);

  // Golden hour during chorus
  skyLow += vec3(0.15, 0.08, -0.05) * chorusMod;

  vec3 sky = mix(skyLow, skyMid, smoothstep(0.0, 0.4, skyT));
  sky = mix(sky, skyHigh, smoothstep(0.4, 1.0, skyT));

  // Sun glow near horizon
  float sunDist = length(vec2(p.x - 0.1, uv.y - horizon - 0.05));
  float sunGlow = exp(-sunDist * 8.0) * (0.5 + slowE * 0.3);
  sky += vec3(0.6, 0.35, 0.1) * sunGlow;

  vec3 col = sky;

  // --- Mesa silhouettes ---
  float mesa1 = mesaProfile(uv.x, 0.2, 0.08 + pitch * 0.04, 0.15);
  float mesa2 = mesaProfile(uv.x, 0.75, 0.06 + pitch * 0.03, 0.12);
  float mesa3 = mesaProfile(uv.x, 0.45, 0.04, 0.08);
  float mesaH = max(max(mesa1, mesa2), mesa3);
  float mesaMask = step(uv.y, horizon + mesaH) * step(horizon - 0.01, uv.y);
  vec3 mesaColor = vec3(0.12, 0.08, 0.06) + vec3(0.05, 0.02, 0.01) * sunGlow;
  col = mix(col, mesaColor, mesaMask);

  // --- Desert ground ---
  float below = step(uv.y, horizon);
  float depth = max(0.001, (horizon - shimmerUV.y) / horizon);
  vec3 desertColor = vec3(0.55, 0.42, 0.28);
  // Distance haze
  desertColor = mix(skyLow, desertColor, smoothstep(0.0, 0.3, depth));
  // Ground texture
  float groundNoise = snoise(vec3(shimmerUV.x * 20.0, depth * 30.0 - t * speed, 0.5)) * 0.05;
  desertColor += groundNoise;
  col = mix(col, desertColor, below);

  // --- Road ---
  float road = roadMask(shimmerUV, horizon);
  vec3 roadColor = vec3(0.12, 0.11, 0.10);
  // Hot asphalt shimmer
  roadColor += vec3(0.02) * sin(shimmerUV.y * 100.0 + t);
  col = mix(col, roadColor, road);

  // --- Center dashes ---
  float dashes = dashLine(shimmerUV, horizon, t, speed);
  col = mix(col, vec3(0.9, 0.85, 0.3), dashes * 0.8);

  // --- Road edge lines ---
  float roadDepth = max(0.001, (horizon - shimmerUV.y) / horizon);
  float roadW = mix(0.005, 0.25, roadDepth * roadDepth);
  float centerX = 0.5 + sin(roadDepth * 2.0) * 0.03;
  float edgeLineL = smoothstep(0.002, 0.0005, abs(shimmerUV.x - (centerX - roadW)));
  float edgeLineR = smoothstep(0.002, 0.0005, abs(shimmerUV.x - (centerX + roadW)));
  float edgeLines = (edgeLineL + edgeLineR) * below * step(0.01, roadDepth);
  col = mix(col, vec3(0.8, 0.8, 0.75), edgeLines * 0.5);

  // --- Dust (6-octave rich detail) ---
  float dustNoise = fbm6(vec3(p.x * 3.0 * detailMod, p.y * 2.0 - t * 0.5 * speed, t * 0.3));
  float dustMask = below * smoothstep(0.0, 0.15, depth) * (0.1 + onset * 0.4 + energy * 0.2);
  float dust = dustNoise * dustMask * 0.15;
  col = mix(col, vec3(0.6, 0.5, 0.35), dust);

  // --- Telephone poles (periodic in perspective) ---
  float poleZ = 1.0 / max(0.01, depth);
  float polePhase = fract(poleZ * 0.1 - t * speed * 0.5);
  float poleX = centerX + roadW + 0.02 + depth * 0.02;
  float poleMask = smoothstep(0.003, 0.001, abs(shimmerUV.x - poleX))
                 * step(0.4, polePhase) * step(polePhase, 0.42)
                 * below * step(0.03, depth);
  float poleHeight = horizon + 0.08 * (1.0 - depth * 2.0);
  poleMask *= step(shimmerUV.y, poleHeight);
  col = mix(col, vec3(0.08, 0.06, 0.04), poleMask);

  // --- Secondary visual layer: heat mirage color (30% blend) ---
  float mirageNoise = fbm3(vec3(warpedP * 4.0, t * 0.12));
  vec3 mirageCol = mix(palCol1, palCol2, mirageNoise * 0.5 + 0.5) * 0.08;
  float mirageMask = below * smoothstep(0.0, 0.1, depth) * smoothstep(0.3, 0.05, depth);
  col += mirageCol * mirageMask * 0.3 * energy;

  // Post-processing
  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);

  gl_FragColor = vec4(col, 1.0);
}
`;
