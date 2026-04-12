/**
 * Stained Glass Dissolution — raymarched gothic rose window dissolving into starfield.
 *
 * For "And We Bid You Goodnight" — the a cappella show closer. A lullaby.
 * The most peaceful moment of the entire show. The audience leaving into the night.
 *
 * CONCEPT: A gothic cathedral rose window, rendered as a full 3D SDF with
 * concentric rings of stained glass panes. As the song progresses, individual
 * panes detach from the window, drift outward, shrink into points of light,
 * and join the starfield behind. The window slowly empties, revealing the cosmos.
 * By the end, only stars remain. Letting go. Transcendence.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → tracery/stone vibration amplitude
 *   uEnergy            → glass color intensity (brighter with energy)
 *   uVocalPresence     → light intensity through glass (a cappella = vocal heavy)
 *   uHarmonicTension   → dissolution rate (more tension = more pieces break free)
 *   uSectionProgress   → overall dissolution progress (0→1 across song)
 *   uSectionType       → space=7 triggers maximum dissolution
 *   uClimaxPhase       → final dissolution burst
 *   uSlowEnergy        → fragment drift speed
 *   uSemanticTender    → warm color shift
 *   uSemanticAmbient   → peace multiplier (slows everything, softens light)
 *   uChromaHue         → glass hue modulation
 *   uPalettePrimary    → primary glass palette
 *   uPaletteSecondary  → secondary glass palette
 *   uPaletteSaturation → glass saturation
 *   uVocalEnergy       → vocal stem light boost
 *   uSpaceScore        → additional dissolution trigger
 *   uDynamicRange      → light shaft contrast
 *   uTimbralBrightness → specular highlight on glass
 *   uBeatStability     → tracery steadiness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const stainedGlassDissolutionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  lightLeakEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  beatPulseEnabled: false,
});

const sgNormalGLSL = buildRaymarchNormal("sgMap($P, dissolveProgress, tension, climaxBurst, bassVib, beatSteady).x", { eps: 0.003, name: "sgNormal" });
const sgDepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

export const stainedGlassDissolutionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.002
#define NUM_RINGS 5
#define PANES_PER_RING 8

// ─── Hash functions for starfield and pane identity ───
float sgHash21(vec2 seed) {
  seed = fract(seed * vec2(123.34, 456.21));
  seed += dot(seed, seed + 45.32);
  return fract(seed.x * seed.y);
}

vec2 sgHash22(vec2 seed) {
  seed = vec2(dot(seed, vec2(127.1, 311.7)), dot(seed, vec2(269.5, 183.3)));
  return fract(sin(seed) * 43758.5453);
}

vec3 sgHash23(vec2 seed) {
  float h1 = sgHash21(seed);
  float h2 = sgHash21(seed + 71.37);
  float h3 = sgHash21(seed + 143.91);
  return vec3(h1, h2, h3);
}

// ─── 2D rotation matrix ───
mat2 sgRot2(float angle) {
  float ca = cos(angle);
  float sa = sin(angle);
  return mat2(ca, -sa, sa, ca);
}

// ─── Voronoi cell distance for pane subdivision within rings ───
// Returns (cellDist, borderDist, cellId.x, cellId.y)
vec4 sgVoronoi(vec2 coord) {
  vec2 cellFloor = floor(coord);
  vec2 cellFrac = fract(coord);
  float minDist = 10.0;
  float secondDist = 10.0;
  vec2 bestId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 randomOffset = sgHash22(cellFloor + neighbor);
      randomOffset = 0.5 + 0.4 * sin(randomOffset * TAU + 0.5);
      vec2 diff = neighbor + randomOffset - cellFrac;
      float dist = dot(diff, diff);
      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
        bestId = cellFloor + neighbor;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }
  float borderDist = (sqrt(secondDist) - sqrt(minDist));
  return vec4(sqrt(minDist), borderDist, bestId);
}

// ─── Pane dissolution state: returns (dissolvePhase, driftOffset.xy, driftOffset.z) ───
// dissolvePhase: 0=attached, 0→1=detaching, 1=fully dissolved into star
// Each pane has a unique dissolution threshold based on its position hash.
vec4 sgPaneDissolution(vec2 paneId, float dissolveProgress, float tension, float climaxBurst) {
  float paneHash = sgHash21(paneId * 7.31 + 13.0);
  float paneHash2 = sgHash21(paneId * 3.17 + 29.0);

  // Each pane has a threshold: it starts dissolving when progress exceeds its threshold.
  // Outer ring panes dissolve first (lower threshold), inner later.
  // Tension accelerates dissolution. Climax bursts dissolve many at once.
  float threshold = paneHash * 0.7 + 0.05;
  threshold -= climaxBurst * 0.4;
  threshold = max(threshold, 0.0);

  float localProgress = smoothstep(threshold, threshold + 0.25, dissolveProgress);
  // Tension makes dissolution more aggressive
  localProgress = min(1.0, localProgress + tension * 0.15 * step(threshold * 0.8, dissolveProgress));

  // Drift direction: outward + slight spiral, unique per pane
  float driftAngle = paneHash * TAU + paneHash2 * 2.0;
  float driftSpeed = 0.3 + paneHash2 * 0.5;
  float driftPhase = localProgress * localProgress; // ease-in drift
  vec2 driftXY = vec2(cos(driftAngle), sin(driftAngle)) * driftPhase * driftSpeed * 3.0;
  float driftZ = driftPhase * (2.0 + paneHash * 3.0); // drift away from camera

  return vec4(localProgress, driftXY, driftZ);
}

// ─── SDF: thin disc (the window plane) ───
float sgDisc(vec3 pos, float radius, float thickness) {
  float dRadial = length(pos.xy) - radius;
  float dAxial = abs(pos.z) - thickness;
  return length(max(vec2(dRadial, dAxial), 0.0)) + min(max(dRadial, dAxial), 0.0);
}

// ─── SDF: ring (annular disc) ───
float sgRing(vec3 pos, float innerR, float outerR, float thickness) {
  float r = length(pos.xy);
  float dRadial = max(innerR - r, r - outerR);
  float dAxial = abs(pos.z) - thickness;
  return length(max(vec2(dRadial, dAxial), 0.0)) + min(max(dRadial, dAxial), 0.0);
}

// ─── SDF: tracery line (radial spoke) ───
float sgTraceryLine(vec2 posXY, float angle, float innerR, float outerR, float width) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(posXY, dir);
  proj = clamp(proj, innerR, outerR);
  vec2 nearest = dir * proj;
  float dist = length(posXY - nearest);
  return dist - width;
}

// ─── SDF: trefoil ornament at intersection points ───
float sgTrefoil(vec2 posXY, vec2 center, float radius) {
  vec2 lp = posXY - center;
  float angle = atan(lp.y, lp.x);
  float r = length(lp);
  float lobes = radius * (0.5 + 0.5 * cos(angle * 3.0));
  return r - lobes;
}

// ─── Main SDF scene: rose window with dissolution ───
// Returns vec2(distance, materialId)
// materialId: 0=stone tracery, 1=glass pane, 2=dissolved fragment, 3=nothing
vec2 sgMap(vec3 pos, float dissolveProgress, float tension, float climaxBurst,
           float bassVibration, float beatSteady) {
  float windowZ = 0.0;
  float windowThickness = 0.06;
  float outerRadius = 2.8;

  // Bass vibration on tracery
  vec3 vibratedPos = pos;
  vibratedPos.xy += vec2(
    sin(pos.y * 8.0 + uDynamicTime * 3.0) * bassVibration * 0.008,
    cos(pos.x * 8.0 + uDynamicTime * 2.7) * bassVibration * 0.008
  ) * (1.0 - beatSteady * 0.5);

  // === STONE TRACERY SDF ===
  float tracery = 1e5;

  // Outer circular frame
  float frameOuter = abs(length(vibratedPos.xy) - outerRadius) - 0.08;
  float frameZ = abs(vibratedPos.z - windowZ) - windowThickness * 1.5;
  float frame = max(frameOuter, frameZ);
  tracery = min(tracery, frame);

  // Concentric ring borders
  for (int ring = 1; ring < NUM_RINGS; ring++) {
    float ringR = outerRadius * float(ring) / float(NUM_RINGS);
    float ringDist = abs(length(vibratedPos.xy) - ringR) - 0.03;
    float ringZ = abs(vibratedPos.z - windowZ) - windowThickness;
    tracery = min(tracery, max(ringDist, ringZ));
  }

  // Radial spokes (8 primary + 8 secondary offset)
  for (int spoke = 0; spoke < 16; spoke++) {
    float angle = float(spoke) * PI / 8.0;
    float spokeWidth = (spoke < 8) ? 0.025 : 0.015;
    float innerR = (spoke < 8) ? 0.0 : outerRadius * 0.3;
    float spokeDist = sgTraceryLine(vibratedPos.xy, angle, innerR, outerRadius, spokeWidth);
    float spokeZ = abs(vibratedPos.z - windowZ) - windowThickness;
    tracery = min(tracery, max(spokeDist, spokeZ));
  }

  // Trefoil ornaments at ring-spoke intersections
  for (int ring = 1; ring < 4; ring++) {
    float ringR = outerRadius * float(ring) / float(NUM_RINGS);
    for (int spoke = 0; spoke < 8; spoke++) {
      float angle = float(spoke) * PI / 4.0 + PI / 8.0;
      vec2 center = vec2(cos(angle), sin(angle)) * ringR;
      float trefoilDist = sgTrefoil(vibratedPos.xy, center, 0.12);
      float trefoilZ = abs(vibratedPos.z - windowZ) - windowThickness * 0.8;
      // Invert: the trefoil is a hole, so its border is tracery
      float trefoilBorder = abs(trefoilDist) - 0.02;
      tracery = min(tracery, max(trefoilBorder, trefoilZ));
    }
  }

  // === GLASS PANES ===
  // Glass lives in the spaces between tracery, on the window plane
  float windowPlane = abs(vibratedPos.z - windowZ) - windowThickness * 0.3;

  // Polar coordinates for ring/pane identification
  float paneR = length(vibratedPos.xy);
  float paneAngle = atan(vibratedPos.y, vibratedPos.x);

  // Determine which ring and angular sector this point is in
  float ringIdx = floor(paneR / (outerRadius / float(NUM_RINGS)));
  ringIdx = clamp(ringIdx, 0.0, float(NUM_RINGS) - 1.0);
  float panesInRing = 8.0 + ringIdx * 4.0; // more panes in outer rings
  float sectorAngle = TAU / panesInRing;
  float sectorIdx = floor((paneAngle + PI) / sectorAngle);

  vec2 paneId = vec2(ringIdx, sectorIdx);

  // Get dissolution state for this pane
  vec4 dissolution = sgPaneDissolution(paneId, dissolveProgress, tension, climaxBurst);
  float dissolvePhase = dissolution.x;
  vec2 driftXY = dissolution.yz;
  float driftZ = dissolution.w;

  // Glass distance: ring-shaped region between tracery lines
  float ringInner = ringIdx * outerRadius / float(NUM_RINGS) + 0.05;
  float ringOuter = (ringIdx + 1.0) * outerRadius / float(NUM_RINGS) - 0.05;
  float glassDist = sgRing(vec3(vibratedPos.xy, vibratedPos.z - windowZ), ringInner, ringOuter, windowThickness * 0.3);

  // For dissolved panes: offset the glass position (fragment drifts away)
  if (dissolvePhase > 0.01) {
    vec3 fragmentPos = pos;
    fragmentPos.xy -= driftXY;
    fragmentPos.z -= driftZ;

    // Fragment shrinks as it dissolves
    float shrink = 1.0 + dissolvePhase * 4.0;
    fragmentPos.xy *= shrink;

    float fragR = length(fragmentPos.xy);
    float fragGlassDist = sgRing(vec3(fragmentPos.xy, fragmentPos.z - windowZ),
                                  ringInner * shrink, ringOuter * shrink,
                                  windowThickness * 0.3 * (1.0 - dissolvePhase * 0.8));

    // Blend between attached and drifting based on dissolve phase
    glassDist = mix(glassDist, fragGlassDist, dissolvePhase);
  }

  // If fully dissolved, glass becomes a point (star)
  if (dissolvePhase > 0.95) {
    glassDist = 1e5; // remove glass, it is now a star
  }

  // Fade tracery as overall dissolution progresses
  float traceryFade = smoothstep(0.7, 1.0, dissolveProgress);
  if (traceryFade > 0.01) {
    tracery = mix(tracery, tracery + traceryFade * 2.0, traceryFade);
  }

  // Return closest surface
  float materialId;
  float closest;
  if (tracery < glassDist && traceryFade < 0.95) {
    closest = tracery;
    materialId = 0.0; // stone
  } else {
    closest = glassDist;
    materialId = mix(1.0, 2.0, dissolvePhase); // glass → fragment
  }

  return vec2(closest, materialId);
}

// ─── Normal (shared raymarching utility) ───
${sgNormalGLSL}

// ─── Starfield: hash-based, dissolving fragments become new stars ───
vec3 sgStarfield(vec2 coord, float dissolveProgress) {
  vec3 stars = vec3(0.0);
  // Layer 1: distant dense stars
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 80.0 + fl * 60.0;
    vec2 starCell = floor(coord * scale);
    vec2 starFrac = fract(coord * scale);
    float starHash = sgHash21(starCell + fl * 100.0);

    if (starHash > 0.92 - dissolveProgress * 0.06) { // more stars as dissolution progresses
      vec2 starPos = sgHash22(starCell + fl * 100.0);
      float starDist = length(starFrac - starPos);
      float starSize = 0.01 + starHash * 0.02;
      float brightness = smoothstep(starSize, 0.0, starDist);
      // Slight twinkle
      brightness *= 0.5 + 0.5 * sin(uDynamicTime * (1.0 + starHash * 3.0) + starHash * TAU);
      // Star color: mostly warm white, some blue, some gold
      vec3 starColor = mix(vec3(1.0, 0.95, 0.85), vec3(0.7, 0.8, 1.0), step(0.7, starHash));
      starColor = mix(starColor, vec3(1.0, 0.85, 0.5), step(0.85, starHash));
      stars += starColor * brightness * (0.3 + fl * 0.2);
    }
  }

  // Layer 2: "arrived" dissolved fragments as bright, warmer stars
  float arrivedStars = smoothstep(0.1, 0.5, dissolveProgress);
  if (arrivedStars > 0.01) {
    float fragScale = 40.0;
    vec2 fragCell = floor(coord * fragScale);
    float fragHash = sgHash21(fragCell * 2.71 + 51.0);
    if (fragHash > 0.85) {
      vec2 fragFrac = fract(coord * fragScale);
      vec2 fragPos = sgHash22(fragCell * 2.71 + 51.0);
      float fragDist = length(fragFrac - fragPos);
      float fragBrightness = smoothstep(0.025, 0.0, fragDist) * arrivedStars;
      // These stars pulse gently with vocal presence
      fragBrightness *= 0.6 + 0.4 * sin(uDynamicTime * 0.8 + fragHash * TAU);
      vec3 fragColor = hsv2rgb(vec3(
        uPalettePrimary + fragHash * 0.3,
        0.3 + fragHash * 0.3,
        0.9
      ));
      stars += fragColor * fragBrightness * 0.8;
    }
  }

  return stars;
}

// ─── Volumetric light shafts through glass ───
vec3 sgLightShafts(vec2 coord, float vocalLight, float dynamicRng) {
  vec3 shafts = vec3(0.0);
  // Light source behind window (slightly off-center for drama)
  vec2 lightOrigin = vec2(0.0, 0.1);
  vec2 toLight = coord - lightOrigin;
  float lightDist = length(toLight);
  float lightAngle = atan(toLight.y, toLight.x);

  // Radial rays: modulated by noise for god-ray effect
  float rayNoise = fbm3(vec3(lightAngle * 3.0, lightDist * 2.0, uDynamicTime * 0.04));
  float rayPattern = 0.5 + 0.5 * sin(lightAngle * 12.0 + rayNoise * 2.0);
  float rayFalloff = exp(-lightDist * 1.2);
  float rayStrength = rayPattern * rayFalloff * vocalLight;

  // Dynamic range controls shaft contrast
  rayStrength *= 0.5 + dynamicRng * 0.5;

  // Warm golden light (cathedral afternoon sunlight)
  vec3 shaftColor = vec3(1.0, 0.88, 0.6) * 0.4;
  shafts = shaftColor * rayStrength;

  return shafts;
}

// ─── Glass color for a given pane ───
vec3 sgGlassColor(vec2 paneId, float energy, float tenderWarm, float chromaHueMod) {
  float paneHash = sgHash21(paneId * 7.31 + 13.0);
  float paneHash2 = sgHash21(paneId * 11.17 + 5.0);

  // Base hue from palette + unique per-pane offset
  float hue = uPalettePrimary + paneHash * 0.4 + chromaHueMod;

  // Tender warmth shifts toward amber/rose
  hue = mix(hue, 0.08 + paneHash * 0.06, tenderWarm * 0.3);

  // Secondary palette influence for variety
  float hue2 = uPaletteSecondary + paneHash2 * 0.2;
  hue = mix(hue, hue2, paneHash2 * 0.3);

  // Saturation: richer at higher energy, never garish
  float sat = mix(0.3, 0.75, energy) * uPaletteSaturation;
  // Cathedral glass is deeply saturated but not neon
  sat = min(sat, 0.85);

  // Brightness: energy lifts it, but glass is luminous even when quiet
  float brightness = mix(0.25, 0.7, energy);

  return hsv2rgb(vec3(hue, sat, brightness));
}


void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio parameter extraction ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float vocalEng = clamp(uVocalEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float sectionProg = clamp(uSectionProgress, 0.0, 1.0);
  float tenderWarm = clamp(uSemanticTender, 0.0, 1.0);
  float ambientPeace = clamp(uSemanticAmbient, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.2;
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float dynamicRng = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float beatSteady = clamp(uBeatStability, 0.0, 1.0);

  // Section type: space (7) triggers maximum dissolution
  float sectionT = uSectionType;
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sOutro = smoothstep(5.5, 6.5, sectionT) * (1.0 - step(6.5, sectionT));

  // ─── Dissolution progress: the heart of the shader ───
  // Combines section progress, space score, climax, and ambient mood
  float dissolveProgress = sectionProg * 0.7;
  dissolveProgress += sSpace * 0.3;
  dissolveProgress += spaceScore * 0.15;
  dissolveProgress += sOutro * 0.2;
  // Ambient peace gently accelerates the letting go
  dissolveProgress += ambientPeace * 0.08;
  dissolveProgress = clamp(dissolveProgress, 0.0, 1.0);

  // Climax burst: during climax phase, many panes dissolve at once
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBurst = isClimax * uClimaxIntensity;

  // Vocal presence drives the light behind the glass (this is an a cappella song)
  float vocalLight = max(vocalPres, vocalEng) * 1.5 + 0.3;
  // Ambient peace makes the light softer, warmer
  vocalLight *= mix(1.0, 0.7, ambientPeace);

  // ─── Camera setup ───
  // Camera looks straight at the rose window, slowly pulling back as dissolution progresses
  float camPullback = 4.5 + dissolveProgress * 2.5;
  // Peace multiplier: ambient slows camera drift
  float camDriftSpeed = 0.015 * (1.0 - ambientPeace * 0.6);
  vec3 ro = vec3(
    sin(uDynamicTime * camDriftSpeed) * 0.3,
    cos(uDynamicTime * camDriftSpeed * 0.7) * 0.2 + 0.1,
    -camPullback
  );
  vec3 lookAtPt = vec3(0.0, 0.0, 0.0);
  vec3 fwd = normalize(lookAtPt - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(fwd, worldUp));
  vec3 camUp = cross(camRight, fwd);
  float fov = 0.8 + dissolveProgress * 0.15;
  vec3 rd = normalize(fwd * fov + camRight * p.x + camUp * p.y);

  // ─── Starfield background (always present, revealed by dissolution) ───
  float starVisibility = mix(0.15, 1.0, dissolveProgress);
  vec3 starBg = sgStarfield(rd.xy * 2.0 + rd.z * 0.5, dissolveProgress) * starVisibility;

  // Deep space nebula glow behind stars
  float nebulaGlow = fbm3(vec3(rd.xy * 1.5, uDynamicTime * 0.008));
  vec3 nebulaColor = mix(
    hsv2rgb(vec3(uPalettePrimary + 0.6, 0.2, 0.08)),
    hsv2rgb(vec3(uPaletteSecondary + 0.3, 0.15, 0.06)),
    nebulaGlow * 0.5 + 0.5
  );
  vec3 background = starBg + nebulaColor * starVisibility * 0.5;

  // ─── Raymarch the rose window ───
  float totalDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);
  bool marchSuccess = false;

  for (int stepIdx = 0; stepIdx < MAX_STEPS; stepIdx++) {
    vec3 marchPos = ro + rd * totalDist;
    vec2 sceneResult = sgMap(marchPos, dissolveProgress, tension, climaxBurst, bass, beatSteady);
    float sceneDist = sceneResult.x;

    if (sceneDist < SURF_DIST) {
      marchResult = vec2(totalDist, sceneResult.y);
      marchSuccess = true;
      break;
    }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8; // slight overshoot protection
  }

  vec3 col;

  if (marchSuccess) {
    vec3 surfPos = ro + rd * marchResult.x;
    float matId = marchResult.y;
    vec3 normal = sgNormal(surfPos);

    // Polar coords for pane identification
    float paneR = length(surfPos.xy);
    float paneAngle = atan(surfPos.y, surfPos.x);
    float outerRadius = 2.8;
    float ringIdx = floor(paneR / (outerRadius / float(NUM_RINGS)));
    ringIdx = clamp(ringIdx, 0.0, float(NUM_RINGS) - 1.0);
    float panesInRing = 8.0 + ringIdx * 4.0;
    float sectorAngle = TAU / panesInRing;
    float sectorIdx = floor((paneAngle + PI) / sectorAngle);
    vec2 paneId = vec2(ringIdx, sectorIdx);

    // Dissolution state of this pane
    vec4 dissolution = sgPaneDissolution(paneId, dissolveProgress, tension, climaxBurst);
    float dissolvePhase = dissolution.x;

    if (matId < 0.5) {
      // === STONE TRACERY ===
      // Dark stone with subtle warm highlights
      vec3 stoneBase = vec3(0.04, 0.035, 0.03);
      // Light from behind creates rim lighting on tracery edges
      float rimLight = pow(1.0 - abs(dot(normal, -rd)), 3.0);
      vec3 rimColor = vec3(0.8, 0.65, 0.4) * rimLight * vocalLight * 0.2;

      // Timbral brightness adds specular highlight
      float specular = pow(max(0.0, dot(reflect(rd, normal), vec3(0.0, 0.0, -1.0))), 16.0);
      vec3 specColor = vec3(1.0, 0.9, 0.7) * specular * timbralBright * 0.15;

      col = stoneBase + rimColor + specColor;

      // Tracery fades with overall dissolution
      float traceryAlpha = 1.0 - smoothstep(0.65, 1.0, dissolveProgress);
      col = mix(background, col, traceryAlpha);

    } else {
      // === GLASS PANE (possibly dissolving fragment) ===
      vec3 glassColor = sgGlassColor(paneId, energy, tenderWarm, chromaHueMod);

      // Light transmission: light streams through from behind
      // The key visual — colored light projected forward
      float transmission = vocalLight;
      // Energy brightens the glass
      transmission *= 0.5 + energy * 0.7;

      // Glass is semi-transparent: we see light through it
      vec3 litGlass = glassColor * transmission;

      // Add light shaft contribution: each pane projects colored light
      float lightScatter = pow(max(0.0, dot(normal, vec3(0.0, 0.0, -1.0))), 1.5);
      litGlass += glassColor * lightScatter * vocalLight * 0.3;

      // Timbral brightness → specular glint on glass surface
      float glassSpec = pow(max(0.0, dot(reflect(rd, normal), vec3(0.0, 0.2, -1.0))), 24.0);
      litGlass += vec3(1.0, 0.95, 0.9) * glassSpec * timbralBright * 0.2;

      // Voronoi edge darkening within pane (glass leading detail)
      vec2 voronoiCoord = vec2(paneAngle * panesInRing / TAU, paneR * 3.0);
      vec4 voronoiResult = sgVoronoi(voronoiCoord * 2.0);
      float voronoiEdge = smoothstep(0.0, 0.08, voronoiResult.y);
      litGlass *= mix(0.3, 1.0, voronoiEdge);

      // Dissolving fragments: fade to star-like point
      if (dissolvePhase > 0.01) {
        // Fragment gets brighter and smaller (becoming a star)
        float starTransition = smoothstep(0.3, 0.9, dissolvePhase);
        // Colors shift toward warm white as glass becomes starlight
        vec3 starWhite = vec3(1.0, 0.95, 0.85);
        litGlass = mix(litGlass, starWhite * 0.8, starTransition);
        // Brightness peaks in mid-dissolution, then fades to star-level
        float brightPeak = sin(dissolvePhase * PI) * 1.5;
        litGlass *= 1.0 + brightPeak;
        // Alpha fades: fragment disappears, star appears in background
        float fragAlpha = 1.0 - smoothstep(0.7, 1.0, dissolvePhase);
        litGlass *= fragAlpha;
      }

      col = litGlass;

      // Behind the glass: starfield showing through dissolved areas
      float behindGlassVisibility = dissolvePhase * 0.5;
      col = mix(col, col + background * behindGlassVisibility, behindGlassVisibility);
    }
  } else {
    // === MISS: pure starfield/cosmos ───
    col = background;
  }

  // ─── Volumetric light shafts (additive, on top of everything) ───
  vec3 lightShafts = sgLightShafts(p, vocalLight, dynamicRng);
  // Light shafts are blocked by remaining glass (stronger when window intact)
  float shaftStrength = mix(0.8, 0.15, dissolveProgress);
  col += lightShafts * shaftStrength;

  // ─── Tender warmth: global warm color shift ───
  if (tenderWarm > 0.01) {
    vec3 warmShift = vec3(1.04, 1.0, 0.92);
    col *= mix(vec3(1.0), warmShift, tenderWarm * 0.4);
  }

  // ─── Peace aura: soft overall glow at high ambient ───
  if (ambientPeace > 0.1) {
    float auraDist = length(p);
    float aura = exp(-auraDist * 1.5) * ambientPeace * 0.08;
    vec3 auraColor = hsv2rgb(vec3(uPalettePrimary + 0.05, 0.2, 0.9));
    col += auraColor * aura;
  }

  // ─── Fragment drift speed modulated by slow energy ───
  // (Already baked into dissolution via driftSpeed, but add visual trail for fragments)
  float driftVisual = slowE * dissolveProgress * 0.03;
  float trailNoise = fbm3(vec3(p * 4.0, uDynamicTime * 0.1));
  vec3 trailColor = hsv2rgb(vec3(uPalettePrimary + 0.1, 0.3, 0.5));
  col += trailColor * trailNoise * driftVisual;

  // ─── Atmospheric fog: depth-based, dissolves with window ───
  float fogNoise = fbm3(vec3(p * 0.5, uDynamicTime * 0.012));
  float fogDensity = mix(0.2, 0.03, dissolveProgress) * (1.0 - energy * 0.3);
  vec3 fogColor = vec3(0.01, 0.01, 0.02);
  col = mix(col, fogColor, fogDensity * (0.5 + fogNoise * 0.5));

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(p * 2.0, uDynamicTime * 0.05));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.5, 0.8));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.5, 0.8));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.4;
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Vignette: cathedral darkness at edges ───
  float vigStrength = mix(0.30, 0.20, dissolveProgress); // lighter vignette as window dissolves
  float vig = 1.0 - dot(p * vigStrength, p * vigStrength);
  vig = smoothstep(0.0, 1.0, vig);
  col = mix(vec3(0.003, 0.002, 0.005), col, vig);

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
  ${sgDepthAlpha}
}
`;
