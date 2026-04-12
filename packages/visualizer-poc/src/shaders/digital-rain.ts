/**
 * Digital Rain — raymarched 3D volumetric matrix rain.
 * Columns of glowing descending glyphs at varying Z-distances create a
 * true volumetric forest of digital rain. Camera moves through the columns.
 * Each column is a cylinder of descending glyph particles with emission,
 * volumetric scatter, depth fog, and reflective floor.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → column sway amplitude
 *   uEnergy           → rain density / overall brightness
 *   uDrumOnset        → wave of brightness through columns
 *   uVocalPresence    → ambient green glow
 *   uHarmonicTension  → rain fall speed
 *   uSectionType      → jam=dense rapid, space=sparse slow, chorus=full downpour
 *   uClimaxPhase      → rain parts to reveal something behind it
 *   uClimaxIntensity  → parting intensity
 *   uMids             → glyph character cycling rate
 *   uOnset            → glyph mutation flash
 *   uBeatSnap         → horizontal glitch bands
 *   uSlowEnergy       → camera drift speed
 *   uChordIndex       → glyph set rotation
 *   uPalettePrimary   → rain column tint
 *   uPaletteSecondary → background / floor tint
 *   uTimbralBrightness→ emission sharpness
 *   uSpaceScore       → fog density
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const digitalRainVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  grainStrength: "light",
  halationEnabled: true,
  caEnabled: true,
});

export const digitalRainFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ─── Hashing ───
float drHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float drHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 drHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// ─── Glyph SDF: abstract geometric glyph within a unit cell ───
// Returns brightness [0,1] for a glyph at cell-local UV, seed selects shape
float drGlyph(vec2 cellUV, float seed, float chordIdx) {
  // Rotate glyph shape by chord index
  float angle = chordIdx * 0.26 + seed * 1.5;
  float ca = cos(angle), sa = sin(angle);
  vec2 ruv = vec2(ca * cellUV.x - sa * cellUV.y, sa * cellUV.x + ca * cellUV.y);

  // Multi-shape composite: select shapes by seed bands
  float band = fract(seed * 7.31);

  float s1 = step(0.2, abs(ruv.x)) + step(0.2, abs(ruv.y));
  float s2 = step(0.55, length(ruv));
  float s3 = step(0.25, abs(ruv.x + ruv.y));
  float s4 = step(0.25, abs(ruv.x - ruv.y));

  float pattern;
  if (band < 0.25) {
    pattern = s1 * (1.0 - s2);
  } else if (band < 0.5) {
    pattern = s2 + s3 * 0.5;
  } else if (band < 0.75) {
    pattern = s3 * s4;
  } else {
    pattern = max(s1, s4) * (1.0 - s2);
  }

  // Crosshatch lines for texture
  float lines = step(0.92, fract(ruv.x * 4.0 + seed * 2.0)) +
                step(0.92, fract(ruv.y * 4.0 + seed * 5.0));
  pattern = max(pattern, lines * 0.6);

  return clamp(1.0 - pattern, 0.0, 1.0);
}

// ─── Column: a single rain column at grid position (ix, iz) ───
// Returns (emission brightness, column distance) for the ray point
// columnPos: world-space position of the column center (x, z)
// swayAmount: bass-driven sway
// fallSpeed: how fast glyphs descend
// density: 0=absent, 1=full
// glyphSize: world-space size of each glyph cell
struct DrColumnResult {
  float emission;
  float dist;
  float headGlow;
};

DrColumnResult drColumn(vec3 pos, vec2 columnXZ, float columnSeed,
                        float swayAmount, float fallSpeed, float density,
                        float glyphSize, float flowTime, float chordIdx,
                        float onsetMut, float drumWave) {
  DrColumnResult res;
  res.emission = 0.0;
  res.dist = 100.0;
  res.headGlow = 0.0;

  if (density < 0.01) return res;

  // Column sway (bass-driven sinusoidal displacement)
  float swayPhase = columnSeed * TAU + flowTime * 0.3;
  float sx = sin(swayPhase) * swayAmount;
  float sz = cos(swayPhase * 0.7 + 1.3) * swayAmount * 0.6;
  vec2 swayedXZ = columnXZ + vec2(sx, sz);

  // Distance from ray point to column axis (infinite cylinder)
  vec2 delta = pos.xz - swayedXZ;
  float colDist = length(delta);
  float colRadius = glyphSize * 0.55;

  res.dist = colDist - colRadius;

  // Only compute glyph emission if we are close to the column
  if (colDist > colRadius * 3.0) return res;

  // Vertical glyph cell
  float fallY = pos.y + flowTime * fallSpeed + columnSeed * 50.0;
  float cellIdx = floor(fallY / glyphSize);
  float cellFrac = fract(fallY / glyphSize);

  // Cell-local UV for glyph rendering
  float lateralU = clamp(delta.x / colRadius, -1.0, 1.0);
  vec2 cellUV = vec2(lateralU, cellFrac * 2.0 - 1.0);

  // Glyph seed: changes with onset for mutation effect
  float glyphSeed = drHash21(vec2(columnSeed * 127.0, cellIdx + floor(onsetMut)));

  float glyph = drGlyph(cellUV, glyphSeed, chordIdx);

  // Trail fade: head of column is brightest, fading tail behind
  float trailLen = 10.0 + density * 8.0;
  float trailHead = fract(flowTime * fallSpeed * 0.08 + columnSeed * 5.0);
  float normalizedY = fract(fallY * 0.015);
  float trailDist = fract(trailHead - normalizedY);
  float trailFade = smoothstep(trailLen * 0.015, 0.0, trailDist);

  // Head glow: the leading character is white-hot
  float headBright = smoothstep(0.015, 0.0, trailDist) * 2.0;
  res.headGlow = headBright * glyph * density;

  // Drum onset wave: bright pulse travelling down the column
  float drumPhase = fract(flowTime * 0.5 - pos.y * 0.05 + columnSeed * 0.3);
  float drumPulse = drumWave * smoothstep(0.05, 0.0, abs(drumPhase - 0.5)) * 3.0;

  // Column emission (cylindrical falloff)
  float cylFalloff = 1.0 - smoothstep(0.0, colRadius, colDist);
  res.emission = glyph * (trailFade + headBright + drumPulse) * density * cylFalloff;

  return res;
}

// ─── Floor: reflective ground plane with rain column reflections ───
float drFloor(vec3 pos) {
  return pos.y + 3.0; // floor at y = -3
}

// ─── Scene distance function ───
// We raymarch a simplified field: floor plane + volumetric column sampling
float drMap(vec3 pos) {
  float floorDist = drFloor(pos);
  return floorDist;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO READS (14+ uniforms) ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnset, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float chordIndex = uChordIndex;
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float flowTime = uDynamicTime;
  float chromaHueMod = uChromaHue * 0.15;

  // === DERIVED PARAMETERS ===
  // Rain fall speed: tension drives speed, section-type modulates
  float fallSpeed = (0.6 + tension * 0.8 + energy * 0.4)
                  * mix(1.0, 1.8, sJam)    // jam: rapid
                  * mix(1.0, 0.25, sSpace)  // space: slow drip
                  * mix(1.0, 1.4, sChorus); // chorus: downpour

  // Column sway from bass
  float swayAmount = bass * 0.4 + 0.05;

  // Rain density: energy-driven, section-modulated
  float rainDensity = (0.4 + energy * 0.5)
                    * mix(1.0, 1.4, sJam)
                    * mix(1.0, 0.3, sSpace)
                    * mix(1.0, 1.3, sChorus)
                    * mix(1.0, 1.1, sSolo);

  // Glyph size (world space)
  float glyphSize = 0.3;

  // Onset mutation rate
  float onsetMut = onset * 3.0 + flowTime * mids * 0.2;

  // === CLIMAX: rain parting ===
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;
  float rainPartFactor = climaxBoost * 0.6; // columns thin out at climax

  // === PALETTE ===
  float hue1 = uPalettePrimary + chromaHueMod;
  float hue2 = uPaletteSecondary + chromaHueMod * 0.5;
  float chordHue = float(int(chordIndex)) / 24.0 * 0.1;
  float sat = uPaletteSaturation;
  vec3 rainColor1 = paletteHueColor(hue1 + chordHue, sat * 0.85, 0.95);
  vec3 rainColor2 = paletteHueColor(hue2, sat * 0.85, 0.95);

  // === CAMERA SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Gentle camera drift through the rain field
  float driftPhase = flowTime * 0.04 * (1.0 + slowEnergy * 0.3);
  ro.x += sin(driftPhase) * 2.0;
  ro.z += flowTime * 0.15 * (1.0 + slowEnergy * 0.2);
  ro.y = mix(0.0, 0.5, energy); // slight vertical lift at high energy

  // === FLOOR RAYMARCH ===
  // March to find the floor plane for reflections
  float floorT = -1.0;
  if (rd.y < -0.001) {
    floorT = -(ro.y + 3.0) / rd.y;
  }

  // === VOLUMETRIC RAIN COLUMN ACCUMULATION ===
  // Instead of marching SDF, we sample columns along the ray via grid traversal
  vec3 col = vec3(0.0);
  float totalEmission = 0.0;
  float totalHeadGlow = 0.0;

  // Grid spacing for column placement
  float gridSpacing = 1.5;
  int numSamples = int(mix(28.0, 96.0, energy));

  // March along the ray, sampling rain columns
  for (int i = 0; i < 70; i++) {
    if (i >= numSamples) break;
    float fi = float(i);
    float marchT = 0.3 + fi * 0.5;

    // Don't sample past max distance or past the floor
    if (marchT > MAX_DIST) break;
    if (floorT > 0.0 && marchT > floorT) break;

    vec3 samplePos = ro + rd * marchT;

    // Find the nearest column grid cell
    vec2 gridCell = floor(samplePos.xz / gridSpacing);

    // Check 3x3 neighborhood for nearby columns
    for (int gx = -1; gx <= 1; gx++) {
      for (int gz = -1; gz <= 1; gz++) {
        vec2 cell = gridCell + vec2(float(gx), float(gz));
        float cellSeed = drHash21(cell);

        // Column density (some cells empty for natural look)
        float colDensity = step(1.0 - rainDensity, cellSeed);

        // Climax parting: columns near center thin out
        float centerDist = length(cell * gridSpacing - ro.xz);
        colDensity *= mix(1.0, smoothstep(2.0, 6.0, centerDist), rainPartFactor);

        if (colDensity < 0.01) continue;

        // Column world position (jittered within grid cell)
        vec2 jitter = drHash22(cell) * 0.6 - 0.3;
        vec2 columnXZ = (cell + 0.5 + jitter) * gridSpacing;

        DrColumnResult cr = drColumn(
          samplePos, columnXZ, cellSeed,
          swayAmount, fallSpeed, colDensity,
          glyphSize, flowTime, chordIndex,
          onsetMut, drumOnset
        );

        if (cr.emission > 0.001) {
          // Depth fog attenuation
          float fogAtten = exp(-marchT * (0.04 + spaceScore * 0.06));

          // Color: blend primary/secondary by depth, head is white-hot
          float depthBlend = marchT / MAX_DIST;
          vec3 glyphCol = mix(rainColor1, rainColor2, depthBlend * 0.6 + cellSeed * 0.3);
          glyphCol = mix(glyphCol, vec3(1.0), 0.15 * sat); // saturation pushes toward white

          // Timbral brightness sharpens emission
          float sharpness = 1.0 + timbralBright * 0.5;

          vec3 emitColor = glyphCol * pow(cr.emission, 1.0 / sharpness) * fogAtten;

          // Head glow is near-white
          vec3 headColor = mix(glyphCol, vec3(1.0, 0.98, 0.92), 0.7) * cr.headGlow * fogAtten;

          col += emitColor * 0.06 + headColor * 0.04;
          totalEmission += cr.emission * fogAtten;
          totalHeadGlow += cr.headGlow * fogAtten;
        }
      }
    }
  }

  // === VOLUMETRIC SCATTER (green ambient haze from vocal presence) ===
  {
    float scatterAccum = 0.0;
    int scatterSteps = 16;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float st = 0.5 + fi * 1.5;
      if (st > MAX_DIST) break;
      vec3 sp = ro + rd * st;
      float noiseDensity = fbm3(sp * 0.15 + vec3(flowTime * 0.02, 0.0, flowTime * 0.01));
      noiseDensity = max(0.0, noiseDensity);
      float fogAtten = exp(-st * 0.06);
      scatterAccum += noiseDensity * fogAtten * 0.04;
    }
    // Vocal presence makes the scatter green-tinted
    vec3 scatterColor = mix(rainColor2 * 0.15, vec3(0.05, 0.25, 0.08), vocalPresence * 0.7);
    col += scatterColor * scatterAccum * (0.6 + energy * 0.8);
  }

  // === FLOOR REFLECTION ===
  if (floorT > 0.0 && floorT < MAX_DIST) {
    vec3 floorPos = ro + rd * floorT;

    // Floor base color: dark with subtle grid pattern
    vec2 floorUV = floorPos.xz * 0.5;
    float gridLine = smoothstep(0.02, 0.0, abs(fract(floorUV.x) - 0.5)) +
                     smoothstep(0.02, 0.0, abs(fract(floorUV.y) - 0.5));
    vec3 floorBase = rainColor2 * 0.02 + vec3(gridLine * 0.015);

    // Fresnel-like reflection strength (steeper angle = more reflection)
    float fresnel = pow(1.0 - abs(rd.y), 4.0);

    // Reflected rain: sample a few nearby column reflections on the floor
    vec3 reflectedRain = vec3(0.0);
    vec2 floorGrid = floor(floorPos.xz / gridSpacing);
    for (int gx = -2; gx <= 2; gx++) {
      for (int gz = -2; gz <= 2; gz++) {
        vec2 cell = floorGrid + vec2(float(gx), float(gz));
        float cellSeed = drHash21(cell);
        if (cellSeed < 1.0 - rainDensity) continue;

        vec2 jitter = drHash22(cell) * 0.6 - 0.3;
        vec2 columnXZ = (cell + 0.5 + jitter) * gridSpacing;
        float colDist = length(floorPos.xz - columnXZ);
        float reflGlow = exp(-colDist * colDist * 0.8);

        // Trail phase for column brightness at this moment
        float trailHead = fract(flowTime * fallSpeed * 0.08 + cellSeed * 5.0);
        float brightness = 0.3 + 0.7 * trailHead;

        float depthBlend = cellSeed * 0.5;
        vec3 refCol = mix(rainColor1, rainColor2, depthBlend);
        reflectedRain += refCol * reflGlow * brightness * 0.08;
      }
    }

    // Floor fog attenuation
    float floorFog = exp(-floorT * 0.05);
    vec3 floorColor = floorBase + reflectedRain * fresnel;
    col = mix(col, floorColor * floorFog, smoothstep(MAX_DIST, 2.0, floorT) * 0.7);
  }

  // === DEPTH FOG: far columns dissolve into background ===
  {
    float fogBase = fbm3(vec3(screenP * 0.8, flowTime * 0.02)) * 0.3 + 0.1;
    vec3 fogColor = mix(vec3(0.005, 0.012, 0.005), rainColor2 * 0.04, 0.3);
    fogColor += vec3(0.02, 0.08, 0.02) * vocalPresence; // vocal green ambient
    float fogMask = 1.0 - exp(-totalEmission * 0.5);
    col = mix(fogColor * fogBase, col, 0.3 + 0.7 * clamp(totalEmission * 2.0, 0.0, 1.0));
  }

  // === CLIMAX REVEAL: something behind the rain ===
  if (climaxBoost > 0.01) {
    // A pulsing bright core visible through the parted rain
    float revealDist = length(screenP);
    float revealGlow = exp(-revealDist * revealDist * 2.0) * climaxBoost;
    // Bright mandala / sigil shape behind the rain
    float revealAngle = atan(screenP.y, screenP.x);
    float revealPattern = 0.5 + 0.5 * sin(revealAngle * 6.0 + flowTime * 0.5);
    revealPattern *= 0.5 + 0.5 * sin(revealDist * 8.0 - flowTime * 2.0);
    vec3 revealColor = mix(rainColor1 * 2.0, vec3(1.0, 0.95, 0.85), 0.5);
    col += revealColor * revealGlow * (0.3 + revealPattern * 0.4) * (1.0 - totalEmission * 0.3);
  }

  // === DRUM ONSET WAVE: horizontal band of brightness ===
  if (drumOnset > 0.05) {
    float waveFront = fract(flowTime * 0.8);
    float waveY = mix(-1.0, 1.0, waveFront);
    float waveDist = abs(screenP.y - waveY);
    float waveBright = drumOnset * smoothstep(0.15, 0.0, waveDist) * 0.4;
    col += rainColor1 * waveBright;
  }

  // === BEAT GLITCH ===
  if (beatSnap > 0.5) {
    float glitchStrength = (beatSnap - 0.5) * 2.0;
    float glitchY = drHash11(floor(screenP.y * 20.0 + flowTime * 100.0));
    float glitchBand = step(0.88, glitchY);
    col += rainColor1 * 0.2 * glitchBand * glitchStrength;
    // Chromatic split on strong beats
    col.r += col.g * glitchStrength * 0.15;
    col.b += col.g * glitchStrength * 0.08;
  }

  // === ENERGY BRIGHTNESS ===
  col *= 0.7 + energy * 0.6;

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(screenP * 2.0, flowTime * 0.05));
    vec3 c1 = mix(rainColor1, vec3(0.2, 1.0, 0.3), 0.3);
    vec3 c2 = mix(rainColor2, vec3(0.1, 0.6, 0.2), 0.3);
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
