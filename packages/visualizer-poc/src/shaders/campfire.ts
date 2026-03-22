/**
 * Campfire — ground-level bonfire scene under a starfield sky.
 * Flame shapes from animated FBM noise, embers rising on beat,
 * smoke wisps from flatness. Warm light radius expands with energy.
 *
 * Designed for intimate, low-energy songs (acoustic sets, ballads).
 * MASSIVE dynamic range: dying embers at rest, roaring bonfire at peaks.
 *
 * Audio reactivity:
 *   uEnergy     -> fire height, flame intensity, light radius
 *   uBeat/uBeatSnap -> ember particles rise in bursts
 *   uBass       -> flame sway amplitude, base glow pulse
 *   uFlatness   -> smoke wisp density (noisy=more smoke)
 *   uOnsetSnap  -> spark showers, brightness flash
 *   uSlowEnergy -> overall warmth, ember glow persistence
 *   uChromaHue  -> subtle fire color shift (blue/green hints)
 *   uStemVocalRms -> warmth added to surrounding light
 *   uPalettePrimary   -> fire core color
 *   uPaletteSecondary -> ember/smoke tint
 *   uSectionType -> jam=fire builds, space=just embers, solo=focused flame
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const campfireVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const campfireFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Starfield ---
float campfireStars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.7, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.03, 0.005, dist);
}

// --- Flame FBM: turbulent upward flow ---
float flameFBM(vec3 p, float turbulence) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 6; i++) {
    val += amp * snoise(p * freq);
    p.xz = rot * p.xz;
    p.y *= 1.2;
    p.x += turbulence * 0.15 * float(i);
    freq *= 2.2;
    amp *= 0.48;
  }
  return val;
}

// --- Ember particle: pseudo-random rising sparks ---
float ember(vec2 uv, float seed, float time, float beatPulseVal) {
  float h1 = fract(sin(seed * 127.1) * 43758.5453);
  float h2 = fract(sin(seed * 311.7) * 43758.5453);
  float h3 = fract(sin(seed * 543.3) * 43758.5453);

  // Ember starts near fire center, drifts upward
  float lifetime = mod(time * (0.3 + h1 * 0.4) + h2 * 10.0, 3.0);
  float alive = smoothstep(0.0, 0.1, lifetime) * smoothstep(3.0, 2.5, lifetime);

  // Beat pulse accelerates embers upward
  float speed = 0.15 + h3 * 0.1 + beatPulseVal * 0.12;
  float x = (h1 - 0.5) * 0.3 + sin(lifetime * 2.0 + h2 * 6.28) * 0.05;
  float y = -0.35 + lifetime * speed;

  float dist = length(uv - vec2(x, y));
  float size = mix(0.003, 0.008, h3) * (1.0 - lifetime / 3.0);
  float brightness = alive * smoothstep(size * 2.0, size * 0.5, dist);

  return brightness * (0.5 + h2 * 0.5);
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

  // === Audio-derived parameters ===
  float tensionTurb = uHarmonicTension * 0.2;
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float bpH = beatPulseHalf(uMusicalTime);
  float bp = beatPulse(uMusicalTime);

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  float slowTime = uDynamicTime * 0.15;

  // === FIRE PARAMETERS (massive dynamic range) ===
  // Space: just embers. Jam: building fire. Solo: focused flame. Chorus: warm glow.
  float fireIntensity = mix(0.05, 1.0, energy);
  fireIntensity *= mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace) * mix(1.0, 1.2, sSolo) * mix(1.0, 1.1, sChorus);
  fireIntensity += climaxBoost * 0.4;
  fireIntensity = clamp(fireIntensity, 0.0, 1.5);

  float fireHeight = mix(0.08, 0.55, energy) * mix(1.0, 1.4, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.3, sSolo);
  fireHeight += climaxBoost * 0.15;

  // === SKY: dark night sky ===
  vec3 skyColor = mix(
    vec3(0.01, 0.01, 0.03),
    vec3(0.02, 0.015, 0.04),
    smoothstep(0.0, 0.5, uv.y)
  );
  vec3 col = skyColor;

  // === STARS: visible above the treeline ===
  float starMask = smoothstep(0.1, 0.4, p.y);
  float starLayer1 = campfireStars(uv + slowTime * 0.003, 90.0);
  float starLayer2 = campfireStars(uv + slowTime * 0.002 + 7.0, 140.0) * 0.5;
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + uv.x * 40.0 + uv.y * 25.0);
  vec3 starColor = vec3(0.8, 0.85, 1.0) * (starLayer1 + starLayer2) * twinkle * starMask;
  col += starColor * 0.35;

  // === GROUND SILHOUETTE: dark earth/logs ===
  float groundLine = -0.32 + snoise(vec3(p.x * 3.0, 0.0, 1.0)) * 0.04;
  float groundMask = smoothstep(groundLine + 0.02, groundLine - 0.01, p.y);

  // Log silhouettes near fire
  float logL = smoothstep(0.02, 0.0, abs(length(p - vec2(-0.18, -0.34)) - 0.08) - 0.015);
  float logR = smoothstep(0.02, 0.0, abs(length(p - vec2(0.15, -0.33)) - 0.07) - 0.012);
  float logs = max(logL, logR);

  // === FIRE COLORS from palette ===
  float hue1 = uPalettePrimary + chromaH * 0.05;
  float hue2 = uPaletteSecondary + chromaH * 0.03;
  float sat = mix(0.8, 1.0, slowE) * uPaletteSaturation;

  vec3 fireCore = hsv2rgb(vec3(hue1 * 0.08 + 0.04, sat * 0.7, 1.0)); // bright yellow-white
  vec3 fireMid = hsv2rgb(vec3(hue1 * 0.05 + 0.06, sat, 0.95));      // orange
  vec3 fireOuter = hsv2rgb(vec3(hue2 * 0.04 + 0.01, sat * 0.9, 0.7)); // deep red
  // Ensure warm tones
  fireCore = mix(fireCore, vec3(1.0, 0.95, 0.6), 0.5);
  fireMid = mix(fireMid, vec3(1.0, 0.55, 0.1), 0.4);
  fireOuter = mix(fireOuter, vec3(0.8, 0.15, 0.02), 0.4);

  // === FLAME SHAPE: FBM-driven fire ===
  vec2 fireUV = p - vec2(0.0, -0.30); // fire origin at bottom center
  // Upward flow: y-offset increases with time for rising motion
  float sway = bass * 0.15 * mix(1.0, 0.5, beatStab) * sin(fireUV.y * 3.0 + slowTime * 2.0);
  vec3 flamePos = vec3(
    fireUV.x * 3.0 + sway,
    fireUV.y * 2.5 - slowTime * 1.5,
    slowTime * 0.8
  );

  float flameDensity = flameFBM(flamePos, onset * 0.8 + tensionTurb);
  // Shape: cone tapering upward
  float coneWidth = mix(0.25, 0.45, energy) * (1.0 - smoothstep(0.0, fireHeight, fireUV.y));
  float coneMask = smoothstep(coneWidth, coneWidth * 0.3, abs(fireUV.x));
  float heightMask = smoothstep(fireHeight, 0.0, fireUV.y) * step(0.0, fireUV.y);

  float flame = flameDensity * coneMask * heightMask;
  flame = smoothstep(-0.1, 0.5, flame) * fireIntensity;

  // Color varies with height: white-yellow core -> orange -> red tips
  float flameH = clamp(fireUV.y / max(fireHeight, 0.01), 0.0, 1.0);
  vec3 flameColor = mix(fireCore, fireMid, smoothstep(0.0, 0.4, flameH));
  flameColor = mix(flameColor, fireOuter, smoothstep(0.3, 0.8, flameH));

  // HDR fire: allow values > 1.0 for bloom to pick up
  col += flameColor * flame * 2.5;

  // === EMBERS: rising sparks on beat ===
  float emberBurst = max(bp, uBeatSnap) * energy;
  float emberCount = mix(5.0, 25.0, energy + sJam * 0.3);
  vec3 emberCol = mix(fireMid, fireCore, 0.3);
  float emberTotal = 0.0;
  for (int i = 0; i < 25; i++) {
    if (float(i) >= emberCount) break;
    emberTotal += ember(p, float(i) * 7.13 + 0.5, uDynamicTime, emberBurst);
  }
  col += emberCol * emberTotal * mix(0.3, 1.5, energy) * 3.0;

  // === SMOKE WISPS: from flatness (noise-like audio = more smoke) ===
  float smokeAmount = flatness * 0.4 + 0.05;
  smokeAmount *= mix(1.0, 0.2, sSpace); // less smoke in space
  vec2 smokeUV = p - vec2(0.0, -0.1);
  float smokeN = fbm(vec3(smokeUV.x * 2.0 + sin(slowTime * 0.3) * 0.2,
                           smokeUV.y * 1.5 - slowTime * 0.5,
                           slowTime * 0.2));
  float smokeMask = smoothstep(0.0, 0.5, smokeUV.y) * smoothstep(0.8, 0.2, smokeUV.y);
  smokeMask *= smoothstep(0.4, 0.1, abs(smokeUV.x));
  float smoke = smoothstep(-0.1, 0.3, smokeN) * smokeMask * smokeAmount;
  vec3 smokeColor = mix(vec3(0.15, 0.1, 0.08), vec3(0.25, 0.2, 0.18), smokeN * 0.5 + 0.5);
  col = mix(col, smokeColor, smoke * 0.3);

  // === WARM LIGHT RADIUS: illuminates surroundings ===
  // At rest: barely see beyond fire. At peaks: whole clearing lit.
  float lightRadius = mix(0.15, 0.9, energy) + vocalRms * 0.15 + climaxBoost * 0.2;
  lightRadius *= mix(1.0, 1.3, sJam) * mix(1.0, 0.3, sSpace);
  float distFromFire = length(p - vec2(0.0, -0.25));
  float warmLight = smoothstep(lightRadius, lightRadius * 0.1, distFromFire);
  warmLight *= fireIntensity;

  // Warm ambient light on ground and surroundings
  vec3 warmColor = mix(fireMid, fireCore, 0.3) * 0.15;
  warmColor += vec3(vocalRms * 0.05, vocalRms * 0.03, 0.0); // vocal warmth
  col += warmColor * warmLight * (1.0 - flame * 0.5);

  // Firelight flicker on ground
  float flicker = 0.8 + 0.2 * sin(uTime * 8.0 + p.x * 5.0) * (0.5 + 0.5 * snoise(vec3(p.x * 3.0, uTime * 4.0, 0.0)));
  col *= mix(1.0, flicker, warmLight * 0.3);

  // === GROUND: dark earth with warm reflections ===
  vec3 groundCol = vec3(0.02, 0.015, 0.01);
  groundCol += warmColor * warmLight * 0.5 * flicker;
  col = mix(col, groundCol, groundMask);

  // Log highlights
  col += vec3(0.15, 0.06, 0.02) * logs * warmLight * flicker;

  // === TREE SILHOUETTES at edges ===
  float treeL = smoothstep(0.0, 0.02, p.x + 0.6 + snoise(vec3(p.y * 8.0, 0.0, 2.0)) * 0.05);
  float treeR = smoothstep(0.0, 0.02, -p.x + 0.6 + snoise(vec3(p.y * 8.0, 0.0, 5.0)) * 0.05);
  float treeMask = (1.0 - treeL) + (1.0 - treeR);
  treeMask *= step(-0.3, p.y) * smoothstep(0.5, -0.3, p.y);
  col = mix(col, vec3(0.005, 0.005, 0.01), treeMask * 0.8);

  // === SDF ICON EMERGENCE ===
  {
    float nf = flameFBM(vec3(p * 2.0, slowTime * 0.5), 0.0);
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, fireMid, fireOuter, nf, uClimaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === DIM STARS behind fire glow ===
  col -= starColor * 0.35 * warmLight;

  // === VIGNETTE: tighter than aurora ===
  float vigScale = mix(0.35, 0.25, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.005, 0.005), col, vignette);

  // === DARKNESS TEXTURE: prevent dead black in quiet passages ===
  col += darknessTexture(uv, uTime, energy);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
