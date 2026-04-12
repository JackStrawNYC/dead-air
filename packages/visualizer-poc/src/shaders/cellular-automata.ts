/**
 * Cellular Automata — raymarched 3D cellular automata.
 * A 3D grid of cube SDFs that follow Game of Life rules across the grid,
 * with active cells glowing and dead cells transparent. Multiple generations
 * visible simultaneously as layers in Z. Full raymarching with AO, lighting,
 * Fresnel glow on active cells.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> cell wall brightness + active cell count
 *   uBass            -> cell pulse scale
 *   uHighs           -> cell interior sparkle
 *   uMids            -> mid-layer glow
 *   uOnsetSnap       -> cell birth cascade
 *   uSlowEnergy      -> evolution speed
 *   uBeatSnap        -> generation advance pulse
 *   uMelodicPitch    -> color mapping vertical
 *   uMelodicDirection -> camera orbit direction
 *   uHarmonicTension -> cell color variation
 *   uBeatStability   -> grid regularity
 *   uChromaHue       -> hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> max cell activity
 *   uVocalEnergy     -> warm inner glow
 *   uCoherence       -> pattern stability
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const ca2DepthAlpha = buildDepthAlphaOutput("marchDist", "CA2_MAX_DIST");

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
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  anaglyphEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define CA2_MAX_STEPS 80
#define CA2_MAX_DIST 40.0
#define CA2_SURF_DIST 0.002

// ---- Hash for cell state ----
float ca2Hash31(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.53));
  p += dot(p, p.yzx + 45.32);
  return fract(p.x * p.y * p.z);
}

// ---- Cell alive state (procedural Game of Life in 3D) ----
float ca2CellAlive(vec3 cellId, float generation, float energy, float coherence) {
  // Base state from noise (seeded by cell ID and generation)
  float baseNoise = ca2Hash31(cellId + vec3(0.0, 0.0, generation * 0.1));

  // Count "alive" neighbors (6-connected in 3D)
  float neighborCount = 0.0;
  float prevGen = generation - 1.0;
  vec3 offsets[6];
  offsets[0] = vec3(1, 0, 0);
  offsets[1] = vec3(-1, 0, 0);
  offsets[2] = vec3(0, 1, 0);
  offsets[3] = vec3(0, -1, 0);
  offsets[4] = vec3(0, 0, 1);
  offsets[5] = vec3(0, 0, -1);

  for (int i = 0; i < 6; i++) {
    float nh = ca2Hash31(cellId + offsets[i] + vec3(0.0, 0.0, prevGen * 0.1));
    neighborCount += step(0.45, nh);
  }

  // 3D GoL rules: birth with 2-3 neighbors, survive with 2-4
  float prevAlive = step(0.45, ca2Hash31(cellId + vec3(0.0, 0.0, prevGen * 0.1)));
  float born = (1.0 - prevAlive) * step(1.5, neighborCount) * (1.0 - step(3.5, neighborCount));
  float survive = prevAlive * step(1.5, neighborCount) * (1.0 - step(4.5, neighborCount));

  float alive = max(born, survive);

  // Coherence modulation
  if (coherence > 0.7) {
    // High coherence: more stable patterns
    float stableSurvive = prevAlive * step(1.0, neighborCount) * (1.0 - step(5.5, neighborCount));
    alive = mix(alive, max(born, stableSurvive), (coherence - 0.7) / 0.3 * 0.5);
  }
  if (coherence < 0.3) {
    // Low coherence: random mutations
    float mutation = step(0.75, baseNoise) * (0.3 - coherence) / 0.3;
    alive = max(alive, mutation * 0.5);
  }

  // Energy boosts birth rate
  float energyBirth = step(0.6 - energy * 0.2, baseNoise);
  alive = max(alive, energyBirth * 0.3);

  return clamp(alive, 0.0, 1.0);
}

// ---- Box SDF ----
float ca2SdBox(vec3 pos, vec3 halfSize) {
  vec3 d = abs(pos) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// ---- Scene SDF: 3D grid of cube cells ----
float ca2SceneSDF(vec3 pos, float generation, float energy, float coherence,
                   float bass, out vec3 ca2CellColor, out float ca2CellGlow) {
  ca2CellColor = vec3(0.0);
  ca2CellGlow = 0.0;

  float cellSize = 0.4;
  float gap = 0.08;
  float gridPitch = cellSize + gap;

  // Which cell are we in?
  vec3 cellId = floor(pos / gridPitch + 0.5);

  // Limit grid extent
  if (abs(cellId.x) > 6.0 || abs(cellId.y) > 6.0 || abs(cellId.z) > 6.0) return 1e6;

  // Cell center
  vec3 cellCenter = cellId * gridPitch;
  vec3 localPos = pos - cellCenter;

  // Is this cell alive?
  float alive = ca2CellAlive(cellId, generation, energy, coherence);

  if (alive < 0.3) return 1e6; // dead cell = invisible

  // Active cell: glowing cube
  float pulseScale = 1.0 + bass * 0.1 * alive;
  vec3 cubeSize = vec3(cellSize * 0.45 * pulseScale * alive);
  float cubeDist = ca2SdBox(localPos, cubeSize);

  ca2CellGlow = alive;
  return cubeDist;
}

// ---- Normal ----
vec3 ca2CalcNormal(vec3 pos, float generation, float energy, float coherence, float bass) {
  float eps = 0.005;
  vec3 dummyCol; float dummyGlow;
  float ref = ca2SceneSDF(pos, generation, energy, coherence, bass, dummyCol, dummyGlow);
  return normalize(vec3(
    ca2SceneSDF(pos + vec3(eps, 0, 0), generation, energy, coherence, bass, dummyCol, dummyGlow) - ref,
    ca2SceneSDF(pos + vec3(0, eps, 0), generation, energy, coherence, bass, dummyCol, dummyGlow) - ref,
    ca2SceneSDF(pos + vec3(0, 0, eps), generation, energy, coherence, bass, dummyCol, dummyGlow) - ref
  ));
}

// ---- Occlusion ----
float ca2CalcOcclusion(vec3 pos, vec3 nrm, float generation, float energy, float coherence, float bass) {
  float occl = 0.0;
  float weight = 1.0;
  vec3 dummyCol; float dummyGlow;
  for (int i = 1; i <= 4; i++) {
    float sd = float(i) * 0.12;
    float sdf = ca2SceneSDF(pos + nrm * sd, generation, energy, coherence, bass, dummyCol, dummyGlow);
    occl += weight * max(sd - sdf, 0.0);
    weight *= 0.5;
  }
  return clamp(1.0 - occl * 3.0, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.2 * chordConf;
  float vocalGlow = uVocalEnergy * 0.12;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.04;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float evolSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.2, sChorus);
  float wallGlowMod = mix(1.0, 1.1, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.4, sChorus);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;

  // ---- Generation (time-based, beat-synced advancement) ----
  float generation = floor(slowTime * evolSpeed * 2.0 + effectiveBeat * 0.5);

  // ---- Camera: orbit around the grid ----
  float orbitAngle = slowTime * 0.2 * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) + melodicDir * 0.3;
  float orbitRadius = 8.0 + sin(slowTime * 0.1) * 1.0;
  vec3 rayOrig = vec3(
    cos(orbitAngle) * orbitRadius,
    3.0 + sin(slowTime * 0.15) * 1.5 + melodicPitch * 1.0,
    sin(orbitAngle) * orbitRadius
  );
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(55.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background ----
  vec3 bgColor = hsv2rgb(vec3(hue2, sat * 0.3, 0.02 + slowE * 0.02));
  vec3 col = bgColor;

  // ---- Raymarch ----
  float marchDist = 0.0;
  vec3 cellColor = vec3(0.0);
  float cellGlow = 0.0;
  bool didCollide = false;

  for (int i = 0; i < CA2_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = ca2SceneSDF(marchPos, generation, energy, coherence, bass, cellColor, cellGlow);
    if (sdf < CA2_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > CA2_MAX_DIST) break;
    marchDist += max(sdf, 0.01) * 0.9;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = ca2CalcNormal(collidePos, generation, energy, coherence, bass);
    float occl = ca2CalcOcclusion(collidePos, nrm, generation, energy, coherence, bass);

    // Which cell?
    float gridPitch = 0.48;
    vec3 cellId = floor(collidePos / gridPitch + 0.5);
    float cellHash = ca2Hash31(cellId);

    // Cell color: based on cell ID, tension, and palette
    float cellHueOffset = cellHash * tension * 0.35;
    float cellHue = mix(hue1 + cellHueOffset, hue2, cellHash);
    cellHue += melodicPitch * 0.08;
    float cellBright = mix(0.3, 0.8, cellGlow) * (0.3 + e2 * 0.7) * wallGlowMod;

    vec3 surfaceCol = hsv2rgb(vec3(fract(cellHue), sat, cellBright));

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, -0.3));
    float diffuse = max(dot(nrm, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specular = pow(max(dot(nrm, halfVec), 0.0), 32.0);
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);

    // Emissive + lit surface
    vec3 litCol = surfaceCol * (0.2 + diffuse * 0.6) * occl;
    litCol += surfaceCol * specular * 0.3 * occl;
    litCol += surfaceCol * fresnelVal * 0.2;

    // Interior sparkle from highs
    float sparkleNoise = snoise(vec3(collidePos * 10.0, uDynamicTime * 3.0));
    float sparkle = smoothstep(0.6, 0.95, sparkleNoise) * highs * 0.4;
    litCol += hsv2rgb(vec3(fract(hue1 + 0.1), sat * 0.6, 1.0)) * sparkle;

    // Vocal warmth
    litCol += hsv2rgb(vec3(fract(hue1 + 0.05), sat * 0.5, vocalGlow)) * cellGlow;

    // Mids glow on mid-height cells
    float midHeight = smoothstep(-1.0, 0.0, collidePos.y) * smoothstep(2.0, 0.5, collidePos.y);
    litCol *= 1.0 + mids * midHeight * 0.2;

    col = litCol;

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.04);
    col = mix(col, bgColor, fogFactor);
  }

  // ---- Onset cell birth cascade (bright flash) ----
  if (onset > 0.1) {
    col += vec3(0.06, 0.05, 0.08) * onset * exp(-length(screenP) * 3.0);
  }

  // ---- Beat pulse ----
  col *= 1.0 + effectiveBeat * 0.15;

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.5;

  // ---- SDF icon emergence ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Vignette ----
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(bgColor * 0.3, col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${ca2DepthAlpha}
}
`;
