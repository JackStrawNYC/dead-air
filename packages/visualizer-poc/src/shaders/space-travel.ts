/**
 * Space Travel — flying through an infinite star field with nebula clouds.
 * Inspired by the Stargate sequence in 2001: A Space Odyssey.
 * Camera hurtles forward through deep space; stars streak into warp lines
 * at high energy. Volumetric nebula clouds drift past, colored by palette.
 *
 * MASSIVE dynamic range: whisper-quiet = gentle star drift through serene void;
 * peak energy = full hyperspace warp with star streaks and rushing nebula.
 *
 * Audio reactivity:
 *   uEnergy       -> forward speed (gentle drift -> full warp)
 *   uBeat         -> star brightness pulse
 *   uOnsetSnap    -> sudden speed burst (lurch forward)
 *   uSpectralFlux -> star density and brightness
 *   uFlatness     -> nebula density (flat spectrum = denser clouds)
 *   uMelodicDirection -> camera roll (subtle rotation)
 *   uChromaHue    -> nebula color shift
 *   uBass         -> depth throb, planet pulse
 *   uSectionType  -> jam=faster warp, space=near-still drift, solo=tunnel focus
 *   uVocalEnergy  -> brightens nebula inner glow
 *   uHarmonicTension -> nebula turbulence
 *   uMelodicPitch -> star color temperature shift
 *   uBeatStability -> streak uniformity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const spaceTravelVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const spaceTravelFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', flareEnabled: true, halationEnabled: true, caEnabled: true, bloomEnabled: true, bloomThresholdOffset: -0.1 })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ═══════════════════════════════════════════════════════════
// Hash functions for star field
// ═══════════════════════════════════════════════════════════

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// ═══════════════════════════════════════════════════════════
// Star layer: volumetric star field with depth and streaking
// ═══════════════════════════════════════════════════════════

vec3 starField(vec2 uv, float depth, float speed, float warpAmount, float flux,
               float beatPulse, float pitchTemp) {
  vec3 col = vec3(0.0);
  float cellSize = 0.08 + depth * 0.04;
  vec2 cell = floor(uv / cellSize);
  vec2 f = fract(uv / cellSize);

  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 neighbor = vec2(float(dx), float(dy));
      vec2 cellId = cell + neighbor;

      float h = hash21(cellId);
      float h2 = hash21(cellId + 100.0);
      float h3 = hash21(cellId + 200.0);

      // Star existence probability scaled by spectral flux
      float starProb = 0.3 + flux * 0.4;
      if (h > starProb) continue;

      vec2 starPos = vec2(h, h2);
      vec2 diff = f - starPos - neighbor;

      // Warp streaking: elongate stars in the radial direction from center
      vec2 radDir = normalize(uv + 0.001);
      float radComp = dot(diff, radDir);
      float perpComp = length(diff - radDir * radComp);

      // Streak length proportional to warp + distance from center
      float streakLen = 1.0 + warpAmount * (2.0 + length(uv) * 3.0);
      float streakDist = sqrt(perpComp * perpComp + (radComp / streakLen) * (radComp / streakLen));

      float size = 0.006 + h3 * 0.012;
      float brightness = smoothstep(size, size * 0.2, streakDist);

      // Twinkle
      float twinkle = 0.6 + 0.4 * sin(h * 100.0 + depth * 20.0 + speed * (0.5 + h2));
      brightness *= twinkle;

      // Beat pulse on stars
      brightness *= 1.0 + beatPulse * 0.6;

      // Star color: blueish-white with pitch temperature shift
      // Low pitch = warmer (amber), high pitch = cooler (blue-white)
      vec3 starColor = mix(
        vec3(1.0, 0.85, 0.7),   // warm
        vec3(0.7, 0.85, 1.0),   // cool
        0.5 + pitchTemp * 0.5
      );
      // Some stars are colored
      if (h3 > 0.7) {
        starColor = mix(starColor, hsv2rgb(vec3(h * 0.5 + 0.5, 0.6, 1.0)), 0.4);
      }

      col += starColor * brightness * (0.6 + depth * 0.4);
    }
  }

  return col;
}

// ═══════════════════════════════════════════════════════════
// Volumetric nebula: FBM noise clouds you fly through
// ═══════════════════════════════════════════════════════════

vec4 nebulaClouds(vec3 rayPos, vec3 rayDir, float nebulaTime, float density,
                  float turbulence, vec3 nebulaCol1, vec3 nebulaCol2, float vocalGlow) {
  vec4 acc = vec4(0.0);
  float stepSize = 0.25;
  int maxSteps = int(mix(12.0, 24.0, density));

  for (int i = 0; i < 24; i++) {
    if (i >= maxSteps) break;
    if (acc.a > 0.9) break;

    float t = float(i) * stepSize + 0.5;
    vec3 pos = rayPos + rayDir * t;

    // Slow drift through nebula field
    pos.z += nebulaTime;

    // FBM density with turbulence from harmonic tension
    float n = fbm(pos * 0.3 + turbulence * 0.2);
    n += fbm3(pos * 0.7 + 10.0) * 0.3;

    // Density threshold
    float d = smoothstep(-0.1 - density * 0.3, 0.4, n);

    // Distance falloff (nebula fades at extremes)
    float distFade = smoothstep(6.0, 2.0, t) * smoothstep(0.0, 1.0, t);
    d *= distFade;

    if (d > 0.01) {
      // Color varies with position and noise
      float colorMix = n * 0.5 + 0.5 + pos.x * 0.1;
      vec3 nebulaColor = mix(nebulaCol1, nebulaCol2, colorMix);

      // Inner glow from vocal energy
      nebulaColor *= 1.0 + vocalGlow * 0.4;

      // Emissive: nebulae glow from within
      float emissive = max(0.0, n) * 0.3;
      nebulaColor += nebulaColor * emissive;

      float alpha = d * stepSize * 2.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - acc.a);

      acc.rgb += nebulaColor * weight * 0.8;
      acc.a += weight;
    }
  }

  return acc;
}

// ═══════════════════════════════════════════════════════════
// Planet/asteroid silhouettes: SDF circles with noise displacement
// ═══════════════════════════════════════════════════════════

float planetSDF(vec2 uv, vec2 center, float radius, float noiseDisp) {
  float d = length(uv - center) - radius;
  // Noise displacement for rocky/organic shape
  float angle = atan(uv.y - center.y, uv.x - center.x);
  d += noiseDisp * sin(angle * 7.0 + center.x * 20.0) * 0.3 * radius;
  d += noiseDisp * sin(angle * 13.0 + center.y * 30.0) * 0.15 * radius;
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === CLAMP INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float drumBeat = clamp(uDrumBeat, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === SPEED: the heart of the experience ===
  // Quiet: gentle 0.05 drift. Peak: full 1.0 warp. MASSIVE range.
  float baseSpeed = mix(0.02, 1.0, energy * energy);
  baseSpeed *= mix(1.0, 1.8, sJam);       // jam: faster
  baseSpeed *= mix(1.0, 0.1, sSpace);      // space: near-still
  baseSpeed *= mix(1.0, 0.7, sSolo);       // solo: slightly slower, focused
  baseSpeed += onset * 0.8;                 // onset: sudden lurch
  baseSpeed += climaxBoost * 0.5;           // climax: extra push
  baseSpeed *= 1.0 + uEnergyTrend * 0.3;   // trend: building momentum

  // Warp factor: how much stars streak (0 = dots, 1 = full lines)
  float warpFactor = smoothstep(0.15, 0.8, energy) * mix(1.0, 1.5, sJam) * mix(1.0, 0.05, sSpace);
  warpFactor += onset * 0.5;
  warpFactor += climaxBoost * 0.4;
  warpFactor = clamp(warpFactor, 0.0, 2.0);

  // === TIME ===
  float travelTime = uDynamicTime * baseSpeed * 2.0;
  float slowTime = uDynamicTime * 0.1;

  // === CAMERA ROLL from melodic direction ===
  float rollAngle = melodicDir * 0.15 + sin(slowTime * 0.3) * 0.03;
  rollAngle *= mix(1.0, 0.2, sSpace); // minimal roll in space sections
  float cr = cos(rollAngle);
  float sr = sin(rollAngle);
  vec2 rolledP = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);

  // === SOLO TUNNEL FOCUS ===
  // During solos, vignette intensifies to create a tunnel effect
  float tunnelFocus = sSolo * 0.3;

  // === BEAT PULSE ===
  float bpFull = beatPulse(uMusicalTime);
  float bpHalf = beatPulseHalf(uMusicalTime);
  float beatP = bpFull * 0.5 + max(uBeat, drumBeat) * 0.5;

  // === DEEP SPACE BACKGROUND ===
  // Dark blue/purple void — never pure black
  vec3 skyBase = mix(
    vec3(0.005, 0.008, 0.025),   // deep indigo
    vec3(0.015, 0.01, 0.04),      // deep purple
    0.5 + 0.5 * sin(slowTime * 0.2 + p.x * 0.5)
  );
  // Energy lifts the void slightly
  skyBase *= 1.0 + energy * 0.3;
  vec3 col = skyBase;

  // === STAR FIELD: multiple depth layers ===
  // Each layer at different depth = parallax. Forward motion via time offset.
  {
    // Far stars: small, dense, slow parallax
    vec2 farUV = rolledP * 6.0 + vec2(0.0, travelTime * 0.3);
    col += starField(farUV, 0.2, travelTime * 0.3, warpFactor * 0.3, flux, beatP * 0.3, melodicPitch) * 0.25;

    // Mid stars: medium density
    vec2 midUV = rolledP * 3.0 + vec2(0.0, travelTime * 0.7);
    col += starField(midUV, 0.5, travelTime * 0.7, warpFactor * 0.7, flux, beatP * 0.6, melodicPitch) * 0.5;

    // Near stars: large, bright, fast parallax, strong streaking
    vec2 nearUV = rolledP * 1.5 + vec2(0.0, travelTime * 1.2);
    col += starField(nearUV, 1.0, travelTime * 1.2, warpFactor, flux, beatP, melodicPitch) * 0.8;
  }

  // === RADIAL WARP STREAKS: high energy only ===
  // At full warp, additional radial streaks emanate from center
  if (warpFactor > 0.3) {
    float radialDist = length(rolledP);
    float streakAngle = atan(rolledP.y, rolledP.x);

    // Hash-based streak pattern
    float streakPattern = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float freq = 30.0 + fi * 17.0;
      float phase = travelTime * (2.0 + fi * 0.5) + fi * 100.0;
      float streak = pow(abs(sin(streakAngle * freq + phase)), 80.0);
      streak *= smoothstep(0.0, 0.3, radialDist) * smoothstep(1.2, 0.4, radialDist);
      streakPattern += streak * (1.0 - fi * 0.25);
    }

    float streakBrightness = (warpFactor - 0.3) * 1.4;
    streakBrightness *= 1.0 + beatP * 0.4;
    vec3 streakColor = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.9, 0.8), radialDist);
    col += streakColor * streakPattern * streakBrightness * 0.15;
  }

  // === SPEED LINES: motion blur effect at high speed ===
  if (warpFactor > 0.5) {
    float speedLineNoise = snoise(vec3(rolledP * 20.0, travelTime * 0.5));
    float speedLines = pow(max(0.0, speedLineNoise), 3.0);
    speedLines *= (warpFactor - 0.5) * 2.0;
    speedLines *= smoothstep(0.0, 0.2, length(rolledP));
    col += vec3(0.5, 0.6, 0.8) * speedLines * 0.12;
  }

  // === NEBULA CLOUDS: volumetric FBM noise you fly through ===
  {
    // Nebula colors from palette + chromaHue
    float hue1 = uPalettePrimary + chromaH * 0.15;
    float hue2 = uPaletteSecondary + chromaH * 0.1;
    float sat = mix(0.5, 0.9, slowE) * uPaletteSaturation;

    vec3 nebCol1 = hsv2rgb(vec3(hue1, sat, 0.8));
    vec3 nebCol2 = hsv2rgb(vec3(hue2, sat * 0.8, 0.6));

    // Mix in cosmic purple/blue
    nebCol1 = mix(nebCol1, vec3(0.2, 0.1, 0.5), 0.2);
    nebCol2 = mix(nebCol2, vec3(0.05, 0.2, 0.4), 0.25);

    // Ray setup: looking forward with slight camera roll
    vec3 rayDir = normalize(vec3(rolledP.x, rolledP.y, -1.5));
    vec3 rayPos = vec3(sin(slowTime * 0.1) * 0.5, cos(slowTime * 0.07) * 0.3, 0.0);

    float nebulaTime = travelTime * 0.4;
    float nebDensity = flatness * 0.7 + 0.15; // flatness drives nebula thickness
    nebDensity *= mix(1.0, 0.3, sSpace);       // less nebula in space sections
    nebDensity *= mix(1.0, 1.5, sJam);         // more nebula in jams
    float nebTurb = tension * 0.5 + onset * 0.3;

    vec4 nebula = nebulaClouds(rayPos, rayDir, nebulaTime, nebDensity,
                                nebTurb, nebCol1, nebCol2, vocalE);

    // Additive blend: nebula glows over star field
    col += nebula.rgb * (0.6 + energy * 0.5 + climaxBoost * 0.3);

    // Dim stars behind thick nebula
    col = mix(col, nebula.rgb + skyBase, nebula.a * 0.3);
  }

  // === PLANET / ASTEROID SILHOUETTES ===
  // Occasionally drift past — position derived from time so they scroll through
  {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float planetSeed = fi * 137.5 + 42.0;
      float planetCycleTime = slowTime * (0.03 + fi * 0.015);

      // Planet position cycles across the viewport
      float px = sin(planetCycleTime + planetSeed) * 0.8;
      float py = cos(planetCycleTime * 0.7 + planetSeed * 2.0) * 0.5;
      vec2 planetCenter = vec2(px, py);

      // Only render if planet is near viewport (performance)
      float distToCenter = length(rolledP - planetCenter);
      if (distToCenter > 0.6) continue;

      float planetRadius = 0.04 + hash21(vec2(planetSeed)) * 0.08;
      float noiseDisp = 0.3 + hash21(vec2(planetSeed + 50.0)) * 0.4;

      float d = planetSDF(rolledP, planetCenter, planetRadius, noiseDisp);

      // Dark silhouette with rim lighting
      float silhouette = smoothstep(0.002, -0.002, d);
      float rim = smoothstep(0.015, 0.0, abs(d)) * 0.8;

      // Rim color from nebula palette
      vec3 rimColor = hsv2rgb(vec3(uPalettePrimary + fi * 0.1, 0.6, 0.8));

      // Planet darkens what's behind it
      col *= 1.0 - silhouette * 0.85;
      // Rim glow
      col += rimColor * rim * (0.4 + energy * 0.3);

      // Bass pulse on planet rim
      col += rimColor * rim * bass * 0.3;
    }
  }

  // === CENTRAL WARP TUNNEL: solo/climax focused effect ===
  {
    float tunnelGate = max(sSolo * 0.6, climaxBoost * 0.4);
    if (tunnelGate > 0.01) {
      float radDist = length(rolledP);
      float tunnelRing = smoothstep(0.5, 0.2, radDist) * smoothstep(0.0, 0.1, radDist);
      float tunnelPulse = sin(radDist * 20.0 - travelTime * 8.0) * 0.5 + 0.5;
      tunnelPulse = pow(tunnelPulse, 3.0);

      vec3 tunnelColor = hsv2rgb(vec3(chromaH + radDist * 0.2, 0.7, 0.9));
      col += tunnelColor * tunnelRing * tunnelPulse * tunnelGate * 0.25;
    }
  }

  // === STARGATE FLASH: onset triggers a brief blinding flash from center ===
  if (onset > 0.7) {
    float flashDist = length(rolledP);
    float flash = smoothstep(0.8, 0.0, flashDist) * (onset - 0.7) * 3.3;
    flash *= 1.0 + climaxBoost;
    col += vec3(0.8, 0.85, 1.0) * flash * 0.4;
  }

  // === COSMIC DUST PARTICLES: tiny fast-moving specks ===
  {
    float dustTime = travelTime * 3.0;
    vec2 dustUV = rolledP * 50.0 + vec2(sin(dustTime * 0.1), dustTime);
    vec2 dustCell = floor(dustUV);
    vec2 dustF = fract(dustUV);
    float dustH = hash21(dustCell);
    if (dustH > 0.85) {
      vec2 dustPos = vec2(fract(dustH * 7.13), fract(dustH * 13.17));
      float dustDist = length(dustF - dustPos);
      float dustBright = smoothstep(0.03, 0.005, dustDist) * 0.3;
      dustBright *= 1.0 + energy * 0.5;
      col += vec3(0.7, 0.8, 1.0) * dustBright;
    }
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(rolledP * 2.0, slowTime));
    vec3 iconCol1 = hsv2rgb(vec3(uPalettePrimary, 0.7 * uPaletteSaturation, 0.9));
    vec3 iconCol2 = hsv2rgb(vec3(uPaletteSecondary, 0.6 * uPaletteSaturation, 0.8));

    col += iconEmergence(rolledP, uTime, energy, bass, iconCol1, iconCol2, nf, climaxPhase, uSectionIndex) * 0.6;
    col += heroIconEmergence(rolledP, uTime, energy, bass, iconCol1, iconCol2, nf, uSectionIndex);
  }

  // === DEPTH FOG: subtle blue haze at edges for infinite depth feel ===
  {
    float fogDist = length(rolledP);
    float fog = smoothstep(0.3, 1.2, fogDist) * 0.15;
    fog *= mix(1.0, 0.5, energy); // less fog at high energy (clearer view)
    vec3 fogColor = vec3(0.05, 0.08, 0.15);
    col = mix(col, fogColor, fog);
  }

  // === VIGNETTE: tunnel focus during solos, wider during space ===
  {
    float vigScale = mix(0.25, 0.35, tunnelFocus);
    vigScale = mix(vigScale, 0.18, sSpace); // wider view in space
    float vignette = 1.0 - dot(rolledP * vigScale, rolledP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    col = mix(vec3(0.01, 0.005, 0.02), col, vignette);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
