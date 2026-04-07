/**
 * Databend — raymarched 3D corrupted data architecture.
 * Glitching geometric structures that fragment and reassemble. Digital voxel
 * blocks shifting and displacing. CRT scanline artifacts as volumetric bands.
 *
 * Visual aesthetic:
 *   - Quiet: stable grid of translucent data blocks, faint scanlines
 *   - Building: blocks start displacing, gaps appear, scanlines thicken
 *   - Peak: extreme fragmentation — blocks shatter outward, volumetric scanlines
 *   - Release: blocks snap back into formation, corruption fades
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy             -> overall corruption intensity + displacement magnitude
 *   uBass               -> block scale pulsation + ground shake
 *   uMids               -> scanline density
 *   uHighs              -> specular sharpness on block facets
 *   uOnsetSnap          -> triggers block cascade displacement event
 *   uBeatSnap           -> momentary snap-back toward grid alignment
 *   uStemDrums          -> horizontal row displacement
 *   uEnergyForecast     -> pre-corruption wobble (anticipation)
 *   uSectionType        -> corruption character (verse=subtle, jam=extreme)
 *   uImprovisationScore -> displacement randomness
 *   uClimaxPhase        -> full shatter at 2+
 *   uClimaxIntensity    -> shatter magnitude
 *   uHarmonicTension    -> color shift toward warmer hues under tension
 *   uMelodicPitch       -> light source height
 *   uBeatStability      -> grid rigidity (high=locked, low=jittery)
 *   uVocalPresence      -> glow intensity within blocks
 *   uSlowEnergy         -> ambient drift speed
 *   uDynamicRange       -> contrast between lit and dark blocks
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

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  caEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
  paletteCycleEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define DB_MAX_STEPS 90
#define DB_MAX_DIST 25.0
#define DB_SURF_DIST 0.002

// ============================================================
// Utility
// ============================================================
mat2 dbRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float dbHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float dbHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 dbHash3(float n) {
  return vec3(dbHash(n), dbHash(n + 17.3), dbHash(n + 31.7));
}

// ============================================================
// SDF: axis-aligned box
// ============================================================
float dbBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// ============================================================
// SDF: rounded box
// ============================================================
float dbRoundBox(vec3 p, vec3 b, float r) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) - r + min(max(d.x, max(d.y, d.z)), 0.0);
}

// ============================================================
// SDF: infinite thin plane (for scanlines)
// ============================================================
float dbPlane(vec3 p, float y) {
  return abs(p.y - y) - 0.008;
}

// ============================================================
// Block displacement: each block gets a pseudo-random offset
// ============================================================
vec3 dbBlockDisplacement(vec3 blockId, float corruption, float randomness,
                          float drumShift, float onsetCascade, float time) {
  float blockSeed = dbHash2(blockId.xz + blockId.yy * 7.31);
  float displaced = step(1.0 - corruption * 0.6, blockSeed);

  float angle = dbHash2(blockId.xz * 3.17 + floor(time * 3.0)) * TAU;
  float dist = dbHash2(blockId.xz * 7.31 + floor(time * 2.5)) * corruption;
  dist *= (0.3 + randomness * 0.7);

  vec3 offset = vec3(cos(angle), sin(angle * 0.7), sin(angle)) * dist * displaced;

  // Drum-driven horizontal row shift
  float rowId = blockId.y;
  float drumRow = drumShift * 0.5 * (dbHash(rowId + floor(time * 4.0)) - 0.5);
  offset.x += drumRow;

  // Onset cascade amplification
  offset *= 1.0 + onsetCascade * 3.0;

  return offset;
}

// ============================================================
// Scene SDF: voxel grid of data blocks + scanline planes
// ============================================================
float dbMap(vec3 p, float corruption, float randomness, float drumShift,
            float onsetCascade, float bassScale, float beatStability,
            float time, float climaxShatter) {
  float minDist = DB_MAX_DIST;

  // --- Voxel block grid ---
  float gridSpacing = 1.8;
  vec3 gridP = p;
  vec3 blockId = floor(gridP / gridSpacing + 0.5);
  vec3 localP = gridP - blockId * gridSpacing;

  // Clamp visible blocks
  blockId = clamp(blockId, vec3(-3.0), vec3(3.0));

  // Per-block displacement
  vec3 disp = dbBlockDisplacement(blockId, corruption, randomness,
                                   drumShift, onsetCascade, time);

  // Climax shatter: blocks explode outward
  if (climaxShatter > 0.01) {
    vec3 shatterDir = normalize(blockId + 0.001);
    disp += shatterDir * climaxShatter * 2.5 * dbHash(dot(blockId, vec3(7.13, 11.31, 3.97)));
  }

  // Beat stability affects grid precision
  float jitter = (1.0 - beatStability) * 0.15;
  disp += vec3(
    sin(time * 5.0 + blockId.x * 3.0),
    cos(time * 4.0 + blockId.y * 2.0),
    sin(time * 6.0 + blockId.z * 4.0)
  ) * jitter;

  vec3 displacedP = localP - disp;

  // Block size: bass-pulsed, varies per block
  float blockVar = 0.6 + dbHash(dot(blockId, vec3(3.7, 11.1, 7.3))) * 0.4;
  float blockSize = 0.35 * blockVar * (1.0 + bassScale * 0.3);
  float blockHeight = blockSize * (0.5 + dbHash(dot(blockId, vec3(13.1, 5.7, 9.3))) * 1.0);

  // Gate: skip some blocks based on corruption for voids
  float gateThreshold = mix(0.2, 0.6, corruption);
  float blockGate = step(gateThreshold, dbHash(dot(blockId, vec3(17.3, 23.1, 7.7))));

  float block = dbRoundBox(displacedP, vec3(blockSize, blockHeight, blockSize), 0.02);
  block = mix(DB_MAX_DIST, block, blockGate);
  minDist = min(minDist, block);

  // Neighbor blocks for denser field
  for (int dx = -1; dx <= 1; dx += 2) {
    for (int dz = -1; dz <= 1; dz += 2) {
      vec3 nId = blockId + vec3(float(dx), 0.0, float(dz));
      nId = clamp(nId, vec3(-3.0), vec3(3.0));
      vec3 nLocalP = p - nId * gridSpacing;
      vec3 nDisp = dbBlockDisplacement(nId, corruption, randomness, drumShift, onsetCascade, time);
      if (climaxShatter > 0.01) {
        nDisp += normalize(nId + 0.001) * climaxShatter * 2.5 * dbHash(dot(nId, vec3(7.13, 11.31, 3.97)));
      }
      nDisp += vec3(
        sin(time * 5.0 + nId.x * 3.0),
        cos(time * 4.0 + nId.y * 2.0),
        sin(time * 6.0 + nId.z * 4.0)
      ) * jitter;
      vec3 nDP = nLocalP - nDisp;
      float nVar = 0.6 + dbHash(dot(nId, vec3(3.7, 11.1, 7.3))) * 0.4;
      float nSize = 0.35 * nVar * (1.0 + bassScale * 0.3);
      float nHeight = nSize * (0.5 + dbHash(dot(nId, vec3(13.1, 5.7, 9.3))) * 1.0);
      float nGate = step(gateThreshold, dbHash(dot(nId, vec3(17.3, 23.1, 7.7))));
      float nBlock = dbRoundBox(nDP, vec3(nSize, nHeight, nSize), 0.02);
      nBlock = mix(DB_MAX_DIST, nBlock, nGate);
      minDist = min(minDist, nBlock);
    }
  }

  // --- CRT scanline bands (volumetric) ---
  float scanDensity = 12.0 + uMids * 8.0;
  float scanY = fract(p.y * scanDensity / gridSpacing + time * 0.5);
  float scanline = smoothstep(0.0, 0.05, abs(scanY - 0.5) - 0.45);
  float scanDist = abs(scanY - 0.5) / scanDensity * gridSpacing * 2.0;
  // Only show scanlines when corruption is present
  scanDist = mix(DB_MAX_DIST, scanDist + 0.5, step(0.1, corruption));
  minDist = min(minDist, scanDist);

  // --- Ground plane for grounding ---
  float ground = p.y + 4.5 + bassScale * 0.3;
  minDist = min(minDist, ground);

  return minDist;
}

// ============================================================
// Material ID: 0=block, 1=scanline, 2=ground
// ============================================================
float dbMaterialID(vec3 p, float corruption, float randomness, float drumShift,
                    float onsetCascade, float bassScale, float beatStability,
                    float time, float climaxShatter) {
  float gridSpacing = 1.8;
  vec3 blockId = floor(p / gridSpacing + 0.5);
  blockId = clamp(blockId, vec3(-3.0), vec3(3.0));
  vec3 localP = p - blockId * gridSpacing;
  vec3 disp = dbBlockDisplacement(blockId, corruption, randomness, drumShift, onsetCascade, time);
  if (climaxShatter > 0.01) {
    disp += normalize(blockId + 0.001) * climaxShatter * 2.5 * dbHash(dot(blockId, vec3(7.13, 11.31, 3.97)));
  }
  float jitter = (1.0 - beatStability) * 0.15;
  disp += vec3(sin(time * 5.0 + blockId.x * 3.0), cos(time * 4.0 + blockId.y * 2.0), sin(time * 6.0 + blockId.z * 4.0)) * jitter;
  vec3 displacedP = localP - disp;
  float blockVar = 0.6 + dbHash(dot(blockId, vec3(3.7, 11.1, 7.3))) * 0.4;
  float blockSize = 0.35 * blockVar * (1.0 + bassScale * 0.3);
  float blockHeight = blockSize * (0.5 + dbHash(dot(blockId, vec3(13.1, 5.7, 9.3))) * 1.0);
  float block = dbRoundBox(displacedP, vec3(blockSize, blockHeight, blockSize), 0.02);
  float ground = p.y + 4.5 + bassScale * 0.3;

  if (ground < block) return 2.0;
  return 0.0;
}

// ============================================================
// Normal via central differences
// ============================================================
vec3 dbNormal(vec3 p, float corruption, float randomness, float drumShift,
              float onsetCascade, float bassScale, float beatStability,
              float time, float climaxShatter) {
  vec2 eps = vec2(0.003, 0.0);
  float d = dbMap(p, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter);
  return normalize(vec3(
    dbMap(p + eps.xyy, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter) - d,
    dbMap(p + eps.yxy, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter) - d,
    dbMap(p + eps.yyx, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter) - d
  ));
}

// ============================================================
// Ambient Occlusion (5-tap)
// ============================================================
float dbAmbientOcclusion(vec3 p, vec3 n, float corruption, float randomness,
                          float drumShift, float onsetCascade, float bassScale,
                          float beatStability, float time, float climaxShatter) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    float dist = fi * 0.1;
    float d = dbMap(p + n * dist, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter);
    occ += (dist - d) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ============================================================
// Soft shadow
// ============================================================
float dbSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k,
                    float corruption, float randomness, float drumShift,
                    float onsetCascade, float bassScale, float beatStability,
                    float time, float climaxShatter) {
  float res = 1.0;
  float marchT = mint;
  for (int i = 0; i < 32; i++) {
    if (marchT > maxt) break;
    float d = dbMap(ro + rd * marchT, corruption, randomness, drumShift, onsetCascade, bassScale, beatStability, time, climaxShatter);
    if (d < 0.001) return 0.0;
    res = min(res, k * d / marchT);
    marchT += d;
  }
  return clamp(res, 0.0, 1.0);
}

// ============================================================
// Volumetric scanline fog
// ============================================================
vec3 dbScanlineFog(vec3 ro, vec3 rd, float maxT, float corruption, float mids, float time) {
  vec3 fog = vec3(0.0);
  float scanDensity = 12.0 + mids * 8.0;
  int fogSteps = 24;
  float stepSize = maxT / float(fogSteps);
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float marchT = fi * stepSize;
    vec3 pos = ro + rd * marchT;
    float scanY = fract(pos.y * scanDensity / 1.8 + time * 0.5);
    float scanBand = exp(-pow((scanY - 0.5) * 20.0, 2.0));
    float depthFade = exp(-marchT * 0.15);
    fog += scanBand * depthFade * corruption * 0.008;
  }
  return fog;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float drumShift = clamp(uStemDrums, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float sectionT = clamp(uSectionType, 0.0, 7.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);

  float time = uDynamicTime * 0.15;

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  // Corruption parameters
  float corruption = energy * 0.6 + forecast * 0.2;
  corruption *= 1.0 - beatSnap * 0.4; // beat recovery
  corruption *= mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);

  float climaxShatter = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * uClimaxIntensity;

  // Cascade from onset
  float cascadeTime = fract(time * 2.0);
  float onsetCascade = onset * smoothstep(0.0, 0.3, cascadeTime) * smoothstep(1.0, 0.3, cascadeTime);

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 palColor1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palColor2 = paletteHueColor(hue2, 0.85, 0.95);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === RAYMARCH ===
  float marchT = 0.0;
  float totalDist = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < DB_MAX_STEPS; i++) {
    marchPos = ro + rd * marchT;
    float d = dbMap(marchPos, corruption, improv, drumShift, onsetCascade, bass,
                     beatStability, time, climaxShatter);
    if (d < DB_SURF_DIST) {
      marchHit = true;
      break;
    }
    if (marchT > DB_MAX_DIST) break;
    marchT += d * 0.85; // slightly conservative stepping
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  // Background: deep dark with digital gradient
  vec3 bgCol = vec3(0.02, 0.015, 0.025);
  bgCol += palColor2 * 0.02 * (1.0 + snoise(vec3(screenP * 2.0, time * 0.1)) * 0.5);

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = dbNormal(pos, corruption, improv, drumShift, onsetCascade, bass,
                          beatStability, time, climaxShatter);
    float matID = dbMaterialID(pos, corruption, improv, drumShift, onsetCascade, bass,
                                beatStability, time, climaxShatter);

    // Light position: melodic pitch raises it
    vec3 lightPos = vec3(3.0, 5.0 + melodicPitch * 3.0, 4.0);
    vec3 lightDir = normalize(lightPos - pos);
    vec3 viewDir = normalize(ro - pos);
    vec3 halfVec = normalize(lightDir + viewDir);

    // === DIFFUSE ===
    float diff = max(dot(norm, lightDir), 0.0);

    // === SPECULAR (Blinn-Phong) ===
    float specPow = 32.0 + highs * 128.0;
    float spec = pow(max(dot(norm, halfVec), 0.0), specPow);

    // === FRESNEL ===
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);

    // === AMBIENT OCCLUSION ===
    float occl = dbAmbientOcclusion(pos, norm, corruption, improv, drumShift,
                                     onsetCascade, bass, beatStability, time, climaxShatter);

    // === SOFT SHADOW ===
    float shadow = dbSoftShadow(pos + norm * 0.01, lightDir, 0.05, 10.0, 8.0,
                                 corruption, improv, drumShift, onsetCascade, bass,
                                 beatStability, time, climaxShatter);

    // === MATERIAL COLOR ===
    vec3 matCol;
    if (matID < 1.0) {
      // Block: per-block color from palette hash
      vec3 blockId = floor(pos / 1.8 + 0.5);
      float blockHue = dbHash(dot(blockId, vec3(7.3, 11.1, 3.7)));
      matCol = mix(palColor1, palColor2, blockHue);

      // Vocal glow: blocks emit light from within
      float innerGlow = vocalPresence * 0.3 * (0.5 + 0.5 * sin(time * 3.0 + blockHue * TAU));
      matCol += palColor1 * innerGlow;

      // Dynamic range: contrast between lit and dark blocks
      float darkMask = step(0.5 - dynamicRange * 0.3, dbHash(dot(blockId, vec3(5.1, 9.3, 2.7))));
      matCol *= mix(0.4, 1.0, darkMask);

      // Corruption: channel separation effect on blocks
      if (corruption > 0.2) {
        float sepAmount = corruption * 0.15;
        matCol.r *= 1.0 + sepAmount * sin(pos.x * 10.0 + time * 5.0);
        matCol.b *= 1.0 + sepAmount * cos(pos.z * 10.0 + time * 3.0);
      }
    } else {
      // Ground: dark reflective surface
      matCol = vec3(0.03, 0.025, 0.04);
      float gridLine = smoothstep(0.02, 0.0, abs(fract(pos.x * 0.5) - 0.5));
      gridLine += smoothstep(0.02, 0.0, abs(fract(pos.z * 0.5) - 0.5));
      matCol += palColor2 * gridLine * 0.08;
    }

    // === COMPOSE LIGHTING ===
    vec3 ambient = matCol * 0.08 * (0.5 + slowEnergy * 0.5);
    vec3 diffuseLight = matCol * diff * 0.7;
    vec3 specLight = vec3(0.8, 0.85, 1.0) * spec * 0.5;
    vec3 fresnelLight = palColor1 * fresnel * 0.25;

    col = (ambient + diffuseLight + specLight + fresnelLight) * occl * (0.4 + shadow * 0.6);

    // === TENSION COLOR SHIFT ===
    if (tension > 0.2) {
      col = mix(col, col * vec3(1.1, 0.9, 0.8), tension * 0.3);
    }

    // Depth fog toward background
    float depthFade = 1.0 - exp(-marchT * 0.08);
    col = mix(col, bgCol, depthFade);
  } else {
    col = bgCol;
  }

  // === VOLUMETRIC SCANLINE FOG ===
  vec3 scanFog = dbScanlineFog(ro, rd, min(marchT, DB_MAX_DIST), corruption, mids, time);
  vec3 scanColor = mix(palColor1, palColor2, 0.5) * vec3(0.6, 0.8, 1.0);
  col += scanFog * scanColor;

  // === FORECAST WOBBLE: screen-space chromatic pre-corruption ===
  if (forecast > 0.3) {
    float wobble = sin(screenP.y * 20.0 + time * 8.0) * forecast * 0.02;
    col.rg += wobble;
  }

  // === CLIMAX BOOST ===
  col *= 1.0 + climaxShatter * 0.5;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(screenP * 2.0, time));
    col += iconEmergence(screenP, uTime, energy, bass, palColor1, palColor2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, palColor1, palColor2, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, screenP);
  gl_FragColor = vec4(col, 1.0);
}
`;
