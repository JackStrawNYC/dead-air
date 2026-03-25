/**
 * Campfire — warm bonfire under a starfield sky.
 * Ground-level bonfire with rising embers, tree silhouettes, warm ground glow.
 * FullscreenQuad GLSL replacement for the R3F geometry version.
 *
 * Audio reactivity:
 *   uEnergy        → fire height, ember count, light intensity
 *   uBass          → fire base pulse, flame sway
 *   uOnsetSnap     → ember burst
 *   uVocalEnergy   → smoke density
 *   uChromaHue     → fire color accent
 *   uFlatness      → smoke haze density
 *   uSlowEnergy    → ambient warmth / sky glow
 *   uBeatSnap      → fire size pulse
 *   uSectionType   → jam=roaring, space=embers only, chorus=bright flames
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const campfireGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const campfireGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  stageFloodEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Star field ---
float starField(vec2 uv, float time) {
  vec2 cell = floor(uv * 80.0);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  float brightness = step(0.97, h) * (0.4 + 0.6 * sin(time * (1.0 + h2 * 3.0) + h * 6.28));
  return max(0.0, brightness);
}

// --- Tree silhouette ---
float treeSilhouette(vec2 uv, float xPos, float height, float width, float seed) {
  float dx = (uv.x - xPos) / width;
  // Trunk
  float trunk = smoothstep(0.06, 0.04, abs(dx)) * step(uv.y, height * 0.4);
  // Canopy: triangle with noise
  float canopyBase = height * 0.25;
  float canopyTop = height;
  float cy = (uv.y - canopyBase) / (canopyTop - canopyBase);
  float canopyWidth = mix(0.5, 0.02, cy * cy);
  float noise = snoise(vec3(dx * 8.0 + seed, cy * 6.0, seed * 3.7)) * 0.15;
  float canopy = step(abs(dx) - noise, canopyWidth) * step(canopyBase, uv.y) * step(uv.y, canopyTop);
  return max(trunk, canopy);
}

// --- Flame shape ---
float flameShape(vec2 uv, float time, float energy, float bass) {
  vec2 p = uv;
  p.x *= 2.5; // narrow flame

  // Rising distortion
  float distort = snoise(vec3(p.x * 3.0, p.y * 2.0 - time * 2.5, time * 0.7)) * 0.3;
  distort += snoise(vec3(p.x * 6.0, p.y * 4.0 - time * 4.0, time * 1.3)) * 0.15;
  p.x += distort * (1.0 + bass * 0.5);

  // Flame height driven by energy
  float height = 0.15 + energy * 0.35 + bass * 0.08;

  // Tapered shape: wide at bottom, narrow at top
  float taper = smoothstep(height, 0.0, p.y) * smoothstep(-0.02, 0.05, p.y);
  float width = mix(0.25, 0.02, p.y / max(height, 0.01));
  float flame = smoothstep(width, width * 0.3, abs(p.x)) * taper;

  return flame;
}

// --- Ember particles ---
float embers(vec2 uv, float time, float onset) {
  float total = 0.0;
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float h1 = fract(sin(fi * 127.1) * 43758.5453);
    float h2 = fract(sin(fi * 311.7) * 43758.5453);
    float h3 = fract(sin(fi * 543.3) * 43758.5453);

    float speed = 0.15 + h1 * 0.25;
    float phase = fract(time * speed + h3);

    float x = (h2 - 0.5) * 0.4 + sin(time * (1.0 + h1) + fi) * 0.08;
    float y = phase * 0.6 + 0.05;

    float brightness = (1.0 - phase) * (0.3 + onset * 0.7);
    float size = 0.003 + h1 * 0.002;
    float d = length(uv - vec2(x, y));
    total += brightness * smoothstep(size, size * 0.2, d);
  }
  return total;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - vec2(0.5, 0.0)) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float vocal = clamp(uVocalEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float hueShift = uChromaHue;
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float beatPulse = clamp(uBeatSnap, 0.0, 1.0);
  float t = uDynamicTime;

  // Section type modulation
  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);     // jam = roaring
  float spaceMod = smoothstep(6.5, 7.5, sType);    // space = embers only
  float chorusMod = smoothstep(1.5, 2.5, sType) * (1.0 - smoothstep(2.5, 3.5, sType)); // chorus = bright

  float fireEnergy = energy * (1.0 + jamMod * 0.4 + chorusMod * 0.2) * (1.0 - spaceMod * 0.7);

  // --- Sky gradient (dark blue-purple to warm horizon) ---
  float skyGrad = uv.y;
  vec3 skyTop = vec3(0.02, 0.02, 0.06);
  vec3 skyMid = vec3(0.04, 0.03, 0.08);
  vec3 skyHorizon = vec3(0.08 + slowE * 0.06, 0.04 + slowE * 0.03, 0.03);
  vec3 sky = mix(skyHorizon, skyMid, smoothstep(0.2, 0.5, skyGrad));
  sky = mix(sky, skyTop, smoothstep(0.5, 0.9, skyGrad));

  // Stars (upper sky only)
  float stars = starField(uv, t * 0.3) * smoothstep(0.4, 0.7, uv.y);
  sky += vec3(0.9, 0.85, 0.7) * stars;

  vec3 col = sky;

  // --- Ground ---
  float groundLine = 0.18;
  float ground = smoothstep(groundLine + 0.01, groundLine - 0.01, uv.y);
  vec3 groundColor = vec3(0.03, 0.02, 0.01);
  // Warm glow on ground near fire
  float groundGlow = exp(-abs(p.x) * 4.0) * fireEnergy * 0.3;
  groundColor += vec3(0.4, 0.15, 0.02) * groundGlow;
  col = mix(col, groundColor, ground);

  // --- Fire ---
  vec2 fireUV = vec2(p.x, uv.y - groundLine);
  float flame = flameShape(fireUV, t, fireEnergy, bass + beatPulse * 0.3);

  // Fire color: orange core → yellow tips, hue-shifted
  float flameTemp = flame;
  float h = 0.05 + hueShift * 0.15; // orange base, shift toward red or yellow
  float s = mix(1.0, 0.4, flameTemp);
  float v = flameTemp;
  vec3 fireColor = hsv2rgb(vec3(h, s, v));
  // White-hot core
  fireColor += vec3(smoothstep(0.6, 1.0, flameTemp) * 0.4);

  col += fireColor * flame * (1.0 - ground * 0.3);

  // --- Fire glow (atmospheric bloom around fire) ---
  float glowDist = length(vec2(p.x, uv.y - groundLine - 0.05));
  float fireGlow = exp(-glowDist * 3.0) * fireEnergy * 0.35;
  col += vec3(0.5, 0.2, 0.05) * fireGlow;

  // --- Embers ---
  float emberVal = embers(vec2(p.x, uv.y - groundLine), t, onset);
  vec3 emberColor = hsv2rgb(vec3(h + 0.02, 0.9, 1.0));
  col += emberColor * emberVal * (0.5 + fireEnergy * 0.5);

  // --- Smoke (above fire, subtle) ---
  float smokeY = uv.y - groundLine - 0.1;
  float smokeDensity = (vocal * 0.5 + flatness * 0.3 + 0.1) * (1.0 - spaceMod * 0.5);
  float smokeNoise = fbm(vec3(p.x * 2.0, smokeY * 1.5 - t * 0.3, t * 0.2));
  float smokeMask = smoothstep(0.0, 0.3, smokeY) * smoothstep(0.6, 0.1, smokeY) * exp(-abs(p.x) * 3.0);
  float smoke = smokeNoise * smokeMask * smokeDensity * 0.3;
  col = mix(col, vec3(0.15, 0.12, 0.1), smoke);

  // --- Tree silhouettes ---
  float tree1 = treeSilhouette(uv, 0.12, 0.55, 0.08, 1.0);
  float tree2 = treeSilhouette(uv, 0.88, 0.60, 0.09, 2.7);
  float tree3 = treeSilhouette(uv, 0.05, 0.45, 0.06, 4.3);
  float tree4 = treeSilhouette(uv, 0.95, 0.50, 0.07, 5.9);
  float trees = max(max(tree1, tree2), max(tree3, tree4));
  // Trees are dark silhouettes with slight fire rim-light
  vec3 treeColor = vec3(0.01, 0.005, 0.002);
  float rimLight = exp(-length(vec2(p.x, uv.y - groundLine)) * 2.0) * fireEnergy * 0.15;
  treeColor += vec3(0.3, 0.1, 0.02) * rimLight;
  col = mix(col, treeColor, trees * step(groundLine, uv.y));

  // Post-processing
  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);

  gl_FragColor = vec4(col, 1.0);
}
`;
