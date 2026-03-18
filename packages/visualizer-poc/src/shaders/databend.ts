/**
 * Databend — JPEG compression artifact aesthetic with macroblock displacement,
 * DCT corruption patterns, channel separation, and quantization banding.
 *
 * Visual aesthetic:
 *   - Quiet: subtle quantization banding, barely visible macroblock grid
 *   - Building: block displacement grows, DCT basis functions become visible
 *   - Peak: extreme corruption events, channel separation, block cascades
 *   - Release: corruption freezes then slowly resolves back to faint banding
 *
 * Audio reactivity:
 *   uEnergy              -> corruption intensity
 *   uBass                -> block displacement distance
 *   uOnsetSnap           -> new corruption event (triggers block cascade)
 *   uBeatSnap            -> clarity recovery moment (blocks snap back)
 *   uStemDrums           -> horizontal block shift
 *   uEnergyForecast      -> pre-corruption buildup
 *   uSectionType         -> corruption character (verse=bands, chorus=blocks, etc.)
 *   uImprovisationScore  -> displacement randomness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const databendVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const databendFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ bloomEnabled: false, halationEnabled: false, grainStrength: "normal", paletteCycleEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Hash functions
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// JPEG-like macroblock grid (8x8 blocks)
vec2 macroblockId(vec2 uv, float blockSize) {
  return floor(uv * blockSize);
}

vec2 macroblockUV(vec2 uv, float blockSize) {
  return fract(uv * blockSize);
}

// DCT basis function approximation (2D cosine)
// Simulates the visual appearance of DCT coefficients becoming visible
float dctBasis(vec2 uv, float u, float v) {
  return cos(PI * u * (uv.x + 0.5)) * cos(PI * v * (uv.y + 0.5));
}

// Quantization banding: reduces color precision to simulate JPEG quantization
vec3 quantize(vec3 col, float levels) {
  return floor(col * levels + 0.5) / levels;
}

// Block displacement: shifts macroblocks by corrupt motion vectors
vec2 blockDisplace(vec2 blockId, float time, float intensity, float randomness) {
  // Each block gets a pseudo-random displacement vector
  float blockHash = hash2(blockId + floor(time * 2.0));
  // Gate: only some blocks are displaced
  float displaced = step(1.0 - intensity * 0.5, blockHash);
  // Displacement direction and distance
  float angle = hash2(blockId * 3.17 + floor(time * 3.0)) * TAU;
  float dist = hash2(blockId * 7.31 + floor(time * 2.5)) * intensity * (0.3 + randomness * 0.7);
  return vec2(cos(angle), sin(angle)) * dist * displaced;
}

// Channel separation: each RGB channel samples from different block offsets
vec3 channelSeparation(vec2 uv, vec2 blockId, float amount) {
  vec2 rOffset = vec2(amount * 0.02, 0.0) * hash2(blockId + 10.0);
  vec2 gOffset = vec2(0.0, -amount * 0.015) * hash2(blockId + 20.0);
  vec2 bOffset = vec2(-amount * 0.018, amount * 0.01) * hash2(blockId + 30.0);
  return vec3(rOffset.x + gOffset.x, rOffset.y + gOffset.y, bOffset.x + bOffset.y);
}

// Cascade corruption: a "wave" of block displacement spreading from onset point
float cascadeWave(vec2 blockId, float time, float origin, float speed) {
  float dist = length(blockId - vec2(origin * 10.0, 5.0));
  float waveFront = time * speed - dist * 0.3;
  return smoothstep(0.0, 0.5, waveFront) * smoothstep(2.0, 0.5, waveFront);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float drumShift = clamp(uStemDrums, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float sectionType = clamp(uSectionType, 0.0, 7.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.05;

  // Phase 1 uniform integrations
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // --- Corruption parameters ---
  float corruption = energy * 0.6 + forecast * 0.2;
  float blockDisplaceDist = bass * 0.15;
  float randomness = improv;

  // Beat recovery reduces corruption momentarily
  corruption *= 1.0 - beatSnap * 0.5;

  // --- Block grid ---
  float blockSize = mix(8.0, 16.0, step(4.0, sectionType)); // smaller blocks for intense sections
  // Scale block size to resolution
  float blocksX = floor(uResolution.x / blockSize);
  float blocksY = floor(uResolution.y / blockSize);
  vec2 blockScale = vec2(blocksX, blocksY) / uResolution;
  vec2 scaledUV = uv * vec2(blocksX, blocksY) / vec2(blocksX, blocksY); // normalized

  vec2 blockId = floor(uv * vec2(blocksX, blocksY));
  vec2 blockUV = fract(uv * vec2(blocksX, blocksY));

  // --- Block displacement ---
  vec2 displacement = blockDisplace(blockId, uDynamicTime, blockDisplaceDist, randomness);

  // Drum-driven horizontal shift for entire rows
  float rowId = blockId.y;
  float drumRowShift = drumShift * 0.03 * (hash(rowId + floor(uDynamicTime * 4.0)) - 0.5);
  displacement.x += drumRowShift;

  // Onset cascade: wave of corruption spreading outward
  float cascadeTime = max(0.0, uDynamicTime - floor(uDynamicTime)); // time since last "second"
  float cascade = cascadeWave(blockId, cascadeTime, hash(floor(uDynamicTime)), 8.0) * onset;
  displacement *= 1.0 + cascade * 3.0;

  // Apply displacement to sampling UV
  vec2 corruptedUV = uv + displacement / vec2(blocksX, blocksY);
  corruptedUV = fract(corruptedUV); // wrap

  // --- The "original" image: flowing colorful content ---
  // Layer 1: smooth gradient base
  vec3 baseContent = vec3(0.0);
  float grad1 = fbm(vec3(corruptedUV * 3.0, slowTime * 0.3));
  float grad2 = snoise(vec3(corruptedUV * 5.0 + 15.0, slowTime * 0.5));
  baseContent = hsv2rgb(vec3(hue1 + grad1 * 0.2, sat, 0.4 + grad1 * 0.3));
  vec3 layer2Color = hsv2rgb(vec3(hue2 + grad2 * 0.15, sat * 0.8, 0.3 + grad2 * 0.2));
  baseContent = mix(baseContent, layer2Color, smoothstep(-0.2, 0.2, grad2));

  // Layer 2: geometric content (circles, lines) that gets corrupted
  float circle = smoothstep(0.02, 0.0, abs(length(corruptedUV - 0.5) - 0.2 - sin(slowTime) * 0.05));
  baseContent += hsv2rgb(vec3(hue1 + 0.3, sat, 0.6)) * circle * 0.4;

  // Horizontal lines
  float hLines = smoothstep(0.01, 0.0, abs(fract(corruptedUV.y * 8.0) - 0.5) - 0.48);
  baseContent += hsv2rgb(vec3(hue2 + 0.1, sat * 0.5, 0.3)) * hLines * 0.2;

  // --- Apply corruption effects ---
  vec3 col = baseContent;

  // DCT basis visibility: high-frequency cosine patterns bleed through
  float dctVisibility = corruption * 0.4;
  if (dctVisibility > 0.05) {
    // Show multiple DCT basis functions
    float dct1 = dctBasis(blockUV, 3.0, 1.0) * 0.5 + 0.5;
    float dct2 = dctBasis(blockUV, 1.0, 4.0) * 0.5 + 0.5;
    float dct3 = dctBasis(blockUV, 2.0, 2.0) * 0.5 + 0.5;
    float dctMix = dct1 * 0.4 + dct2 * 0.3 + dct3 * 0.3;
    // DCT artifacts are colored by the block's average color
    vec3 dctColor = col * dctMix;
    col = mix(col, dctColor, dctVisibility * (0.5 + hash2(blockId) * 0.5));
  }

  // Quantization banding
  float quantLevels = mix(256.0, 4.0, corruption * 0.8);
  col = quantize(col, quantLevels);

  // Channel separation on displaced blocks
  float channelSepAmount = corruption * 1.5;
  if (channelSepAmount > 0.1) {
    vec3 sepOffsets = channelSeparation(uv, blockId, channelSepAmount);
    vec2 rUV = fract(corruptedUV + vec2(sepOffsets.x, 0.0));
    vec2 bUV = fract(corruptedUV + vec2(0.0, sepOffsets.z));
    float rContent = fbm3(vec3(rUV * 3.0, slowTime * 0.3));
    float bContent = fbm3(vec3(bUV * 3.0, slowTime * 0.3));
    col.r = mix(col.r, rContent * 0.5 + 0.3, channelSepAmount * 0.15);
    col.b = mix(col.b, bContent * 0.5 + 0.3, channelSepAmount * 0.12);
  }

  // --- Block boundary artifacts ---
  // Macroblock grid lines visible during corruption
  float gridLine = smoothstep(0.05, 0.0, min(blockUV.x, blockUV.y));
  gridLine += smoothstep(0.05, 0.0, min(1.0 - blockUV.x, 1.0 - blockUV.y));
  gridLine = min(gridLine, 1.0);
  col = mix(col, col * 0.5 + vec3(0.1, 0.08, 0.06), gridLine * corruption * 0.4);

  // --- Onset: trigger new corruption event ---
  if (onset > 0.3) {
    // Row of blocks shifts dramatically
    float onsetRow = floor(uv.y * blocksY);
    float onsetGate = step(0.7, hash(onsetRow + floor(uDynamicTime * 10.0)));
    float shiftAmount = onset * 0.15 * onsetGate;
    vec2 onsetUV = fract(uv + vec2(shiftAmount, 0.0));
    vec3 shiftedContent = hsv2rgb(vec3(hue1 + 0.3, sat, 0.5 + fbm3(vec3(onsetUV * 4.0, slowTime)) * 0.3));
    col = mix(col, shiftedContent, onset * onsetGate * 0.5);
  }

  // --- Forecast buildup: blocks start to wobble before corruption ---
  if (forecast > 0.3) {
    float wobble = sin(blockId.x * 2.0 + uDynamicTime * 8.0) * forecast * 0.003;
    col.rg += wobble;
  }

  // --- Section-specific corruption character ---
  // Low sections: horizontal banding
  if (sectionType < 2.0) {
    float band = sin(uv.y * uResolution.y * 0.5 + uDynamicTime * 2.0) * 0.5 + 0.5;
    col *= 0.9 + band * 0.2 * corruption;
  }
  // High sections: complete block shuffling
  if (sectionType > 5.0) {
    float shuffleGate = step(0.6, hash2(blockId + floor(uDynamicTime * 1.5)));
    vec2 shuffledBlockId = floor(vec2(
      hash2(blockId * 2.71) * blocksX,
      hash2(blockId * 3.14) * blocksY
    ));
    vec3 shuffledColor = hsv2rgb(vec3(
      hue2 + hash2(shuffledBlockId) * 0.3,
      sat * 0.6,
      0.3 + hash2(shuffledBlockId + 10.0) * 0.4
    ));
    col = mix(col, shuffledColor, shuffleGate * corruption * 0.4);
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.1;

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
  col = mix(vec3(0.02, 0.015, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
