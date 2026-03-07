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
#define VOLSTEPS 30
#define FRACTAL_ITERS 16

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- Domain warp: two-pass FBM distortion for organic cloud shapes ---
vec3 domainWarp(vec3 p, float onset, float time) {
  // Pass 1: large-scale cloud shaping
  vec3 q = vec3(
    fbm3(p + vec3(0.0, 0.0, time * 0.03)),
    fbm3(p + vec3(5.2, 1.3, time * 0.03)),
    fbm3(p + vec3(2.1, 7.8, time * 0.03))
  );

  // Pass 2: onset-reactive turbulence
  vec3 r = vec3(
    fbm3(p + 4.0 * q + vec3(1.7, 9.2, time * 0.05)),
    fbm3(p + 4.0 * q + vec3(8.3, 2.8, time * 0.05)),
    fbm3(p + 4.0 * q + vec3(3.1, 5.4, time * 0.05))
  );

  return p + 0.35 * (q + onset * 0.8 * r);
}

// --- Camera path: Lissajous curve with variable Z-forward drift ---
vec3 cameraPath(float t) {
  return vec3(
    sin(t * 0.7) * 2.0 + cos(t * 0.3) * 0.8,
    cos(t * 0.5) * 1.6 + sin(t * 0.2) * 0.6,
    t * (3.5 + sin(t * 0.15) * 1.0)
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
  float driftSpeed = 0.05 + energy * 0.08;
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

  // Slow barrel roll: ±13 degrees via incommensurate frequencies
  float rollAngle = sin(camT * 0.37) * 0.12 + cos(camT * 0.23) * 0.1;
  vec3 rolledRight = camRight * cos(rollAngle) + camUp * sin(rollAngle);
  vec3 rolledUp = -camRight * sin(rollAngle) + camUp * cos(rollAngle);

  // FOV modulated by bass
  float fov = mix(1.5, 2.0, bass);
  vec3 rd = normalize(p.x * rolledRight + p.y * rolledUp + fov * camForward);

  // === STAR NEST: Kaliset volumetric fractal ===
  // Nebula/cloud color from palette primary
  float hue1 = uPalettePrimary;
  vec3 cloudColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));

  // Emission color from palette secondary
  float hue2 = uPaletteSecondary;
  vec3 emissionColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Kaliset parameters (retuned for 30 steps)
  float formuparam = 0.53 + onset * 0.15;
  float tile = 0.92;
  float darkmatter = mix(0.25, 0.05, bass);
  float distfading = 0.78;
  float saturation = 0.92;

  // Highs modulate iteration count (18-24 range)
  int maxIters = 18 + int(highs * 6.0);

  // Travel speed from energy
  float travelSpeed = energy * 0.08 + 0.02;
  vec3 from = camPos + rd * 0.1;
  from += vec3(1.0, 1.0, 1.0) * uTime * travelSpeed;

  // Volumetric rendering
  float s = 0.1;
  float fade = 1.0;
  vec3 accColor = vec3(0.0);
  float accGlow = 0.0;

  for (int r = 0; r < VOLSTEPS; r++) {
    // Adaptive step size: dense near camera, efficient in distance
    float stepsize = 0.08 + float(r) * 0.006;

    vec3 samplePos = from + s * rd * 0.5;

    // Domain warp with distance fade (near samples only)
    float warpFade = smoothstep(3.0, 0.5, float(r) / 30.0 * 5.0);
    if (warpFade > 0.01) {
      samplePos = mix(samplePos, domainWarp(samplePos, onset, uTime), warpFade);
    }

    // Tiling fold
    samplePos = abs(vec3(tile) - mod(samplePos, vec3(tile * 2.0)));

    float pa = 0.0;
    float a = 0.0;
    float minOrbit = 1e10;

    // Kaliset fractal iterations
    for (int i = 0; i < FRACTAL_ITERS; i++) {
      if (i >= maxIters) break;
      samplePos = abs(samplePos) / dot(samplePos, samplePos) - formuparam;
      float orbitLen = length(samplePos);
      a += abs(orbitLen - pa);
      pa = orbitLen;
      minOrbit = min(minOrbit, orbitLen);
    }

    // Dark matter subtraction
    float dm = max(0.0, darkmatter - a * a * 0.001);
    a *= a * a;

    if (r > 6) {
      fade *= 1.0 - dm;
    }

    // === Multi-scale color mapping (3-band gradient) ===
    float density = clamp(a * 0.001, 0.0, 1.0);
    // Depth-dependent hue shift for layered color separation
    float depthHue = float(r) * 0.008;
    vec3 shiftedCloud = 0.5 + 0.5 * cos(6.28318 * vec3(hue1 + depthHue, hue1 + 0.33 + depthHue, hue1 + 0.67 + depthHue));

    // Band 1 (low density, outer wisps): cool-shifted cloud color
    vec3 bandCool = shiftedCloud * vec3(0.7, 0.85, 1.0);
    // Band 2 (mid density, body): warm mix of cloud + emission
    vec3 bandWarm = mix(shiftedCloud, emissionColor, 0.35) * vec3(1.0, 0.95, 0.85);
    // Band 3 (high density, cores): bright white-hot emission
    vec3 bandHot = mix(emissionColor, vec3(1.0, 0.98, 0.95), 0.5);

    // Blend bands based on density
    vec3 localColor = mix(bandCool, bandWarm, smoothstep(0.1, 0.5, density));
    localColor = mix(localColor, bandHot, smoothstep(0.5, 0.9, density));

    float s1 = s;
    vec3 v = vec3(s1, s1 * s1, s1 * s1 * s1 * s1);
    accColor += fade * localColor * a * 0.00013;
    accColor += fade * v * a * 0.00005;

    // === Emission cores: detect fractal convergence ===
    float coreGlow = smoothstep(0.5, 0.05, minOrbit) * a * 0.0002;
    accColor += fade * emissionColor * coreGlow;

    // === God rays: directional light shafts from bright nodes ===
    if (coreGlow > 0.001) {
      vec3 toSample = normalize(samplePos);
      float rayAlign = abs(dot(rd, toSample));
      float godRay = pow(rayAlign, 8.0) * coreGlow * 3.0;
      accColor += fade * emissionColor * godRay * 0.5;
    }

    // Accumulate volumetric luminance for nebula glow
    accGlow += fade * a * 0.00008;

    fade *= distfading;
    s += stepsize;
  }

  // Apply saturation
  float lumAcc = dot(accColor, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(vec3(lumAcc), accColor, saturation);

  // === CHROMATIC ABERRATION from highs ===
  float caAmount = highs * 0.015;
  if (caAmount > 0.001) {
    vec2 caOffset = p * caAmount;
    col.r += col.r * caOffset.x * 0.3;
    col.b -= col.b * caOffset.x * 0.3;
  }

  // === QUIET PASSAGE PARTICLES ===
  float quietness = smoothstep(0.3, 0.05, energy);
  if (quietness > 0.01) {
    float spark1 = snoise(vec3(p * 20.0, uTime * 0.2));
    float spark2 = snoise(vec3(p * 25.0 + 50.0, uTime * 0.15 + 10.0));
    float particle = max(0.0, spark1 * spark2 - 0.4) * 5.0;
    vec3 particleColor = mix(emissionColor, vec3(0.4, 0.8, 1.0), 0.5);
    col += particle * quietness * 0.15 * particleColor;
  }

  // === FOG ===
  float fogDist = mix(0.3, 0.9, energy);
  vec3 fogColor = cloudColor * 0.15;
  float fogAmount = (1.0 - fogDist) * 0.5;
  col = mix(col, fogColor, fogAmount * smoothstep(0.5, 0.0, lumAcc));

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
  col *= 1.0 + bp * 0.10;

  // === BLOOM: bright pixel self-illumination ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.35, 0.2, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.5;
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
  col += bloomColor * bloomAmount * 0.55;

  // === NEBULA GLOW: diffuse volumetric luminance layer ===
  float glowAmount = accGlow * (0.6 + bass * 0.4);
  vec3 glowColor = mix(emissionColor, cloudColor, 0.3) * 0.35;
  col += glowColor * glowAmount;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.02, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // === LIFTED BLACKS ===
  col = max(col, vec3(0.06, 0.05, 0.07));

  gl_FragColor = vec4(col, 1.0);
}
`;
