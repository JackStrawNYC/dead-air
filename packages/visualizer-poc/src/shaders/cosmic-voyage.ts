/**
 * Cosmic Voyage — upgraded raymarched volumetric nebula flight.
 * Flies a camera through 3D fractal noise nebula clouds with proper
 * AO, multi-band color mapping, domain-warped density fields, emission cores,
 * god ray light shafts, and deep audio reactivity (14+ uniforms).
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → camera drift speed, glow intensity, fog distance
 *   uBass             → cloud density/thickness, camera shake, low-octave boost
 *   uHighs            → chromatic aberration, high-octave detail, specular
 *   uOnsetSnap        → cloud turbulence / domain warp burst
 *   uBeatSnap         → formuparam modulation, brightness pulse
 *   uSlowEnergy       → fog drift speed, ambient nebula glow
 *   uHarmonicTension  → fractal distortion, color saturation
 *   uBeatStability    → smooth flight vs erratic
 *   uMelodicPitch     → camera pitch angle, color temperature
 *   uChromaHue        → nebula hue rotation
 *   uChordIndex       → per-chord color offset
 *   uVocalEnergy      → emission core brightness
 *   uSpectralFlux     → domain warp intensity, flow speed
 *   uSectionType      → jam=dense fast, space=serene drift, solo=tunnel
 *   uClimaxPhase      → maximum saturation and god ray intensity
 *   uPalettePrimary/Secondary → nebula and emission colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const cosmicVoyageVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const cosmicVoyageFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ halationEnabled: true, caEnabled: true, anaglyphEnabled: true, dofEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define VOLSTEPS_LIMIT 40
#define FRACTAL_ITERS 16

// ═══════════════════════════════════════════════════════════
// Prefixed helper — cvy namespace
// ═══════════════════════════════════════════════════════════

float cvySdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

// Domain warp: two-pass FBM distortion for organic nebula shapes
vec3 cvyDomainWarp(vec3 pos, float onset, float dynTime, float flux) {
  vec3 q = vec3(
    fbm3(pos + vec3(0.0, 0.0, dynTime * 0.03)),
    fbm3(pos + vec3(5.2, 1.3, dynTime * 0.03)),
    fbm3(pos + vec3(2.1, 7.8, dynTime * 0.03))
  );
  vec3 r = vec3(
    fbm3(pos + 4.0 * q + vec3(1.7, 9.2, dynTime * 0.05)),
    fbm3(pos + 4.0 * q + vec3(8.3, 2.8, dynTime * 0.05)),
    fbm3(pos + 4.0 * q + vec3(3.1, 5.4, dynTime * 0.05))
  );
  return pos + 0.35 * (q + onset * 1.5 * r) + flux * 0.8 * q;
}

// Camera path: Lissajous curve with variable Z-forward drift
vec3 cvyCameraPath(float pathT) {
  return vec3(
    sin(pathT * 0.7) * 2.0 + cos(pathT * 0.3) * 0.8,
    cos(pathT * 0.5) * 1.6 + sin(pathT * 0.2) * 0.6,
    pathT * (3.5 + sin(pathT * 0.15) * 1.0)
  );
}

// Ambient occlusion for nebula volume (density-based)
float cvyVolumeAO(vec3 pos, vec3 norm, float onset, float dynTime, float flux) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 4; i++) {
    float dist = float(i) * 0.3;
    vec3 samplePos = pos + norm * dist;
    samplePos = cvyDomainWarp(samplePos, onset, dynTime, flux);
    float density = fbm3(samplePos * 0.3) * 0.5 + 0.5;
    occ += (1.0 - density) * weight;
    weight *= 0.5;
  }
  return clamp(occ * 0.5, 0.0, 1.0);
}

void main() {
  vec2 fragUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (fragUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ═══ Camera ═══
  float driftSpeed = 0.12 + energy * 0.15 + uFastEnergy * 0.06;
  driftSpeed *= mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
  float camT = uDynamicTime * driftSpeed;
  vec3 camPos = cvyCameraPath(camT);

  float shakeGate = smoothstep(0.25, 0.55, energy);
  float shakeAmt = bass * 0.06 * shakeGate * mix(1.0, 0.2, stability);
  camPos.x += snoise(vec3(uTime * 6.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uTime * 6.0, 0.0)) * shakeAmt;

  vec3 camLookTarget = cvyCameraPath(camT + 0.1);
  vec3 camFwd = normalize(camLookTarget - camPos);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);

  float rollAngle = sin(camT * 0.37) * 0.20 + cos(camT * 0.23) * 0.16;
  vec3 rolledRight = camRt * cos(rollAngle) + camUpDir * sin(rollAngle);
  vec3 rolledUp = -camRt * sin(rollAngle) + camUpDir * cos(rollAngle);

  float fov = mix(1.5, 2.0, bass);
  vec3 rayDir = normalize(screenPos.x * rolledRight + screenPos.y * rolledUp + fov * camFwd);

  // ═══ Palette ═══
  float hue1 = hsvToCosineHue(uPalettePrimary) + chromaH * 0.15 + chordHue;
  vec3 cloudColor = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  vec3 emissionColor = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // ═══ Kaliset volumetric fractal ═══
  float formuparam = 0.53 + onset * 0.15 + effectiveBeat * 0.12 + uDrumOnset * 0.15;
  float tile = 0.92;
  float stemOther = clamp(uOtherEnergy, 0.0, 1.0);
  float darkmatter = mix(0.15, 0.05, bass) * mix(1.3, 0.7, uJamDensity) * (1.0 - stemOther * 0.2);
  float distfading = 0.78;
  float saturation = 0.92 + tension * 0.08;

  int maxIters = 18 + int(highs * 6.0);
  float travelSpeed = energy * 0.08 + 0.02;
  vec3 from = camPos + rayDir * 0.1;
  from += vec3(1.0, 1.0, 1.0) * uDynamicTime * travelSpeed;

  int volSteps = int(mix(20.0, 40.0, uJamDensity));
  float marchS = 0.1;
  float fade = 1.0;
  vec3 accColor = vec3(0.0);
  float accGlow = 0.0;
  float accDensity = 0.0;

  for (int r = 0; r < VOLSTEPS_LIMIT; r++) {
    if (r >= volSteps) break;
    float stepsize = 0.08 + float(r) * 0.006;
    vec3 samplePos = from + marchS * rayDir * 0.5;

    // Domain warp near camera
    float warpFade = smoothstep(3.0, 0.5, float(r) / float(volSteps) * 5.0);
    if (warpFade > 0.01) {
      samplePos = mix(samplePos, cvyDomainWarp(samplePos, onset, uDynamicTime, flux), warpFade);
    }

    // Tiling fold
    samplePos = abs(vec3(tile) - mod(samplePos, vec3(tile * 2.0)));

    float pa = 0.0;
    float acc = 0.0;
    float minOrbit = 1e10;

    for (int i = 0; i < FRACTAL_ITERS; i++) {
      if (i >= maxIters) break;
      samplePos = abs(samplePos) / dot(samplePos, samplePos) - formuparam;
      float orbitLen = length(samplePos);
      acc += abs(orbitLen - pa);
      pa = orbitLen;
      minOrbit = min(minOrbit, orbitLen);
    }

    float dm = max(0.0, darkmatter - acc * acc * 0.001);
    acc *= acc * acc;

    if (r > 6) fade *= 1.0 - dm;

    // Multi-scale color mapping
    float density = clamp(acc * 0.001, 0.0, 1.0);
    float depthHue = float(r) * 0.008;
    vec3 shiftedCloud = 0.5 + 0.5 * cos(TAU * vec3(hue1 + depthHue, hue1 + 0.33 + depthHue, hue1 + 0.67 + depthHue));

    vec3 bandCool = shiftedCloud * vec3(0.7, 0.85, 1.0);
    vec3 bandWarm = mix(shiftedCloud, emissionColor, 0.35) * vec3(1.0, 0.95, 0.85);
    vec3 bandHot = mix(emissionColor, vec3(1.0, 0.98, 0.95), 0.5);

    vec3 localColor = mix(bandCool, bandWarm, smoothstep(0.1, 0.5, density));
    localColor = mix(localColor, bandHot, smoothstep(0.5, 0.9, density));

    // Vocal brightness on emission cores
    localColor += emissionColor * vocalE * smoothstep(0.5, 0.9, density) * 0.3;

    float s1 = marchS;
    vec3 v = vec3(s1, s1 * s1, s1 * s1 * s1 * s1);
    accColor += fade * localColor * acc * 0.00018;
    accColor += fade * v * acc * 0.00006;

    // Emission cores
    float coreGlow = smoothstep(0.5, 0.05, minOrbit) * acc * 0.0002;
    accColor += fade * emissionColor * coreGlow * (1.0 + vocalE * 0.5);
    accDensity += density * fade * 0.01;

    // God rays from emission cores
    if (coreGlow > 0.001) {
      vec3 toSample = normalize(samplePos);
      float rayAlign = abs(dot(rayDir, toSample));
      float godRay = pow(rayAlign, 8.0) * coreGlow * 3.0;
      accColor += fade * emissionColor * godRay * (0.5 + climaxBoost * 0.5);
    }

    accGlow += fade * acc * 0.00008;
    fade *= distfading;
    marchS += stepsize;
  }

  // Volume AO approximation: darker in dense regions
  float volAO = clamp(1.0 - accDensity * 3.0, 0.3, 1.0);

  // Saturation + grading
  float lumAcc = dot(accColor, vec3(0.299, 0.587, 0.114));
  float boostedSat = saturation + climaxBoost * 0.15;
  vec3 col = mix(vec3(lumAcc), accColor, boostedSat);
  col *= (1.15 + climaxBoost * 0.20) * volAO;

  // Melodic color temperature
  col *= mix(vec3(1.05, 0.98, 0.9), vec3(0.9, 0.98, 1.05), melPitch);

  // Chromatic aberration
  float caAmount = highs * 0.015 + onset * 0.05;
  if (caAmount > 0.001) {
    col = applyCA(col, vUv, caAmount);
  }

  // Quiet passage particles
  float quietness = smoothstep(0.3, 0.05, energy);
  if (quietness > 0.01) {
    float spark1 = snoise(vec3(screenPos * 20.0, uDynamicTime * 0.2));
    float spark2 = snoise(vec3(screenPos * 25.0 + 50.0, uDynamicTime * 0.15 + 10.0));
    float particle = max(0.0, spark1 * spark2 - 0.4) * 5.0;
    col += particle * quietness * 0.15 * mix(emissionColor, vec3(0.4, 0.8, 1.0), 0.5);
  }

  // Fog: palette-colored
  float fogDist = mix(0.40, 0.85, energy);
  vec3 fogColor = mix(cloudColor, emissionColor, 0.3) * 0.25;
  float fogAmount = (1.0 - fogDist) * 0.35;
  col = mix(col, fogColor, fogAmount * smoothstep(0.5, 0.0, lumAcc));

  // Ambient nebula fill
  float ambNeb = fbm3(vec3(screenPos * 0.8, uDynamicTime * 0.05)) * 0.5 + 0.5;
  vec3 ambColor = mix(cloudColor, emissionColor, ambNeb) * mix(0.10, 0.04, energy);
  col += ambColor;

  // Beat pulse
  col *= 1.0 + effectiveBeat * 0.12;

  // Nebula glow
  float glowAmount = accGlow * (0.8 + bass * 0.4);
  col += mix(emissionColor, cloudColor, 0.3) * 0.45 * glowAmount;

  // Vignette
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(cloudColor * 0.03, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vignette);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 3.0, uTime * 0.08));
    col += iconEmergence(screenPos, uTime, energy, bass, cloudColor, emissionColor, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, cloudColor, emissionColor, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  // Feedback
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.95, 0.88, energy);
  float feedbackDecay = clamp(baseDecay + sJam * 0.04 + sSpace * 0.06, 0.80, 0.97);
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
