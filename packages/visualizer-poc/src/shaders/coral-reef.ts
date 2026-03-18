/**
 * Coral Reef — underwater coral garden with polyps, bioluminescent plankton,
 * caustic light overlay, and swaying anemone tentacles.
 * No feedback needed — all procedural from noise fields.
 *
 * Feedback: No
 *
 * Audio reactivity:
 *   uEnergy         → polyp open/close state + plankton density
 *   uBass           → tentacle sway amplitude
 *   uHighs          → bioluminescent sparkle intensity
 *   uStemBass       → deep water pressure pulse
 *   uBeatStability  → wave regularity (stable = gentle swell, unstable = chop)
 *   uEnergyForecast → depth anticipation (darkens/lightens)
 *   uChromaHue      → coral hue shifts from harmonic content
 *   uChordIndex     → chord-driven color variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const coralReefVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const coralReefFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  thermalShimmerEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- Branching coral SDF ---
// Recursive branching approximated by overlapping capsule SDFs
float coralBranch(vec2 p, vec2 base, float angle, float height, float thickness, int depth) {
  vec2 dir = vec2(sin(angle), cos(angle));
  vec2 tip = base + dir * height;

  // Capsule SDF: distance from line segment
  vec2 pa = p - base;
  vec2 ba = tip - base;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h) - mix(thickness, thickness * 0.3, h); // taper

  return d;
}

// --- Caustic light pattern (reused from deep-ocean approach) ---
float causticLight(vec2 p, float time, float scale) {
  p *= scale;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.0 / float(n + 1)));
    i = p + vec2(
      cos(t - i.x) + sin(t + i.y),
      sin(t - i.y) + cos(t + i.x)
    );
    c += 1.0 / length(vec2(
      p.x / (sin(i.x + t) / inten),
      p.y / (cos(i.y + t) / inten)
    ));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 6.0), 0.0, 1.0);
}

// --- Anemone tentacle ---
float tentacle(vec2 p, vec2 base, float swayAmt, float time, float seed) {
  float segLen = 0.04;
  float d = 1e10;
  vec2 pos = base;
  float angle = PI * 0.5; // starts pointing up

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    // Each segment sways with phase offset
    float sway = sin(time * 2.0 + fi * 0.8 + seed * 5.0) * swayAmt * (fi / 8.0);
    angle += sway * 0.3;

    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 nextPos = pos + dir * segLen;

    // Capsule distance for this segment
    vec2 pa = p - pos;
    vec2 ba = nextPos - pos;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float thickness = mix(0.008, 0.002, fi / 8.0); // taper
    float segDist = length(pa - ba * h) - thickness;
    d = min(d, segDist);

    pos = nextPos;
  }
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.06;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // --- Color palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.9, energy) * uPaletteSaturation;

  // --- Deep water background ---
  // Depth anticipation: forecast darkens the scene (anticipating a swell)
  float depthMod = mix(1.0, 0.7, forecast);
  vec3 deepWater = hsv2rgb(vec3(hue1 + 0.55, 0.6, 0.08 * depthMod));
  vec3 shallowWater = hsv2rgb(vec3(hue1 + 0.5, 0.5, 0.2 * depthMod));

  // Gradient: deeper at bottom, shallower at top
  float depthGrad = smoothstep(-0.5, 0.5, p.y);
  vec3 col = mix(deepWater, shallowWater, depthGrad);

  // --- Water wave distortion ---
  // Beat stability controls wave regularity
  float waveFreq = mix(3.0, 8.0, 1.0 - stability);
  float waveSway = sin(p.x * waveFreq + uDynamicTime * 0.8) * 0.02 * (1.0 + bass * 0.5);
  vec2 waterP = p + vec2(0.0, waveSway);

  // Deep water pressure pulse from stem bass
  float pressurePulse = stemBass * sin(uDynamicTime * 1.5 - length(waterP) * 4.0) * 0.01;
  waterP += vec2(pressurePulse);

  // --- Coral structures ---
  // Multiple coral colonies at different positions
  float coralMask = 0.0;
  vec3 coralColor = vec3(0.0);

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = fi * 7.13 + 3.0;

    // Coral base position: distributed along bottom
    vec2 coralBase = vec2(
      (fi / 4.0 - 0.5) * 1.2 + sin(seed) * 0.15,
      -0.35 + sin(seed * 2.0) * 0.05
    );

    // Per-coral hue variation
    float coralHue = hue1 + fi * 0.08 + chromaHueMod;
    float coralSat = sat * mix(0.7, 1.0, sin(seed * 3.0) * 0.5 + 0.5);

    // Main trunk
    float trunkAngle = PI * 0.5 + sin(uDynamicTime * 0.3 + seed) * bass * 0.05;
    float trunkHeight = 0.15 + sin(seed * 5.0) * 0.05;
    float trunkThick = 0.012 + bass * 0.004;
    float trunk = coralBranch(waterP, coralBase, trunkAngle, trunkHeight, trunkThick, 0);

    // Branches: 2-3 per coral
    float branches = 1e10;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float branchSeed = seed + fj * 11.7;
      vec2 branchBase = coralBase + vec2(sin(trunkAngle), cos(trunkAngle)) * trunkHeight * (0.3 + fj * 0.25);
      float branchAngle = trunkAngle + (fj - 1.0) * 0.5 + sin(branchSeed) * 0.3;
      float branchHeight = trunkHeight * 0.6;
      float branchThick = trunkThick * 0.6;
      float b = coralBranch(waterP, branchBase, branchAngle, branchHeight, branchThick, 0);
      branches = min(branches, b);
    }

    float coralDist = min(trunk, branches);
    float coralGlow = smoothstep(0.02, 0.0, coralDist);
    float coralEdge = smoothstep(0.005, 0.0, abs(coralDist));

    vec3 thisCoralColor = hsv2rgb(vec3(coralHue, coralSat, 0.6 + energy * 0.3));
    vec3 edgeHighlight = hsv2rgb(vec3(coralHue + 0.1, coralSat * 0.6, 0.9));

    coralColor += thisCoralColor * coralGlow + edgeHighlight * coralEdge * 0.5;
    coralMask = max(coralMask, coralGlow);
  }

  col += coralColor;

  // --- Polyps: tiny circles that open/close with energy ---
  float polypState = smoothstep(0.2, 0.7, energy); // open when energy high
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = fi * 3.71 + 20.0;
    vec2 polypPos = vec2(
      (fract(sin(seed * 12.9898) * 43758.5453) - 0.5) * 1.4,
      (fract(sin(seed * 78.233) * 43758.5453) - 0.5) * 0.4 - 0.2
    );

    float polypSize = (0.008 + polypState * 0.006) * (0.8 + sin(seed * 5.0) * 0.2);
    float dist = length(waterP - polypPos);
    float polyp = smoothstep(polypSize, polypSize * 0.3, dist);

    // Polyp petals: radial pattern when open
    float petalAngle = atan(waterP.y - polypPos.y, waterP.x - polypPos.x);
    float petals = (sin(petalAngle * 6.0) * 0.5 + 0.5) * polypState;
    polyp *= 0.5 + petals * 0.5;

    float polypHue = hue2 + fi * 0.04;
    vec3 polypColor = hsv2rgb(vec3(polypHue, sat, 0.8));
    col += polypColor * polyp * 0.4;
  }

  // --- Anemone tentacles: swaying with bass ---
  float swayAmount = 0.1 + bass * 0.25;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float seed = fi * 5.31 + 50.0;
    vec2 anemoneBase = vec2(
      (fi / 3.0 - 0.5) * 1.0 + sin(seed) * 0.2,
      -0.38 + sin(seed * 3.0) * 0.03
    );

    // Multiple tentacles per anemone
    for (int j = 0; j < 5; j++) {
      float fj = float(j);
      float tSeed = seed + fj * 3.17;
      vec2 tBase = anemoneBase + vec2((fj - 2.0) * 0.015, 0.0);
      float td = tentacle(waterP, tBase, swayAmount, uDynamicTime, tSeed);
      float tGlow = smoothstep(0.008, 0.0, td);

      float tHue = hue2 + 0.1 + fi * 0.05;
      vec3 tColor = hsv2rgb(vec3(tHue, sat * 0.8, 0.7 + mids * 0.3));
      // Tips glow brighter
      float tipBrightness = smoothstep(0.0, 0.3, waterP.y - anemoneBase.y);
      col += tColor * tGlow * (0.3 + tipBrightness * 0.5);
    }
  }

  // --- Caustic light overlay ---
  float caustic1 = causticLight(waterP + vec2(uDynamicTime * 0.03, 0.0), uDynamicTime * 0.8, 5.0);
  float caustic2 = causticLight(waterP - vec2(0.2, 0.1), uDynamicTime * 0.6 + 10.0, 7.0);
  float caustics = caustic1 * 0.6 + caustic2 * 0.4;
  // Caustics visible more at top (closer to surface)
  float causticFade = smoothstep(-0.3, 0.4, p.y);
  vec3 causticColor = hsv2rgb(vec3(hue1 + 0.45, 0.3, 1.0));
  col += causticColor * caustics * causticFade * 0.35;

  // --- Bioluminescent plankton sparkle ---
  float planktonDensity = energy * 0.7 + (1.0 - energy) * 0.2; // always some present
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float seed = fi * 11.31 + 80.0;
    vec2 planktonPos = vec2(
      snoise(vec3(seed, uDynamicTime * 0.06, 0.0)) * 0.7,
      snoise(vec3(0.0, seed, uDynamicTime * 0.05)) * 0.45
    );

    float dist = length(waterP - planktonPos);
    // Tiny sparkles
    float sparkle = smoothstep(0.015, 0.002, dist);
    float twinkle = 0.3 + 0.7 * pow(sin(uDynamicTime * 5.0 + seed * 3.0) * 0.5 + 0.5, 3.0);

    // Highs drive sparkle intensity
    vec3 sparkleColor = hsv2rgb(vec3(hue2 + 0.2 + fi * 0.02, 0.4, 1.0));
    col += sparkleColor * sparkle * twinkle * highs * planktonDensity * 0.5;
  }

  // --- Floating particulate / marine snow ---
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fi * 9.17 + 120.0;
    float driftSpeed = 0.02 + fi * 0.005;
    vec2 particlePos = vec2(
      fract(seed * 0.37 + uDynamicTime * driftSpeed * 0.3) * 1.4 - 0.7,
      fract(seed * 0.53 - uDynamicTime * driftSpeed * 0.2) * 1.0 - 0.5
    );
    float dist = length(waterP - particlePos);
    float particle = smoothstep(0.006, 0.002, dist);
    col += vec3(0.3, 0.5, 0.6) * particle * 0.06;
  }

  // --- Deep water fog ---
  float fogDensity = mix(0.4, 0.15, energy);
  float fogNoise = fbm3(vec3(waterP * 2.0, uDynamicTime * 0.03));
  float fog = fogDensity * (0.5 + fogNoise * 0.5);
  vec3 fogColor = mix(deepWater, shallowWater, 0.3) * 0.3;
  col = mix(col, fogColor, fog * 0.4);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(deepWater * 0.3, col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
