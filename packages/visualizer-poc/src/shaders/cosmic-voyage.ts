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

${buildPostProcessGLSL({ halationEnabled: false, caEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define VOLSTEPS_LIMIT 40
#define FRACTAL_ITERS 16

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- Domain warp: two-pass FBM distortion for organic cloud shapes ---
vec3 domainWarp(vec3 p, float onset, float dynTime) {
  // Pass 1: large-scale cloud shaping
  vec3 q = vec3(
    fbm3(p + vec3(0.0, 0.0, dynTime * 0.03)),
    fbm3(p + vec3(5.2, 1.3, dynTime * 0.03)),
    fbm3(p + vec3(2.1, 7.8, dynTime * 0.03))
  );

  // Pass 2: onset-reactive turbulence
  vec3 r = vec3(
    fbm3(p + 4.0 * q + vec3(1.7, 9.2, dynTime * 0.05)),
    fbm3(p + 4.0 * q + vec3(8.3, 2.8, dynTime * 0.05)),
    fbm3(p + 4.0 * q + vec3(3.1, 5.4, dynTime * 0.05))
  );

  return p + 0.35 * (q + onset * 1.5 * r) + uSpectralFlux * 0.8 * q;
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
  float driftSpeed = 0.12 + energy * 0.15 + uFastEnergy * 0.06;
  float camT = uDynamicTime * driftSpeed;
  vec3 camPos = cameraPath(camT);

  // Bass camera shake (energy-gated: calm during quiet)
  float shakeGate = smoothstep(0.25, 0.55, energy);
  float shakeAmt = bass * 0.06 * shakeGate;
  camPos.x += snoise(vec3(uTime * 6.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uTime * 6.0, 0.0)) * shakeAmt;

  // Camera look direction: ahead on the path
  vec3 camTarget = cameraPath(camT + 0.1);
  vec3 camForward = normalize(camTarget - camPos);
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camForward));
  vec3 camUp = cross(camForward, camRight);

  // Slow barrel roll: ±13 degrees via incommensurate frequencies
  float rollAngle = sin(camT * 0.37) * 0.20 + cos(camT * 0.23) * 0.16;
  vec3 rolledRight = camRight * cos(rollAngle) + camUp * sin(rollAngle);
  vec3 rolledUp = -camRight * sin(rollAngle) + camUp * cos(rollAngle);

  // FOV modulated by bass
  float fov = mix(1.5, 2.0, bass);
  vec3 rd = normalize(p.x * rolledRight + p.y * rolledUp + fov * camForward);

  // === STAR NEST: Kaliset volumetric fractal ===
  // Nebula/cloud color from palette primary
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 cloudColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));

  // Emission color from palette secondary
  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 emissionColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === CLIMAX REACTIVITY: shaders respond to emotional arc ===
  float climaxPhase = uClimaxPhase; // 0=idle,1=build,2=climax,3=sustain,4=release
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5); // climax or sustain
  float climaxBoost = isClimax * climaxI;

  // Kaliset parameters (retuned for 30 steps)
  float formuparam = 0.53 + onset * 0.15 + max(uBeatSnap, uDrumBeat) * 0.12 + uDrumOnset * 0.15;
  float tile = 0.92;
  // Jam density reduces dark matter absorption → denser nebula at peaks
  // At neutral density (0.5) the multiplier is 1.0, preserving original behavior.
  float darkmatter = mix(0.15, 0.05, bass) * mix(1.3, 0.7, uJamDensity);
  float distfading = 0.78;
  float saturation = 0.92;

  // Highs modulate iteration count (18-24 range)
  int maxIters = 18 + int(highs * 6.0);

  // Travel speed from energy
  float travelSpeed = energy * 0.08 + 0.02;
  vec3 from = camPos + rd * 0.1;
  from += vec3(1.0, 1.0, 1.0) * uDynamicTime * travelSpeed;

  // Volumetric rendering
  // Jam density modulates volume step count: sparse exploration (20) → dense peak (40)
  int volSteps = int(mix(20.0, 40.0, uJamDensity));
  float s = 0.1;
  float fade = 1.0;
  vec3 accColor = vec3(0.0);
  float accGlow = 0.0;

  for (int r = 0; r < VOLSTEPS_LIMIT; r++) {
    if (r >= volSteps) break;
    // Adaptive step size: dense near camera, efficient in distance
    float stepsize = 0.08 + float(r) * 0.006;

    vec3 samplePos = from + s * rd * 0.5;

    // Domain warp with distance fade (near samples only)
    float warpFade = smoothstep(3.0, 0.5, float(r) / float(volSteps) * 5.0);
    if (warpFade > 0.01) {
      samplePos = mix(samplePos, domainWarp(samplePos, onset, uDynamicTime), warpFade);
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
    accColor += fade * localColor * a * 0.00018;
    accColor += fade * v * a * 0.00006;

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

  // === SDF STEALIE: emerges from cosmic nebula ===
  {
    float nf = fbm3(vec3(p * 3.0, uTime * 0.08));
    accColor += stealieEmergence(p, uTime, energy, bass, cloudColor, emissionColor, nf, uClimaxPhase);
  }

  // Apply saturation (boosted for vivid nebula)
  float lumAcc = dot(accColor, vec3(0.299, 0.587, 0.114));
  float boostedSat = saturation + climaxBoost * 0.15;
  vec3 col = mix(vec3(lumAcc), accColor, boostedSat);
  col *= 1.15 + climaxBoost * 0.20;

  // === CHROMATIC ABERRATION from highs (directional fringing) ===
  float caAmount = highs * 0.015 + uOnsetSnap * 0.059;
  if (caAmount > 0.001) {
    col = applyCA(col, vUv, caAmount);
  }

  // === QUIET PASSAGE PARTICLES ===
  float quietness = smoothstep(0.3, 0.05, energy);
  if (quietness > 0.01) {
    float spark1 = snoise(vec3(p * 20.0, uDynamicTime * 0.2));
    float spark2 = snoise(vec3(p * 25.0 + 50.0, uDynamicTime * 0.15 + 10.0));
    float particle = max(0.0, spark1 * spark2 - 0.4) * 5.0;
    vec3 particleColor = mix(emissionColor, vec3(0.4, 0.8, 1.0), 0.5);
    col += particle * quietness * 0.15 * particleColor;
  }

  // === FOG: palette-colored atmosphere (fills voids with color, not black) ===
  float fogDist = mix(0.40, 0.85, energy);
  vec3 fogColor = mix(cloudColor, emissionColor, 0.3) * 0.25;
  float fogAmount = (1.0 - fogDist) * 0.35;
  col = mix(col, fogColor, fogAmount * smoothstep(0.5, 0.0, lumAcc));

  // === AMBIENT NEBULA: subtle palette color everywhere (no dark voids) ===
  float ambNeb = fbm3(vec3(p * 0.8, uDynamicTime * 0.05)) * 0.5 + 0.5;
  vec3 ambColor = mix(cloudColor, emissionColor, ambNeb) * mix(0.10, 0.04, energy);
  col += ambColor;

  // === VIGNETTE ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(cloudColor * 0.03, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vignette);

  // === NEBULA GLOW: diffuse volumetric luminance layer ===
  float glowAmount = accGlow * (0.8 + bass * 0.4);
  vec3 glowColor = mix(emissionColor, cloudColor, 0.3) * 0.45;
  col += glowColor * glowAmount;

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.95, 0.95 - 0.07, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
