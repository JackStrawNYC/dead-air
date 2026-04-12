/**
 * Warm Nebula — raymarched volumetric warm-toned stellar nursery.
 * Amber/gold/rose palette, dense cloud structure, embedded proto-star
 * formation cores, dust filaments. Full 3D volumetric with proper
 * emission/absorption, ambient occlusion, Fresnel glow on dense cores.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> cloud density and brightness
 *   uBass            -> cloud pulse breathing
 *   uHighs           -> dust sparkle intensity
 *   uMids            -> mid-layer cloud brightness
 *   uOnsetSnap       -> warm flash
 *   uSlowEnergy      -> drift speed + center glow
 *   uBeatSnap        -> core pulse sync
 *   uMelodicPitch    -> vertical cloud offset
 *   uMelodicDirection -> drift direction
 *   uHarmonicTension -> filament complexity
 *   uBeatStability   -> cloud form stability
 *   uChromaHue       -> hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> full luminosity
 *   uVocalEnergy     -> inner core warmth
 *   uCoherence       -> cloud coherence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const warmNebulaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const warmNebulaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ---- Proto-star core SDF ----
float wnCoreDistance(vec3 pos, vec3 center, float radius) {
  return length(pos - center) - radius;
}

// ---- Dust filament density ----
float wnFilamentDensity(vec3 pos, float time, float tension) {
  // Ridged noise creates sharp filament structures
  float filament = ridged4(pos * 0.8 + vec3(time * 0.03, 0.0, time * 0.02));
  // Higher tension = more complex filaments
  filament += ridged4(pos * 1.5 + vec3(0.0, time * 0.02, 0.0)) * tension * 0.5;
  // Threshold to create discrete filaments
  return smoothstep(0.4, 0.8, filament);
}

// ---- Nebula cloud density at a 3D point ----
float wnCloudDensity(vec3 pos, float time, float bass, float energy, float tension,
                      float coherenceWarp) {
  // Broad structure
  float broad = fbm3(pos * 0.3 + vec3(time * 0.02, 0.0, time * 0.015));
  // Fine detail (energy-responsive)
  float detail = fbm6(pos * 0.8 + vec3(0.0, time * 0.03, 0.0)) * (0.5 + energy * 0.5);
  // Combine
  float density = broad * 0.6 + detail * 0.4;

  // Bass breathing
  density *= 1.0 + bass * 0.15 * sin(length(pos) * 0.5 + time * 1.0);

  // Coherence warp: low coherence = more turbulent
  float turbulence = snoise(vec3(pos * 1.5 + vec2(time * 0.04, 0.0).xyy)) * coherenceWarp;
  density += turbulence * 0.15;

  // Filaments add structure
  float filaments = wnFilamentDensity(pos, time, tension);
  density = mix(density, density + filaments * 0.3, 0.5);

  return density;
}

// ---- Star field for background ----
float wnStarField(vec3 rd) {
  vec3 cell = floor(rd * 60.0);
  vec3 fr = fract(rd * 60.0) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float star = step(0.9, h);
  float dist = length(fr);
  return star * smoothstep(0.06, 0.01, dist) * h;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio clamping ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.10 * chordConf;
  float vocalGlow = uVocalEnergy * 0.12;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.01;

  // ---- Section modulation ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionDrift = mix(1.0, 1.35, sJam) * mix(1.0, 0.12, sSpace);
  float sectionBright = mix(1.0, 1.0, sJam) * mix(1.0, 0.75, sSpace) * mix(1.0, 1.25, sChorus) * mix(1.0, 1.15, sSolo);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.1, 0.75, e2) * uPaletteSaturation;

  // Warm base hues
  float amberHue = 0.097;
  float copperHue = 0.069;
  float roseHue = 0.958;

  vec3 warmAmber = safeBlendHue(amberHue, hue1, 0.4, sat * 0.9, 1.0);
  vec3 warmCopper = safeBlendHue(copperHue, hue2, 0.35, sat * 0.85, 0.9);
  vec3 warmRose = safeBlendHue(roseHue, hue1 + 0.15, 0.3, sat * 0.7, 0.85);

  // ---- Coherence warp factor ----
  float coherenceWarp = coherence > 0.7 ? mix(1.0, 0.3, (coherence - 0.7) / 0.3)
                      : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                      : 1.0;

  // ---- Camera ----
  float driftTime = slowTime * sectionDrift;
  vec3 rayOrig = vec3(
    sin(driftTime * 0.2) * 3.0 + melodicDir * 0.5,
    melodicPitch * 1.5 - 0.5 + sin(driftTime * 0.15) * 0.5,
    cos(driftTime * 0.18) * 3.0 - 6.0
  );
  vec3 camLookAt = vec3(sin(driftTime * 0.08) * 1.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(55.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background: warm dark void ----
  vec3 col = vec3(0.004, 0.002, 0.001);

  // Background stars
  float bgStars = wnStarField(rayDir);
  col += vec3(0.9, 0.85, 0.7) * bgStars * 0.2;

  // ---- Proto-star cores (3 formation sites) ----
  vec3 corePositions[3];
  corePositions[0] = vec3(0.0, 0.0, 0.0);
  corePositions[1] = vec3(2.5, 1.0, 3.0);
  corePositions[2] = vec3(-1.5, -0.8, 2.0);

  float coreRadii[3];
  coreRadii[0] = 0.3 + bass * 0.1;
  coreRadii[1] = 0.2 + effectiveBeat * 0.05;
  coreRadii[2] = 0.25;

  // ---- Volumetric nebula raymarch ----
  int volumeSteps = int(mix(32.0, 60.0, energy));
  float stepSize = 0.15;
  vec3 nebulaAccum = vec3(0.0);
  float nebulaAlpha = 0.0;

  for (int i = 0; i < 60; i++) {
    if (i >= volumeSteps) break;
    if (nebulaAlpha > 0.95) break;
    float fi = float(i);
    float marchT = 0.5 + fi * stepSize;
    vec3 samplePos = rayOrig + rayDir * marchT;

    // Cloud density
    float density = wnCloudDensity(samplePos, driftTime, bass, energy, tension, coherenceWarp);

    // Density modulation
    density *= 0.6 + e2 * 0.4;
    density *= sectionBright;
    density += climaxBoost * 0.05;
    density *= 0.06;

    if (density > 0.001) {
      float alpha = density * (1.0 - nebulaAlpha);

      // Color varies with position and density
      float colorPhase = fbm3(samplePos * 0.4 + vec3(driftTime * 0.05, 0.0, 0.0));
      vec3 cloudColor;
      if (colorPhase < 0.33) {
        cloudColor = mix(warmAmber, warmCopper, colorPhase * 3.0);
      } else if (colorPhase < 0.66) {
        cloudColor = mix(warmCopper, warmRose, (colorPhase - 0.33) * 3.0);
      } else {
        cloudColor = mix(warmRose, warmAmber, (colorPhase - 0.66) * 3.0);
      }

      // Self-illumination from dense regions
      cloudColor *= 1.0 + density * 12.0 * energy;

      // Mids boost mid-depth layers
      float midDepth = smoothstep(2.0, 5.0, marchT) * smoothstep(8.0, 5.0, marchT);
      cloudColor *= 1.0 + mids * midDepth * 0.3;

      // Proto-star core proximity glow
      for (int c = 0; c < 3; c++) {
        float coreDist = length(samplePos - corePositions[c]);
        float coreGlow = exp(-coreDist * coreDist / (coreRadii[c] * coreRadii[c] * 4.0));
        vec3 coreColor = mix(warmAmber * 2.0, vec3(1.0, 0.95, 0.85), coreGlow);
        cloudColor += coreColor * coreGlow * (0.3 + e2 * 0.7 + vocalGlow);
      }

      // Depth coloring: warmer near, cooler far
      cloudColor = mix(cloudColor, cloudColor * vec3(0.85, 0.8, 0.9), fi / float(volumeSteps) * 0.3);

      // Onset flash
      cloudColor *= 1.0 + onset * 0.5 * exp(-fi * 0.05);

      nebulaAccum += cloudColor * alpha;
      nebulaAlpha += alpha;
    }

    // ---- Dust sparkle (highs) ----
    float dustNoise = snoise(vec3(samplePos * 12.0 + driftTime * 0.3));
    float dustSparkle = smoothstep(0.85, 0.95, dustNoise) * highs * 0.015 * e2;
    if (dustSparkle > 0.001) {
      vec3 dustColor = mix(warmAmber * 1.5, vec3(1.0, 0.95, 0.85), 0.5);
      nebulaAccum += dustColor * dustSparkle * (1.0 - nebulaAlpha);
    }
  }

  // Blend nebula over background
  col = mix(col, nebulaAccum, nebulaAlpha);
  col += nebulaAccum * (1.0 - nebulaAlpha) * 0.2; // emission bleeds into background

  // ---- Proto-star core rendering (bright points) ----
  for (int c = 0; c < 3; c++) {
    vec3 toCore = corePositions[c] - rayOrig;
    float projDist = dot(toCore, rayDir);
    if (projDist < 0.0) continue;
    vec3 projPoint = rayOrig + rayDir * projDist;
    float screenDist = length(corePositions[c] - projPoint);
    float corePoint = exp(-screenDist * screenDist * 50.0) * (0.2 + e2 * 0.8);
    float coreHalo = exp(-screenDist * screenDist * 5.0) * 0.15;
    vec3 coreCol = warmAmber * 2.0;
    col += coreCol * (corePoint + coreHalo) * (1.0 + effectiveBeat * 0.3 + vocalGlow);
  }

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.4;

  // ---- SDF icon emergence ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Atmospheric depth ----
  float fogNoise_ad = fbm3(vec3(screenP * 0.5, uDynamicTime * 0.012));
  float fogDensity_ad = mix(0.3, 0.02, energy);
  vec3 fogColor_ad = vec3(0.008, 0.005, 0.003);
  col = mix(col, fogColor_ad, fogDensity_ad * (0.5 + fogNoise_ad * 0.5));

  // ---- Vignette ----
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.002, 0.001), col, vignette);

  // ---- Post-processing (includes temporal blend) ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
