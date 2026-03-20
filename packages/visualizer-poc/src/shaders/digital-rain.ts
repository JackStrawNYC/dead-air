/**
 * Digital Rain — Matrix-style cascading glyphs.
 * Cascading glyph columns with depth parallax. Beat-synced glitch flash.
 * Chord changes swap glyph sets.
 *
 * Audio reactivity:
 *   uEnergy     → fall speed + density
 *   uBeatSnap   → glitch flash
 *   uChordIndex → glyph set selection
 *   uMids       → glyph brightness
 *   uOnset      → character change rate
 *   uBass       → column width
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const digitalRainVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const digitalRainFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  grainStrength: "light",
})}

varying vec2 vUv;

#define PI 3.14159265

// Pseudo-random for column seeding
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Glyph pattern — abstract geometric shapes based on grid position
float glyphPattern(vec2 cellUV, float seed, float chordIdx) {
  // Rotate based on chord index for visual variety
  float angle = chordIdx * 0.26;
  float ca = cos(angle), sa = sin(angle);
  vec2 ruv = vec2(ca * cellUV.x - sa * cellUV.y, sa * cellUV.x + ca * cellUV.y);

  // Create abstract glyph from combined shapes
  float s1 = step(0.2, abs(ruv.x)) + step(0.2, abs(ruv.y));
  float s2 = step(0.6, length(ruv));
  float s3 = step(0.3, abs(ruv.x + ruv.y));

  // Mix shapes based on seed for variety
  float pattern = mix(s1, s2, fract(seed * 3.7));
  pattern = mix(pattern, s3, fract(seed * 7.3) * 0.5);

  // Add crosshatch lines
  float lines = step(0.9, fract(ruv.x * 4.0 + seed * 2.0)) +
                step(0.9, fract(ruv.y * 4.0 + seed * 5.0));
  pattern = max(pattern, lines * 0.5);

  return clamp(1.0 - pattern, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnset, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float chordIndex = uChordIndex;
  float chromaHueMod = uChromaHue * 0.15;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float slowTime = uDynamicTime;

  // --- Column parameters ---
  float columnWidth = mix(0.03, 0.02, bass) * mix(1.0, 0.8, sJam) * mix(1.0, 1.5, sSpace);
  float fallSpeed = (0.3 + energy * 0.5) * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.2, sChorus);
  float glyphSize = columnWidth * 0.9;

  vec3 col = vec3(0.005, 0.008, 0.005); // dark green-tinted background

  // --- Cascading columns ---
  float numColumns = 1.0 / columnWidth;

  // Column index
  float colIdx = floor((p.x + 0.5 * aspect.x) / columnWidth);
  float colCenter = (colIdx + 0.5) * columnWidth - 0.5 * aspect.x;

  // Column-specific properties
  float colSeed = hash11(colIdx * 127.1);
  float colSpeed = fallSpeed * (0.5 + colSeed * 1.0);
  float colPhase = colSeed * 100.0;

  // Vertical position in column
  float colY = p.y + slowTime * colSpeed + colPhase;

  // Glyph cell
  float cellIdx = floor(colY / glyphSize);
  vec2 cellUV = vec2(
    (p.x - colCenter) / glyphSize,
    fract(colY / glyphSize)
  );
  cellUV = cellUV * 2.0 - 1.0; // -1 to 1

  // Glyph seed changes based on onset
  float glyphSeed = hash21(vec2(colIdx, cellIdx + floor(onset * 2.0 + slowTime * 0.1)));

  // Character change rate from onset
  float changeRate = onset * 0.5;
  glyphSeed += floor(slowTime * changeRate) * 0.1;

  // Draw glyph
  float glyph = glyphPattern(cellUV, glyphSeed, chordIndex);

  // Fade trail: brighter at top of column
  float trailLen = 8.0 + energy * 12.0;
  float trailHead = fract(slowTime * colSpeed * 0.1 + colSeed * 10.0);
  float normalizedY = fract(colY * 0.02);
  float trailDist = fract(trailHead - normalizedY);
  float trailFade = smoothstep(trailLen * 0.02, 0.0, trailDist);

  // Head brightness (lead character is brightest)
  float headGlow = smoothstep(0.02, 0.0, trailDist) * 1.5;

  // Column density varies
  float density = step(0.3 - energy * 0.2, colSeed);

  // Color
  float hue = uPalettePrimary + chromaHueMod;
  float sat = mix(0.6, 1.0, mids) * uPaletteSaturation;
  float val = glyph * (trailFade + headGlow) * density * mids;

  // Head character is white-green
  vec3 glyphColor = mix(
    hsv2rgb(vec3(hue, sat, val)),
    vec3(val * 1.2),
    headGlow * 0.5
  );

  col += glyphColor;

  // --- Depth parallax: background layer ---
  float bgColumnWidth = columnWidth * 2.0;
  float bgColIdx = floor((p.x + 0.5 * aspect.x) / bgColumnWidth);
  float bgColSeed = hash11(bgColIdx * 237.5);
  float bgY = p.y + slowTime * fallSpeed * 0.3 + bgColSeed * 50.0;
  float bgCellIdx = floor(bgY / (bgColumnWidth * 0.9));
  float bgGlyphSeed = hash21(vec2(bgColIdx, bgCellIdx));
  vec2 bgCellUV = vec2(
    (p.x - (bgColIdx + 0.5) * bgColumnWidth + 0.5 * aspect.x) / (bgColumnWidth * 0.9),
    fract(bgY / (bgColumnWidth * 0.9))
  ) * 2.0 - 1.0;
  float bgGlyph = glyphPattern(bgCellUV, bgGlyphSeed, chordIndex);
  float bgFade = fract(slowTime * 0.05 + bgColSeed * 5.0);
  bgFade = smoothstep(0.5, 0.0, bgFade);
  col += hsv2rgb(vec3(hue + 0.05, sat * 0.5, bgGlyph * bgFade * 0.08));

  // --- Beat-synced glitch flash ---
  if (beatSnap > 0.5) {
    float glitchStrength = (beatSnap - 0.5) * 2.0;
    float glitchY = hash11(floor(p.y * 20.0 + slowTime * 100.0));
    float glitchBand = step(0.85, glitchY);
    col += vec3(0.1, 0.3, 0.1) * glitchBand * glitchStrength;

    // Horizontal shift on strong beats
    float shift = glitchStrength * 0.02 * sin(p.y * 50.0);
    col.r += col.g * abs(shift) * 5.0;
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime * 0.05));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.002, 0.005, 0.002), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
