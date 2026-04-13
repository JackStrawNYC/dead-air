/**
 * River — flowing water with reflections, bank vegetation, sky mirror.
 * Serene flowing river with ripples, reflections, overhanging trees, sky gradient.
 * FullscreenQuad GLSL replacement for the R3F geometry version.
 *
 * Audio reactivity (15+ uniforms):
 *   uEnergy            → water flow speed, ripple intensity
 *   uBass              → deep current swells
 *   uOnsetSnap         → splash ripples
 *   uDrumOnset         → concentric splash burst on water surface
 *   uVocalEnergy       → mist above water
 *   uVocalPresence     → sunbeam column intensity through mist
 *   uStemBass          → deep undertow distortion in reflections
 *   uChromaHue         → reflected sky/foliage color
 *   uSlowEnergy        → ambient light / golden hour
 *   uMelodicPitch      → sky color warmth
 *   uSectionType       → jam=rapids, space=still pond, chorus=sparkling
 *   uShaderHoldProgress→ scene evolves: dawn mist → midday clarity → golden hour
 *   uBeatSnap          → rhythmic sparkle pulse on water crests
 *   uSemanticAmbient   → enhances mist and softens contrast
 *   uSemanticPsychedelic→ water color saturation + reflection warping
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const riverGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const riverGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
  stageFloodEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Tree canopy silhouette from sides ---
float canopySilhouette(vec2 uv, float side, float seed) {
  float x = side > 0.0 ? uv.x : (1.0 - uv.x);
  float canopyEdge = 0.15 + snoise(vec3(uv.y * 5.0, seed, 0.0)) * 0.08
                   + snoise(vec3(uv.y * 12.0, seed + 5.0, 0.0)) * 0.03;
  return smoothstep(canopyEdge + 0.02, canopyEdge - 0.02, x) * step(0.35, uv.y);
}

// --- Water ripple ---
float ripple(vec2 uv, float time, float energy) {
  float r1 = sin(uv.x * 30.0 + uv.y * 5.0 + time * 2.0) * 0.5 + 0.5;
  float r2 = sin(uv.x * 15.0 - uv.y * 8.0 + time * 1.5 + 1.7) * 0.5 + 0.5;
  float r3 = snoise(vec3(uv.x * 8.0, uv.y * 3.0 - time * energy, time * 0.3)) * 0.5 + 0.5;
  return mix(r3, (r1 + r2) * 0.5, energy * 0.5);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocal = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float hueShift = uChromaHue;
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float t = uDynamicTime;

  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);
  float spaceMod = smoothstep(6.5, 7.5, sType);
  float chorusMod = smoothstep(1.5, 2.5, sType) * (1.0 - smoothstep(2.5, 3.5, sType));

  // Hold progress evolves the scene: dawn mist (0-0.3) → midday clarity (0.3-0.7) → golden hour (0.7-1.0)
  float dawnPhase = smoothstep(0.0, 0.3, holdP) * (1.0 - smoothstep(0.3, 0.5, holdP));
  float middayPhase = smoothstep(0.25, 0.5, holdP) * (1.0 - smoothstep(0.65, 0.85, holdP));
  float goldenPhase = smoothstep(0.7, 1.0, holdP);

  float flowSpeed = energy * (1.0 + jamMod * 0.5) * (1.0 - spaceMod * 0.7);
  float waterLine = 0.42;

  // --- Sky (evolves with hold progress) ---
  float skyT = smoothstep(waterLine, 1.0, uv.y);
  vec3 skyLow = mix(vec3(0.55, 0.65, 0.75), vec3(0.75, 0.6, 0.4), pitch); // cool to warm
  vec3 skyHigh = vec3(0.3, 0.45, 0.7 + hueShift * 0.15);
  skyLow += vec3(0.1, 0.08, 0.0) * slowE; // golden hour warmth
  // Hold progress: dawn is pink/cool, golden hour is warm amber
  skyLow = mix(skyLow, vec3(0.5, 0.4, 0.55), dawnPhase * 0.4);   // dawn: cooler pink
  skyLow = mix(skyLow, vec3(0.85, 0.6, 0.3), goldenPhase * 0.5); // golden hour: warm amber

  vec3 sky = mix(skyLow, skyHigh, skyT);

  // Clouds
  float cloudNoise = fbm(vec3(uv.x * 3.0 + t * 0.02, uv.y * 2.0, t * 0.05));
  float cloudMask = smoothstep(0.45, 0.55, cloudNoise) * smoothstep(waterLine + 0.1, 0.9, uv.y);
  sky = mix(sky, vec3(0.9, 0.9, 0.85), cloudMask * 0.4);

  vec3 col = sky;

  // --- Far bank (trees/hills at horizon) ---
  float bankLine = waterLine + 0.02;
  float bankH = snoise(vec3(uv.x * 6.0, 1.0, 0.0)) * 0.04 + 0.04;
  float bank = step(uv.y, bankLine + bankH) * step(waterLine, uv.y);
  vec3 bankColor = vec3(0.08, 0.15, 0.06); // dark green tree line
  col = mix(col, bankColor, bank);

  // --- Water surface ---
  float waterMask = step(uv.y, waterLine);

  // Reflect sky (flipped Y with distortion)
  float reflY = waterLine + (waterLine - uv.y); // mirror Y
  float reflDistort = snoise(vec3(uv.x * 10.0, uv.y * 5.0 - t * flowSpeed, t * 0.4)) * 0.02;
  reflDistort += bass * 0.01 * sin(uv.y * 40.0 + t * 3.0);
  // Stem bass: deep undertow warps reflections more than surface bass
  reflDistort += stemBass * 0.015 * sin(uv.y * 20.0 + t * 1.5);
  // Psychedelic: exaggerated reflection warping
  reflDistort *= 1.0 + psyche * 0.8;
  vec2 reflUV = vec2(uv.x + reflDistort, reflY + reflDistort * 0.5);

  // Reflected sky color
  float reflSkyT = smoothstep(waterLine, 1.0, reflUV.y);
  vec3 reflectedSky = mix(skyLow, skyHigh, reflSkyT);
  reflectedSky = mix(reflectedSky, vec3(0.9, 0.9, 0.85), cloudMask * 0.3); // reflected clouds

  // Water base color
  vec3 waterColor = vec3(0.05, 0.12, 0.15);

  // Ripple pattern
  float rip = ripple(uv, t, flowSpeed);

  // Fresnel-like: shallow angle = more reflection
  float depth = (waterLine - uv.y) / waterLine;
  float fresnel = smoothstep(0.0, 0.5, 1.0 - depth);

  // Blend water color + reflection
  vec3 water = mix(waterColor, reflectedSky * 0.7, fresnel * (0.5 + rip * 0.3));

  // Sparkle highlights — beat-synced rhythmic accent
  float sparkle = smoothstep(0.75, 0.85, rip) * energy * (0.3 + chorusMod * 0.5);
  sparkle += beatSnap * 0.4 * smoothstep(0.6, 0.8, rip); // beat snap triggers extra sparkle
  water += vec3(0.8, 0.85, 0.9) * sparkle * 0.3;

  // Onset splash ripple
  float splashDist = length(vec2(p.x, (uv.y - waterLine * 0.5)));
  float splash = onset * 0.3 * smoothstep(0.15, 0.0, abs(splashDist - onset * 0.3)) * waterMask;
  water += vec3(0.5, 0.6, 0.7) * splash;

  // Drum onset: concentric splash burst from center of water
  float drumSplashDist = length(vec2(p.x, (uv.y - waterLine * 0.5)));
  float drumRing = smoothstep(0.02, 0.0, abs(drumSplashDist - drumOn * 0.5)) * drumOn;
  drumRing += smoothstep(0.02, 0.0, abs(drumSplashDist - drumOn * 0.3)) * drumOn * 0.6;
  water += vec3(0.7, 0.8, 0.9) * drumRing * 0.5 * waterMask;

  // Psychedelic: saturate water color
  float waterSat = length(water - vec3(dot(water, vec3(0.299, 0.587, 0.114))));
  water = mix(water, water * (1.0 + psyche * 0.6), psyche * 0.5);

  // Current streaks
  float streaks = smoothstep(0.4, 0.6, snoise(vec3(uv.x * 20.0 - t * flowSpeed * 3.0, uv.y * 3.0, t * 0.2)));
  water += vec3(0.08, 0.1, 0.12) * streaks * 0.2 * energy;

  col = mix(col, water, waterMask);

  // --- Overhanging tree canopy from sides ---
  float leftCanopy = canopySilhouette(uv, 1.0, 0.0);
  float rightCanopy = canopySilhouette(uv, -1.0, 3.7);
  float canopy = max(leftCanopy, rightCanopy);
  vec3 canopyColor = vec3(0.02, 0.05, 0.02);
  // Backlight through leaves
  float backlight = slowE * 0.15 * (1.0 - smoothstep(0.5, 0.8, uv.y));
  canopyColor += vec3(0.1, 0.15, 0.05) * backlight;
  col = mix(col, canopyColor, canopy);

  // --- Mist above water ---
  float mistY = abs(uv.y - waterLine);
  // Mist enhanced by vocal presence (sunbeam column) and ambient semantic
  float mistBase = vocal * 0.3 + vocalP * 0.2 + 0.05;
  mistBase += ambient * 0.15; // ambient semantic softens into mist
  mistBase += dawnPhase * 0.2; // dawn phase: thicker mist
  mistBase *= (1.0 - middayPhase * 0.4); // midday: mist burns off
  float mist = exp(-mistY * 15.0) * mistBase * (1.0 + spaceMod * 0.5);
  float mistNoise = fbm(vec3(p.x * 3.0 + t * 0.1, mistY * 5.0, t * 0.15));
  col = mix(col, vec3(0.7, 0.75, 0.8), mist * mistNoise * 0.4);

  // Vocal presence: sunbeam column through mist (vertical light shaft)
  float sunbeamX = sin(t * 0.03) * 0.15; // slowly drifting beam position
  float beamDist = abs(p.x - sunbeamX);
  float sunbeam = exp(-beamDist * 8.0) * vocalP * 0.2;
  sunbeam *= smoothstep(waterLine - 0.05, waterLine + 0.3, uv.y); // above water only
  sunbeam *= (0.5 + mistNoise * 0.5); // modulated by mist density
  col += vec3(0.9, 0.85, 0.6) * sunbeam;

  // Beat snap: global brightness pulse
  col *= 1.0 + beatSnap * 0.1;

  col = applyTemperature(col);
  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);
  gl_FragColor = vec4(col, 1.0);
}
`;
