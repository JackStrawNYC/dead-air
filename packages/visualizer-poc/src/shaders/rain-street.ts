/**
 * Rain Street — wet city street at night, noir cinematic atmosphere.
 * Rain streaks fall as animated vertical lines. Puddles reflect colored
 * neon-like light. Fog at ground level. Street lamp glow with bloom.
 *
 * Designed for melancholic, contemplative songs (Wharf Rat, Black Muddy River).
 * MASSIVE dynamic range: gentle drizzle -> driving rain.
 *
 * Audio reactivity:
 *   uEnergy     -> rain intensity, puddle activity, lamp brightness
 *   uBeat/uOnset -> puddle ripple bursts (expanding circles)
 *   uBass       -> ground-level fog pulse, deep puddle reflections
 *   uChromaHue  -> reflected neon color shifts
 *   uStemVocalRms -> fog density at ground level
 *   uFlatness   -> rain streak density (noisy=more rain)
 *   uSlowEnergy -> overall ambient light, reflection clarity
 *   uOnsetSnap  -> splash highlights, bright droplet flashes
 *   uPalettePrimary   -> dominant neon reflection color
 *   uPaletteSecondary -> secondary reflection / lamp color
 *   uSectionType -> jam=driving rain, space=just puddle reflections, solo=spotlight from lamp
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const rainStreetVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const rainStreetFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'heavy', bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Rain streak: animated vertical falling line ---
float rainStreak(vec2 uv, float seed, float time, float speed) {
  float h1 = fract(sin(seed * 127.1) * 43758.5453);
  float h2 = fract(sin(seed * 311.7) * 43758.5453);
  float h3 = fract(sin(seed * 543.3) * 43758.5453);

  float x = h1;
  float fallSpeed = speed * (0.7 + h2 * 0.6);
  float y = fract(h3 + time * fallSpeed);

  // Streak shape: very thin vertical line
  float dx = abs(uv.x - x);
  float dy = uv.y - (1.0 - y);

  float streakLen = 0.03 + h2 * 0.04;
  float inStreak = step(0.0, dy) * step(dy, streakLen);
  float thin = smoothstep(0.002, 0.0005, dx);

  return thin * inStreak * (0.5 + h3 * 0.5);
}

// --- Puddle ripple: expanding concentric circle ---
float puddleRipple(vec2 uv, vec2 center, float time, float birth) {
  float age = time - birth;
  if (age < 0.0 || age > 2.0) return 0.0;

  float dist = length(uv - center);
  float radius = age * 0.15;
  float ring = smoothstep(0.008, 0.0, abs(dist - radius) - 0.003);
  float fade = smoothstep(2.0, 0.0, age);

  return ring * fade;
}

// --- Street lamp glow ---
vec3 lampGlow(vec2 p, vec2 lampPos, vec3 lampColor, float intensity) {
  float dist = length(p - lampPos);
  // Soft circular glow with inverse-square falloff
  float glow = intensity / (1.0 + dist * dist * 25.0);
  // Bloom halo: wider, dimmer
  float halo = intensity * 0.3 / (1.0 + dist * dist * 6.0);
  return lampColor * (glow + halo);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float vocalRms = clamp(uVocalEnergy, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === Audio parameters ===
  float tensionTurb = uHarmonicTension * 0.15;
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float bp = beatPulse(uMusicalTime);
  float bpH = beatPulseHalf(uMusicalTime);

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  float slowTime = uDynamicTime * 0.12;

  // --- Domain warping + detail ---
  vec2 warpedP = p + vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // === RAIN INTENSITY: massive dynamic range ===
  float rainIntensity = mix(0.05, 1.0, energy);
  rainIntensity *= mix(1.0, 1.5, sJam) * mix(1.0, 0.05, sSpace) * mix(1.0, 0.7, sSolo);
  rainIntensity += flatness * 0.2;
  rainIntensity += climaxBoost * 0.3;
  rainIntensity = clamp(rainIntensity, 0.0, 1.5);

  // === NEON COLORS from palette + chroma shift ===
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.7, 1.0, slowE) * uPaletteSaturation;

  vec3 neonColor1 = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 neonColor2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.85));
  // Ensure cinematic neon tones
  neonColor1 = mix(neonColor1, vec3(0.9, 0.2, 0.5), 0.2);  // magenta hint
  neonColor2 = mix(neonColor2, vec3(0.2, 0.5, 0.9), 0.2);  // cyan hint

  float energyFreq = 1.0 + energy * 0.5;

  // === SKY: dark overcast night — domain-warped clouds for richness ===
  vec3 skyColor = mix(
    vec3(0.02, 0.02, 0.035),
    vec3(0.04, 0.035, 0.05),
    smoothstep(0.0, 0.5, uv.y)
  );
  // Palette-tinted sky undertone
  skyColor = mix(skyColor, hsv2rgb(vec3(uPaletteSecondary + chromaH * 0.05, 0.1, 0.03)), 0.15);
  // Domain-warped cloud texture (fbm6 for rich detail)
  vec3 cloudWarpPos = vec3(p.x * 0.5, p.y * 0.3, slowTime * 0.03);
  float cloudWarp = fbm3(cloudWarpPos) * 0.3;
  float clouds = fbm6(vec3(p.x * 1.5 * energyFreq + cloudWarp, p.y * 0.8 + slowTime * 0.05, slowTime * 0.1));
  skyColor += vec3(0.015) * smoothstep(-0.1, 0.3, clouds) * smoothstep(0.2, 0.5, uv.y);
  // Secondary cloud layer for depth (30%)
  float cloudLayer2 = fbm3(vec3(p.x * 0.8 - slowTime * 0.02, p.y * 0.5 + 5.0, slowTime * 0.08));
  skyColor += vec3(0.01, 0.008, 0.012) * smoothstep(0.0, 0.4, cloudLayer2) * smoothstep(0.3, 0.6, uv.y) * 0.3;

  vec3 col = skyColor;

  // === STREET HORIZON ===
  float horizonY = -0.05;
  float isStreet = smoothstep(horizonY + 0.03, horizonY - 0.02, p.y);

  // === BUILDINGS: silhouette skyline ===
  float buildingH = 0.15 + 0.2 * step(0.5, fract(p.x * 3.0 + 0.2))
                   + 0.12 * step(0.6, fract(p.x * 5.0 + 0.7))
                   + 0.08 * snoise(vec3(floor(p.x * 4.0), 0.0, 3.0));
  float buildingMask = step(p.y, horizonY + buildingH) * step(horizonY, p.y);
  // Windows: scattered lit rectangles
  vec2 winGrid = fract(vec2(p.x * 20.0, (p.y - horizonY) * 30.0));
  float hasWindow = step(0.7, fract(sin(dot(floor(vec2(p.x * 20.0, (p.y - horizonY) * 30.0)), vec2(127.1, 311.7))) * 43758.5453));
  float winLight = step(0.3, winGrid.x) * step(winGrid.x, 0.7) * step(0.3, winGrid.y) * step(winGrid.y, 0.7) * hasWindow;
  vec3 buildingCol = vec3(0.01, 0.01, 0.015);
  buildingCol += mix(neonColor1, neonColor2, fract(p.x * 3.0)) * winLight * 0.15;
  col = mix(col, buildingCol, buildingMask);

  // === STREET LAMPS ===
  vec2 lamp1Pos = vec2(-0.35, horizonY + 0.25);
  vec2 lamp2Pos = vec2(0.45, horizonY + 0.22);
  vec3 lampColor1 = vec3(1.0, 0.85, 0.5); // warm sodium
  vec3 lampColor2 = mix(neonColor2, vec3(0.9, 0.9, 1.0), 0.5); // cool white-blue

  float lampIntensity = mix(0.15, 0.4, slowE) + sSolo * 0.25;
  lampIntensity += climaxBoost * 0.1;

  col += lampGlow(p, lamp1Pos, lampColor1, lampIntensity);
  col += lampGlow(p, lamp2Pos, lampColor2, lampIntensity * 0.7);

  // Lamp pole silhouettes
  float pole1 = smoothstep(0.008, 0.003, abs(p.x - lamp1Pos.x)) * step(horizonY, p.y) * step(p.y, lamp1Pos.y);
  float pole2 = smoothstep(0.008, 0.003, abs(p.x - lamp2Pos.x)) * step(horizonY, p.y) * step(p.y, lamp2Pos.y);
  col = mix(col, vec3(0.01), max(pole1, pole2));

  // === WET STREET SURFACE ===
  vec3 streetColor = vec3(0.015, 0.015, 0.02);

  // Puddle areas: irregular shapes on the street
  float puddleNoise = snoise(vec3(p.x * 4.0, p.y * 6.0, 2.5));
  float puddleArea = smoothstep(0.1, 0.3, puddleNoise) * isStreet;

  // Puddle reflections: mirror the scene above with domain-warped distortion
  vec2 reflUV = vec2(p.x, -p.y + 2.0 * horizonY);
  // Multi-frequency ripple distortion for shimmer
  float reflDistort = snoise(vec3(reflUV * 5.0 * energyFreq, uDynamicTime * 0.5)) * 0.02;
  float reflDistort2 = snoise(vec3(reflUV * 12.0 * energyFreq, uDynamicTime * 0.8 + 3.0)) * 0.008;
  reflUV += reflDistort + reflDistort2;
  // Rain impact shimmer: high-frequency ripple breakup
  float shimmer = snoise(vec3(p * 20.0 * energyFreq, uDynamicTime * 2.0)) * 0.004 * energy;
  reflUV += shimmer;

  // Reflected lamp glow in puddles
  vec3 puddleRefl = vec3(0.0);
  puddleRefl += lampGlow(reflUV, lamp1Pos, lampColor1, lampIntensity * 0.5);
  puddleRefl += lampGlow(reflUV, lamp2Pos, lampColor2, lampIntensity * 0.35);

  // Neon reflections in wet surface — both palette colors
  float neonRefl1 = smoothstep(0.5, 0.0, length(reflUV - vec2(-0.2, 0.15)));
  float neonRefl2 = smoothstep(0.5, 0.0, length(reflUV - vec2(0.3, 0.2)));
  puddleRefl += neonColor1 * neonRefl1 * 0.15 * slowE;
  puddleRefl += neonColor2 * neonRefl2 * 0.12 * slowE;

  // === SHIMMER HIGHLIGHT LAYER: specular rain-on-surface sparkle (30%) ===
  float shimmerNoise = snoise(vec3(p * 30.0 * energyFreq, uDynamicTime * 1.5));
  float shimmerSparkle = pow(max(0.0, shimmerNoise), 6.0) * energy;
  vec3 shimmerColor = mix(neonColor1, neonColor2, snoise(vec3(p * 5.0, uDynamicTime * 0.3)) * 0.5 + 0.5);
  puddleRefl += shimmerColor * shimmerSparkle * 0.3;

  // Wet surface: mix of dark street + reflections
  float wetness = mix(0.2, 0.6, energy) + puddleArea * 0.3;
  vec3 wetStreet = mix(streetColor, puddleRefl, wetness);

  // === PUDDLE RIPPLES from beat/onset ===
  float rippleTotal = 0.0;
  for (int i = 0; i < 12; i++) {
    float seed = float(i) * 13.37;
    float rh1 = fract(sin(seed * 127.1) * 43758.5453);
    float rh2 = fract(sin(seed * 311.7) * 43758.5453);
    float rh3 = fract(sin(seed * 543.3) * 43758.5453);

    vec2 rippleCenter = vec2(
      (rh1 - 0.5) * aspect.x * 0.8,
      horizonY - 0.05 - rh2 * 0.3
    );

    // Ripples triggered periodically, more frequent with energy
    float ripplePeriod = mix(3.0, 0.8, energy);
    float rippleBirth = floor(uDynamicTime / ripplePeriod + rh3 * ripplePeriod) * ripplePeriod;
    rippleTotal += puddleRipple(p, rippleCenter, uDynamicTime, rippleBirth);
  }

  // Beat-triggered splash ripples
  float beatRipple = puddleRipple(p, vec2(0.0, horizonY - 0.15), uDynamicTime,
    floor(uMusicalTime) / max(uTempo / 60.0, 0.5));
  rippleTotal += beatRipple * max(bp, uBeatSnap) * 2.0;

  // Ripples add bright highlights to puddles
  wetStreet += vec3(0.15, 0.12, 0.1) * rippleTotal * puddleArea;
  // Ripples also distort reflections (already handled by noise)

  col = mix(col, wetStreet, isStreet);

  // === RAIN STREAKS ===
  float rainSpeed = mix(0.8, 2.5, rainIntensity);
  float rainCount = mix(30.0, 150.0, rainIntensity);
  float rainTotal = 0.0;

  for (int i = 0; i < 150; i++) {
    if (float(i) >= rainCount) break;
    rainTotal += rainStreak(uv, float(i) * 3.17 + 0.5, uDynamicTime, rainSpeed);
  }

  // Rain color: slightly blue-white, catches lamp light
  vec3 rainColor = vec3(0.5, 0.55, 0.65);
  // Nearest lamp tints the rain
  float lampDist1 = length(p - lamp1Pos);
  float lampDist2 = length(p - lamp2Pos);
  rainColor += lampColor1 * 0.2 / (1.0 + lampDist1 * lampDist1 * 10.0);
  rainColor += lampColor2 * 0.15 / (1.0 + lampDist2 * lampDist2 * 10.0);

  col += rainColor * rainTotal * mix(0.08, 0.25, rainIntensity);

  // === GROUND FOG from vocal presence + bass ===
  float fogAmount = vocalRms * 0.3 + bass * 0.15 + 0.05;
  fogAmount *= mix(1.0, 0.3, sSpace);
  float fogHeight = smoothstep(horizonY - 0.15, horizonY + 0.08, p.y) * smoothstep(horizonY + 0.15, horizonY + 0.03, p.y);
  float fogNoise = fbm6(vec3(p.x * 2.0 * detailMod + slowTime * 0.3, p.y * 3.0, slowTime * 0.15));
  float fog = fogHeight * (0.3 + 0.7 * smoothstep(-0.2, 0.3, fogNoise)) * fogAmount;

  // Fog picks up nearby light colors
  vec3 fogColor = mix(vec3(0.06, 0.06, 0.08), lampColor1 * 0.15 + neonColor1 * 0.05, slowE);
  col = mix(col, fogColor, fog);

  // === ONSET SPLASH: bright flash on street surface ===
  float splash = onset * energy;
  col += vec3(0.1, 0.08, 0.06) * splash * isStreet;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm6(vec3(p * 2.0, slowTime));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, neonColor1, neonColor2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight * 0.5;
  }

  // --- Secondary visual layer: wet neon reflection shimmer (30% blend) ---
  float refShimmer = fbm3(vec3(warpedP * 5.0 * detailMod, uDynamicTime * 0.2));
  vec3 refCol = mix(neonColor1, neonColor2, refShimmer * 0.5 + 0.5) * 0.06;
  float refMask = isStreet * energy;
  col += refCol * refMask * 0.3;

  // === VIGNETTE: strong noir vignette ===
  float vigScale = mix(0.40, 0.28, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.005, 0.01), col, vignette);

  // === DARKNESS TEXTURE ===
  col += darknessTexture(uv, uTime, energy);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
