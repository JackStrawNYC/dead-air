/**
 * Aviary Canopy — raymarched forest canopy for "Bird Song."
 *
 * "All I know is something like a bird within her sang."
 * Spacious, beautiful, soaring jams. One of the Dead's most transcendent vehicles.
 *
 * CONCEPT: Camera floats upward through a dense forest canopy toward open sky.
 * Branch SDFs with bifurcation, leaf clusters on tips, dappled god rays
 * streaming through gaps, bird silhouettes on smooth flight paths.
 * Green/gold/amber palette. Airy and luminous.
 *
 * Audio reactivity (16 uniforms):
 *   uBass            → branch sway amplitude
 *   uEnergy          → light intensity, bird count, canopy detail
 *   uDrumOnset       → bird launch events
 *   uVocalPresence   → golden warm sunlight warmth
 *   uMelodicPitch    → camera height (pitch=height, soaring)
 *   uSectionType     → jam=canopy opens to sky, space=dense forest floor,
 *                       chorus=light flood, solo=dramatic contrast
 *   uClimaxPhase     → break through canopy into pure sky
 *   uSlowEnergy      → camera ascent speed
 *   uSemanticAmbient → forest density
 *   uBeat            → leaf flutter sync
 *   uHighs           → leaf shimmer
 *   uMids            → mid-canopy density
 *   uHarmonicTension → color saturation shift
 *   uSpaceScore      → atmospheric fog depth
 *   uTimbralBrightness → specular highlight intensity
 *   uClimaxIntensity → sky breakthrough intensity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const aviaryCanopyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  lightLeakEnabled: true,
});

export const aviaryCanopyFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define AC_PI 3.14159265
#define AC_TAU 6.28318530
#define AC_MAX_STEPS 80
#define AC_MAX_DIST 40.0
#define AC_SURF_DIST 0.002

// ─── Hash helpers ───
float acHash(float n) { return fract(sin(n) * 43758.5453123); }
float acHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth min for organic blending ───
float acSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Cylinder SDF (capped) ───
float acCylinder(vec3 p, float radius, float halfLen) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(radius, halfLen);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ─── Single branch segment: tapered cylinder along Y axis ───
float acBranchSeg(vec3 p, float baseRadius, float tipRadius, float segLen) {
  float t = clamp(p.y / segLen, 0.0, 1.0);
  float radius = mix(baseRadius, tipRadius, t);
  float dXZ = length(p.xz) - radius;
  float dY = abs(p.y - segLen * 0.5) - segLen * 0.5;
  return max(dXZ, dY);
}

// ─── Bark texture: noise-based displacement for rough surface ───
// Kept very small to preserve SDF Lipschitz (normal estimation safety)
float acBark(vec3 p) {
  return (snoise(p * 4.0) * 0.3 + snoise(p * 8.0) * 0.1) * 0.005;
}

// ─── Leaf cluster: noisy soft sphere at branch tip ───
// All displacement frequencies kept low and amplitudes small
float acLeafCluster(vec3 p, float radius, float leafTime) {
  float n = snoise(p * 2.0 + leafTime * 0.3) * 0.15;
  float d = length(p) - radius * (1.0 + n * 0.2);
  // Gentle flutter — low frequency so normals stay smooth
  d += sin(p.x * 3.0 + leafTime * 1.5) * 0.005;
  d += sin(p.z * 2.5 + leafTime * 1.3) * 0.004;
  return d;
}

// ─── Bird wing SDF: two triangular planes flapping ───
float acBirdWing(vec2 p, float flapPhase) {
  // Triangle SDF for one wing
  float flapAngle = sin(flapPhase) * 0.4;
  float wingSpan = 0.12;
  // Rotate wing by flap angle
  float cfa = cos(flapAngle); float sfa = sin(flapAngle);
  vec2 wp = vec2(cfa * p.x - sfa * p.y, sfa * p.x + cfa * p.y);
  // Triangle: base at origin, tip at (wingSpan, 0)
  float d = max(abs(wp.y) - 0.02 * (1.0 - wp.x / wingSpan), -wp.x);
  d = max(d, wp.x - wingSpan);
  return d;
}

// ─── Full bird silhouette: body + two wings ───
float acBirdSDF(vec3 p, float flapPhase) {
  // Body: elongated ellipsoid
  vec3 bp = p;
  bp.x *= 2.5; // stretch body
  float body = length(bp) - 0.04;
  // Left wing
  float leftWing = acBirdWing(vec2(-p.z - 0.01, p.y), flapPhase);
  // Right wing
  float rightWing = acBirdWing(vec2(p.z - 0.01, p.y), flapPhase + AC_PI);
  float wings = min(leftWing, rightWing);
  // Combine: body is 3D, wings are 2D extruded
  float wingExtrude = max(wings, abs(p.x) - 0.03);
  return min(body, wingExtrude);
}

// ─── Single branching tree structure ───
float acBranch(vec3 p, float sway, float flowTime) {
  // Main trunk: vertical cylinder
  float trunkRadius = 0.08;
  vec3 tp = p;
  // Bass-driven sway
  tp.x += sin(tp.y * 1.5 + flowTime * 0.4) * sway * 0.06;
  tp.z += cos(tp.y * 1.2 + flowTime * 0.3) * sway * 0.04;

  float trunk = acBranchSeg(tp, trunkRadius, trunkRadius * 0.6, 3.0);
  trunk += acBark(tp);

  // Fork point at y~2.0
  vec3 forkP = tp - vec3(0.0, 2.0, 0.0);

  // Sub-branch 1: angled left-forward
  float angle1 = 0.45;
  float ca1 = cos(angle1); float sa1 = sin(angle1);
  vec3 b1p = forkP;
  b1p.xy = vec2(ca1 * b1p.x + sa1 * b1p.y, -sa1 * b1p.x + ca1 * b1p.y);
  float branch1 = acBranchSeg(b1p, trunkRadius * 0.5, trunkRadius * 0.2, 1.8);
  branch1 += acBark(b1p + 17.0);

  // Sub-branch 2: angled right-back
  float angle2 = -0.5;
  float ca2 = cos(angle2); float sa2 = sin(angle2);
  vec3 b2p = forkP;
  b2p.xz = vec2(ca2 * b2p.x + sa2 * b2p.z, -sa2 * b2p.x + ca2 * b2p.z);
  b2p.xy = vec2(cos(-0.35) * b2p.x + sin(-0.35) * b2p.y, -sin(-0.35) * b2p.x + cos(-0.35) * b2p.y);
  float branch2 = acBranchSeg(b2p, trunkRadius * 0.45, trunkRadius * 0.15, 1.5);
  branch2 += acBark(b2p + 31.0);

  // Sub-branch 3: forward-up (thinnest)
  vec3 b3p = forkP;
  float ca3 = cos(0.3); float sa3 = sin(0.3);
  b3p.yz = vec2(ca3 * b3p.y - sa3 * b3p.z, sa3 * b3p.y + ca3 * b3p.z);
  float branch3 = acBranchSeg(b3p, trunkRadius * 0.35, trunkRadius * 0.1, 1.2);
  branch3 += acBark(b3p + 53.0);

  float branches = min(branch1, min(branch2, branch3));
  float tree = acSmin(trunk, branches, 0.08);

  // Leaf clusters at branch tips
  vec3 leaf1Pos = forkP - vec3(-1.2, 1.1, 0.3);
  float leaves1 = acLeafCluster(leaf1Pos, 0.35 + sway * 0.05, flowTime);

  vec3 leaf2Pos = forkP - vec3(0.8, 0.9, -0.6);
  float leaves2 = acLeafCluster(leaf2Pos, 0.28 + sway * 0.04, flowTime * 1.1);

  vec3 leaf3Pos = forkP - vec3(0.1, 1.0, 0.5);
  float leaves3 = acLeafCluster(leaf3Pos, 0.22, flowTime * 0.9);

  float allLeaves = min(leaves1, min(leaves2, leaves3));
  return acSmin(tree, allLeaves, 0.06);
}

// ─── Scene SDF: repeating canopy cells + birds ───
// Returns vec2(distance, materialID): 0=branch/leaf, 1=bird, 2=sky
vec2 acMap(vec3 p, float sway, float flowTime, float energy, float drumOnset, float density) {
  // Repeating forest cells via domain repetition
  float cellSize = 3.5 - density * 0.8;
  vec3 cellId = floor(p / cellSize);
  vec3 cellP = mod(p, cellSize) - cellSize * 0.5;

  // Per-cell variation from hash
  float cellHash = acHash2(cellId.xz);
  float cellHash2 = acHash2(cellId.xz + 100.0);

  // Rotate each cell's tree for variety
  float cellAngle = cellHash * AC_TAU;
  float cca = cos(cellAngle); float sca = sin(cellAngle);
  vec3 rotP = cellP;
  rotP.xz = vec2(cca * cellP.x + sca * cellP.z, -sca * cellP.x + cca * cellP.z);

  // Y offset: trees at different heights
  rotP.y -= cellHash2 * 1.5;

  // Scale variation
  float treeScale = 0.8 + cellHash * 0.4;
  rotP /= treeScale;

  float treeDist = acBranch(rotP, sway, flowTime) * treeScale;
  vec2 result = vec2(treeDist, 0.0);

  // === BIRDS ===
  // Bird count scales with energy: 0-3 birds
  float birdCount = floor(energy * 3.0 + drumOnset * 2.0);
  for (int idx = 0; idx < 3; idx++) {
    if (float(idx) >= birdCount) break;
    float fi = float(idx);
    float birdSeed = acHash(fi * 73.156 + 17.0);

    // Smooth flight path: figure-eight-ish in XZ, sine wave in Y
    float birdPhase = flowTime * (0.3 + birdSeed * 0.2) + fi * 2.094;
    vec3 birdCenter = vec3(
      sin(birdPhase * 0.7 + fi * 1.5) * (4.0 + birdSeed * 3.0),
      3.0 + sin(birdPhase * 0.4) * 1.5 + fi * 0.8,
      cos(birdPhase * 0.5 + fi * 2.7) * (3.0 + birdSeed * 2.5)
    );

    // Drum onset launches birds upward
    birdCenter.y += drumOnset * 2.0 * (1.0 - fi * 0.2);

    // Flight direction for orientation
    vec3 birdVel = vec3(
      cos(birdPhase * 0.7 + fi * 1.5) * 0.7,
      cos(birdPhase * 0.4) * 0.4,
      -sin(birdPhase * 0.5 + fi * 2.7) * 0.5
    );
    float yawAngle = atan(birdVel.z, birdVel.x);

    // Transform point into bird local space
    vec3 birdP = p - birdCenter;
    float cyaw = cos(-yawAngle); float syaw = sin(-yawAngle);
    birdP.xz = vec2(cyaw * birdP.x + syaw * birdP.z, -syaw * birdP.x + cyaw * birdP.z);

    float flapSpeed = 8.0 + energy * 4.0;
    float birdDist = acBirdSDF(birdP, flowTime * flapSpeed + fi * AC_PI);

    if (birdDist < result.x) {
      result = vec2(birdDist, 1.0);
    }
  }

  return result;
}

// ─── Normal estimation (central differences) ───
vec3 acNormal(vec3 p, float sway, float flowTime, float energy, float drumOnset, float density) {
  float eps = 0.008;
  float ref = acMap(p, sway, flowTime, energy, drumOnset, density).x;
  vec3 nrm = vec3(
    acMap(p + vec3(eps, 0.0, 0.0), sway, flowTime, energy, drumOnset, density).x - ref,
    acMap(p + vec3(0.0, eps, 0.0), sway, flowTime, energy, drumOnset, density).x - ref,
    acMap(p + vec3(0.0, 0.0, eps), sway, flowTime, energy, drumOnset, density).x - ref
  );
  float len = length(nrm);
  return len > 0.0001 ? nrm / len : vec3(0.0, 1.0, 0.0);
}

// ─── God rays: dappled light through canopy gaps ───
float acGodRays(vec3 ro, vec3 rd, vec3 sunDir, float flowTime, float sway, float density) {
  float accumLight = 0.0;
  float stepLen = 0.6;
  for (int i = 0; i < 12; i++) {
    float t = float(i) * stepLen + 0.5;
    vec3 samplePos = ro + rd * t;
    // Check if light reaches this point by marching toward sun
    float shadowDist = 0.0;
    vec3 shadowP = samplePos;
    for (int j = 0; j < 6; j++) {
      shadowP += sunDir * 0.4;
      float sd = acMap(shadowP, sway, flowTime, 0.0, 0.0, density).x;
      shadowDist += max(0.0, -sd) * 0.5; // accumulate occlusion
    }
    float transmittance = exp(-shadowDist * 3.0);
    // Atmospheric scattering
    float scatter = exp(-t * 0.08);
    accumLight += transmittance * scatter * stepLen * 0.08;
  }
  return accumLight;
}

// ─── Sky gradient with clouds ───
vec3 acSky(vec3 rd, float climaxBreak, float energy, float flowTime) {
  // Base sky: deep blue at horizon, brighter above
  float skyGrad = smoothstep(-0.1, 0.8, rd.y);
  vec3 deepBlue = vec3(0.12, 0.18, 0.35);
  vec3 brightBlue = vec3(0.35, 0.55, 0.85);
  vec3 zenith = vec3(0.5, 0.7, 1.0);
  vec3 skyCol = mix(deepBlue, mix(brightBlue, zenith, skyGrad), skyGrad);

  // Climax: sky becomes radiant gold/white
  vec3 climaxSky = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 1.0, 0.95), skyGrad);
  skyCol = mix(skyCol, climaxSky, climaxBreak * 0.7);

  // Clouds: FBM noise for wispy formations
  float cloudNoise = fbm3(vec3(rd.xz * 2.0 + flowTime * 0.02, rd.y * 0.5));
  float cloudMask = smoothstep(0.2, 0.6, rd.y) * smoothstep(0.1, 0.4, cloudNoise);
  vec3 cloudCol = mix(vec3(0.9, 0.92, 0.95), vec3(1.0, 0.95, 0.85), energy * 0.3);
  skyCol = mix(skyCol, cloudCol, cloudMask * 0.4);

  // Sun glow
  vec3 sunDir = normalize(vec3(0.3, 0.8 + climaxBreak * 0.3, 0.5));
  float sunDot = max(0.0, dot(rd, sunDir));
  float sunGlow = pow(sunDot, 32.0) * 2.0 + pow(sunDot, 4.0) * 0.3;
  vec3 sunColor = mix(vec3(1.0, 0.85, 0.5), vec3(1.0, 0.95, 0.8), climaxBreak);
  skyCol += sunColor * sunGlow * (0.5 + energy * 0.5 + climaxBreak * 1.0);

  return skyCol;
}

void main() {
  vec2 uvCoord = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uvCoord - 0.5) * aspect;

  // === AUDIO INPUTS (clamped) ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalWarmth = clamp(uVocalPresence, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float beatVal = clamp(uBeat, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam   = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace  = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo   = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === DERIVED PARAMETERS ===
  float flowTime = uDynamicTime;
  float sway = bass * 0.8 + beatVal * 0.2; // branch sway from bass
  float density = 0.5 + ambient * 0.3 + mids * 0.2 - sJam * 0.3 + sSpace * 0.3;
  density = clamp(density, 0.2, 1.0);

  // Camera height driven by melodic pitch: low pitch = forest floor, high = canopy top
  float cameraHeight = mix(-1.0, 5.0, melodicPitch);
  // Slow energy drives upward ascent
  cameraHeight += slowE * 2.0;
  // Climax: break through canopy into pure sky
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBreak = isClimax * climaxIntensity;
  cameraHeight += climaxBreak * 4.0;
  // Section modulations
  cameraHeight -= sSpace * 2.0; // space = sink to forest floor
  cameraHeight += sJam * 1.5;   // jam = rise toward canopy opening
  cameraHeight += sChorus * 1.0; // chorus = open and bright

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uvCoord, aspect, ro, rd);
  // Override camera position Y with audio-driven height
  ro.y += cameraHeight;

  // Gentle camera bob from bass
  ro.x += sin(flowTime * 0.15) * 0.3 * (1.0 + bass * 0.5);
  ro.z += cos(flowTime * 0.12) * 0.2;

  // Sun direction: rises with energy and climax
  vec3 sunDir = normalize(vec3(
    0.3 + sin(flowTime * 0.02) * 0.1,
    0.7 + energy * 0.2 + climaxBreak * 0.4,
    0.5
  ));

  // === MAIN RAYMARCH ===
  float totalDist = 0.0;
  float matId = -1.0;
  vec3 marchPos = ro;

  // Adaptive step count: more steps at higher energy
  int stepCount = int(mix(50.0, 80.0, energy));

  for (int i = 0; i < AC_MAX_STEPS; i++) {
    if (i >= stepCount) break;
    marchPos = ro + rd * totalDist;
    vec2 scene = acMap(marchPos, sway, flowTime, energy, drumOnset, density);
    float dist = scene.x;

    if (dist < AC_SURF_DIST) {
      matId = scene.y;
      break;
    }
    if (totalDist > AC_MAX_DIST) break;

    totalDist += dist * 0.7; // conservative stepping for organic SDFs
  }

  vec3 col = vec3(0.0);

  if (totalDist < AC_MAX_DIST && matId >= 0.0) {
    // === SURFACE SHADING ===
    vec3 norm = acNormal(marchPos, sway, flowTime, energy, drumOnset, density);
    float diffuse = max(0.0, dot(norm, sunDir));
    float specAngle = max(0.0, dot(reflect(-sunDir, norm), -rd));
    float specular = pow(specAngle, 16.0 + timbralBright * 32.0) * (0.3 + timbralBright * 0.5);

    // === MATERIAL COLORS ===
    if (matId < 0.5) {
      // Unified canopy material — use Y height to softly transition from
      // brown bark below to green/gold leaves above. Smooth, no discontinuities.
      float heightT = smoothstep(-1.0, 1.5, marchPos.y);

      vec3 barkCol = vec3(0.22, 0.14, 0.08);
      barkCol = mix(barkCol, vec3(0.32, 0.22, 0.10), vocalWarmth * 0.3);

      vec3 leafGreen = vec3(0.18, 0.42, 0.12);
      vec3 leafGold = vec3(0.45, 0.42, 0.15);
      vec3 leafAmber = vec3(0.55, 0.32, 0.12);
      float leafVariation = snoise(marchPos * 0.8 + flowTime * 0.1);
      vec3 leafCol = mix(leafGreen, leafGold, leafVariation * 0.5 + 0.5);
      leafCol = mix(leafCol, leafAmber, tension * 0.3);

      // Soft height-based blend instead of hard fract() boundary
      vec3 surfaceColUnused = mix(barkCol, leafCol, heightT);

      // Beat-synced flutter brightness (no high-frequency sin)
      leafCol *= 1.0 + beatVal * 0.12 + highs * 0.06;
      barkCol *= 1.0 + beatVal * 0.05;
      // overwrite isLeaf for downstream code
      float isLeaf = heightT;

      vec3 surfaceCol = mix(barkCol, leafCol, isLeaf);

      // Dappled light: gentle low-frequency modulation, NO smoothstep
      // (smoothstep creates sharp edges that chromatic aberration turns into rainbow noise)
      float dapple = snoise(marchPos * 0.6 + vec3(flowTime * 0.05, 0.0, flowTime * 0.03));
      dapple = 0.7 + 0.3 * dapple; // soft 0.4-1.0 range, no hard edges
      float dappleLight = dapple * diffuse;

      // Vocal warmth adds golden sunlight color
      vec3 warmSun = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.85, 0.5), vocalWarmth);

      col = surfaceCol * (0.15 + dappleLight * 0.7) * warmSun;
      col += specular * warmSun * 0.4;

      // Chorus: flood with light
      col *= 1.0 + sChorus * 0.5;
      // Space: darker, moodier
      col *= 1.0 - sSpace * 0.3;
      // Solo: dramatic contrast boost
      col = mix(col, col * 1.4, sSolo * 0.3);

    } else {
      // Bird material: dark silhouette with rim light
      vec3 birdCol = vec3(0.02, 0.02, 0.03);
      // Rim light from sun
      float rimDot = 1.0 - max(0.0, dot(norm, -rd));
      float rimLight = pow(rimDot, 3.0) * 0.8;
      vec3 rimCol = mix(vec3(0.8, 0.7, 0.5), vec3(1.0, 0.9, 0.6), vocalWarmth);
      birdCol += rimCol * rimLight;
      // Energy glow on bird bodies
      birdCol += vec3(0.3, 0.25, 0.15) * energy * 0.3;
      col = birdCol;
    }

    // === DEPTH FOG ===
    float fogDist = totalDist;
    float fogDensity = 0.04 + spaceScore * 0.03 + sSpace * 0.02;
    float fogAmount = 1.0 - exp(-fogDist * fogDensity);
    vec3 fogColor = mix(vec3(0.15, 0.2, 0.12), vec3(0.3, 0.35, 0.2), vocalWarmth * 0.5);
    // Fog lifts with energy
    fogColor = mix(fogColor, vec3(0.5, 0.5, 0.35), energy * 0.2);
    col = mix(col, fogColor, fogAmount);

  } else {
    // === SKY (no surface intersection) ===
    col = acSky(rd, climaxBreak, energy, flowTime);
  }

  // === GOD RAYS (volumetric dappled light) ===
  {
    float godRayStr = acGodRays(ro, rd, sunDir, flowTime, sway, density);
    vec3 rayColor = mix(vec3(1.0, 0.9, 0.6), vec3(1.0, 0.8, 0.4), vocalWarmth);
    // Energy and vocal presence amplify god rays
    float rayIntensity = (0.4 + energy * 0.8 + vocalWarmth * 0.5) * (1.0 + sChorus * 0.6);
    // Climax: god rays become radiant
    rayIntensity += climaxBreak * 1.5;
    // Space: dim rays
    rayIntensity *= 1.0 - sSpace * 0.4;
    col += rayColor * godRayStr * rayIntensity;
  }

  // === BIRD FLIGHT TRAILS ===
  // Faint luminous trails behind birds (screenspace)
  {
    float trailAccum = 0.0;
    float birdCount = floor(energy * 3.0 + drumOnset * 2.0);
    for (int idx = 0; idx < 3; idx++) {
      if (float(idx) >= birdCount) break;
      float fi = float(idx);
      float birdSeed = acHash(fi * 73.156 + 17.0);
      float birdPhase = flowTime * (0.3 + birdSeed * 0.2) + fi * 2.094;

      // Past positions (trail)
      for (int trail = 0; trail < 4; trail++) {
        float trailT = float(trail) * 0.15;
        float pastPhase = birdPhase - trailT;
        vec3 pastPos = vec3(
          sin(pastPhase * 0.7 + fi * 1.5) * (4.0 + birdSeed * 3.0),
          3.0 + sin(pastPhase * 0.4) * 1.5 + fi * 0.8,
          cos(pastPhase * 0.5 + fi * 2.7) * (3.0 + birdSeed * 2.5)
        );
        pastPos.y += drumOnset * 2.0 * (1.0 - fi * 0.2);
        // Project to screenspace (approximate)
        vec3 viewP = pastPos - ro;
        float projDist = dot(viewP, normalize(rd));
        if (projDist > 0.5) {
          vec2 screenP = viewP.xy / projDist;
          float trailDist = length(p - screenP);
          float trailFade = exp(-float(trail) * 0.8);
          trailAccum += smoothstep(0.08, 0.0, trailDist) * trailFade * 0.15;
        }
      }
    }
    vec3 trailColor = mix(vec3(0.8, 0.7, 0.4), vec3(1.0, 0.9, 0.6), energy);
    col += trailColor * trailAccum;
  }

  // === BEAT PULSE ===
  col *= 1.0 + uBeatSnap * 0.08;

  // === CANOPY DAPPLE OVERLAY ===
  // Gentle low-freq additive light, no smoothstep
  {
    float dapplePattern = fbm3(vec3(p * 1.5 + flowTime * 0.1, flowTime * 0.05));
    dapplePattern = 0.5 + 0.5 * dapplePattern;
    float dappleStr = 0.05 * (1.0 + energy * 0.3) * (1.0 - climaxBreak * 0.5);
    vec3 dappleCol = vec3(1.0, 0.95, 0.7) * dapplePattern * dappleStr;
    col += dappleCol;
  }

  // === DEAD ICONOGRAPHY ===
  float iconNoise = snoise(vec3(p * 2.0, uTime * 0.1));
  vec3 iconCol1 = vec3(0.3, 0.5, 0.2);  // forest green
  vec3 iconCol2 = vec3(0.8, 0.7, 0.3);  // golden
  col += iconEmergence(p, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uSectionIndex);

  // === POST PROCESS ===
  col = applyPostProcess(col, uvCoord, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
