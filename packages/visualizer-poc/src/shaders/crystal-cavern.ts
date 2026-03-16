/**
 * Crystal Cavern — instanced crystalline geometry shaders.
 * 400 icosahedrons in a cylindrical cave distribution.
 * v7: Upgraded with Fresnel refraction/reflection, internal glow,
 * facet flash on onset, bass-driven vibration.
 *
 * Audio reactivity:
 *   uBass       → crystal vibration, scale pulse
 *   uHighs      → facet glow intensity, specular sharpness, rotation speed
 *   uEnergy     → emissive glow, Fresnel intensity, fog distance
 *   uOnsetSnap  → facet flash, refraction spike
 *   uMusicalTime → rotation phase-lock
 *   uChroma0-2  → per-crystal color from pitch class
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const crystalCavernVert = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uBass;
uniform float uHighs;
uniform float uEnergy;
uniform float uMusicalTime;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform float uFastEnergy;
uniform float uDrumBeat;
uniform float uOnsetSnap;

${noiseGLSL}

attribute float aInstanceIndex;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float vInstanceIndex;
varying float vGlow;
varying float vFresnel;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vInstanceIndex = aInstanceIndex;

  // Bass-driven scale pulse + vibration
  float bassPhase = aInstanceIndex * 0.37;
  float scalePulse = 1.0 + uBass * 0.15 * sin(uMusicalTime * 3.14159 + bassPhase) + uDrumBeat * 0.10;

  // Bass vibration: small random offset per crystal
  vec3 vibration = vec3(
    sin(uTime * 8.0 + aInstanceIndex * 1.7) * uBass * 0.02,
    cos(uTime * 7.3 + aInstanceIndex * 2.3) * uBass * 0.02,
    sin(uTime * 9.1 + aInstanceIndex * 0.9) * uBass * 0.015
  );

  // Highs-driven rotation around local Y axis
  float rotAngle = uDynamicTime * (0.3 + uHighs * 0.5) + aInstanceIndex * 1.618;
  float c = cos(rotAngle);
  float s = sin(rotAngle);
  mat3 rot = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);

  vec3 pos = rot * (position * scalePulse) + vibration;
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  // View direction for Fresnel
  vec4 mvPos = modelViewMatrix * worldPos;
  vViewDir = normalize(-mvPos.xyz);

  // Fresnel: more reflective at grazing angles
  float ndotv = max(0.0, dot(vNormal, vViewDir));
  vFresnel = pow(1.0 - ndotv, 3.0);

  // Emissive glow: chroma-based per crystal
  int chromaIdx = int(mod(aInstanceIndex, 12.0));
  vGlow = getChroma(chromaIdx, uChroma0, uChroma1, uChroma2);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const crystalCavernFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal' })}

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float vInstanceIndex;
varying float vGlow;
varying float vFresnel;

void main() {
  vec3 norm = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);

  // === TWO-LIGHT SETUP for crystal depth ===
  vec3 lightDir1 = normalize(vec3(0.3, 1.0, 0.5));
  vec3 lightDir2 = normalize(vec3(-0.5, -0.3, 0.8));

  float ndotl1 = max(0.0, dot(norm, lightDir1));
  float ndotl2 = max(0.0, dot(norm, lightDir2));

  // Specular (Blinn-Phong with sharpness from highs)
  vec3 halfVec1 = normalize(lightDir1 + viewDir);
  float specPow = 32.0 + uHighs * 64.0;
  float spec1 = pow(max(0.0, dot(norm, halfVec1)), specPow);

  vec3 halfVec2 = normalize(lightDir2 + viewDir);
  float spec2 = pow(max(0.0, dot(norm, halfVec2)), specPow) * 0.5;

  // Base crystal color from palette + instance index
  float hue = uPalettePrimary + mod(vInstanceIndex * 0.0833, 1.0) * 0.3;
  float sat = 0.6 * uPaletteSaturation;
  vec3 baseColor = hsv2rgb(vec3(hue, sat, 0.4 + ndotl1 * 0.4));

  // === INTERNAL GLOW: palette-colored light from crystal core ===
  float chromaIdx = mod(vInstanceIndex, 12.0);
  float chromaHue = chromaIdx / 12.0;
  vec3 glowColor = hsv2rgb(vec3(chromaHue, 0.8, 1.0));

  float emissive = vGlow * (uEnergy + uFastEnergy * 0.8) * 1.5;
  // Internal glow: brighter at crystal center (approximated by inverse Fresnel)
  float internalGlow = (1.0 - vFresnel) * emissive;

  // === FRESNEL REFLECTION/REFRACTION ===
  // High Fresnel = reflective surface, low = see internal glow
  vec3 reflectColor = vec3(0.6, 0.7, 0.9) * (0.3 + uEnergy * 0.3);
  vec3 refractColor = glowColor * internalGlow;

  vec3 fresnelMix = mix(refractColor, reflectColor, vFresnel * (0.5 + uEnergy * 0.3));

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset: facet flash (bright white spike on transient)
  float flash = max(uOnsetSnap, uDrumOnset) * 0.7 * (1.0 + climaxBoost * 0.5);
  // Make flash stronger on facets facing the viewer
  float facetFlash = flash * pow(max(0.0, dot(norm, viewDir)), 4.0);

  // Beat snap: crystal brightness pulse
  float beatKick = uBeatSnap * 0.30 * (1.0 + climaxBoost * 0.4);

  // Rim glow for depth
  float rim = pow(vFresnel, 2.0) * (0.4 + climaxBoost * 0.2);

  // === COMPOSITE ===
  vec3 col = baseColor * (0.15 + ndotl1 * 0.5 + ndotl2 * 0.2);
  col += fresnelMix;
  col += vec3(1.0, 0.98, 0.95) * (spec1 + spec2) * (0.3 + uHighs * 0.3);
  col += facetFlash * vec3(1.0, 0.95, 0.9);
  col += beatKick;
  col += rim * glowColor * 0.4;

  // Fog: distance-based (shader-specific, applied before post-proc)
  float fogDist = length(vWorldPos);
  float fog = 1.0 - exp(-fogDist * (0.08 - uEnergy * 0.03));
  vec3 fogColor = vec3(0.02, 0.03, 0.06);
  col = mix(col, fogColor, fog);

  // === POST-PROCESSING (shared chain) ===
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 screenP = (screenUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  col = applyPostProcess(col, screenUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
