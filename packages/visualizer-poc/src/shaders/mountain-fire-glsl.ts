/**
 * Mountain Fire — wildfire blazing behind mountain silhouettes.
 * Layered mountain ridges, fire glow, rising embers, smoke, dramatic sky.
 * FullscreenQuad GLSL replacement for the R3F geometry version.
 *
 * Audio reactivity:
 *   uEnergy        → fire height, sky redness, ember count
 *   uBass          → fire pulse, mountain rumble
 *   uOnsetSnap     → ember burst
 *   uFlatness      → smoke density
 *   uMelodicPitch  → mountain height shift
 *   uChromaHue     → fire color accent
 *   uSlowEnergy    → sky color (blue/purple → red/orange)
 *   uSectionType   → jam=inferno, space=smoldering, chorus=dramatic
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const mountainFireGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const mountainFireGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Mountain ridge profile ---
float mountainRidge(float x, float seed, float scale, float height) {
  float n1 = snoise(vec3(x * scale, seed, 0.0)) * 0.5;
  float n2 = snoise(vec3(x * scale * 2.3, seed + 5.0, 0.0)) * 0.25;
  float n3 = snoise(vec3(x * scale * 5.0, seed + 10.0, 0.0)) * 0.12;
  return height * (0.5 + n1 + n2 + n3);
}

// --- Ember particles ---
float embers(vec2 p, float time, float onset, float energy) {
  float total = 0.0;
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float h1 = fract(sin(fi * 127.1) * 43758.5453);
    float h2 = fract(sin(fi * 311.7) * 43758.5453);
    float h3 = fract(sin(fi * 543.3) * 43758.5453);

    float speed = 0.1 + h1 * 0.2 + energy * 0.15;
    float phase = fract(time * speed + h3);
    float x = (h2 - 0.5) * 0.8 + sin(time * (0.5 + h1) + fi) * 0.1;
    float y = phase * 0.5;

    float brightness = (1.0 - phase) * (0.2 + onset * 0.6 + energy * 0.3);
    float size = 0.002 + h1 * 0.002;
    float d = length(p - vec2(x, y));
    total += brightness * smoothstep(size, size * 0.1, d);
  }
  return total;
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
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float t = uDynamicTime;

  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);
  float spaceMod = smoothstep(6.5, 7.5, sType);

  float fireIntensity = energy * (1.0 + jamMod * 0.5) * (1.0 - spaceMod * 0.6);

  // --- Domain warping + palette ---
  vec2 warpedP = p + vec2(fbm3(vec3(p * 0.5, t * 0.05)), fbm3(vec3(p * 0.5 + 100.0, t * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;
  float palHue1 = uPalettePrimary + hueShift * 0.12;
  float palHue2 = uPaletteSecondary + hueShift * 0.08;
  vec3 palCol1 = hsv2rgb(vec3(palHue1, 0.8 * uPaletteSaturation, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(palHue2, 0.7 * uPaletteSaturation, 0.85));

  // --- Sky ---
  float skyGrad = uv.y;
  vec3 skyTop = mix(vec3(0.05, 0.03, 0.1), vec3(0.15, 0.03, 0.02), slowE);
  vec3 skyMid = mix(vec3(0.1, 0.05, 0.12), vec3(0.4, 0.1, 0.05), fireIntensity);
  vec3 skyLow = mix(vec3(0.15, 0.06, 0.03), vec3(0.7, 0.25, 0.05), fireIntensity);

  vec3 sky = mix(skyLow, skyMid, smoothstep(0.3, 0.6, skyGrad));
  sky = mix(sky, skyTop, smoothstep(0.6, 1.0, skyGrad));

  // Fire glow on sky
  float fireGlowSky = exp(-abs(p.x) * 2.0) * fireIntensity * 0.4 * smoothstep(0.6, 0.3, uv.y);
  sky += vec3(0.5, 0.15, 0.02) * fireGlowSky;

  vec3 col = sky;

  // --- Mountain layers (3 ridges, back to front) ---
  float baseY = 0.30;

  // Back ridge (farthest, tallest, darkest silhouette)
  float ridge3H = mountainRidge(uv.x, 1.0, 3.0, 0.18 + pitch * 0.06);
  float ridge3 = step(uv.y, baseY + ridge3H);
  vec3 ridge3Col = vec3(0.06, 0.04, 0.08);
  // Fire rim light on back ridge
  float rimBack = fireIntensity * 0.2 * smoothstep(baseY + ridge3H - 0.02, baseY + ridge3H, uv.y);
  ridge3Col += vec3(0.6, 0.2, 0.03) * rimBack;

  // Mid ridge
  float ridge2H = mountainRidge(uv.x, 4.7, 4.0, 0.12 + pitch * 0.04);
  float ridge2 = step(uv.y, baseY - 0.02 + ridge2H);
  vec3 ridge2Col = vec3(0.04, 0.02, 0.05);
  float rimMid = fireIntensity * 0.35 * smoothstep(baseY - 0.02 + ridge2H - 0.015, baseY - 0.02 + ridge2H, uv.y);
  ridge2Col += vec3(0.7, 0.25, 0.04) * rimMid;

  // Front ridge (closest, lowest)
  float ridge1H = mountainRidge(uv.x, 8.3, 5.0, 0.08 + pitch * 0.03);
  float ridge1 = step(uv.y, baseY - 0.05 + ridge1H);
  vec3 ridge1Col = vec3(0.02, 0.01, 0.02);
  float rimFront = fireIntensity * 0.15 * smoothstep(baseY - 0.05 + ridge1H - 0.01, baseY - 0.05 + ridge1H, uv.y);
  ridge1Col += vec3(0.5, 0.15, 0.03) * rimFront;

  // Composite mountains back to front
  col = mix(col, ridge3Col, ridge3);
  col = mix(col, ridge2Col, ridge2);
  col = mix(col, ridge1Col, ridge1);

  // --- Fire behind mountains (visible between ridges and at top) ---
  float fireBehindY = baseY + ridge3H;
  float fireZone = smoothstep(fireBehindY - 0.05, fireBehindY + 0.15, uv.y) *
                   smoothstep(fireBehindY + 0.25 + fireIntensity * 0.15, fireBehindY, uv.y);
  float fireNoise = fbm6(vec3(p.x * 3.0 * detailMod, (uv.y - fireBehindY) * 4.0 - t * 2.0, t * 0.5));
  float fireMask = fireZone * fireNoise * (1.0 - ridge2) * (1.0 - ridge1); // only visible in gaps

  float h = 0.04 + hueShift * 0.12;
  vec3 fireCol = hsv2rgb(vec3(h, mix(0.9, 0.5, fireNoise), 1.0));
  fireCol += vec3(0.3, 0.1, 0.0) * smoothstep(0.5, 1.0, fireNoise); // white-hot spots
  col += fireCol * fireMask * fireIntensity * 1.5;

  // --- Embers rising above ridges ---
  vec2 emberUV = vec2(p.x, uv.y - baseY);
  float emberVal = embers(emberUV, t, onset, fireIntensity);
  vec3 emberCol = hsv2rgb(vec3(h + 0.02, 0.85, 1.0));
  col += emberCol * emberVal * (0.4 + fireIntensity * 0.6);

  // --- Smoke ---
  float smokeY = uv.y - baseY - ridge3H;
  float smokeNoise = fbm6(vec3(p.x * 2.0 * detailMod + t * 0.2, smokeY * 2.0 - t * 0.4, t * 0.15));
  float smokeMask = smoothstep(0.0, 0.15, smokeY) * smoothstep(0.4, 0.05, smokeY);
  smokeMask *= exp(-abs(p.x) * 2.0);
  float smoke = smokeNoise * smokeMask * (flatness * 0.3 + fireIntensity * 0.2) * 0.4;
  col = mix(col, vec3(0.2, 0.15, 0.12), smoke);

  // --- Ground (below front ridge) ---
  float groundY = baseY - 0.05;
  float groundMask = step(uv.y, groundY) * (1.0 - ridge1);
  vec3 groundCol = vec3(0.02, 0.01, 0.01);
  groundCol += vec3(0.15, 0.05, 0.01) * exp(-abs(p.x) * 3.0) * fireIntensity * 0.3;
  col = mix(col, groundCol, step(uv.y, groundY));

  // --- Secondary visual layer: atmospheric fire glow (30% blend) ---
  float atmosNoise = fbm3(vec3(warpedP * 2.0, t * 0.1));
  vec3 atmosCol = mix(palCol1, palCol2, atmosNoise * 0.5 + 0.5) * 0.1;
  float atmosMask = smoothstep(baseY - 0.05, baseY + 0.3, uv.y) * fireIntensity;
  col += atmosCol * atmosMask * 0.3;

  col = applyTemperature(col);
  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);
  gl_FragColor = vec4(col, 1.0);
}
`;
