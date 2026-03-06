/**
 * Cosmic Voyage — volumetric raymarching shader.
 * Flies a camera through 3D fractal noise nebula clouds.
 * Primary mode for Drums/Space, available as sectionOverride for long jams.
 *
 * Audio reactivity:
 *   uEnergy  → camera drift speed, glow intensity, fog distance
 *   uBass    → cloud density/thickness, camera shake, low-octave boost
 *   uHighs   → chromatic aberration, high-octave detail
 *   uOnsetSnap → cloud turbulence / domain warp
 *   uPalettePrimary   → cloud body color
 *   uPaletteSecondary → emission core color, god ray color
 */

import { noiseGLSL } from "./noise";

export const cosmicVoyageVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const cosmicVoyageFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform float uTime;
uniform float uBass;
uniform float uRms;
uniform float uCentroid;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uMids;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uChromaHue;
uniform float uFlatness;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform vec4 uContrast0;
uniform vec4 uContrast1;

varying vec2 vUv;

#define PI 3.14159265
#define MAX_STEPS 80
#define MAX_DIST 12.0

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- 5-octave volumetric FBM: bass boosts low octaves, highs boost detail ---
float fbmVolume(vec3 p, float bassAmp, float detailAmp) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    // Low octaves (0-1) get bass boost, high octaves (3-4) get detail boost
    float octaveBoost = 1.0;
    if (i < 2) {
      octaveBoost += bassAmp * 0.5;
    } else if (i > 2) {
      octaveBoost += detailAmp * 0.4;
    }
    value += amplitude * octaveBoost * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- Camera path: Lissajous curve with constant Z-forward drift ---
vec3 cameraPath(float t) {
  return vec3(
    sin(t * 0.7) * 1.5 + cos(t * 0.3) * 0.8,
    cos(t * 0.5) * 1.2 + sin(t * 0.2) * 0.6,
    t * 3.0
  );
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);

  // === CAMERA SETUP ===
  float driftSpeed = 0.04 + energy * 0.06;
  float camT = uTime * driftSpeed;
  vec3 camPos = cameraPath(camT);

  // Bass camera shake
  float shakeAmt = bass * 0.06;
  camPos.x += snoise(vec3(uTime * 6.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uTime * 6.0, 0.0)) * shakeAmt;

  // Camera look direction: ahead on the path
  vec3 camTarget = cameraPath(camT + 0.1);
  vec3 camForward = normalize(camTarget - camPos);
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camForward));
  vec3 camUp = cross(camForward, camRight);

  // Ray direction
  vec3 rd = normalize(p.x * camRight + p.y * camUp + 1.5 * camForward);

  // === RAYMARCHING ===
  vec3 accColor = vec3(0.0);
  float accAlpha = 0.0;
  vec3 accEmission = vec3(0.0);
  float stepSize = 0.12;

  // Cloud body color from palette primary
  float hue1 = uPalettePrimary;
  vec3 cloudColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));

  // Emission color from palette secondary
  float hue2 = uPaletteSecondary;
  vec3 emissionColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  for (int i = 0; i < MAX_STEPS; i++) {
    if (accAlpha > 0.95) break;

    float t = float(i) * stepSize;
    if (t > MAX_DIST) break;

    vec3 pos = camPos + rd * t;

    // Domain warp from onset hits — clouds churn
    vec3 warpedPos = pos;
    warpedPos.xy += onset * 0.4 * vec2(
      snoise(pos * 0.5 + uTime * 0.3),
      snoise(pos * 0.5 + uTime * 0.3 + 100.0)
    );

    // Density from volumetric FBM
    float density = fbmVolume(warpedPos * 0.3, bass, highs);

    // Bass lowers threshold → Phil bombs = thick clouds
    float threshold = 0.1 - bass * 0.15;
    density = smoothstep(threshold, threshold + 0.4, density);

    if (density > 0.01) {
      // Emission cores: different frequency snoise inside dense regions
      float emissionNoise = snoise(warpedPos * 0.8 + uTime * 0.15);
      float emissionStrength = smoothstep(0.3, 0.7, emissionNoise) * energy * 0.8;

      // Cloud shading: depth-based darkening
      float depthFade = exp(-t * 0.08);
      vec3 localColor = cloudColor * (0.4 + 0.6 * depthFade);
      localColor += emissionColor * emissionStrength;

      // Front-to-back alpha compositing
      float alpha = density * stepSize * 3.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - accAlpha);

      accColor += localColor * weight;
      accEmission += emissionColor * emissionStrength * weight;
      accAlpha += weight;

      // Dense region: use normal step size
      stepSize = 0.12;
    } else {
      // Empty space: larger steps for performance
      stepSize = 0.18;
    }
  }

  vec3 col = accColor;

  // === GOD RAYS: radial glow from accumulated emission ===
  float godRayStrength = length(accEmission) * energy * 0.6;
  float radialDist = length(p);
  float godRay = exp(-radialDist * 2.0) * godRayStrength;
  col += emissionColor * godRay * 0.5;

  // === CHROMATIC ABERRATION from highs ===
  float caAmount = highs * 0.015;
  if (caAmount > 0.001) {
    vec2 caOffset = p * caAmount;
    // Shift R and B channels
    col.r = col.r + accColor.r * caOffset.x * 0.3;
    col.b = col.b - accColor.b * caOffset.x * 0.3;
  }

  // === BIOLUMINESCENT PARTICLES in quiet passages ===
  float quietness = smoothstep(0.3, 0.05, energy);
  if (quietness > 0.01) {
    float spark1 = snoise(vec3(p * 20.0, uTime * 0.2));
    float spark2 = snoise(vec3(p * 25.0 + 50.0, uTime * 0.15 + 10.0));
    float particle = max(0.0, spark1 * spark2 - 0.4) * 5.0;
    vec3 particleColor = mix(emissionColor, vec3(0.4, 0.8, 1.0), 0.5);
    col += particle * quietness * 0.15 * particleColor;
  }

  // === FOG: distance from energy (quiet = thick fog, loud = clear) ===
  float fogDist = mix(0.3, 0.9, energy);
  float fog = 1.0 - exp(-accAlpha * (1.0 - fogDist) * 2.0);
  vec3 fogColor = cloudColor * 0.15;
  col = mix(col, fogColor, (1.0 - fogDist) * (1.0 - accAlpha) * 0.5);

  // === VIGNETTE ===
  float vigScale = mix(0.72, 0.64, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = cloudColor * 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BEAT PULSE: tempo-locked emission swell ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.04;

  // === BLOOM: bright pixel self-illumination ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.45, 0.35, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.5;
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
  col += bloomColor * bloomAmount * 0.4;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.02, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // === LIFTED BLACKS ===
  col = max(col, vec3(0.06, 0.05, 0.07));

  gl_FragColor = vec4(col, 1.0);
}
`;
