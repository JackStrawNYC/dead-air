/**
 * Volumetric Smoke — concert smoke with volumetric spotlights.
 * Mid energy affinity: concert atmosphere with curlNoise-driven density.
 *
 * Audio reactivity:
 *   uBass         → smoke density thickness
 *   uEnergy       → step count (24-40), spotlight intensity
 *   uDrumOnset    → smoke bursts (+0.4 density, fast decay)
 *   uVocalEnergy  → spotlight cone tracking
 *   uSectionIndex → spotlight positions (seeded hash)
 *   uSlowEnergy   → smoke drift speed
 *   uPalettePrimary   → smoke tint
 *   uPaletteSecondary → spotlight color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const volumetricSmokeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const volumetricSmokeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265

// Simple hash for spotlight positions from section index
float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Smoke density with curlNoise advection
float smokeDens(vec3 p, float bass, float time, float energy) {
  p.y -= time * 0.25;
  p.x += sin(p.y * 0.4 + time * 0.15) * 0.25;

  // curlNoise advection gated behind energy > 0.2
  if (energy > 0.2) {
    vec3 curl = curlNoise(vec3(p.xy, time * 0.08));
    p += curl * 0.3 * smoothstep(0.2, 0.6, energy);
  }

  float d = fbm(p * 0.7);
  d += fbm3(p * 1.4 + 4.0) * 0.4;

  // Bass thickens
  d *= 0.5 + bass * 0.6;

  return clamp(d * 0.5 + 0.15, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float sectionIdx = uSectionIndex;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === ADVANCED AUDIO UNIFORMS ===
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  float flowTime = uDynamicTime * (0.06 + slowE * 0.04) * mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace);

  // === PALETTE (chord-shifted) ===
  float hue1 = hsvToCosineHue(uPalettePrimary) + chordHue;
  vec3 smokeTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  smokeTint = mix(smokeTint, vec3(0.4, 0.42, 0.45), 0.5 - tension * 0.12); // tension adds color to smoke

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 spotlightTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === 3 SPOTLIGHT POSITIONS (seeded from sectionIndex) ===
  vec3 spotPos[3];
  vec3 spotDir[3];
  float spotAngle = 0.35 * mix(1.0, 1.2, sJam) * mix(1.0, 0.8, sSpace) * (1.0 + tension * 0.15); // tension widens spotlight cones

  spotPos[0] = vec3(hash1(sectionIdx * 1.1) * 4.0 - 2.0, 3.0, hash1(sectionIdx * 2.3) * 2.0 - 1.0);
  spotPos[1] = vec3(hash1(sectionIdx * 3.7) * 4.0 - 2.0, 3.5, hash1(sectionIdx * 4.1) * 2.0 - 1.0);
  spotPos[2] = vec3(hash1(sectionIdx * 5.3) * 4.0 - 2.0, 2.8, hash1(sectionIdx * 6.7) * 2.0 - 1.0);

  // Direction tracks vocal energy (sweeps with presence)
  float vocalSweep = vocalE * 0.3;
  spotDir[0] = normalize(vec3(sin(flowTime * 0.3) * 0.2 + vocalSweep, -1.0, cos(flowTime * 0.2) * 0.1));
  spotDir[1] = normalize(vec3(cos(flowTime * 0.25) * 0.3 - vocalSweep, -1.0, sin(flowTime * 0.15) * 0.2));
  spotDir[2] = normalize(vec3(sin(flowTime * 0.4 + 2.0) * 0.15, -1.0, cos(flowTime * 0.3 + 1.0) * 0.15 + vocalSweep));

  // === RAY SETUP (from 3D camera uniforms) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === VOLUMETRIC SMOKE RAYMARCH (24-40 steps) ===
  int steps = int(mix(24.0, 40.0, energy)) + int(sJam * 6.0) - int(sSpace * 6.0) + int(tension * 4.0); // tension adds detail
  float stepSize = 0.15 - melodicPitch * 0.02; // higher pitch = finer steps

  vec3 smokeAccum = vec3(0.0);
  float smokeAlpha = 0.0;
  vec3 lightAccum = vec3(0.0);

  for (int i = 0; i < 40; i++) {
    if (i >= steps) break;
    float fi = float(i);
    float t = 0.3 + fi * stepSize;
    vec3 pos = ro + rd * t;

    float density = smokeDens(pos, bass, flowTime, energy);

    // Drum onset smoke bursts + stem drums boost
    density += (drumOnset * 0.4 + uStemDrums * 0.2) * exp(-fi * 0.15);

    density *= 0.07;

    if (density > 0.001) {
      float alpha = density * (1.0 - smokeAlpha);

      // Depth-varying smoke color
      vec3 smokeColor = mix(smokeTint * 0.5, smokeTint * 0.2, fi / float(steps));

      smokeAccum += smokeColor * alpha;
      smokeAlpha += alpha;
    }

    // === SPOTLIGHT CONES ===
    // Evaluate 3 spotlights at each step
    for (int s = 0; s < 3; s++) {
      vec3 toLight = normalize(spotPos[s] - pos);
      float spotDist = length(spotPos[s] - pos);
      float dotVal = dot(toLight, spotDir[s]);
      float coneAtten = smoothstep(cos(spotAngle), cos(spotAngle * 0.9), dotVal);
      float falloff = exp(-spotDist * 0.3);

      // In-scatter: density at sample × cone attenuation
      float lightDensity = smokeDens(pos, bass, flowTime, energy) * 0.5;
      float inscatter = lightDensity * coneAtten * falloff;

      vec3 spotColor = spotlightTint * (0.7 + float(s) * 0.1);
      lightAccum += spotColor * inscatter * 0.04 * (1.0 + energy * 0.5);
    }
  }

  vec3 col = smokeAccum + lightAccum;

  // === AMBIENT FOG FLOOR ===
  float ambientFog = 0.08 + slowE * 0.04;
  col += smokeTint * ambientFog * (1.0 - smokeAlpha);

  // Beat + climax
  col *= 1.0 + climaxBoost * 0.15;
  col *= 1.0 + uBeatSnap * 0.15 * (1.0 + climaxBoost * 0.3);

  // === VIGNETTE ===
  float vigScale = mix(0.35, 0.28, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.03, 0.02, 0.04), col, vignette);

  // === CUSTOM INLINE BLOOM (not buildPostProcessGLSL — already has volumetric lights) ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.35, 0.20, energy) - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (2.5 + climaxBoost * 1.0);
  vec3 bloomColor = mix(col, spotlightTint * 0.8, 0.3);
  vec3 bloom = bloomColor * bloomAmount * 0.35;
  col = col + bloom - col * bloom;

  // === LIGHT LEAK ===
  col += lightLeak(p, uDynamicTime, energy, uOnsetSnap);

  // === CINEMATIC GRADE ===
  col = cinematicGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.04, 0.02, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // Onset saturation pulse
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.8);

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, smokeTint, spotlightTint, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, smokeTint, spotlightTint, _nf, uSectionIndex);

  // Lifted blacks
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * clamp(uClimaxIntensity, 0.0, 1.0));
  col = max(col, vec3(0.04, 0.03, 0.05) * liftMult);

  gl_FragColor = vec4(col, 1.0);
}
`;
