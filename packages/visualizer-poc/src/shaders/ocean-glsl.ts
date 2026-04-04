/**
 * Ocean — vast open ocean with rolling waves, horizon, and sky.
 * Deep blue water with foam crests, swell, distant horizon, atmospheric sky.
 * FullscreenQuad GLSL replacement for the R3F geometry version.
 *
 * Audio reactivity:
 *   uEnergy        → wave height, foam, choppiness
 *   uBass          → deep swell, undertow
 *   uOnsetSnap     → wave crest break, spray
 *   uSlowEnergy    → sea state (calm→rough)
 *   uChromaHue     → water color shift (tropical→deep)
 *   uMelodicPitch  → sky warmth
 *   uVocalPresence → mist/spray
 *   uSectionType   → jam=storm surf, space=glassy calm, chorus=sparkling
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const oceanGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const oceanGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
  stageFloodEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Wave height function ---
float waveHeight(vec2 pos, float time, float energy, float bass) {
  float h = 0.0;
  float amp = 0.015 + energy * 0.03 + bass * 0.02;

  // Multiple overlapping wave trains
  h += sin(pos.x * 8.0 + time * 1.2) * amp;
  h += sin(pos.x * 12.0 - time * 0.8 + pos.y * 3.0) * amp * 0.6;
  h += sin(pos.x * 20.0 + time * 2.5 + 1.3) * amp * 0.3;
  h += snoise(vec3(pos.x * 5.0, pos.y * 3.0, time * 0.5)) * amp * 0.8;

  // Bass swell (long-period wave)
  h += sin(pos.x * 2.0 + time * 0.3) * bass * 0.04;

  return h;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float hueShift = uChromaHue;
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float t = uDynamicTime;

  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);
  float spaceMod = smoothstep(6.5, 7.5, sType);
  float chorusMod = smoothstep(1.5, 2.5, sType) * (1.0 - smoothstep(2.5, 3.5, sType));

  float seaState = slowE * (1.0 + jamMod * 0.5) * (1.0 - spaceMod * 0.6);
  float horizon = 0.52;

  // --- Domain warping for organic variation ---
  vec2 warpedP = p + vec2(fbm3(vec3(p * 0.5, t * 0.05)), fbm3(vec3(p * 0.5 + 100.0, t * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // --- Palette colors ---
  float palHue1 = uPalettePrimary + hueShift * 0.1;
  float palHue2 = uPaletteSecondary + hueShift * 0.08;
  vec3 palCol1 = hsv2rgb(vec3(palHue1, 0.7 * uPaletteSaturation, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(palHue2, 0.6 * uPaletteSaturation, 0.85));

  // --- Sky ---
  float skyT = smoothstep(horizon, 1.0, uv.y);
  vec3 skyLow = mix(vec3(0.6, 0.7, 0.8), vec3(0.8, 0.6, 0.4), pitch * 0.5);
  vec3 skyHigh = mix(vec3(0.25, 0.35, 0.6 + hueShift * 0.1), palCol2 * 0.4, 0.2);

  vec3 sky = mix(skyLow, skyHigh, skyT);

  // Sun/horizon glow
  float sunDist = length(vec2(p.x + 0.15, uv.y - horizon - 0.08));
  float sunGlow = exp(-sunDist * 6.0) * (0.4 + slowE * 0.3);
  sky += vec3(0.5, 0.35, 0.15) * sunGlow;

  // Clouds (6-octave for rich detail)
  float cloudNoise = fbm6(vec3(uv.x * 4.0 + t * 0.015, uv.y * 2.5, t * 0.03));
  float cloudMask = smoothstep(0.42, 0.55, cloudNoise) * smoothstep(horizon + 0.05, 0.95, uv.y);
  sky = mix(sky, vec3(0.9, 0.88, 0.85), cloudMask * 0.35);

  vec3 col = sky;

  // --- Horizon line ---
  float horizonGlow = exp(-abs(uv.y - horizon) * 40.0) * 0.15;
  col += vec3(0.6, 0.5, 0.4) * horizonGlow;

  // --- Ocean surface ---
  float waterMask = step(uv.y, horizon);
  float depth = (horizon - uv.y) / horizon; // 0 at horizon, 1 at bottom

  // Perspective: compress waves near horizon
  float perspScale = mix(1.0, 20.0, 1.0 - depth);
  vec2 wavePos = vec2(uv.x * perspScale, depth * 10.0 - t * seaState);

  // Wave displacement
  float wave = waveHeight(wavePos, t, seaState, bass);

  // Ocean color (deep blue → teal, hue-shifted, palette-tinted)
  vec3 deepColor = mix(vec3(0.02, 0.06, 0.12 + hueShift * 0.05), palCol1 * 0.15, 0.2);
  vec3 shallowColor = mix(vec3(0.05, 0.15, 0.2 + hueShift * 0.1), palCol2 * 0.2, 0.15);
  vec3 waterColor = mix(shallowColor, deepColor, depth);

  // Wave-driven brightness
  float waveBright = smoothstep(-0.01, 0.03, wave) * (0.3 + seaState * 0.3);
  waterColor += vec3(0.1, 0.15, 0.2) * waveBright;

  // Sky reflection (stronger near horizon)
  float fresnel = pow(1.0 - depth, 3.0);
  vec3 reflected = skyLow * 0.6;
  reflected += vec3(0.5, 0.35, 0.15) * sunGlow * 0.5; // sun reflection path
  waterColor = mix(waterColor, reflected, fresnel * 0.6);

  // Sun path on water
  float sunPathX = abs(p.x + 0.15);
  float sunPath = exp(-sunPathX * 8.0) * fresnel * sunGlow * 2.0;
  float sunPathShimmer = abs(sin(wavePos.x * 30.0 + t * 5.0));
  waterColor += vec3(0.6, 0.4, 0.15) * sunPath * sunPathShimmer;

  // Foam on wave crests
  float foam = smoothstep(0.025, 0.04, wave) * (0.3 + seaState * 0.5 + onset * 0.3);
  foam *= (1.0 - smoothstep(0.0, 0.3, depth)); // more foam in foreground
  foam *= snoise(vec3(wavePos * 5.0, t * 2.0)) * 0.5 + 0.5; // patchy
  waterColor = mix(waterColor, vec3(0.85, 0.9, 0.95), foam * 0.6);

  // Sparkle (chorus highlight)
  float sparkle = pow(max(0.0, snoise(vec3(wavePos * 20.0, t * 3.0))), 8.0);
  waterColor += vec3(0.8, 0.85, 0.9) * sparkle * (0.1 + chorusMod * 0.4) * (1.0 - depth);

  // Deep swell shadows
  float swellShadow = smoothstep(0.0, -0.02, wave) * 0.15 * depth;
  waterColor *= 1.0 - swellShadow;

  col = mix(col, waterColor, waterMask);

  // --- Spray/mist near horizon ---
  float sprayY = abs(uv.y - horizon);
  float spray = exp(-sprayY * 20.0) * (vocalPres * 0.2 + onset * 0.15) * seaState;
  float sprayNoise = fbm6(vec3(p.x * 5.0 + t * 0.3, sprayY * 10.0, t * 0.2));
  col = mix(col, vec3(0.8, 0.85, 0.9), spray * sprayNoise * 0.3);

  // --- Secondary visual layer: subsurface light (30% blend) ---
  float subsurfNoise = fbm3(vec3(warpedP * 3.0 * detailMod, t * 0.15));
  vec3 subsurfColor = mix(palCol1, palCol2, subsurfNoise * 0.5 + 0.5) * 0.15;
  float subsurfMask = step(uv.y, horizon) * smoothstep(0.0, 0.15, depth);
  col += subsurfColor * subsurfMask * 0.3 * energy;

  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);
  gl_FragColor = vec4(col, 1.0);
}
`;
