/**
 * River — 3D water surface shaders for React Three Fiber geometry scene.
 *
 * Vertex shader: sine wave layers + FBM noise displacement for rolling water.
 * Fragment shader: reflective blue-green with Fresnel effect, foam at crests,
 * palette-driven tint, and post-processing.
 *
 * Audio reactivity (via uniforms):
 *   uEnergy     -> wave height, flow speed, foam density
 *   uBass       -> low-frequency swell amplitude
 *   uOnsetSnap  -> splash ripple rings
 *   uHighs      -> surface sparkle intensity
 *   uVocalEnergy -> mist factor fed to fragment
 *   uChromaHue  -> water color temperature shift
 *   uHarmonicTension -> choppiness / cross-wave turbulence
 *   uBeatStability -> tightens wave patterns
 *   uSlowEnergy -> ambient drift
 *   uPalettePrimary   -> deep water hue
 *   uPaletteSecondary -> sky/reflection hue
 *   uSectionType -> jam=faster, space=still, solo=focused rapids
 *   uMelodicPitch -> reflection brightness
 */

import { noiseGLSL } from "./noise";

export const riverWaterVert = /* glsl */ `
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uOnsetSnap;
uniform float uSlowEnergy;
uniform float uHarmonicTension;
uniform float uBeatStability;
uniform float uSectionType;
uniform float uMelodicDirection;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDisplacement;
varying float vFoamFactor;

${noiseGLSL}

void main() {
  vUv = uv;

  vec3 pos = position;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);

  // Section type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float flowSpeed = mix(0.3, 1.5, energy * energy);
  flowSpeed *= mix(1.0, 1.6, sJam);
  flowSpeed *= mix(1.0, 0.15, sSpace);
  flowSpeed *= mix(1.0, 1.3, sSolo);

  float t = uDynamicTime * flowSpeed;

  // === Layer 1: Large rolling swells (bass-driven) ===
  float swellAmp = mix(0.15, 0.8, bass) * mix(0.5, 1.0, energy);
  swellAmp *= mix(1.0, 0.1, sSpace); // calm in space
  float swell = sin(pos.x * 0.3 + t * 0.4) * sin(pos.z * 0.2 - t * 0.6) * swellAmp;
  swell += sin(pos.x * 0.15 - t * 0.25 + 1.7) * cos(pos.z * 0.1 - t * 0.35) * swellAmp * 0.6;

  // === Layer 2: Mid-frequency waves (energy-driven) ===
  float midWaveAmp = mix(0.05, 0.35, energy);
  float midWave = sin(pos.x * 1.2 + t * 1.5 + 3.1) * sin(pos.z * 0.8 - t * 2.0) * midWaveAmp;
  midWave += sin(pos.x * 0.7 - pos.z * 1.5 + t * 1.8) * midWaveAmp * 0.4;

  // === Layer 3: FBM noise displacement for natural texture ===
  vec3 noisePos = vec3(pos.x * 0.08, pos.z * 0.08 - t * 0.15, uTime * 0.1);
  float fbmDisp = fbm(noisePos) * mix(0.1, 0.5, energy);
  // Finer detail layer
  float fbmFine = fbm(noisePos * 3.0 + vec3(17.0, 0.0, 5.0)) * mix(0.02, 0.15, energy);

  // === Layer 4: Onset splash ripples ===
  float onsetRipple = 0.0;
  if (onset > 0.1) {
    float dist = length(pos.xz);
    onsetRipple = sin(dist * 2.0 - uTime * 8.0) * onset * 0.3 * smoothstep(20.0, 0.0, dist);
  }

  // === Layer 5: Harmonic tension cross-chop ===
  float chop = sin(pos.x * 2.5 + pos.z * 2.5 + t * 3.0) * tension * mix(0.05, 0.25, energy);

  // === Layer 6: Beat-locked pulse ===
  float beatPulse = sin(pos.z * 0.5 - uTime * 4.0) * beatStab * 0.08;

  float totalDisp = swell + midWave + fbmDisp + fbmFine + onsetRipple + chop + beatPulse;
  pos.y += totalDisp;

  vDisplacement = totalDisp;

  // Foam factor: high displacement + high energy = foam
  float dispMag = abs(totalDisp);
  float foamThreshold = mix(0.5, 0.15, energy);
  vFoamFactor = smoothstep(foamThreshold, foamThreshold + 0.2, dispMag) * energy;
  vFoamFactor += onset * 0.3; // onset adds foam

  // Compute approximate normal from displacement gradient
  float eps = 0.5;
  vec3 posR = vec3(pos.x + eps, position.y, pos.z);
  vec3 posF = vec3(pos.x, position.y, pos.z + eps);
  float dispR = sin(posR.x * 0.3 + t * 0.4) * sin(posR.z * 0.2 - t * 0.6) * swellAmp
              + sin(posR.x * 1.2 + t * 1.5 + 3.1) * sin(posR.z * 0.8 - t * 2.0) * midWaveAmp
              + fbm(vec3(posR.x * 0.08, posR.z * 0.08 - t * 0.15, uTime * 0.1)) * mix(0.1, 0.5, energy);
  float dispF = sin(posF.x * 0.3 + t * 0.4) * sin(posF.z * 0.2 - t * 0.6) * swellAmp
              + sin(posF.x * 1.2 + t * 1.5 + 3.1) * sin(posF.z * 0.8 - t * 2.0) * midWaveAmp
              + fbm(vec3(posF.x * 0.08, posF.z * 0.08 - t * 0.15, uTime * 0.1)) * mix(0.1, 0.5, energy);
  vec3 tangent = normalize(vec3(eps, dispR - totalDisp, 0.0));
  vec3 bitangent = normalize(vec3(0.0, dispF - totalDisp, eps));
  vNormal = normalize(cross(bitangent, tangent));

  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const riverWaterFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uHighs;
uniform float uOnsetSnap;
uniform float uSlowEnergy;
uniform float uChromaHue;
uniform float uVocalEnergy;
uniform float uVocalPresence;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uMelodicPitch;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uBeatStability;
uniform float uSectionType;
uniform float uHarmonicTension;
uniform vec3 uCameraPosition;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDisplacement;
varying float vFoamFactor;

${noiseGLSL}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);

  // === WATER COLOR: palette-driven with chroma hue shift ===
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.5, 0.8, slowE) * uPaletteSaturation;

  vec3 deepColor = hsv2rgb(vec3(hue1, sat, 0.2 + energy * 0.15));
  vec3 midColor = hsv2rgb(vec3(mix(hue1, hue2, 0.5), sat * 0.9, 0.3 + energy * 0.2));
  vec3 shallowColor = hsv2rgb(vec3(hue2, sat * 0.7, 0.45 + energy * 0.25));

  // Depth-based: use world Z to pick color (far = deep, near = shallow)
  float depthFactor = smoothstep(-50.0, 10.0, vWorldPos.z);
  vec3 waterColor = mix(deepColor, shallowColor, depthFactor * 0.7);
  waterColor = mix(waterColor, midColor, clamp(vDisplacement * 0.3 + 0.35, 0.0, 1.0));

  // === FRESNEL REFLECTION ===
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);
  vec3 N = normalize(vNormal);
  float fresnel = pow(1.0 - max(dot(viewDir, N), 0.0), 3.0);
  fresnel = mix(0.1, 0.8, fresnel);

  // Sky reflection color
  vec3 skyColor = mix(
    vec3(0.02, 0.04, 0.1),
    vec3(0.08, 0.12, 0.25),
    0.5 + 0.5 * N.y
  );
  // Moon/melodic glow in reflection
  skyColor += vec3(0.3, 0.35, 0.5) * melPitch * 0.3;

  waterColor = mix(waterColor, skyColor, fresnel);

  // === SURFACE SPARKLE: energy + highs driven ===
  vec3 sparklePos = vec3(vWorldPos.xz * 0.5, uTime * 0.3);
  float sparkleNoise = snoise(sparklePos);
  float sparkleThreshold = mix(0.88, 0.55, energy + highs * 0.3);
  float sparkle = smoothstep(sparkleThreshold, sparkleThreshold + 0.04, sparkleNoise);
  sparkle *= mix(0.3, 1.0, energy) * (0.4 + highs * 0.6);
  waterColor += vec3(0.9, 0.92, 1.0) * sparkle * 0.4;

  // === FOAM at wave crests ===
  vec3 foamColor = vec3(0.85, 0.9, 0.95);
  float foam = vFoamFactor;
  // Extra foam noise
  float foamNoise = fbm(vec3(vWorldPos.xz * 0.3, uDynamicTime * 0.2));
  foam *= smoothstep(0.2, 0.6, foamNoise);
  foam = clamp(foam, 0.0, 1.0);
  waterColor = mix(waterColor, foamColor, foam * 0.7);

  // === BASS RIPPLE HIGHLIGHT ===
  float bassHighlight = sin(length(vWorldPos.xz) * 0.5 - uDynamicTime * 2.0 * bass) * bass * 0.08;
  waterColor += vec3(0.5, 0.6, 0.8) * max(0.0, bassHighlight);

  // === ONSET SPLASH BRIGHTNESS ===
  waterColor += vec3(0.3, 0.35, 0.4) * onset * 0.2;

  // === CLIMAX BOOST ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;
  waterColor *= 1.0 + climaxBoost * 0.35;

  // === DEPTH FOG at distance (subtle) ===
  float fogDist = length(uCameraPosition - vWorldPos);
  float fogAmount = 1.0 - exp(-fogDist * 0.015 * mix(1.5, 0.5, energy));
  vec3 fogColor = mix(vec3(0.02, 0.04, 0.08), vec3(0.05, 0.08, 0.15), 0.5);
  waterColor = mix(waterColor, fogColor, clamp(fogAmount, 0.0, 0.7));

  gl_FragColor = vec4(waterColor, 1.0);
}
`;

// Keep legacy exports for backwards compatibility (unused but prevents import errors)
export const riverVert = riverWaterVert;
export const riverFrag = riverWaterFrag;
