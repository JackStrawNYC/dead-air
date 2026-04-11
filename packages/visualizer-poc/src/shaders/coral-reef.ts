/**
 * Coral Reef — raymarched living coral reef ecosystem.
 * Brain coral domes, staghorn branches, sea fan SDFs, anemone tentacles,
 * fish schooling particles, dappled sunlight from above, full underwater
 * scene with proper water volumetrics.
 *
 * Feedback: No
 *
 * Audio reactivity (14+ uniforms):
 *   uBass            → current sway (coral, anemone, kelp)
 *   uEnergy          → coral color vibrancy, fish count
 *   uDrumOnset       → fish scatter burst
 *   uVocalPresence   → sunlight warmth / shaft intensity
 *   uHarmonicTension → water turbidity (fog density)
 *   uSectionType     → jam=fish swarm, space=night reef + bioluminescence,
 *                       chorus=golden hour reef, solo=dramatic spotlight
 *   uClimaxPhase     → coral spawning event (particle cloud)
 *   uSlowEnergy      → ambient drift speed
 *   uHighs           → caustic sharpness / plankton sparkle
 *   uMids            → coral growth modifier
 *   uMelodicPitch    → fish altitude
 *   uTimbralBrightness → coral hue shift
 *   uSpaceScore      → night mode strength
 *   uBeatStability   → current steadiness
 *   uStemBass        → seafloor rumble
 *   uFastEnergy      → particle burst intensity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const coralReefVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const cr2NormalGLSL = buildRaymarchNormal("cr2Map($P, flowTime, bassVal, midsVal).x", { eps: 0.002, name: "cr2Normal" });
const cr2AOGLSL = buildRaymarchAO("cr2Map($P, flowTime, bassVal, midsVal).x", { steps: 5, stepBase: -0.04, stepScale: 0.06, weightDecay: 0.7, finalMult: 3.0, name: "cr2Occlusion" });
const cr2DepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  dofEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  caEnabled: true,
});

export const coralReefFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 50.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════
// SDF PRIMITIVES
// ═══════════════════════════════════════════════

float cr2Sphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float cr2Capsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 ab = b - a;
  vec3 ap = pos - a;
  float projT = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  return length(pos - (a + projT * ab)) - radius;
}

float cr2Box(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cr2Ellipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float cr2SmoothMin(float a, float b, float k) {
  float blend = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, blend) - k * blend * (1.0 - blend);
}

float cr2SmoothMax(float a, float b, float k) {
  return -cr2SmoothMin(-a, -b, k);
}

mat2 cr2Rot(float angle) {
  float ca = cos(angle);
  float sa = sin(angle);
  return mat2(ca, -sa, sa, ca);
}

// ═══════════════════════════════════════════════
// SEAFLOOR TERRAIN
// ═══════════════════════════════════════════════

float cr2Terrain(vec3 pos, float bassVal, float time) {
  // Base seafloor plane
  float terrain = pos.y + 3.5;

  // Sand ripple ridges driven by bass
  float ripple = ridgedMultifractal(pos * 0.5 + vec3(time * 0.01, 0.0, 0.0), 4, 2.0, 0.5);
  terrain -= ripple * 0.4 * (1.0 + bassVal * 0.2);

  // Large rock mounds scattered on the floor
  float rocks = fbm6(pos * 0.12 + vec3(0.0, 0.0, time * 0.003));
  terrain -= max(0.0, rocks - 0.25) * 2.8;

  // Smaller rubble detail
  float rubble = fbm3(pos * 0.8 + vec3(50.0));
  terrain -= max(0.0, rubble - 0.3) * 0.4;

  // Bass rumble displacement
  float rumble = sin(pos.x * 0.6 + time * 0.7) * sin(pos.z * 0.5 + time * 0.5) * bassVal * 0.1;
  terrain += rumble;

  return terrain;
}

// ═══════════════════════════════════════════════
// ROCK FORMATIONS
// ═══════════════════════════════════════════════

float cr2RockFormation(vec3 pos) {
  float rock = MAX_DIST;

  // Large reef rock cluster — provides structure backdrop
  for (int rIdx = 0; rIdx < 3; rIdx++) {
    float fr = float(rIdx);
    float seed = fr * 5.71 + 1.3;

    vec3 rockPos = vec3(
      sin(seed * 13.7) * 8.0,
      -3.0 + sin(seed * 7.3) * 0.5,
      -10.0 - fr * 4.0 + cos(seed * 9.1) * 3.0
    );

    vec3 localP = pos - rockPos;

    // Bulbous rock shape (box with smooth erosion)
    float baseRock = cr2Ellipsoid(localP, vec3(1.5 + fr * 0.4, 1.0 + fr * 0.3, 1.2 + fr * 0.3));

    // Noise displacement for organic shape
    float roughness = fbm3(localP * 0.6 + vec3(seed)) * 0.4;
    baseRock += roughness;

    rock = min(rock, baseRock);
  }

  return rock;
}

// ═══════════════════════════════════════════════
// BRAIN CORAL — dome shapes with sinuous ridges
// ═══════════════════════════════════════════════

float cr2BrainCoral(vec3 pos, float seed, float growth) {
  // Hemispheric dome
  float domeR = (0.6 + seed * 0.3) * growth;
  float dome = cr2Sphere(pos, domeR);

  // Flatten the bottom
  dome = cr2SmoothMax(dome, -(pos.y + 0.02), 0.1);

  // Sinuous ridge pattern carved into the surface (brain folds)
  float ridgeFreq = 8.0 + seed * 4.0;
  float ridgeAngle = atan(pos.z, pos.x) * ridgeFreq + pos.y * 6.0;
  float ridgeDepth = sin(ridgeAngle) * 0.04 * growth;
  // Second frequency for irregularity
  ridgeDepth += sin(ridgeAngle * 1.7 + seed * 20.0) * 0.02;

  dome += ridgeDepth;

  return dome;
}

// ═══════════════════════════════════════════════
// STAGHORN CORAL — branching fractal structure
// ═══════════════════════════════════════════════

float cr2Staghorn(vec3 pos, float seed, float growth, float bassVal, float time) {
  // Main trunk rising from the floor
  float trunkH = (1.5 + seed * 0.8) * growth;
  float trunkR = 0.06 + seed * 0.03;

  // Bass-driven sway
  float sway = sin(time * 0.4 + seed * 5.0) * bassVal * 0.15;
  vec3 swayOffset = vec3(sway, 0.0, sway * 0.5);

  float trunk = cr2Capsule(pos, vec3(0.0), vec3(swayOffset.x, trunkH, swayOffset.z), trunkR);

  // Fork into 3 branches
  float branches = MAX_DIST;
  for (int bIdx = 0; bIdx < 3; bIdx++) {
    float fb = float(bIdx);
    float bSeed = seed + fb * 7.13;
    float forkY = trunkH * (0.4 + fb * 0.2);
    vec3 forkBase = vec3(swayOffset.x * forkY / trunkH, forkY, swayOffset.z * forkY / trunkH);

    float bAngle = (fb - 1.0) * 1.2 + sin(bSeed * 11.0) * 0.4;
    float bHeight = trunkH * (0.5 - fb * 0.08);
    vec3 branchEnd = forkBase + vec3(
      sin(bAngle) * bHeight * 0.6 + sway * 0.5,
      bHeight,
      cos(bAngle) * bHeight * 0.4
    );

    float branch = cr2Capsule(pos, forkBase, branchEnd, trunkR * 0.7);

    // Sub-branches (tips)
    for (int tIdx = 0; tIdx < 2; tIdx++) {
      float ft = float(tIdx);
      float tipSeed = bSeed + ft * 3.71;
      vec3 tipBase = mix(forkBase, branchEnd, 0.5 + ft * 0.25);
      float tipAngle = bAngle + (ft - 0.5) * 0.8 + sin(tipSeed * 5.0) * 0.3;
      vec3 tipEnd = tipBase + vec3(
        sin(tipAngle) * bHeight * 0.25,
        bHeight * 0.3,
        cos(tipAngle) * bHeight * 0.2
      );
      float tip = cr2Capsule(pos, tipBase, tipEnd, trunkR * 0.4);

      // Bulbous polyp tip
      float polypBall = cr2Sphere(pos - tipEnd, trunkR * 0.8);
      tip = cr2SmoothMin(tip, polypBall, 0.03);

      branch = cr2SmoothMin(branch, tip, 0.04);
    }

    branches = min(branches, branch);
  }

  // Bulbous polyp tips on main trunk apex
  float topPolyp = cr2Sphere(pos - vec3(swayOffset.x, trunkH, swayOffset.z), trunkR * 1.2);

  float coral = cr2SmoothMin(trunk, branches, 0.06);
  coral = cr2SmoothMin(coral, topPolyp, 0.05);

  return coral;
}

// ═══════════════════════════════════════════════
// SEA FAN — flat branching plane
// ═══════════════════════════════════════════════

float cr2Fan(vec3 pos, float seed, float growth, float bassVal, float time) {
  // Sea fans are flat, oriented in a plane
  // Gentle sway perpendicular to the fan face
  float sway = sin(time * 0.35 + seed * 7.0) * bassVal * 0.2;
  vec3 fanPos = pos;
  fanPos.x += sway * fanPos.y * 0.3; // sway increases with height

  // Main fan body — thin box
  float fanH = (1.2 + seed * 0.5) * growth;
  float fanW = (0.8 + seed * 0.3) * growth;
  float fanBody = cr2Box(fanPos - vec3(0.0, fanH * 0.5, 0.0), vec3(fanW * 0.5, fanH * 0.5, 0.02));

  // Carve branch pattern using noise (open lattice)
  float lattice = fbm3(vec3(fanPos.xy * 5.0, seed * 10.0));
  float carve = smoothstep(0.1, -0.1, lattice - 0.2);
  fanBody += carve * 0.04;

  // Round off — use smooth union with a sphere to soften
  float stem = cr2Capsule(fanPos, vec3(0.0, -0.1, 0.0), vec3(0.0, fanH * 0.3, 0.0), 0.04);
  float fan = cr2SmoothMin(fanBody, stem, 0.1);

  // Clip bottom so it sits on the floor
  fan = cr2SmoothMax(fan, -(fanPos.y + 0.05), 0.05);

  return fan;
}

// ═══════════════════════════════════════════════
// ANEMONE — cluster of swaying tentacles
// ═══════════════════════════════════════════════

float cr2Anemone(vec3 pos, float seed, float bassVal, float time) {
  // Base disc
  float baseDisc = cr2Ellipsoid(pos - vec3(0.0, 0.05, 0.0), vec3(0.25, 0.08, 0.25));

  float tentacles = MAX_DIST;
  int tentCount = 8;

  for (int tIdx = 0; tIdx < 8; tIdx++) {
    float ft = float(tIdx);
    float tAngle = ft / 8.0 * TAU + seed * 3.0;
    float tSeed = seed + ft * 2.31;

    // Tentacle base on the disc rim
    float rimR = 0.15 + sin(tSeed * 5.0) * 0.04;
    vec3 tBase = vec3(cos(tAngle) * rimR, 0.1, sin(tAngle) * rimR);

    // Sway: bass-driven with phase offset per tentacle
    float swayStr = 0.15 + bassVal * 0.3;
    float swayPhase = time * 1.5 + tSeed * 4.0;
    float tipSwayX = sin(swayPhase) * swayStr;
    float tipSwayZ = cos(swayPhase * 0.7 + 1.0) * swayStr * 0.6;

    float tentH = 0.5 + sin(tSeed * 7.0) * 0.15;
    vec3 tTip = tBase + vec3(tipSwayX, tentH, tipSwayZ);

    // Midpoint for curvature (3-segment approximation)
    vec3 tMid = mix(tBase, tTip, 0.5) + vec3(
      sin(swayPhase * 0.8 + 2.0) * swayStr * 0.4,
      tentH * 0.15,
      cos(swayPhase * 0.6 + 3.0) * swayStr * 0.3
    );

    float seg1 = cr2Capsule(pos, tBase, tMid, mix(0.025, 0.015, 0.0));
    float seg2 = cr2Capsule(pos, tMid, tTip, mix(0.015, 0.006, 0.0));

    // Bulbous tip
    float tipBall = cr2Sphere(pos - tTip, 0.012);

    float tent = min(seg1, seg2);
    tent = cr2SmoothMin(tent, tipBall, 0.01);

    tentacles = min(tentacles, tent);
  }

  return cr2SmoothMin(baseDisc, tentacles, 0.04);
}

// ═══════════════════════════════════════════════
// CORAL REEF COLONY — place all coral types
// ═══════════════════════════════════════════════

// Material ID returned in .y:
// 1=terrain, 2=brainCoral, 3=staghorn, 4=seaFan, 5=anemone, 6=rock

float cr2CoralColony(vec3 pos, float time, float bassVal, float midsVal, out float matIdOut) {
  float growth = 0.8 + midsVal * 0.3;
  float nearest = MAX_DIST;
  matIdOut = 0.0;

  // --- Brain coral domes (3 clusters) ---
  for (int bcIdx = 0; bcIdx < 3; bcIdx++) {
    float fbc = float(bcIdx);
    float seedBC = fract(fbc * 0.618 + 0.1);
    vec3 bcPos = vec3(
      sin(fbc * 2.1 + 1.5) * 4.0 + sin(seedBC * 17.0) * 1.0,
      -3.2 + ridgedMultifractal(vec3(fbc * 3.0, 0.0, 0.0), 3, 2.0, 0.5) * 0.4,
      cos(fbc * 1.8 + 0.5) * 4.5 - 8.0
    );

    float brain = cr2BrainCoral(pos - bcPos, seedBC, growth);
    if (brain < nearest) {
      nearest = brain;
      matIdOut = 2.0;
    }
  }

  // --- Staghorn coral (4 colonies) ---
  for (int shIdx = 0; shIdx < 4; shIdx++) {
    float fsh = float(shIdx);
    float seedSH = fract(fsh * 0.618 + 0.35);
    vec3 shPos = vec3(
      sin(fsh * 3.1 + 0.7) * 5.5 + cos(seedSH * 11.0) * 1.5,
      -3.3 + ridgedMultifractal(vec3(fsh * 5.0 + 10.0, 0.0, 0.0), 3, 2.0, 0.5) * 0.3,
      cos(fsh * 2.3 + 1.2) * 5.0 - 9.0
    );

    // Rotate each colony for variety
    vec3 localP = pos - shPos;
    localP.xz *= cr2Rot(seedSH * TAU);

    float stag = cr2Staghorn(localP, seedSH, growth, bassVal, time);
    if (stag < nearest) {
      nearest = stag;
      matIdOut = 3.0;
    }
  }

  // --- Sea fans (3) ---
  for (int sfIdx = 0; sfIdx < 3; sfIdx++) {
    float fsf = float(sfIdx);
    float seedSF = fract(fsf * 0.618 + 0.55);
    vec3 sfPos = vec3(
      sin(fsf * 4.2 + 2.0) * 6.0,
      -3.4 + sin(seedSF * 9.0) * 0.3,
      cos(fsf * 2.8 + 3.0) * 4.0 - 10.0
    );

    vec3 localP = pos - sfPos;
    localP.xz *= cr2Rot(seedSF * TAU + 0.5);

    float fan = cr2Fan(localP, seedSF, growth, bassVal, time);
    if (fan < nearest) {
      nearest = fan;
      matIdOut = 4.0;
    }
  }

  // --- Anemones (4) ---
  for (int anIdx = 0; anIdx < 4; anIdx++) {
    float fan = float(anIdx);
    float seedAN = fract(fan * 0.618 + 0.72);
    vec3 anPos = vec3(
      sin(fan * 2.7 + 0.3) * 3.5 + cos(seedAN * 13.0) * 1.0,
      -3.3 + sin(seedAN * 7.0) * 0.15,
      cos(fan * 1.9 + 1.7) * 3.0 - 7.0
    );

    float anem = cr2Anemone(pos - anPos, seedAN, bassVal, time);
    if (anem < nearest) {
      nearest = anem;
      matIdOut = 5.0;
    }
  }

  return nearest;
}

// ═══════════════════════════════════════════════
// SCENE MAP — combine all elements
// ═══════════════════════════════════════════════

// Returns vec2(distance, materialID)
// 0=water, 1=terrain, 2=brainCoral, 3=staghorn, 4=seaFan, 5=anemone, 6=rock
vec2 cr2Map(vec3 pos, float time, float bassVal, float midsVal) {
  // Seafloor terrain
  float terrain = cr2Terrain(pos, bassVal, time);
  vec2 nearest = vec2(terrain, 1.0);

  // Coral colony
  float coralMatId;
  float coral = cr2CoralColony(pos, time, bassVal, midsVal, coralMatId);
  if (coral < nearest.x) nearest = vec2(coral, coralMatId);

  // Rock formations
  float rock = cr2RockFormation(pos);
  if (rock < nearest.x) nearest = vec2(rock, 6.0);

  return nearest;
}

// Normal & AO — generated by shared raymarching utilities
${cr2NormalGLSL}
${cr2AOGLSL}

// ═══════════════════════════════════════════════
// UNDERWATER CAUSTICS
// ═══════════════════════════════════════════════

float cr2Caustic(vec2 coord, float time, float sharpness) {
  coord *= 4.0;
  vec2 iter = coord;
  float causVal = 1.0;
  float intensity = 0.005;

  for (int cn = 0; cn < 5; cn++) {
    float ct = time * (1.0 - (3.5 / float(cn + 1)));
    iter = coord + vec2(
      cos(ct - iter.x) + sin(ct + iter.y),
      sin(ct - iter.y) + cos(ct + iter.x)
    );
    causVal += 1.0 / length(vec2(
      coord.x / (sin(iter.x + ct) / intensity),
      coord.y / (cos(iter.y + ct) / intensity)
    ));
  }

  causVal /= 5.0;
  causVal = 1.17 - pow(causVal, 1.4);
  return clamp(pow(abs(causVal), mix(6.0, 12.0, sharpness)), 0.0, 1.0);
}

// ═══════════════════════════════════════════════
// VOLUMETRIC SUNLIGHT SHAFTS (god rays from surface)
// ═══════════════════════════════════════════════

float cr2SunShaft(vec3 pos, float time, float vocalPresence) {
  // Sunlight comes from above at a slight angle
  vec3 sunDir = normalize(vec3(0.15, 1.0, -0.1));

  // Parallel dappled light bands (tree-like shadow pattern)
  float shaftPattern = sin(pos.x * 1.2 + time * 0.15) * cos(pos.z * 1.0 + time * 0.12);
  shaftPattern += sin(pos.x * 2.5 + pos.z * 1.8 + time * 0.1) * 0.4;
  shaftPattern = smoothstep(0.4, 1.0, shaftPattern);

  // Depth fade: strongest near the surface
  float depthFade = smoothstep(-6.0, 2.0, pos.y);

  // Vocal presence warms and intensifies
  float shaftStr = (0.25 + vocalPresence * 0.75) * depthFade * shaftPattern;

  // Scattering noise for volume
  float scatter = fbm3(pos * 0.4 + vec3(time * 0.04));
  shaftStr *= 0.7 + scatter * 0.3;

  return clamp(shaftStr, 0.0, 1.0);
}

// ═══════════════════════════════════════════════
// SUBSURFACE SCATTERING APPROXIMATION
// ═══════════════════════════════════════════════

float cr2Subsurface(vec3 norm, vec3 lightDir, vec3 viewDir, float thickness) {
  // Translucent light wrapping around thin structures
  vec3 scatterDir = normalize(lightDir + norm * 0.5);
  float viewDot = pow(clamp(dot(viewDir, -scatterDir), 0.0, 1.0), 3.0);
  float normalWrap = pow(clamp(dot(-norm, lightDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  return (viewDot + normalWrap * 0.5) * thickness;
}

// ═══════════════════════════════════════════════
// FISH SCHOOLING PARTICLES
// ═══════════════════════════════════════════════

vec3 cr2Fish(vec3 rayOrigin, vec3 rayDir, float time, float energyVal,
             float drumOnset, float melodicPitch, float sJam) {
  vec3 fishLight = vec3(0.0);

  // Fish count: energy + jam increases swarm size
  int fishCount = int(4.0 + energyVal * 8.0 + sJam * 10.0);

  for (int fIdx = 0; fIdx < 22; fIdx++) {
    if (fIdx >= fishCount) break;

    float ff = float(fIdx);
    float seed = ff * 3.17 + 0.7;

    // School behavior: fish cluster around a moving center
    float schoolTime = time * 0.15;
    vec3 schoolCenter = vec3(
      sin(schoolTime * 0.7) * 4.0,
      -1.0 + melodicPitch * 2.0 + sin(schoolTime * 0.5) * 0.5,
      -6.0 + cos(schoolTime * 0.4) * 3.0
    );

    // Individual offset from school center (noise-driven)
    vec3 fishPos = schoolCenter + vec3(
      snoise(vec3(seed * 11.3, time * 0.3, 0.0)) * 2.5,
      snoise(vec3(0.0, seed * 7.1, time * 0.25)) * 1.0,
      snoise(vec3(seed * 5.7, 0.0, time * 0.28)) * 2.0
    );

    // Drum onset scatter: fish burst outward briefly
    float scatterPhase = max(0.0, drumOnset - 0.1);
    fishPos += normalize(fishPos - schoolCenter) * scatterPhase * 3.0;

    // Ray proximity (billboard particle)
    vec3 toFish = fishPos - rayOrigin;
    float projLen = dot(toFish, rayDir);
    if (projLen < 0.5) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(fishPos - closest);

    // Fish "body" — elongated glow along swim direction
    float fishGlow = exp(-distToRay * distToRay * 60.0);

    // Slight shimmer from scales
    float shimmer = 0.7 + 0.3 * sin(time * 8.0 + seed * TAU);

    // Warm silver/gold fish color
    float fishHue = fract(0.08 + ff * 0.03);
    vec3 fishColor = hsv2rgb(vec3(fishHue, 0.3 + energyVal * 0.3, 0.9));

    // Depth attenuation
    float depthAtten = exp(-max(0.0, projLen) * 0.06);

    fishLight += fishColor * fishGlow * shimmer * depthAtten * 0.12;
  }

  return fishLight;
}

// ═══════════════════════════════════════════════
// BIOLUMINESCENT PLANKTON (space/night mode)
// ═══════════════════════════════════════════════

vec3 cr2Bioluminescence(vec3 rayOrigin, vec3 rayDir, float time,
                        float energyVal, float spaceScore) {
  vec3 bioGlow = vec3(0.0);
  if (spaceScore < 0.05) return bioGlow;

  int bioCount = int(8.0 + energyVal * 10.0);

  for (int bIdx = 0; bIdx < 18; bIdx++) {
    if (bIdx >= bioCount) break;

    float fb = float(bIdx);
    float seed = fb * 4.13 + 2.1;

    vec3 bioPos = vec3(
      sin(seed * 13.7 + time * 0.05) * 7.0,
      sin(seed * 19.3 + time * 0.04) * 2.5 - 1.5,
      -4.0 - seed * 1.5 + cos(seed * 9.1 + time * 0.03) * 3.0
    );

    vec3 toP = bioPos - rayOrigin;
    float projLen = dot(toP, rayDir);
    if (projLen < 0.0) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(bioPos - closest);

    float glow = exp(-distToRay * distToRay * 12.0);

    // Slow pulsation
    float pulse = 0.3 + 0.7 * pow(sin(time * (1.0 + fb * 0.2) + seed * TAU) * 0.5 + 0.5, 2.0);

    // Cool blue-green bioluminescent hues
    float hueVal = fract(0.5 + fb * 0.05);
    vec3 bioColor = hsv2rgb(vec3(hueVal, 0.7, 1.0));

    float depthAtten = exp(-max(0.0, projLen) * 0.07);

    bioGlow += bioColor * glow * pulse * depthAtten * spaceScore * 0.2;
  }

  return bioGlow;
}

// ═══════════════════════════════════════════════
// CORAL SPAWNING EVENT (climax particle cloud)
// ═══════════════════════════════════════════════

vec3 cr2SpawnCloud(vec3 rayOrigin, vec3 rayDir, float time, float climaxAmount) {
  if (climaxAmount < 0.01) return vec3(0.0);

  vec3 spawnGlow = vec3(0.0);

  // Spawn cloud: thousands of tiny eggs/bundles rising from coral
  for (int sIdx = 0; sIdx < 20; sIdx++) {
    float fs = float(sIdx);
    float seed = fs * 5.31 + 0.3;

    // Rise from coral positions, drift upward
    vec3 spawnPos = vec3(
      sin(seed * 11.7) * 6.0,
      mod(time * (0.3 + fract(seed * 0.7) * 0.2) + fs * 0.8 - 3.0, 8.0) - 3.0,
      -8.0 + cos(seed * 7.3) * 4.0
    );

    // Lateral drift
    spawnPos.x += sin(time * 0.4 + fs * 1.3) * 0.5;
    spawnPos.z += cos(time * 0.35 + fs * 1.7) * 0.4;

    vec3 toSpawn = spawnPos - rayOrigin;
    float projLen = dot(toSpawn, rayDir);
    if (projLen < 0.5) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(spawnPos - closest);

    float particle = exp(-distToRay * distToRay * 100.0);
    float depthAtten = exp(-max(0.0, projLen) * 0.08);

    // Warm pink/coral spawn color
    float spawnHue = fract(0.95 + fs * 0.02);
    vec3 spawnColor = hsv2rgb(vec3(spawnHue, 0.5, 1.0));

    spawnGlow += spawnColor * particle * depthAtten * climaxAmount * 0.08;
  }

  return spawnGlow;
}

// ═══════════════════════════════════════════════
// MARINE SNOW (ambient particles)
// ═══════════════════════════════════════════════

vec3 cr2MarineSnow(vec3 rayOrigin, vec3 rayDir, float time, float fastEnergy) {
  vec3 snow = vec3(0.0);

  for (int mIdx = 0; mIdx < 10; mIdx++) {
    float fm = float(mIdx);
    float seed = fm * 5.17 + 2.3;

    vec3 snowPos = vec3(
      fract(seed * 0.37) * 14.0 - 7.0,
      mod(3.0 - time * (0.06 + fract(seed * 0.7) * 0.03) + fm * 1.3, 8.0) - 4.0,
      -3.0 - fm * 1.5 + fract(seed * 0.53) * 5.0
    );

    snowPos.x += sin(time * 0.25 + fm * 1.7) * 0.4;
    snowPos.z += cos(time * 0.2 + fm * 2.1) * 0.3;

    vec3 toParticle = snowPos - rayOrigin;
    float projLen = dot(toParticle, rayDir);
    if (projLen < 0.5) continue;
    vec3 closest = rayOrigin + rayDir * projLen;
    float distToRay = length(snowPos - closest);

    float particle = exp(-distToRay * distToRay * 200.0);
    float depthAtten = exp(-max(0.0, projLen) * 0.1);

    float brightness = 0.02 + fastEnergy * 0.03;

    snow += vec3(0.5, 0.6, 0.65) * particle * depthAtten * brightness;
  }

  return snow;
}

// ═══════════════════════════════════════════════
// FRESNEL (Schlick approximation)
// ═══════════════════════════════════════════════

float cr2Fresnel(vec3 viewDir, vec3 norm, float f0) {
  float cosTheta = clamp(dot(viewDir, norm), 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ═══════════════════════════════════════════════
// WATER FOG (exponential with turbidity)
// ═══════════════════════════════════════════════

vec3 cr2WaterFog(vec3 col, float dist, vec3 fogColor, float turbidity) {
  float fogAmount = 1.0 - exp(-dist * (0.04 + turbidity * 0.06));
  return mix(col, fogColor, fogAmount);
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS (clamped) ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bassVal = clamp(uBass, 0.0, 1.0);
  float midsVal = clamp(uMids, 0.0, 1.0);
  float highsVal = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);

  // === SECTION TYPE DECODE ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxAmount = isClimax * climaxI;

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  // Reef water: warm tropical blue-green (shifts toward cooler blue in space)
  vec3 waterColor = paletteHueColor(hue1, 0.65, 0.85);
  waterColor = mix(waterColor, vec3(0.03, 0.12, 0.22), 0.5 + spaceScore * 0.3);

  float hue2 = uPaletteSecondary;
  vec3 accentColor = paletteHueColor(hue2, 0.8, 0.95);
  accentColor = mix(accentColor, vec3(0.4, 0.8, 0.6), 0.2); // tropical green accent

  // === FLOW TIME (section-modulated) ===
  float flowTime = uDynamicTime * (0.12 + slowE * 0.06)
    * mix(1.0, 1.5, sJam)
    * mix(1.0, 0.4, sSpace)
    * mix(1.0, 1.2, sChorus);

  // === CAMERA RAY ===
  vec3 rayOrigin, rayDir;
  setupCameraRay(uv, aspect, rayOrigin, rayDir);

  // Gentle underwater camera sway driven by bass
  float swayX = sin(flowTime * 0.3) * 0.25 * (1.0 + bassVal * 0.4);
  float swayY = cos(flowTime * 0.25) * 0.12;
  rayOrigin += vec3(swayX, swayY - 0.3, 0.0);

  // Beat stability affects camera steadiness
  float jitter = (1.0 - beatStab) * 0.04;
  rayDir += vec3(
    snoise(vec3(uv * 4.0, uDynamicTime * 2.5)) * jitter,
    snoise(vec3(uv * 4.0 + 10.0, uDynamicTime * 2.5)) * jitter,
    0.0
  );
  rayDir = normalize(rayDir);

  // === RAYMARCH ===
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;
  vec3 marchPos = rayOrigin;

  for (int stepIdx = 0; stepIdx < MAX_STEPS; stepIdx++) {
    marchPos = rayOrigin + rayDir * totalDist;
    vec2 sceneResult = cr2Map(marchPos, flowTime, bassVal, midsVal);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;

    if (sceneDist < SURF_DIST) {
      didHitSurface = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += sceneDist * 0.8; // conservative step
  }

  // === BASE COLOR: underwater void ===
  // Space mode → darker nighttime reef, chorus → warm golden hour
  float nightShift = spaceScore * 0.5;
  vec3 col = waterColor * mix(0.12, 0.04, nightShift);

  // Chorus warm golden cast
  col = mix(col, col * vec3(1.3, 1.1, 0.8), sChorus * 0.4);

  // === VOLUMETRIC SUNLIGHT SHAFTS (accumulated along ray) ===
  float shaftAccum = 0.0;
  float shaftStepSize = min(totalDist, MAX_DIST) / 16.0;
  for (int shIdx = 0; shIdx < 16; shIdx++) {
    float shDist = float(shIdx) * shaftStepSize;
    vec3 shPos = rayOrigin + rayDir * shDist;
    shaftAccum += cr2SunShaft(shPos, flowTime, vocalPresence) * shaftStepSize * 0.12;
  }

  // Chorus floods the reef with warm light
  float shaftMult = 1.0 + sChorus * 2.0 + climaxAmount * 0.5;
  // Space mode dims the shafts (nighttime)
  shaftMult *= mix(1.0, 0.15, sSpace);

  // Vocal warmth tints the light gold
  vec3 shaftColor = mix(vec3(0.4, 0.6, 0.7), vec3(0.9, 0.8, 0.5), vocalPresence * 0.6);
  shaftColor = mix(shaftColor, accentColor, 0.2);
  col += shaftColor * shaftAccum * shaftMult;

  // === SURFACE SHADING ===
  if (didHitSurface) {
    vec3 norm = cr2Normal(marchPos);
    float occl = cr2Occlusion(marchPos, norm);

    // Sunlight direction
    vec3 sunDir = normalize(vec3(0.2, 1.0, -0.15));

    // Diffuse
    float diff = max(dot(norm, sunDir), 0.0);

    // Specular (Blinn-Phong for underwater highlights)
    vec3 halfDir = normalize(sunDir - rayDir);
    float spec = pow(max(dot(norm, halfDir), 0.0), 32.0) * 0.4;

    // Subsurface scattering (translucent coral/anemone)
    float sss = cr2Subsurface(norm, sunDir, -rayDir, 0.6);

    // Fresnel rim
    float fresnel = cr2Fresnel(-rayDir, norm, 0.04);

    // Material coloring
    vec3 surfCol = vec3(0.0);

    if (matId < 1.5) {
      // ── TERRAIN ── Sandy seafloor with caustic projection
      float causticVal = cr2Caustic(marchPos.xz, flowTime * 0.7, highsVal);
      vec3 sandColor = mix(vec3(0.18, 0.15, 0.10), vec3(0.28, 0.22, 0.16), fbm3(marchPos * 0.4));
      causticVal *= 1.0 + stemBass * 0.3;
      surfCol = sandColor * (0.25 + diff * 0.5) + vec3(0.5, 0.6, 0.7) * causticVal * 0.35;
      surfCol += spec * vec3(0.3, 0.4, 0.5) * 0.2;

    } else if (matId < 2.5) {
      // ── BRAIN CORAL ── warm orange/pink domes with groove shadows
      float grooveNoise = fbm3(marchPos * 8.0);
      vec3 coralBase = mix(
        vec3(0.8, 0.35, 0.25),
        vec3(0.9, 0.6, 0.3),
        grooveNoise
      );
      // Energy drives vibrancy
      coralBase = mix(coralBase * 0.6, coralBase, energy);
      // Timbral brightness shifts hue
      coralBase = mix(coralBase, coralBase * vec3(1.1, 0.9, 1.2), timbralBright * 0.4);

      surfCol = coralBase * (0.3 + diff * 0.5 + sss * 0.25);
      surfCol += spec * vec3(0.8, 0.6, 0.4) * 0.15;

    } else if (matId < 3.5) {
      // ── STAGHORN CORAL ── branching purple/lavender
      float branchNoise = fbm3(marchPos * 4.0);
      vec3 stagColor = mix(
        vec3(0.5, 0.25, 0.6),
        vec3(0.8, 0.5, 0.7),
        branchNoise
      );
      stagColor = mix(stagColor * 0.5, stagColor, energy);
      stagColor = mix(stagColor, stagColor * vec3(0.9, 1.1, 1.0), timbralBright * 0.3);

      surfCol = stagColor * (0.3 + diff * 0.45 + sss * 0.3);
      surfCol += spec * vec3(0.6, 0.5, 0.8) * 0.2;

    } else if (matId < 4.5) {
      // ── SEA FAN ── translucent red/orange lattice
      vec3 fanColor = mix(
        vec3(0.7, 0.15, 0.1),
        vec3(0.9, 0.4, 0.2),
        fbm3(marchPos * 6.0)
      );
      fanColor = mix(fanColor * 0.5, fanColor, energy);

      // Strong subsurface for translucency (light through the fan)
      float fanSSS = cr2Subsurface(norm, sunDir, -rayDir, 1.0);
      surfCol = fanColor * (0.25 + diff * 0.35 + fanSSS * 0.5);
      surfCol += vec3(1.0, 0.5, 0.2) * fanSSS * 0.15; // warm backlight
      surfCol += spec * vec3(0.8, 0.5, 0.3) * 0.1;

    } else if (matId < 5.5) {
      // ── ANEMONE ── vivid green/purple with glowing tips
      vec3 anemColor = mix(
        vec3(0.2, 0.7, 0.3),
        vec3(0.6, 0.2, 0.8),
        sin(marchPos.y * 8.0) * 0.5 + 0.5
      );
      anemColor = mix(anemColor * 0.5, anemColor, energy);

      float anemSSS = cr2Subsurface(norm, sunDir, -rayDir, 0.8);
      surfCol = anemColor * (0.3 + diff * 0.4 + anemSSS * 0.35);

      // Glowing tentacle tips
      float tipGlow = smoothstep(-3.0, -2.5, marchPos.y) * 0.4;
      surfCol += anemColor * tipGlow * (0.5 + energy * 0.5);
      surfCol += spec * vec3(0.4, 0.8, 0.5) * 0.15;

    } else {
      // ── ROCK ── dark stone with mineral veins
      float veins = ridgedMultifractal(marchPos * 1.2, 4, 2.0, 0.5);
      vec3 rockColor = mix(vec3(0.1, 0.09, 0.08), vec3(0.2, 0.18, 0.15), veins);
      // Encrusting algae patches
      float algae = smoothstep(0.3, 0.7, fbm3(marchPos * 2.0 + vec3(0.0, 100.0, 0.0)));
      rockColor = mix(rockColor, vec3(0.1, 0.2, 0.08), algae * 0.4);

      surfCol = rockColor * (0.2 + diff * 0.4);
      surfCol += spec * vec3(0.2, 0.2, 0.2) * 0.1;
    }

    // Apply ambient occlusion
    surfCol *= 0.4 + 0.6 * occl;

    // Fresnel rim highlight (underwater edge glow)
    surfCol += accentColor * fresnel * 0.12;

    // Accent coloring from palette
    surfCol = mix(surfCol, surfCol * (0.7 + accentColor * 0.5), 0.15);

    // === WATER FOG (exponential depth extinction) ===
    float turbidity = tension * 0.5 + sJam * 0.2;
    vec3 fogColor = waterColor * 0.1;
    surfCol = cr2WaterFog(surfCol, totalDist, fogColor, turbidity);

    col = surfCol;
  } else {
    // Miss: deep water fog gradient
    float turbidity = tension * 0.4;
    vec3 deepFog = waterColor * mix(0.06, 0.02, spaceScore);
    col = cr2WaterFog(col, MAX_DIST * 0.5, deepFog, turbidity);
  }

  // === FISH SCHOOLING PARTICLES ===
  vec3 fishGlow = cr2Fish(rayOrigin, rayDir, flowTime, energy, drumOnset, melodicPitch, sJam);
  col += fishGlow * (0.8 + energy * 0.5);

  // === BIOLUMINESCENT PLANKTON (space/night reef) ===
  col += cr2Bioluminescence(rayOrigin, rayDir, flowTime, energy, sSpace + spaceScore * 0.5);

  // === MARINE SNOW ===
  col += cr2MarineSnow(rayOrigin, rayDir, flowTime, fastE);

  // === CORAL SPAWNING EVENT (climax) ===
  col += cr2SpawnCloud(rayOrigin, rayDir, flowTime, climaxAmount);

  // === AMBIENT CAUSTIC LIGHT on water volume ===
  float volCaustic = cr2Caustic(screenP + vec2(flowTime * 0.08), flowTime * 0.5, highsVal * 0.6);
  col += waterColor * volCaustic * 0.05 * (0.4 + vocalPresence * 0.6) * mix(1.0, 0.2, sSpace);

  // === SECTION SPECIAL BEHAVIORS ===

  // Jam: fish swarm shimmer intensifier
  if (sJam > 0.01) {
    float swarmNoise = fbm3(vec3(screenP * 3.5, flowTime * 0.7));
    float swarmPulse = smoothstep(0.3, 0.7, swarmNoise) * sJam;
    vec3 swarmColor = hsv2rgb(vec3(fract(0.08 + flowTime * 0.02), 0.6, 0.9));
    col += swarmColor * swarmPulse * 0.1 * energy;
  }

  // Space: night reef — suppress sunlight, enhance bioluminescence already handled above
  col *= mix(1.0, 0.4, sSpace);

  // Chorus: golden hour warmth overlay
  if (sChorus > 0.01) {
    vec3 goldenWash = vec3(1.0, 0.85, 0.6) * sChorus * 0.08;
    col = col + goldenWash - col * goldenWash; // screen blend
  }

  // Solo: dramatic spotlight isolation
  if (sSolo > 0.01) {
    float spotlight = exp(-dot(screenP, screenP) * 1.8);
    col *= mix(1.0, 0.4 + spotlight * 1.1, sSolo);
  }

  // === CLIMAX ENVIRONMENTAL EFFECTS ===
  if (climaxAmount > 0.01) {
    // Warm pink tint from coral spawn
    vec3 spawnTint = vec3(1.0, 0.6, 0.5) * climaxAmount * 0.08;
    col += spawnTint;

    // Enhance volumetric scatter
    col *= 1.0 + climaxAmount * 0.2;
  }

  // === BEAT PULSE brightness ===
  float bpH = beatPulseHalf(uMusicalTime);
  col *= 1.0 + bpH * 0.07 * energy;
  col *= 1.0 + uBeatSnap * 0.08;

  // === SEMANTIC MODULATION ===
  // Cosmic → enhance deep blue tones
  col = mix(col, col * vec3(0.85, 0.9, 1.2), uSemanticCosmic * 0.12);
  // Tender → soften toward warm pastels
  col = mix(col, col * 0.93 + vec3(0.03, 0.02, 0.01), uSemanticTender * 0.15);
  // Ambient → deepen the water darkness slightly
  col *= mix(1.0, 0.9, uSemanticAmbient * 0.25);
  // Psychedelic → saturate coral colors
  float psyLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(psyLuma), col, 1.0 + uSemanticPsychedelic * 0.35);

  // === VIGNETTE (reef darkness at edges) ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(waterColor * 0.04, vec3(0.02, 0.03, 0.04));
  col = mix(vigTint, col, vignette);

  // === DEAD ICONOGRAPHY ===
  float noiseField = snoise(vec3(screenP * 2.0, uTime * 0.1));
  col += iconEmergence(screenP, uTime, energy, bassVal, waterColor, accentColor, noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(screenP, uTime, energy, bassVal, waterColor, accentColor, noiseField, uSectionIndex);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${cr2DepthAlpha}
}
`;
