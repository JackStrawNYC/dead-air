/**
 * Voronoi Flow -- raymarched 3D Voronoi crystal formation.
 * Camera moves through a 3D Voronoi cell structure where each cell
 * is a translucent crystal with unique color. Cell walls are visible
 * as thin membrane SDFs. Fluid flows between cells. The structure
 * constantly rearranges as cells merge and split.
 *
 * Audio reactivity:
 *   uBass             -> cell size pulse (crystals breathe)
 *   uEnergy           -> wall visibility / flow speed
 *   uDrumOnset        -> cell split event (fracture propagation)
 *   uVocalPresence    -> internal cell glow (warm interior light)
 *   uHarmonicTension  -> cell irregularity (distorted lattice)
 *   uSectionType      -> jam=rapid rearrangement, space=frozen crystal,
 *                         chorus=flowing liquid
 *   uClimaxPhase      -> cells shatter into fluid then reform
 *   uMelodicPitch     -> crystal refraction hue
 *   uSlowEnergy       -> drift speed of cell centers
 *   uSpaceScore       -> stillness / frozen quality
 *   uTimbralBrightness-> caustic intensity
 *   uBeatStability    -> lattice regularity
 *   uDynamicRange     -> depth of field fog distance
 *   uChordIndex       -> palette variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

export const voronoiFlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const vf2NormalGLSL = buildRaymarchNormal("vf2Map($P, cellScale, wallThickness, irregularity, cellTime, drumOnset, shatterAmount).x", { eps: 0.003, name: "vf2Normal" });
const vf2AOGLSL = buildRaymarchAO("vf2Map($P, cellScale, wallThickness, irregularity, cellTime, drumOnset, shatterAmount).x", { steps: 5, stepBase: -0.02, stepScale: 0.03, weightDecay: 0.7, finalMult: 1.5, name: "vf2AO" });
const vf2DepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  dofEnabled: true,
});

export const voronoiFlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 16.0
#define SURF_DIST 0.002

// ---------------------------------------------------------------
// 3D hash for Voronoi cell centers
// ---------------------------------------------------------------
vec3 vf2Hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453);
}

// ---------------------------------------------------------------
// vf2Cell: 3D Voronoi with cell ID, nearest distance, edge distance
// Returns vec4(minDist, edgeDist, cellHueA, cellHueB)
// Also outputs cell center via out param
// ---------------------------------------------------------------
vec4 vf2Cell(vec3 pos, float cellScale, float irregularity, float timeShift,
             float splitEvent, out vec3 nearestCenter, out vec3 cellColor) {
  vec3 scaledPos = pos * cellScale;
  vec3 cellId = floor(scaledPos);
  vec3 cellFract = fract(scaledPos);

  float minDist = 10.0;
  float secondDist = 10.0;
  vec3 closestId = vec3(0.0);
  vec3 closestCenter = vec3(0.0);

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 cellSeed = cellId + neighbor;
        vec3 point = vf2Hash3(cellSeed);

        // Animate cell centers with slow orbital motion
        point = 0.5 + 0.5 * sin(timeShift * 0.6 + TAU * point);

        // Irregularity: tension warps lattice
        point += (vf2Hash3(cellSeed + 100.0) - 0.5) * irregularity * 0.7;

        // Split event: drum onset pushes cells apart
        if (splitEvent > 0.15) {
          vec3 splitDir = normalize(vf2Hash3(cellSeed + 200.0) - 0.5);
          point += splitDir * splitEvent * 0.4;
        }

        vec3 diff = neighbor + point - cellFract;
        float dist = length(diff);

        if (dist < minDist) {
          secondDist = minDist;
          minDist = dist;
          closestId = cellSeed;
          closestCenter = pos + (diff) / cellScale;
        } else if (dist < secondDist) {
          secondDist = dist;
        }
      }
    }
  }

  // Edge distance (cell wall)
  float edgeDist = secondDist - minDist;

  // Per-cell color from hash
  vec3 colorSeed = vf2Hash3(closestId + 50.0);
  cellColor = colorSeed;
  nearestCenter = closestCenter;

  return vec4(minDist, edgeDist, colorSeed.x, colorSeed.y);
}

// ---------------------------------------------------------------
// vf2Wall: thin membrane SDF from Voronoi edge distance
// Returns signed distance to the nearest cell wall
// ---------------------------------------------------------------
float vf2Wall(vec3 pos, float cellScale, float irregularity, float timeShift,
              float splitEvent, float wallThickness) {
  vec3 nc;
  vec3 cc;
  vec4 cellData = vf2Cell(pos, cellScale, irregularity, timeShift, splitEvent, nc, cc);
  float edgeDist = cellData.y;
  // Thin membrane: distance from the bisecting plane between cells
  return abs(edgeDist) - wallThickness;
}

// ---------------------------------------------------------------
// vf2Flow: fluid flowing between cells (domain-warped density)
// ---------------------------------------------------------------
float vf2Flow(vec3 pos, float flowTime, float flowSpeed) {
  vec3 warped = pos;
  vec3 curl = curlNoise(pos * 0.8 + flowTime * flowSpeed * 0.3);
  warped += curl * 0.4;
  float density = fbm3(warped * 1.5 + flowTime * flowSpeed * 0.1);
  density = smoothstep(0.2, 0.7, density);
  return density;
}

// ---------------------------------------------------------------
// vf2Map: the SDF scene -- crystal walls + fluid interior
// Returns vec2(distance, materialId)
//   materialId: 0=fluid interior, 1=cell wall, 2=shatter debris
// ---------------------------------------------------------------
vec2 vf2Map(vec3 pos, float cellScale, float wallThickness, float irregularity,
            float timeShift, float splitEvent, float shatterAmount) {
  // Cell wall membrane
  float wallDist = vf2Wall(pos, cellScale, irregularity, timeShift,
                           splitEvent, wallThickness);

  // During climax shatter: break walls into fragments
  if (shatterAmount > 0.01) {
    float fracture = snoise(pos * 8.0 + timeShift * 2.0);
    float shatterBreak = smoothstep(0.0, 0.6, shatterAmount);
    wallDist += fracture * shatterBreak * 0.3;
    // Debris particles
    float debris = length(fract(pos * 4.0) - 0.5) - 0.05 - shatterAmount * 0.1;
    debris += snoise(pos * 12.0) * 0.05;
    float debrisDist = debris * (1.0 - shatterBreak * 0.5);
    if (shatterAmount > 0.3 && debrisDist < wallDist) {
      return vec2(debrisDist, 2.0);
    }
  }

  return vec2(wallDist, 1.0);
}

${vf2AOGLSL}

// ---------------------------------------------------------------
// Fresnel: view-dependent transparency
// ---------------------------------------------------------------
float vf2Fresnel(vec3 viewDir, vec3 normal, float ior) {
  float cosTheta = clamp(dot(-viewDir, normal), 0.0, 1.0);
  float f0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ---------------------------------------------------------------
// Caustics: fake crystal caustics from noise
// ---------------------------------------------------------------
float vf2Caustics(vec3 pos, float causticsTime, float intensity) {
  vec3 p1 = pos * 3.0 + vec3(causticsTime * 0.4, causticsTime * 0.3, causticsTime * 0.2);
  vec3 p2 = pos * 3.0 - vec3(causticsTime * 0.25, causticsTime * 0.35, causticsTime * 0.15);
  float c1 = snoise(p1);
  float c2 = snoise(p2);
  float pattern = abs(c1 + c2);
  pattern = pow(max(0.0, 1.0 - pattern), 3.0);
  return pattern * intensity;
}

${vf2NormalGLSL}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // === AUDIO PARAMETERS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.18;
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.15;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section modifiers
  float sectionFlowMul = mix(1.0, 2.2, sJam) * mix(1.0, 0.1, sSpace)
                        * mix(1.0, 1.5, sChorus) * (1.0 + uPeakApproaching * 0.4);
  float sectionCellMul = mix(1.0, 1.3, sJam) * mix(1.0, 0.7, sSpace);
  float sectionGlowMul = mix(1.0, 0.6, sJam) * mix(1.0, 1.8, sSpace)
                        * mix(1.0, 1.4, sChorus);
  float sectionWallOpacity = mix(1.0, 0.6, sChorus) * mix(1.0, 1.5, sSpace);

  // Time
  float flowTime = uDynamicTime * (0.06 + slowE * 0.10) * sectionFlowMul;
  float cellTime = uDynamicTime * 0.04 * mix(1.0, 2.5, sJam) * mix(1.0, 0.15, sSpace);

  // Climax shatter: phase 2+ triggers shatter, phase 3 reforms
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float shatterAmount = isClimax * climaxIntensity;
  float reformPhase = smoothstep(2.8, 3.5, climaxPhase); // gradual reform
  shatterAmount *= (1.0 - reformPhase * 0.8);

  // === CRYSTAL PARAMETERS ===
  float cellScale = mix(1.8, 3.2, energy) * sectionCellMul;
  // Bass pulses cell size
  cellScale *= 1.0 + bass * 0.3 * sin(uDynamicTime * 2.0);
  // Beat stability -> regularity
  float irregularity = mix(0.6, 0.1, beatStab) + tension * 0.5;
  // Wall thickness: energy reveals walls
  float wallThickness = mix(0.015, 0.06, energy) * sectionWallOpacity;
  // Space score freezes everything
  float freezeFactor = spaceScore * sSpace;

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera drifts slowly through crystal lattice
  ro += vec3(
    sin(flowTime * 0.3) * 1.5,
    cos(flowTime * 0.2) * 0.8 + sin(flowTime * 0.15) * 0.4,
    flowTime * 0.8
  ) * (1.0 - freezeFactor * 0.9);

  // === PALETTE ===
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float palSat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // === RAYMARCH ===
  float totalDist = 0.0;
  vec3 col = vec3(0.0);
  float transmittance = 1.0;
  vec3 lastNorm = vec3(0.0, 1.0, 0.0);
  bool didIntersect = false;

  // Accumulate color through translucent crystal walls
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = ro + rd * totalDist;
    vec2 scene = vf2Map(marchPos, cellScale, wallThickness, irregularity,
                        cellTime, drumOnset, shatterAmount);
    float dist = scene.x;
    float matId = scene.y;

    // Fluid interior volume: accumulate glow as we pass through cells
    {
      vec3 nearCenter;
      vec3 cellCol;
      vec4 cellData = vf2Cell(marchPos, cellScale, irregularity, cellTime,
                              drumOnset, nearCenter, cellCol);

      // Interior glow: vocal presence lights up cell interiors
      float interiorGlow = vocalPresence * 0.35 + energy * 0.30;
      interiorGlow *= sectionGlowMul;
      // Proximity to cell center = brighter
      float centerProx = 1.0 - smoothstep(0.0, 0.5, cellData.x);
      interiorGlow *= centerProx;

      // Fluid density flowing between cells
      float fluidDensity = vf2Flow(marchPos, flowTime, 0.5 + energy * 0.5);
      // Chorus: more fluid flowing
      fluidDensity *= mix(0.3, 0.8, sChorus) * mix(1.0, 0.1, sSpace);

      // Per-cell crystal color
      float cellHue = hue1 + cellCol.x * 0.4 + melodicPitch * 0.15;
      vec3 crystalColor = hsv2rgb(vec3(cellHue, palSat * 0.7, 0.6 + interiorGlow));

      // Caustics: light refracting through crystal walls
      float caustics = vf2Caustics(marchPos, flowTime, timbralBright * 0.6 + 0.15);
      vec3 causticCol = hsv2rgb(vec3(hue2 + caustics * 0.2, palSat * 0.5, 1.0));

      // Accumulate translucent volume
      float stepAbsorb = 0.03 * (interiorGlow + fluidDensity * 0.5);
      col += transmittance * (crystalColor * interiorGlow * 0.08
             + causticCol * caustics * 0.04 * transmittance);
      transmittance *= exp(-stepAbsorb * 0.5);
    }

    // Near-surface: we found a cell wall
    if (dist < SURF_DIST) {
      didIntersect = true;
      vec3 norm = vf2Normal(marchPos);
      lastNorm = norm;

      // Fresnel: glancing angles = more reflective
      float fresnel = vf2Fresnel(rd, norm, 1.45);

      // Ambient occlusion
      float occl = vf2AO(marchPos, norm);

      // Lighting: directional light from above-right
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(0.0, dot(norm, lightDir));
      float specular = pow(max(0.0, dot(reflect(rd, norm), lightDir)), 32.0);

      // Rim light for crystal edges
      float rim = pow(1.0 - max(0.0, dot(-rd, norm)), 3.0);

      // Cell wall color: thin membrane tinted by nearest cell
      vec3 nearCenter;
      vec3 cellCol;
      vec4 cellData = vf2Cell(marchPos, cellScale, irregularity, cellTime,
                              drumOnset, nearCenter, cellCol);
      float wallHue = hue2 + cellCol.y * 0.3 + chromaHueMod;
      vec3 wallColor = hsv2rgb(vec3(wallHue, palSat * 0.6, 0.4));

      // Shatter debris is warmer
      if (scene.y > 1.5) {
        wallColor = hsv2rgb(vec3(hue1 + 0.05, palSat, 0.7));
      }

      // Compose wall surface
      vec3 surfaceCol = wallColor * (0.15 + diffuse * 0.5) * occl;
      surfaceCol += vec3(0.9, 0.95, 1.0) * specular * 0.4 * fresnel;
      surfaceCol += wallColor * rim * 0.3;
      // Translucent wall: partially see through
      float wallAlpha = mix(0.3, 0.7, fresnel) * sectionWallOpacity;
      wallAlpha *= mix(1.0, 0.2, shatterAmount); // walls fade during shatter

      col += transmittance * surfaceCol * wallAlpha;
      transmittance *= (1.0 - wallAlpha * 0.5);

      // Continue marching through (translucent wall)
      totalDist += max(SURF_DIST * 3.0, dist + 0.02);
    } else {
      totalDist += dist * 0.8; // conservative step
    }

    if (totalDist > MAX_DIST || transmittance < 0.02) break;
  }

  // === BACKGROUND: deep crystal void ===
  {
    float fogDist = mix(8.0, 14.0, dynRange);
    float fog = 1.0 - exp(-totalDist * totalDist / (fogDist * fogDist));
    vec3 fogColor = hsv2rgb(vec3(hue1 + 0.1, palSat * 0.3, 0.04 + energy * 0.03));
    // Space sections: deep black background
    fogColor *= (1.0 - sSpace * 0.7);
    col = mix(col, fogColor, fog * transmittance);
  }

  // === GLOBAL CAUSTIC WASH ===
  {
    float globalCaustic = vf2Caustics(ro + rd * 3.0, flowTime * 0.7, 0.2 + timbralBright * 0.4);
    vec3 caustCol = hsv2rgb(vec3(hue2 + 0.15, palSat * 0.4, 0.8));
    col += caustCol * globalCaustic * 0.06 * energy * transmittance;
  }

  // === CLIMAX FLASH: shatter -> reform ===
  if (isClimax > 0.5) {
    float flash = climaxIntensity * smoothstep(0.0, 0.3, shatterAmount);
    vec3 flashCol = hsv2rgb(vec3(hue1, palSat * 0.3, 1.0));
    col += flashCol * flash * 0.15;
  }

  // === BEAT PULSE ===
  col *= 1.0 + uBeatSnap * 0.1;

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(screenPos * 2.0, uTime * 0.08));
    vec3 c1 = hsv2rgb(vec3(hue1, palSat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, palSat, 1.0));
    col += iconEmergence(screenPos, uTime, energy, bass, c1, c2, nf,
                         uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, c1, c2, nf,
                             uSectionIndex);
  }

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenPos);

  gl_FragColor = vec4(col, 1.0);
  ${vf2DepthAlpha}
}
`;
