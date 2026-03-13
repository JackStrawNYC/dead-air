/**
 * Particle Nebula — vertex + fragment shaders for InstancedMesh.
 * 4K icosphere particles in toroidal flow field with Phong shading.
 *
 * v7: Upgraded from Points to InstancedMesh for proper lighting.
 *
 * Audio reactivity:
 *   uBass       → torus expansion, particle scale
 *   uEnergy     → particle brightness, size, orbit speed
 *   uHighs      → specular intensity
 *   uOnsetSnap  → flash + orbit perturbation
 *   uMusicalTime → orbit phase-lock
 */

import { noiseGLSL } from "./noise";

export const particleNebulaVert = /* glsl */ `
${noiseGLSL}

uniform float uTime;
uniform float uDynamicTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uRms;
uniform float uEnergy;
uniform float uFlatness;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uFastEnergy;
uniform float uFastBass;
uniform float uDrumOnset;
uniform float uDrumBeat;
uniform float uSpectralFlux;

attribute float aRadius;
attribute float aTheta;
attribute float aPhi;
attribute float aRandom;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vColorMix;
varying float vDist;
varying float vEnergy;
varying float vOnsetSnap;

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;

  // Toroidal flow field: particles orbit a torus
  // Bass expands the torus major radius
  float majorR = 2.0 + uBass * 1.0 + energy * 0.5;
  float minorR = aRadius * mix(0.3, 1.2, energy);

  // Beat pulse for orbit modulation
  float bp = beatPulse(uMusicalTime);
  minorR *= 1.0 + max(uBeatSnap, uDrumBeat) * 0.20;
  minorR *= 1.0 + uOnsetSnap * 0.08 + uDrumOnset * 0.12;

  // Tempo-aware toroidal orbit
  float orbitSpeed = (mix(0.02, 0.06, energy) + uMids * 0.04) * tempoScale * (1.0 + bp * 0.20);
  float theta = aTheta + uDynamicTime * orbitSpeed * (0.5 + aRandom * 0.5);
  float phi = aPhi + uDynamicTime * orbitSpeed * 0.3 * (aRandom - 0.5);

  // Toroidal position: (R + r*cos(phi)) * cos(theta), (R + r*cos(phi)) * sin(theta), r*sin(phi)
  float torusX = (majorR + minorR * cos(phi)) * cos(theta);
  float torusY = minorR * sin(phi);
  float torusZ = (majorR + minorR * cos(phi)) * sin(theta);

  vec3 pos = vec3(torusX, torusY, torusZ);

  // Noise displacement for organic feel
  float noiseDisp = snoise(vec3(pos * 0.3 + uDynamicTime * 0.08)) * 0.3;
  pos += normalize(pos) * noiseDisp;

  // Per-instance size from energy
  float baseScale = mix(0.04, 0.12, energy) + uRms * 0.04 + aRandom * 0.03;

  // Transform through instanceMatrix (position/rotation/scale baked in scene)
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  // Apply per-particle scale to the local normal
  vNormal = normalize(normalMatrix * normal);
  vWorldPos = worldPos.xyz;

  vec4 mvPosition = modelViewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;

  vColorMix = aRandom;
  vDist = length(mvPosition.xyz);
  vEnergy = energy;
  vOnsetSnap = uOnsetSnap;
}
`;

