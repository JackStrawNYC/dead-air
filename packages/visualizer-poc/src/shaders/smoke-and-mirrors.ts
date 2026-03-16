/**
 * Smoke and Mirrors — volumetric fog with embedded reflective planes.
 * Raymarched smoke density field with mirror surfaces that emerge and dissolve.
 * Replaces lo-fi-grain.
 *
 * Audio reactivity:
 *   uBass       → fog density/thickness
 *   uEnergy     → mirror surface visibility, overall brightness
 *   uHighs      → mirror specular sharpness
 *   uOnsetSnap  → reveals mirror surfaces
 *   uSlowEnergy → fog drift speed
 *   uPalettePrimary   → fog tint color
 *   uPaletteSecondary → mirror highlight color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const smokeAndMirrorsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const smokeAndMirrorsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265

// Smoke density field (FBM + curl noise advection with bass modulation)
float smokeDensity(vec3 p, float bass, float time, float energy) {
  // Upward drift
  p.y -= time * 0.3;
  p.x += sin(p.y * 0.5 + time * 0.2) * 0.3;

  // Curl noise advection for fluid smoke motion (gated behind energy > 0.2)
  if (energy > 0.2) {
    vec3 curl = curlNoise(vec3(p.xy, time * 0.1));
    p += curl * 0.25 * smoothstep(0.2, 0.6, energy);
  }

  float d = fbm(p * 0.8);
  d += fbm3(p * 1.6 + 3.0) * 0.5;

  // Curl noise density contribution
  d += curlNoise(vec3(p.xy, time * 0.1)).z * 0.3;

  // Bass thickens fog
  d *= 0.5 + bass * 0.5;

  return clamp(d * 0.5 + 0.3, 0.0, 1.0);
}

// Mirror plane SDF (infinite plane at given height with normal)
float mirrorPlane(vec3 p, vec3 planeNormal, float planeD) {
  return dot(p, planeNormal) - planeD;
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

  // === BARREL DISTORTION ===
  vec2 distUv = barrelDistort(uv, 0.1);
  vec2 dp = (distUv - 0.5) * aspect;

  float flowTime = uDynamicTime * 0.1;

  // === RAY SETUP ===
  vec3 ro = vec3(0.0, 0.0, -2.0);
  vec3 rd = normalize(vec3(dp, 1.5));

  // === PALETTE COLORS ===
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 fogTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  fogTint = mix(fogTint, vec3(0.4, 0.45, 0.5), 0.4); // push toward neutral smoke

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 mirrorTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // === VOLUMETRIC FOG RAYMARCH (24 steps for denser volumetric smoke) ===
  vec3 fogAccum = vec3(0.0);
  float fogAlpha = 0.0;
  float fogSteps = 24.0;

  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float t = 0.3 + fi * 0.2;
    vec3 pos = ro + rd * t;

    float density = smokeDensity(pos, bass, flowTime, energy);
    density *= 0.08; // thinner per-step for more steps

    if (density > 0.001) {
      float alpha = density * (1.0 - fogAlpha);

      // Depth-varying color: warm near, cool far
      vec3 smokeColor = mix(fogTint * 0.4, fogTint * 0.15, fi / fogSteps);

      // Light scattering: brighter where density is lower (forward scattering)
      float scatter = exp(-density * 3.0) * energy * 0.3;
      smokeColor += scatter * vec3(0.8, 0.85, 0.9);

      fogAccum += smokeColor * alpha;
      fogAlpha += alpha;
    }
  }

  vec3 col = fogAccum;

  // === MIRROR PLANES: 3 reflective surfaces at different angles ===
  // Onset reveals mirrors (they fade in and out)
  float mirrorVisibility = smoothstep(0.2, 0.6, energy) * (0.5 + onset * 0.5);

  if (mirrorVisibility > 0.01) {
    // Mirror 1: angled plane
    float angle1 = flowTime * 0.15;
    vec3 n1 = normalize(vec3(sin(angle1) * 0.3, 0.1, cos(angle1)));
    float d1 = mirrorPlane(ro + rd * 2.0, n1, sin(flowTime * 0.2) * 0.5);
    float mirror1 = smoothstep(0.08, 0.0, abs(d1)) * mirrorVisibility;

    // Mirror 2: different angle
    float angle2 = flowTime * 0.1 + 2.09;
    vec3 n2 = normalize(vec3(cos(angle2) * 0.4, -0.2, sin(angle2)));
    float d2 = mirrorPlane(ro + rd * 3.0, n2, cos(flowTime * 0.15) * 0.3);
    float mirror2 = smoothstep(0.1, 0.0, abs(d2)) * mirrorVisibility * 0.7;

    // Mirror 3: horizontal-ish
    vec3 n3 = normalize(vec3(0.1, 0.8 + sin(flowTime * 0.08) * 0.2, 0.1));
    float d3 = mirrorPlane(ro + rd * 1.5, n3, 0.0);
    float mirror3 = smoothstep(0.12, 0.0, abs(d3)) * mirrorVisibility * 0.5;

    // Specular highlights on mirrors (metallic white)
    vec3 lightDir = normalize(vec3(0.5, 1.0, -0.3));
    float spec1 = pow(max(0.0, dot(reflect(rd, n1), lightDir)), 8.0 + highs * 24.0);
    float spec2 = pow(max(0.0, dot(reflect(rd, n2), lightDir)), 8.0 + highs * 24.0);
    float spec3 = pow(max(0.0, dot(reflect(rd, n3), lightDir)), 8.0 + highs * 24.0);

    // === REFLECTED RAY MARCH: secondary 8-step march through fog along reflected direction ===
    vec3 reflectedFog1 = vec3(0.0);
    vec3 reflectedFog2 = vec3(0.0);
    vec3 reflectedFog3 = vec3(0.0);

    if (mirror1 > 0.02) {
      vec3 reflDir1 = reflect(rd, n1);
      vec3 reflOrigin1 = ro + rd * 2.0;
      for (int j = 0; j < 8; j++) {
        float rt = 0.2 + float(j) * 0.3;
        vec3 rpos = reflOrigin1 + reflDir1 * rt;
        float rd1 = smokeDensity(rpos, bass, flowTime, energy) * 0.06;
        vec3 rc = mix(fogTint * 0.25, mirrorTint * 0.15, float(j) / 8.0);
        reflectedFog1 += rc * rd1;
      }
    }
    if (mirror2 > 0.02) {
      vec3 reflDir2 = reflect(rd, n2);
      vec3 reflOrigin2 = ro + rd * 3.0;
      for (int j = 0; j < 8; j++) {
        float rt = 0.2 + float(j) * 0.3;
        vec3 rpos = reflOrigin2 + reflDir2 * rt;
        float rd2 = smokeDensity(rpos, bass, flowTime, energy) * 0.06;
        vec3 rc = mix(fogTint * 0.2, mirrorTint * 0.12, float(j) / 8.0);
        reflectedFog2 += rc * rd2;
      }
    }
    if (mirror3 > 0.02) {
      vec3 reflDir3 = reflect(rd, n3);
      vec3 reflOrigin3 = ro + rd * 1.5;
      for (int j = 0; j < 8; j++) {
        float rt = 0.2 + float(j) * 0.3;
        vec3 rpos = reflOrigin3 + reflDir3 * rt;
        float rd3 = smokeDensity(rpos, bass, flowTime, energy) * 0.06;
        vec3 rc = mix(fogTint * 0.2, mirrorTint * 0.1, float(j) / 8.0);
        reflectedFog3 += rc * rd3;
      }
    }

    // Mirrors reflect a palette-tinted metallic color + reflected fog
    vec3 mirrorColor = mix(vec3(0.7, 0.75, 0.8), mirrorTint, 0.3);
    col += mirror1 * (mirrorColor * 0.3 + spec1 * vec3(1.0, 0.98, 0.95) * 0.6 + reflectedFog1);
    col += mirror2 * (mirrorColor * 0.25 + spec2 * vec3(1.0, 0.98, 0.95) * 0.5 + reflectedFog2);
    col += mirror3 * (mirrorColor * 0.2 + spec3 * vec3(1.0, 0.98, 0.95) * 0.4 + reflectedFog3);
  }

  // === AMBIENT FOG FLOOR: never pitch black ===
  float ambientFog = 0.08 + slowE * 0.05;
  col += fogTint * ambientFog * (1.0 - fogAlpha);

  // === BEAT PULSE ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.22 + climaxBoost * bp * 0.12;
  col *= 1.0 + uBeatSnap * 0.18 * (1.0 + climaxBoost * 0.4);

  // === VIGNETTE ===
  float vigScale = mix(0.40, 0.32, energy);
  float vignette = 1.0 - dot(dp * vigScale, dp * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.01, 0.02), col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(dp, uDynamicTime, energy, uOnsetSnap);

  // === BLOOM ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.40, 0.25, energy) - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (2.0 + climaxBoost * 1.5);
  vec3 bloomColor = mix(col, vec3(0.9, 0.92, 1.0), 0.3);
  vec3 bloom = bloomColor * bloomAmount * (0.3 + climaxBoost * 0.15);
  col = col + bloom - col * bloom;

  // === ANIMATED STAGE FLOOD ===
  col = stageFloodFill(col, dp, uDynamicTime, energy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE ===
  col = anamorphicFlare(vUv, col, energy, uOnsetSnap);

  // === HALATION ===
  col = halation(vUv, col, energy);

  // === CINEMATIC GRADE ===
  col = cinematicGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.025, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ONSET SATURATION PULSE
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
  col *= 1.0 + onsetPulse * 0.12;

  // Lifted blacks
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  col = max(col, vec3(0.06, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(col, 1.0);
}
`;
