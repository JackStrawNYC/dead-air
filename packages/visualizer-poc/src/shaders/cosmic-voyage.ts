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
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildDepthAlphaOutput } from "./shared/raymarching.glsl";

export const cosmicVoyageVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const cvyDepthAlpha = buildDepthAlphaOutput("(1.0 - clamp(accDensity, 0.0, 1.0))", "1.0");

export const cosmicVoyageFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${lightingGLSL}

// COSMIC VOYAGE FIX: previously had temporalBlend + anaglyph + caEnabled
// all on simultaneously. anaglyph fringe-shifted high-contrast pixels into
// rainbow noise, temporalBlend fed that back in. Fix: anaglyph + temporalBlend
// stay off, CA alone is safe (max 0.03 cap prevents fringing on volumetric).
${buildPostProcessGLSL({ halationEnabled: false, caEnabled: true, lightLeakEnabled: false, anaglyphEnabled: false, dofEnabled: true, temporalBlendEnabled: false, grainStrength: "none", bloomEnabled: true, bloomThresholdOffset: -0.08, beatPulseEnabled: false, lensDistortionEnabled: false })}

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

  // Internal evolution over long holds
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float evolveComplexity = smoothstep(0.0, 0.5, holdP) * (1.0 - smoothstep(0.8, 1.0, holdP) * 0.4);
  float evolveOpenness = 1.0 - smoothstep(0.0, 0.3, holdP) * 0.3 + smoothstep(0.75, 1.0, holdP) * 0.3;

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ═══ Camera — cinematic nebula flight with holdProgress evolution ═══
  // Phase 1 (0.0-0.2): Slow drift — emerging from deep void into nebula edge
  // Phase 2 (0.2-0.5): Accelerating — diving into the nebula core
  // Phase 3 (0.5-0.8): Full speed — barrel roll through dense clouds
  // Phase 4 (0.8-1.0): Decelerate — drift out the other side into open space
  float emerge = smoothstep(0.0, 0.2, holdP);
  float dive = smoothstep(0.2, 0.5, holdP);
  float fullSpeed = smoothstep(0.5, 0.8, holdP);
  float decel = smoothstep(0.8, 1.0, holdP);

  // Drift speed evolves with holdP: slow start → peak → decelerate
  float speedCurve = mix(0.3, 1.0, emerge);
  speedCurve = mix(speedCurve, 1.5, dive);
  speedCurve = mix(speedCurve, 1.8, fullSpeed * (1.0 - decel));
  speedCurve = mix(speedCurve, 0.6, decel);

  float driftSpeed = (0.05 + energy * 0.28 + uFastEnergy * 0.10) * speedCurve;
  driftSpeed *= mix(1.0, 1.8, sJam) * mix(1.0, 0.20, sSpace);
  float camT = uDynamicTime * driftSpeed;
  vec3 camPos = cvyCameraPath(camT);

  // Lissajous amplitude evolves: tight at start/end, wide in the middle
  float pathAmplitude = mix(0.5, 1.0, emerge) * mix(1.0, 1.3, fullSpeed) * mix(1.0, 0.7, decel);
  camPos.xy *= pathAmplitude;

  float shakeGate = smoothstep(0.25, 0.55, energy);
  float shakeAmt = bass * 0.14 * shakeGate * mix(1.0, 0.2, stability);
  // Shake increases during dive, calms during decel
  shakeAmt *= mix(1.0, 1.3, dive) * mix(1.0, 0.4, decel);
  camPos.x += snoise(vec3(uTime * 6.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uTime * 6.0, 0.0)) * shakeAmt;

  // Look-ahead distance evolves: close at slow speed, far at high speed
  float lookAhead = mix(0.05, 0.15, speedCurve);
  vec3 camLookTarget = cvyCameraPath(camT + lookAhead);
  camLookTarget.xy *= pathAmplitude;
  vec3 camFwd = normalize(camLookTarget - camPos);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);

  // Roll: gentle at edges, more dramatic during full speed
  float rollIntensity = mix(0.12, 0.25, fullSpeed) * mix(1.0, 0.5, decel);
  rollIntensity *= mix(1.0, 0.3, sSpace); // space: minimal roll
  float rollAngle = sin(camT * 0.37) * rollIntensity + cos(camT * 0.23) * rollIntensity * 0.7;
  vec3 rolledRight = camRt * cos(rollAngle) + camUpDir * sin(rollAngle);
  vec3 rolledUp = -camRt * sin(rollAngle) + camUpDir * cos(rollAngle);

  float fov = mix(1.5, 2.0, bass) * evolveOpenness;
  // FOV narrows at start (tunnel vision), widens at full speed
  fov *= mix(0.85, 1.0, emerge) * mix(1.0, 1.1, fullSpeed);
  vec3 rayDir = normalize(screenPos.x * rolledRight + screenPos.y * rolledUp + fov * camFwd);

  // ═══ Palette — cosmic: deep purple/blue nebula with magenta/violet accents ═══
  float rawCH1 = uPalettePrimary + chromaH * 0.15 + chordHue;
  float hue1 = mix(rawCH1, 0.72 + fract(rawCH1) * 0.1, 0.4); // pull toward deep purple-blue
  vec3 cloudColor = paletteHueColor(hue1, 0.75, 0.85);
  float rawCH2 = uPaletteSecondary + chordHue * 0.5;
  float hue2 = mix(rawCH2, 0.82 + fract(rawCH2) * 0.12, 0.35); // magenta/violet accent
  vec3 emissionColor = paletteHueColor(hue2, 0.8, 0.95);

  // ═════════════════════════════════════════════════════════════════
  // COSMIC VOYAGE — REWRITE
  // The original kaliset volumetric fractal converged to degenerate
  // (uniform pink/magenta) output at most frames in PITB section 3 etc.
  // Replaced with a layered FBM-based volumetric nebula in screen+ray
  // space, which always produces per-pixel variation regardless of audio
  // state. The camera/raydir feed back into the noise so the result still
  // feels like flying THROUGH a nebula, just without the crash modes.
  // ═════════════════════════════════════════════════════════════════
  vec3 col;
  float accDensity = 0.0;
  float accGlow = 0.0;
  {
    float t = uDynamicTime * 0.06 + uMusicalTime * 0.03;

    // Noise input combines screen position, ray direction (for parallax)
    // and time. The 3D point we sample drifts through noise space.
    vec3 noiseP = vec3(screenPos * 1.6, t * 0.8) + rayDir * 0.4;

    // Three layers of FBM at different scales for cloud/dust depth
    float n1 = fbm3(noiseP * 0.9);
    float n2 = fbm3(noiseP * 1.9 + 7.3);
    float n3 = fbm3(noiseP * 4.0 + 19.1);
    float density = pow(n1 * 0.55 + n2 * 0.30 + n3 * 0.15 + 0.5, 1.4);
    // Widened density: 4x range (sparse quiet → dense loud), modulated by hold evolution
    density = clamp(density * (0.30 + energy * 0.70 + bass * 0.40) * (0.5 + evolveComplexity * 0.5), 0.0, 1.4);
    accDensity = density;

    // Per-pixel hue offset based on ray direction so adjacent pixels
    // always have slightly different colors (no flat-frame failure mode).
    // Reduced from 0.25 to 0.12 to avoid neon-rainbow saturation.
    float pixelHue = atan(rayDir.z, rayDir.x) / TAU * 0.12
                     + rayDir.y * 0.07
                     + n2 * 0.10;
    float depthDriftHue = sin(t * 0.4 + density * 3.0) * 0.06;

    // Cosmic palette — VERY DIM source values. The post-process pipeline
    // applies cinematicGrade ACES tone mapping which brightens dim values
    // significantly, so the source needs to be dark enough that the
    // brightened result still looks restrained instead of neon.
    // Widened saturation: muted quiet (0.15) → vivid loud (0.55)
    float satCap = 0.15 + energy * 0.40;
    vec3 deepSpace = paletteHueColor(hue1 + pixelHue + depthDriftHue, satCap, 0.18);
    vec3 nebulaWarm = paletteHueColor(hue2 + pixelHue * 0.6 - depthDriftHue * 0.5, satCap + 0.08, 0.26);
    // Emission cores: warm gold/amber star points in cosmic nebula (not grey)
    vec3 emissionCore = mix(emissionColor * 0.4, vec3(0.55, 0.45, 0.30), 0.55);

    // Layer the colors by density
    vec3 nebulaCol = mix(deepSpace, nebulaWarm, smoothstep(0.20, 0.65, density));
    nebulaCol = mix(nebulaCol, emissionCore, smoothstep(0.70, 1.05, density) * 0.50);

    // Vocal pulse on bright cores
    nebulaCol += emissionCore * vocalE * smoothstep(0.55, 0.95, density) * 0.12;

    // Climax: pull toward dim cream (post-process will brighten)
    if (climaxBoost > 0.05) {
      nebulaCol = mix(nebulaCol, vec3(0.55, 0.50, 0.42), climaxBoost * smoothstep(0.4, 0.8, density) * 0.25);
    }

    col = nebulaCol * (0.20 + density * 0.30);

    // Bright stars in dark regions
    float starN = fract(sin(dot(floor(screenPos * 110.0), vec2(127.1, 311.7))) * 43758.5);
    float starMask = step(0.988, starN) * smoothstep(0.4, 0.0, density);
    col += vec3(0.95, 0.92, 0.82) * starMask * 28.0 * (starN - 0.988);

    // Streak: subtle camera-motion light streaks
    float streak = pow(max(0.0, dot(rayDir, normalize(camFwd))), 32.0) * 0.15;
    col += vec3(0.7, 0.65, 0.55) * streak * (0.5 + energy * 0.5);

    // Per-step glow accumulator (kept for downstream compatibility)
    accGlow = density * 0.6;
  }

  // Volume AO approximation kept for downstream code that references it
  float volAO = clamp(1.0 - accDensity * 0.6, 0.5, 1.0);
  col *= volAO;
  col *= 1.0 + climaxBoost * 0.15;

  // Kept for downstream compat: lumAcc + accColor references below.
  vec3 accColor = col;
  float lumAcc = dot(col, vec3(0.299, 0.587, 0.114));

  // Blend shared lighting with per-shader lighting for smooth crossfade continuity
  // Cosmic voyage uses a synthetic view-aligned normal for shared diffuse
  {
    vec3 synthNormal = normalize(vec3(screenPos.x * 0.3, screenPos.y * 0.3, 1.0));
    vec3 sharedLight = sharedDiffuse(synthNormal);
    vec3 localLight = col;
    col = mix(localLight, localLight * sharedLight, 0.3);
  }

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
  // Widened fog: thick fog at quiet (0.25) → clear at loud (0.90), resolves to fog at end
  float fogDist = mix(0.25, 0.90, energy) * (0.7 + evolveComplexity * 0.3);
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
  // Widened glow: dim ambient at quiet, vivid bass-driven emission at loud
  float glowAmount = accGlow * (0.4 + bass * 0.9);
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

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
  ${cvyDepthAlpha}
}
`;
