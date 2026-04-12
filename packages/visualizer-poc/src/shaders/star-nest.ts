/**
 * Star Nest -- Kali fractal deep-space volumetric shader.
 * Ported from Kali's "Star Nest" (Shadertoy XlfGRj) -- CC BY-NC-SA 3.0.
 *
 * Volumetric raymarching through an iterated Kali fractal field.
 * Multiple passes at different scales create parallax depth.
 * Camera flies forward; exponential color mapping produces infinite-depth space.
 *
 * Audio reactivity:
 *   uEnergy        -> iteration count, overall brightness, travel speed
 *   uBass          -> folding formfactor (reshapes the fractal geometry)
 *   uSlowEnergy    -> camera drift speed through the field
 *   uOnsetSnap     -> brightness flash + formfactor jolt
 *   uMelodicPitch  -> dominant color hue shift
 *   uSpectralFlux  -> color cycling speed
 *   uJamPhase      -> complexity (more vol steps + fractal iters during jams)
 *   uClimaxIntensity -> zoom speed surge + brightness boost
 *   uHighs         -> high-frequency fractal detail boost
 *   uBeatSnap      -> subtle camera shake + brightness pulse
 *   uHarmonicTension -> color saturation + warmth
 *   uSectionType   -> section modulation (jam=dense, space=serene, chorus=vivid)
 *   uPalettePrimary/Secondary -> color palette integration
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const starNestVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const starNestFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', halationEnabled: true, caEnabled: true, bloomEnabled: true, bloomThresholdOffset: -0.05, dofEnabled: true })}

varying vec2 vUv;

#define _SN_PI 3.14159265
#define _SN_TAU 6.28318530
#define _SN_VOLSTEPS_MAX 28
#define _SN_FRACTAL_MAX 20

// ---------------------------------------------------------------
// Kali fractal core: abs(p)/dot(p,p) - formfactor
// Returns accumulated brightness and minimum orbit trap distance.
// ---------------------------------------------------------------
vec2 _sn_kaliField(vec3 pos, float formfactor, int maxIters) {
  float pa = 0.0;
  float accum = 0.0;
  float minOrbit = 1e10;

  for (int i = 0; i < _SN_FRACTAL_MAX; i++) {
    if (i >= maxIters) break;
    pos = abs(pos) / dot(pos, pos) - formfactor;
    float orbitLen = length(pos);
    accum += abs(orbitLen - pa);
    pa = orbitLen;
    minOrbit = min(minOrbit, orbitLen);
  }

  return vec2(accum, minOrbit);
}

// ---------------------------------------------------------------
// Camera path: Lissajous curve with slow incommensurate drift.
// Provides graceful non-repeating motion through the fractal.
// ---------------------------------------------------------------
vec3 _sn_cameraPath(float t) {
  return vec3(
    sin(t * 0.47) * 1.8 + cos(t * 0.23) * 0.6,
    cos(t * 0.31) * 1.4 + sin(t * 0.17) * 0.5,
    t * 2.5
  );
}

// ---------------------------------------------------------------
// Cosine palette with phase-shifted hues for rich nebula color.
// ---------------------------------------------------------------
vec3 _sn_cosmicPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(_SN_TAU * (c * t + d));
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === CLAMP AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float drumBeat = clamp(uDrumBeat, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === KALI FRACTAL PARAMETERS ===
  // Formfactor: the heart of the fractal shape. Bass reshapes geometry.
  float formfactor = 0.53 + bass * 0.18 + onset * 0.12 + beatSnap * 0.06;
  formfactor = mix(formfactor, formfactor * 1.08, sJam);   // jam: more complex
  formfactor = mix(formfactor, formfactor * 0.92, sSpace);  // space: smoother

  // Iteration count: energy + highs drive detail
  float iterFloat = 12.0 + energy * 5.0 + highs * 3.0;
  iterFloat = mix(iterFloat, iterFloat + 3.0, sJam);
  iterFloat = mix(iterFloat, iterFloat - 2.0, sSpace);
  int maxIters = int(clamp(iterFloat, 10.0, 20.0));

  // Volume steps: jam density drives step count
  float volStepFloat = 14.0 + energy * 8.0 + sJam * 4.0 + climaxBoost * 3.0;
  volStepFloat = mix(volStepFloat, volStepFloat - 4.0, sSpace);
  int volSteps = int(clamp(volStepFloat, 10.0, 28.0));

  // Tiling fold factor
  float tile = 0.85 + bass * 0.1;

  // Dark matter absorption
  float darkmatter = mix(0.18, 0.06, bass) * mix(1.2, 0.8, sJam);

  // Distance fading per step
  float distfading = 0.73 + energy * 0.20;

  // === CAMERA SETUP ===
  float driftSpeed = 0.08 + slowE * 0.12 + energy * 0.30 + climaxBoost * 0.15;
  driftSpeed = mix(driftSpeed, driftSpeed * 1.5, sJam);
  driftSpeed = mix(driftSpeed, driftSpeed * 0.3, sSpace);
  float camT = uDynamicTime * driftSpeed;

  vec3 camPos = _sn_cameraPath(camT);
  vec3 camTarget = _sn_cameraPath(camT + 0.15);
  vec3 camForward = normalize(camTarget - camPos);
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camForward));
  vec3 camUp = cross(camForward, camRight);

  // Slow barrel roll for organic camera motion
  float rollAngle = sin(camT * 0.29) * 0.18 + cos(camT * 0.19) * 0.12;
  rollAngle *= mix(1.0, 0.3, sSpace); // minimal roll in space sections
  vec3 rolledRight = camRight * cos(rollAngle) + camUp * sin(rollAngle);
  vec3 rolledUp = -camRight * sin(rollAngle) + camUp * cos(rollAngle);

  // Beat camera shake (gated by energy)
  float shakeGate = smoothstep(0.2, 0.5, energy);
  float shakeAmt = (beatSnap * 0.04 + onset * 0.06) * shakeGate;
  camPos.x += snoise(vec3(uTime * 5.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uTime * 5.0, 0.0)) * shakeAmt;

  // FOV: bass widens, solo narrows
  float fov = mix(1.4, 2.0, bass) * mix(1.0, 0.85, sSolo);
  vec3 rd = normalize(p.x * rolledRight + p.y * rolledUp + fov * camForward);

  // === PALETTE COLORS ===
  float hue1 = uPalettePrimary + pitch * 0.15 + flux * uDynamicTime * 0.002;
  vec3 palCol1 = paletteHueColor(hue1, 0.78, 0.92);

  float hue2 = uPaletteSecondary + pitch * 0.1;
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.98);

  // === TRAVEL ORIGIN ===
  float travelSpeed = 0.03 + energy * 0.07 + climaxBoost * 0.1;
  vec3 from = camPos + rd * 0.15;
  from += vec3(1.0, 1.0, 1.0) * uDynamicTime * travelSpeed;

  // === 3-PASS VOLUMETRIC RENDERING ===
  // Three passes at slightly different scales create depth parallax.
  vec3 totalColor = vec3(0.0);

  for (int pass = 0; pass < 3; pass++) {
    float fPass = float(pass);

    // Each pass: different scale, offset, and color emphasis
    float passScale = 1.0 + fPass * 0.35;
    float passOffset = fPass * 0.5;
    float passBrightness = mix(1.0, 0.5, fPass / 2.0); // far passes dimmer

    // Depth hue shift: each pass shifts color for layered separation
    float passHueShift = fPass * 0.12;

    vec3 passFrom = from * passScale + vec3(passOffset * 3.7, passOffset * 2.1, passOffset * 5.3);
    vec3 passRd = rd;

    float s = 0.1 + fPass * 0.05;
    float fade = 1.0;
    vec3 accColor = vec3(0.0);

    for (int r = 0; r < _SN_VOLSTEPS_MAX; r++) {
      if (r >= volSteps) break;

      // Adaptive step size: smaller near camera, larger in distance
      float stepsize = 0.06 + float(r) * 0.007 + fPass * 0.01;

      vec3 samplePos = passFrom + s * passRd * 0.5;

      // Tiling fold: creates infinite repeating fractal space
      samplePos = abs(vec3(tile) - mod(samplePos, vec3(tile * 2.0)));

      // Kali fractal evaluation
      vec2 kaliResult = _sn_kaliField(samplePos, formfactor, maxIters);
      float a = kaliResult.x;
      float minOrbit = kaliResult.y;

      // Dark matter: absorb density in inner volume
      float dm = max(0.0, darkmatter - a * a * 0.001);
      a *= a * a; // cube for contrast

      if (r > 5) {
        fade *= 1.0 - dm;
      }

      // === MULTI-BAND COLOR MAPPING ===
      float density = clamp(a * 0.001, 0.0, 1.0);
      float depthHue = float(r) * 0.006 + passHueShift;

      // Band 1: cool outer wisps
      vec3 coolHue = paletteHueColor(hue1 + depthHue, 0.78, 0.92);
      vec3 bandCool = coolHue * vec3(0.7, 0.85, 1.0);

      // Band 2: warm body (palette blend)
      vec3 bandWarm = mix(coolHue, palCol2, 0.4) * vec3(1.0, 0.95, 0.88);

      // Band 3: white-hot emission cores
      vec3 bandHot = mix(palCol2, vec3(1.0, 0.97, 0.92), 0.6);

      vec3 localColor = mix(bandCool, bandWarm, smoothstep(0.1, 0.45, density));
      localColor = mix(localColor, bandHot, smoothstep(0.45, 0.85, density));

      // Accumulate with distance-cubed depth mapping
      float s1 = s;
      vec3 depthWeight = vec3(s1, s1 * s1, s1 * s1 * s1 * s1);
      accColor += fade * localColor * a * 0.00016;
      accColor += fade * depthWeight * a * 0.00005;

      // Emission cores: orbit trap convergence creates bright nodes
      float coreGlow = smoothstep(0.45, 0.04, minOrbit) * a * 0.00015;
      accColor += fade * palCol2 * coreGlow * (1.0 + climaxBoost * 0.5);

      fade *= distfading;
      s += stepsize;
    }

    totalColor += accColor * passBrightness;
  }

  // === ONSET FLASH: brief brightness surge ===
  float flashIntensity = onset * 0.35 + climaxBoost * 0.15;
  totalColor *= 1.0 + flashIntensity;

  // === SATURATION: boosted by tension + chorus ===
  float lum = dot(totalColor, vec3(0.299, 0.587, 0.114));
  float saturation = 0.88 + tension * 0.12 + sChorus * 0.1 + climaxBoost * 0.1;
  vec3 col = mix(vec3(lum), totalColor, saturation);

  // === OVERALL BRIGHTNESS: energy + climax lift ===
  col *= 1.1 + energy * 0.30 + climaxBoost * 0.2;

  // === AMBIENT NEBULA: fills voids with palette color (never pitch black) ===
  float ambNoise = fbm3(vec3(p * 0.6, uDynamicTime * 0.04)) * 0.5 + 0.5;
  vec3 ambColor = mix(palCol1, palCol2, ambNoise) * mix(0.08, 0.03, energy);
  col += ambColor;

  // === QUIET PASSAGE STARS: tiny sparkle particles during soft moments ===
  float quietness = smoothstep(0.3, 0.05, energy);
  if (quietness > 0.01) {
    float spark1 = snoise(vec3(p * 25.0, uDynamicTime * 0.15));
    float spark2 = snoise(vec3(p * 30.0 + 60.0, uDynamicTime * 0.12 + 8.0));
    float particle = max(0.0, spark1 * spark2 - 0.35) * 6.0;
    vec3 particleColor = mix(palCol2, vec3(0.6, 0.8, 1.0), 0.5);
    col += particle * quietness * 0.12 * particleColor;
  }

  // === SPACE SECTION: serene shimmer ===
  if (sSpace > 0.01) {
    float shimmer = snoise(vec3(p * 8.0, uDynamicTime * 0.3)) * 0.5 + 0.5;
    shimmer = pow(shimmer, 6.0);
    col += palCol2 * shimmer * sSpace * 0.06;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.28, 0.22, energy);
  vigScale = mix(vigScale, 0.18, sSpace);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(palCol1 * 0.03, vec3(0.04, 0.03, 0.06));
  col = mix(vigTint, col, vignette);

  // === DEPTH FOG: palette-tinted atmosphere ===
  float fogDist = mix(0.35, 0.75, energy);
  vec3 fogColor = mix(palCol1, palCol2, 0.3) * 0.18;
  float fogAmount = (1.0 - fogDist) * 0.3;
  col = mix(col, fogColor, fogAmount * smoothstep(0.4, 0.0, lum));

  // === SDF ICON EMERGENCE ===
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
