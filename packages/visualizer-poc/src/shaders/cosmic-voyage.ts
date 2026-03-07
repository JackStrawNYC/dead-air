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
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform vec2 uCamOffset;

varying vec2 vUv;

#define PI 3.14159265
#define VOLSTEPS 64
#define LIGHT_STEPS 8

// --- Camera path: Lissajous curve with variable Z-forward drift ---
vec3 cameraPath(float t) {
  return vec3(
    sin(t * 0.7) * 2.0 + cos(t * 0.3) * 0.8,
    cos(t * 0.5) * 1.6 + sin(t * 0.2) * 0.6,
    t * (3.5 + sin(t * 0.15) * 1.0)
  );
}

// --- Domain-rotated FBM for volumetric clouds (nimitz technique) ---
// Rotation per octave prevents axis-aligned artifacts
mat3 m3 = mat3(0.00, 0.80, 0.60,
               -0.80, 0.36, -0.48,
               -0.60, -0.48, 0.64);

float cloudFBM(vec3 p, float time, float bass, float highs) {
  // Contrast bands modulate per-octave weights
  float w0 = 0.5 + uContrast0.x * 0.3 + bass * 0.2;
  float w1 = 0.25 + uContrast0.y * 0.15;
  float w2 = 0.125 + uContrast0.z * 0.1;
  float w3 = 0.0625 + uContrast1.x * 0.08;
  float w4 = 0.03125 + uContrast1.y * 0.06 + highs * 0.04;

  float val = 0.0;
  val += w0 * snoise(p); p = m3 * p * 2.02; p += time * 0.01;
  val += w1 * snoise(p); p = m3 * p * 2.03; p += time * 0.015;
  val += w2 * snoise(p); p = m3 * p * 2.01; p += time * 0.02;
  val += w3 * snoise(p); p = m3 * p * 2.04;
  val += w4 * snoise(p);
  return val;
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

  // Camera offset blending
  camPos.x += uCamOffset.x * 0.002;
  camPos.y += uCamOffset.y * 0.002;

  // Camera look direction: ahead on the path
  vec3 camTarget = cameraPath(camT + 0.1);
  vec3 camForward = normalize(camTarget - camPos);
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camForward));
  vec3 camUp = cross(camForward, camRight);

  // Slow barrel roll
  float rollAngle = sin(camT * 0.37) * 0.12 + cos(camT * 0.23) * 0.1;
  vec3 rolledRight = camRight * cos(rollAngle) + camUp * sin(rollAngle);
  vec3 rolledUp = -camRight * sin(rollAngle) + camUp * cos(rollAngle);

  // FOV modulated by bass
  float fov = mix(1.5, 2.0, bass);
  vec3 rd = normalize(p.x * rolledRight + p.y * rolledUp + fov * camForward);

  // === PALETTE COLORS ===
  float hue1 = uPalettePrimary;
  vec3 cloudColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  float hue2 = uPaletteSecondary;
  vec3 emissionColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Light direction (from "above-right", modulated by time)
  vec3 lightDir = normalize(vec3(0.5 + sin(uTime * 0.03) * 0.3, 1.0, -0.3));

  // === VOLUMETRIC FBM CLOUD RAYMARCHING (64 steps) ===
  vec3 accColor = vec3(0.0);
  float T = 1.0;  // Beer's law transmittance
  float accGlow = 0.0;
  float travelSpeed = energy * 0.08 + 0.02;
  vec3 origin = camPos + vec3(1.0) * uTime * travelSpeed;

  for (int i = 0; i < VOLSTEPS; i++) {
    if (T < 0.01) break;

    // Adaptive step sizing: smaller near density
    float t = 0.1 + float(i) * (0.06 + float(i) * 0.002);
    vec3 pos = origin + rd * t;

    // Domain warp from onset (near samples only)
    float warpFade = smoothstep(4.0, 0.5, t);
    if (warpFade > 0.01 && onset > 0.01) {
      pos.x += onset * warpFade * 0.3 * snoise(pos * 0.5 + uTime * 0.1);
      pos.y += onset * warpFade * 0.2 * snoise(pos * 0.5 + vec3(5.0, 0.0, 0.0) + uTime * 0.1);
    }

    float density = cloudFBM(pos * 0.3, uTime, bass, highs);
    density = max(0.0, density - 0.1) * (1.5 + bass * 0.5); // threshold + bass boost

    if (density > 0.001) {
      float stepSize = 0.06 + float(i) * 0.002;

      // Beer's law transmittance
      float absorption = beerLaw(density * 2.0, stepSize);
      float absorbed = 1.0 - absorption;

      // Inner light march: shadow estimation toward light source
      float shadowDensity = 0.0;
      for (int j = 0; j < LIGHT_STEPS; j++) {
        float lt = float(j) * 0.15 + 0.05;
        vec3 lightPos = pos + lightDir * lt;
        float ld = cloudFBM(lightPos * 0.3, uTime, bass * 0.5, 0.0);
        shadowDensity += max(0.0, ld - 0.1) * 0.15;
      }
      float lightTransmittance = beerLaw(shadowDensity * 3.0, 1.0);

      // Henyey-Greenstein forward scattering
      float cosTheta = dot(rd, lightDir);
      float scatter = hgPhase(cosTheta, 0.7) * density * T;

      // Color: depth-dependent hue shift for layered separation
      float depthHue = t * 0.02;
      vec3 shiftedCloud = 0.5 + 0.5 * cos(6.28318 * vec3(hue1 + depthHue, hue1 + 0.33 + depthHue, hue1 + 0.67 + depthHue));

      // Multi-band color: cool wisps → warm body → hot cores
      vec3 localColor = mix(shiftedCloud * vec3(0.7, 0.85, 1.0),
                           mix(shiftedCloud, emissionColor, 0.35) * vec3(1.0, 0.95, 0.85),
                           smoothstep(0.1, 0.5, density));
      localColor = mix(localColor, mix(emissionColor, vec3(1.0, 0.98, 0.95), 0.5),
                       smoothstep(0.5, 1.2, density));

      // Accumulate emission weighted by transmittance + light
      vec3 emission = localColor * (lightTransmittance * 0.7 + 0.3); // 30% ambient
      emission += emissionColor * scatter * lightTransmittance * 2.0; // scatter contribution

      // God ray contribution from scattering
      float godRay = pow(max(0.0, cosTheta), 8.0) * density * lightTransmittance;
      emission += emissionColor * godRay * 0.5;

      accColor += emission * absorbed * T * 1.5;
      accGlow += density * T * 0.0005;

      T *= absorption;
    }
  }

  vec3 col = accColor;

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

  // === VIGNETTE ===
  float vigScale = mix(0.72, 0.64, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = cloudColor * 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BEAT PULSE ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.10;

  // === NEBULA GLOW ===
  float glowAmount = accGlow * (0.6 + bass * 0.4);
  vec3 glowColor = mix(emissionColor, cloudColor, 0.3) * 0.35;
  col += glowColor * glowAmount;

  // === COLOR GRADING: deep blue shadows, warm gold highlights ===
  col = colorGrade(col, vec3(0.05, 0.08, 0.15), vec3(1.0, 0.85, 0.6), 1.1, 1.05);

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