export const particleNebulaFrag = /* glsl */ `
precision highp float;

// Film grain helper
vec3 filmGrain(vec2 uv, float grainTime) {
  float n = fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// HSV-to-cosine hue correction
float hsvToCosineHue(float h) { return 1.0 - h; }

// Hue-preserving filmic tone curve (local copy — noiseGLSL not injected in this frag)
vec3 cinematicGrade(vec3 col, float energy) {
  float maxC = max(col.r, max(col.g, col.b));
  vec3 hueRatio = col / max(maxC, 0.001);
  float exposure = 1.2 + energy * 0.2;
  float mapped = 1.0 - exp(-maxC * exposure);
  col = hueRatio * mapped;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float contrast = mix(0.95, 1.06, energy);
  col = mix(vec3(luma), col, contrast);
  return col;
}

uniform float uTime;
uniform float uDynamicTime;
uniform float uCentroid;
uniform float uRms;
uniform float uEnergy;
uniform float uChromaHue;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uSectionProgress;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uOnsetSnap;
uniform float uBass;
uniform float uHighs;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uCoherence;
uniform float uFastEnergy;
uniform float uDrumOnset;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vColorMix;
varying float vDist;
varying float vEnergy;
varying float vOnsetSnap;

void main() {
  // === PHONG SHADING with moving point light ===
  vec3 norm = normalize(vNormal);

  // Moving point light orbits the nebula
  float lightAngle = uDynamicTime * 0.2;
  vec3 lightPos = vec3(cos(lightAngle) * 4.0, sin(lightAngle * 0.7) * 2.0, sin(lightAngle) * 4.0);
  vec3 lightDir = normalize(lightPos - vWorldPos);
  vec3 viewDir = normalize(-vWorldPos);

  // Diffuse
  float ndotl = max(0.0, dot(norm, lightDir));
  float diffuse = ndotl * 0.7;

  // Specular (Blinn-Phong)
  vec3 halfVec = normalize(lightDir + viewDir);
  float specPow = 16.0 + uHighs * 32.0;
  float spec = pow(max(0.0, dot(norm, halfVec)), specPow) * (0.3 + uHighs * 0.4);

  // Ambient
  float ambient = 0.15 + vEnergy * 0.1;

  // === COLOR from palette ===
  float caAmount = uBass * 0.03 + vEnergy * 0.015 + uOnsetSnap * 0.04 + uDrumOnset * 0.05;
  float hueCenter = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.25 + vColorMix * 0.3;
  vec3 baseColor = 0.5 + 0.5 * cos(6.28318 * vec3(hueCenter, hueCenter + 0.33, hueCenter + 0.67));

  // Secondary palette blend
  float secHue = hsvToCosineHue(uPaletteSecondary) + vColorMix * 0.2;
  vec3 secRgb = 0.5 + 0.5 * cos(6.28318 * vec3(secHue, secHue + 0.33, secHue + 0.67));
  baseColor = mix(baseColor, secRgb, vColorMix * 0.3);

  // Color temperature
  vec3 warmShift = vec3(1.12, 0.95, 0.82);
  vec3 coolShift = vec3(0.85, 0.95, 1.12);
  baseColor *= mix(coolShift, warmShift, vEnergy);

  // Palette saturation
  float sat = mix(0.6, 1.0, vEnergy) * uPaletteSaturation;
  vec3 gray = vec3(dot(baseColor, vec3(0.299, 0.587, 0.114)));
  baseColor = mix(gray, baseColor, sat);

  // Composite lighting
  vec3 rgb = baseColor * (ambient + diffuse) + vec3(1.0, 0.98, 0.95) * spec;

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  rgb *= 1.0 + uBeatSnap * 0.30 * (1.0 + climaxBoost * 0.5);
  rgb *= 1.0 + vOnsetSnap * 0.12;

  // Rim glow
  float rim = 1.0 - max(0.0, dot(norm, viewDir));
  rim = pow(rim, 3.0) * (0.2 + climaxBoost * 0.15);
  rgb += baseColor * rim * 0.5;

  rgb *= mix(0.40, 0.78, vEnergy) + uRms * 0.3 + uFastEnergy * 0.15;

  // === DISTANCE FOG ===
  float fogDensity = mix(0.15, 0.02, vEnergy);
  float fogAmount = 1.0 - exp(-fogDensity * vDist * vDist);
  vec3 fogColor = vec3(0.02, 0.02, 0.04);
  rgb = mix(rgb, fogColor, fogAmount);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, vEnergy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  rgb += afterglowCol * afterglowStr;

  // === BLOOM ===
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  float bThresh = 0.4 - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bThresh) * (2.0 + climaxBoost * 1.5);
  vec3 bloomColor = mix(rgb, vec3(1.0, 0.98, 0.95), 0.3);
  vec3 bloom = bloomColor * bloomAmount * (0.25 + climaxBoost * 0.15);
  rgb = rgb + bloom - rgb * bloom;

  // ONSET SATURATION PULSE
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(onsetLuma), rgb, 1.0 + onsetPulse * 1.0);
  rgb *= 1.0 + onsetPulse * 0.12;

  // === CINEMATIC GRADE ===
  rgb = cinematicGrade(rgb, vEnergy);

  // === FILM GRAIN ===
  float grainTime = floor(uRms * 50.0) / 50.0;
  float grainIntensity = mix(0.04, 0.01, vEnergy);
  // Use world position as UV proxy for grain
  vec2 grainUv = vWorldPos.xy * 10.0;
  rgb += filmGrain(grainUv, grainTime) * grainIntensity;

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  rgb = max(rgb, vec3(0.06, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(rgb, 1.0);
}
`;
