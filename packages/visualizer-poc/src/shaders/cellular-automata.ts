/**
 * Cellular Automata — hexagonal cells dividing/multiplying with feedback persistence.
 * Hexagonal grid with Game-of-Life-inspired rules adapted to 6 neighbors.
 * Cell walls glow with energy, cells fade rather than snap on/off via feedback buffer.
 *
 * Visual aesthetic:
 *   - Quiet: sparse living cells, dim walls, slow evolution
 *   - Building: cells multiply outward, walls brighten, grid tightens
 *   - Peak: dense colony, pulsing walls, rapid division cascades
 *   - Release: cells die back, walls dim, grid relaxes
 *
 * Audio reactivity:
 *   uEnergy          -> cell wall brightness + grid density
 *   uBass            -> cell wall thickness
 *   uHighs           -> cell interior sparkle
 *   uOnsetSnap       -> cell division cascade (births near onset point)
 *   uHarmonicTension -> cell color variation across hexagons
 *   uBeatStability   -> grid regularity (high=regular, low=distorted boundaries)
 *   uSlowEnergy      -> overall colony vitality
 *   uMelodicPitch    -> color mapping
 *   uCoherence       -> pattern stability (high=stable, low=chaotic mutation)
 *   uChromaHue       -> hue shifts
 *   uChordIndex      -> chord-driven hue modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const cellularAutomataVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const cellularAutomataFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define SQRT3 1.7320508

// --- Hex grid helpers (axial coordinates) ---

// Hash for deterministic per-cell values
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Convert cartesian to axial hex coordinates and return (cellLocal, cellId)
vec4 hexCoord(vec2 p) {
  // Scale so hex has unit edge length
  vec2 a = mod(p, vec2(1.0, SQRT3)) - vec2(0.5, SQRT3 * 0.5);
  vec2 b = mod(p - vec2(0.5, SQRT3 * 0.5), vec2(1.0, SQRT3)) - vec2(0.5, SQRT3 * 0.5);
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  return vec4(gv.x, gv.y, id.x, id.y);
}

// Snap a point to the nearest hex center (in scaled hex space)
vec2 hexCenter(vec2 p) {
  vec4 hc = hexCoord(p);
  return hc.zw; // cell ID is the center
}

// Hex SDF: distance to hex boundary from cell-local coords
float hexSDF(vec2 gv) {
  vec2 ag = abs(gv);
  return max(ag.x, dot(ag, vec2(0.5, SQRT3 * 0.5)));
}

// Sample 6 hex neighbors by offsetting in axial directions
float sampleNeighborAlive(vec2 cellId, float hexScale, vec2 texelSize) {
  float count = 0.0;
  // 6 neighbor offsets in hex grid (unit spacing)
  vec2 offsets[6];
  offsets[0] = vec2(1.0, 0.0);
  offsets[1] = vec2(-1.0, 0.0);
  offsets[2] = vec2(0.5, SQRT3 * 0.5);
  offsets[3] = vec2(-0.5, SQRT3 * 0.5);
  offsets[4] = vec2(0.5, -SQRT3 * 0.5);
  offsets[5] = vec2(-0.5, -SQRT3 * 0.5);

  for (int i = 0; i < 6; i++) {
    vec2 neighborCenter = cellId + offsets[i];
    // Convert back to UV space
    vec2 neighborUV = neighborCenter / hexScale;
    neighborUV = neighborUV / vec2(uResolution.x / uResolution.y, 1.0) + 0.5;
    neighborUV = clamp(neighborUV, vec2(0.001), vec2(0.999));
    // Sample previous frame at neighbor center; use green channel as alive state
    float neighborState = texture2D(uPrevFrame, neighborUV).g;
    count += step(0.35, neighborState); // alive if green > 0.35
  }
  return count;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Uniform clamping ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float melodicConf = clamp(uMelodicConfidence, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float beatConf = clamp(uBeatConfidence, 0.0, 1.0);

  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float slowTime = uDynamicTime * 0.04;

  // --- Audio integrations ---
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.2;
  float vocalGlow = uVocalEnergy * 0.12;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: faster evolution + denser cells. Space: frozen + minimal. Chorus: vibrant walls. Solo: dramatic pulsing.
  float evolutionSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.3, sSolo);
  float densityMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace);
  float wallGlowMod = mix(1.0, 1.1, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.4, sChorus);
  float pulseMod = mix(1.0, 1.0, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.6, sSolo);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);

  // --- Grid scale: 15-25 cells across screen depending on energy ---
  float hexScale = mix(15.0, 25.0, energy) * densityMod;

  // --- Beat stability distortion: low stability = wobbly hex boundaries ---
  vec2 hexP = p * hexScale;
  if (stability < 0.6) {
    float distortAmount = (0.6 - stability) * 0.4;
    float nx = snoise(vec3(hexP * 0.15, slowTime * 0.3));
    float ny = snoise(vec3(hexP * 0.15 + 50.0, slowTime * 0.3 + 20.0));
    hexP += vec2(nx, ny) * distortAmount;
  }

  // --- Hex coordinate lookup ---
  vec4 hex = hexCoord(hexP);
  vec2 cellGv = hex.xy;  // cell-local coordinates
  vec2 cellId = hex.zw;  // cell center (ID)

  // --- Cell wall SDF ---
  float hexDist = hexSDF(cellGv);
  float hexRadius = 0.5; // unit hex
  float wallThickness = (0.04 + bass * 0.06) * (1.0 + effectiveBeat * 0.3);
  float wallMask = smoothstep(hexRadius - wallThickness, hexRadius - wallThickness * 0.3, hexDist);
  float interiorMask = 1.0 - wallMask;

  // --- Sample previous frame at this cell's center for state persistence ---
  vec2 cellCenterUV = cellId / hexScale;
  cellCenterUV = cellCenterUV / aspect + 0.5;
  cellCenterUV = clamp(cellCenterUV, vec2(0.001), vec2(0.999));
  vec4 prevSample = texture2D(uPrevFrame, cellCenterUV);
  float prevAlive = prevSample.g; // green channel encodes alive state

  // --- Count alive neighbors (hexagonal Game of Life) ---
  vec2 texel = 1.0 / uResolution;
  float neighborCount = sampleNeighborAlive(cellId, hexScale, texel);

  // --- Cellular automata rules (hex GoL variant) ---
  // Born: dead cell with exactly 2 neighbors becomes alive
  // Survive: alive cell with 2-3 neighbors stays alive
  // Die: otherwise
  float born = (1.0 - step(0.35, prevAlive)) * step(1.5, neighborCount) * (1.0 - step(2.5, neighborCount));
  float survive = step(0.35, prevAlive) * step(1.5, neighborCount) * (1.0 - step(3.5, neighborCount));
  float newAlive = max(born, survive);

  // --- Coherence modulation of rules ---
  // High coherence: stable cell patterns (tighter survive range)
  if (coherence > 0.7) {
    float lockAmt = (coherence - 0.7) / 0.3;
    // Widen survive range slightly to stabilize
    float stableSurvive = step(0.35, prevAlive) * step(1.5, neighborCount) * (1.0 - step(4.5, neighborCount));
    newAlive = mix(newAlive, max(born, stableSurvive), lockAmt * 0.6);
  }
  // Low coherence: chaotic mutation — random births
  if (coherence < 0.3) {
    float chaosAmt = (0.3 - coherence) / 0.3;
    float mutationNoise = snoise(vec3(cellId * 0.5, slowTime * 2.0));
    float mutation = step(0.7 - chaosAmt * 0.3, mutationNoise);
    newAlive = max(newAlive, mutation * chaosAmt * 0.5);
  }

  // --- Noise seeding for initial state (first frame detection) ---
  vec4 rawPrev = texture2D(uPrevFrame, uv);
  if (rawPrev.a < 0.01) {
    float seedNoise = snoise(vec3(cellId * 0.3, 0.0));
    newAlive = step(0.2, seedNoise);
  }

  // --- Onset triggers cell division cascade ---
  if (onset > 0.2) {
    float distFromCenter = length(p);
    float cascadeRadius = onset * 1.5;
    float cascadeRing = smoothstep(cascadeRadius, cascadeRadius - 0.3, distFromCenter);
    float birthNoise = snoise(vec3(cellId * 0.7, uTime * 3.0));
    float onsetBirth = cascadeRing * step(0.3 - onset * 0.3, birthNoise);
    newAlive = max(newAlive, onsetBirth);
  }

  // --- Beat-synced cell pulse ---
  newAlive = clamp(newAlive + effectiveBeat * 0.15 * step(0.35, prevAlive), 0.0, 1.0);

  // --- Evolution speed gate: control how fast cells update ---
  float evolveGate = step(snoise(vec3(cellId * 0.1, floor(uDynamicTime * evolutionSpeed * 2.0))), 0.3);
  newAlive = mix(prevAlive, newAlive, evolveGate * 0.7 + 0.3);

  // --- Palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;

  // --- Cell color: alive = primary, dying = shift toward secondary ---
  float dyingPhase = smoothstep(0.35, 0.15, newAlive); // cells fading out
  float alivePhase = smoothstep(0.2, 0.5, newAlive);

  // HarmonicTension drives per-cell hue variation
  float cellHueOffset = hash21(cellId) * tension * 0.35;
  float cellHue = mix(hue1 + cellHueOffset, hue2, dyingPhase);
  float cellBrightness = mix(0.05, 0.55 + energy * 0.35, alivePhase) * pulseMod;

  // Melodic pitch tints alive cells
  cellHue += melodicPitch * melodicConf * 0.08;

  vec3 cellColor = hsv2rgb(vec3(cellHue, sat, cellBrightness));

  // --- Highs drive cell interior sparkle ---
  float sparkle = snoise(vec3(cellGv * 8.0, uTime * 4.0));
  sparkle = smoothstep(0.5, 0.9, sparkle) * highs * 0.4 * alivePhase;
  vec3 sparkleColor = hsv2rgb(vec3(hue1 + 0.1, sat * 0.6, 1.0));
  cellColor += sparkleColor * sparkle;

  // --- Cell wall color: glow with energy ---
  float wallBrightness = (0.3 + energy * 0.7) * wallGlowMod;
  wallBrightness += effectiveBeat * 0.2;
  // Walls near alive cells glow brighter
  float aliveWallBoost = alivePhase * 0.4;
  vec3 wallColor = hsv2rgb(vec3(mix(hue1, hue2, 0.3), sat * 0.8, wallBrightness + aliveWallBoost));

  // --- Vocal glow adds warmth to alive cells ---
  cellColor += hsv2rgb(vec3(hue1 + 0.05, sat * 0.5, vocalGlow)) * alivePhase;

  // --- Compose cell interior + walls ---
  vec3 col = mix(cellColor, wallColor, wallMask);

  // Background: very dark for dead regions
  vec3 deadColor = hsv2rgb(vec3(hue2, sat * 0.3, 0.02 + slowE * 0.03));
  col = mix(deadColor, col, max(alivePhase * interiorMask, wallMask));

  // --- Climax detection ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;
  // Climax: extra wall glow + cell saturation
  col += wallColor * wallMask * climaxBoost * 0.3;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(deadColor * 0.3, col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // --- Feedback trails with section-aware decay ---
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.96, 0.96 - 0.07, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase sub-states
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  // --- Encode alive state in green channel for next frame ---
  col.g = mix(col.g, newAlive, 0.5);

  gl_FragColor = vec4(col, 1.0);
}
`;
