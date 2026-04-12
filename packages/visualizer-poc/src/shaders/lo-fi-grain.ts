/**
 * Lo-Fi Darkroom — raymarched darkroom interior.
 * Camera looks at a photograph developing in a chemical bath tray.
 * The image emerges from the developer fluid as a 3D relief (height-mapped
 * surface). Red safelight illumination. Chemical swirls in the tray.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → fluid ripple amplitude and wavelength
 *   uEnergy           → image emergence rate, contrast depth
 *   uDrumOnset        → chemical splash ring (droplet impact)
 *   uVocalPresence    → safelight brightness / warmth
 *   uHarmonicTension  → development contrast (deep blacks vs blown highlights)
 *   uSectionType      → jam=rapid development, space=blank paper,
 *                        chorus=full image revealed, solo=dodging/burning
 *   uClimaxPhase      → image overexposes to white then new image starts
 *   uClimaxIntensity  → climax effect strength
 *   uSlowEnergy       → chemical swirl speed
 *   uHighs            → fluid caustic sharpness
 *   uMelodicPitch     → image relief height modulation
 *   uBeatSnap         → tray vibration jolt
 *   uSpaceScore       → dampens to blank paper when high
 *   uDynamicRange     → fluid surface tension / meniscus contrast
 *   uSemanticAmbient  → darkroom atmosphere density
 *   uSemanticTender   → warmer safelight tint
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const lfNormalGLSL = buildRaymarchNormal(
  "lfMap($P, bass, drumOnset, beatSnap, emergence, tension, melPitch, timeVal)",
  { eps: 0.001, name: "lfNormal" },
);
const lfAOGLSL = buildRaymarchAO(
  "lfMap($P, bass, drumOnset, beatSnap, emergence, tension, melPitch, timeVal)",
  { steps: 5, stepBase: 0.0, stepScale: 0.06, weightDecay: 0.6, finalMult: 3.0, name: "lfAmbientOcclusion" },
);
const lfDepthAlpha = buildDepthAlphaOutput("marchDist", "LF_MAX_DIST");

export const loFiGrainVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "heavy",
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  lightLeakEnabled: false,
  stageFloodEnabled: false,
});

export const loFiGrainFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define LF_PI 3.14159265
#define LF_TAU 6.28318530
#define LF_MAX_STEPS 80
#define LF_MAX_DIST 16.0
#define LF_SURF_DIST 0.003
#define LF_SPLASH_COUNT 6

// ═══════════════════════════════════════════════════════
// Hash helpers (lf-prefixed)
// ═══════════════════════════════════════════════════════

float lfHash(float n) { return fract(sin(n) * 43758.5453123); }
float lfHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 lfHash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ═══════════════════════════════════════════════════════
// SDF Primitives
// ═══════════════════════════════════════════════════════

float lfSdBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float lfSdPlane(vec3 pos, float yLevel) {
  return pos.y - yLevel;
}

float lfSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float lfSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════
// Development Tray SDF — rectangular tray with beveled rim
// ═══════════════════════════════════════════════════════

float lfTray(vec3 pos) {
  // Outer shell: wide shallow box
  float outerBox = lfSdBox(pos - vec3(0.0, -0.02, 0.0), vec3(1.8, 0.12, 1.3));
  // Inner cavity: slightly smaller, raised up to form walls
  float innerBox = lfSdBox(pos - vec3(0.0, 0.04, 0.0), vec3(1.65, 0.14, 1.15));
  // Tray = outer minus inner (shell)
  float shell = max(outerBox, -innerBox);

  // Beveled rim: rounded edge along top of tray walls
  float rimBox = lfSdBox(pos - vec3(0.0, 0.08, 0.0), vec3(1.75, 0.025, 1.25));
  shell = lfSmin(shell, rimBox, 0.03);

  return shell;
}

// ═══════════════════════════════════════════════════════
// Fluid Surface — rippling liquid in the tray
// ═══════════════════════════════════════════════════════

float lfFluid(vec3 pos, float bass, float drumOnset, float beatSnap, float timeVal) {
  // Base fluid level inside tray
  float fluidY = 0.03;

  // Only compute if near the fluid surface
  if (pos.y > fluidY + 0.15 || pos.y < fluidY - 0.08) return 1.0;
  // Confine fluid to tray interior
  if (abs(pos.x) > 1.6 || abs(pos.z) > 1.1) return 1.0;

  // Bass-driven ripples: concentric waves from center
  float radialDist = length(pos.xz);
  float bassRipple = sin(radialDist * 12.0 - timeVal * 3.0) * bass * 0.012;
  bassRipple += sin(radialDist * 7.0 - timeVal * 2.2 + 1.5) * bass * 0.008;

  // Chemical swirl displacement
  float swirlNoise = fbm3(vec3(pos.xz * 1.5, timeVal * 0.15)) * 0.008;

  // Drum onset splash: expanding ring
  float splashRing = sin(radialDist * 20.0 - timeVal * 8.0) * drumOnset * 0.015;
  splashRing *= smoothstep(1.5, 0.0, radialDist);

  // Beat vibration
  float vibration = beatSnap * sin(pos.x * 15.0 + pos.z * 13.0) * 0.003;

  float surfaceY = fluidY + bassRipple + swirlNoise + splashRing + vibration;
  return pos.y - surfaceY;
}

// ═══════════════════════════════════════════════════════
// Developing Image — height-mapped photograph emerging from fluid
// ═══════════════════════════════════════════════════════

float lfImageHeight(vec2 uv, float emergence, float tension, float melPitch, float timeVal) {
  // The "photograph" is a procedural landscape of tonal values
  // Multi-frequency detail creates the illusion of photographic content
  float coarse = fbm6(vec3(uv * 2.0, timeVal * 0.02 + 100.0));
  float detail = fbm3(vec3(uv * 6.0, timeVal * 0.01 + 200.0)) * 0.4;
  float fine = snoise(vec3(uv * 14.0, timeVal * 0.005 + 300.0)) * 0.15;

  float photo = coarse + detail + fine;
  photo = photo * 0.5 + 0.5; // normalize 0-1

  // Emergence: image develops from nothing → full relief
  // Dark areas develop first (like real darkroom chemistry)
  float developThreshold = 1.0 - emergence;
  float developed = smoothstep(developThreshold - 0.2, developThreshold + 0.1, photo);

  // Tension increases contrast: deep blacks, bright highlights
  developed = mix(developed, pow(developed, mix(1.0, 2.5, tension)), tension);

  // Melodic pitch modulates the height of the relief
  float reliefHeight = developed * (0.03 + melPitch * 0.02) * emergence;

  return reliefHeight;
}

float lfImage(vec3 pos, float emergence, float tension, float melPitch, float timeVal) {
  // Photo paper sits at the bottom of the tray
  float paperY = 0.0;

  // Confine to paper area (slightly smaller than tray interior)
  if (abs(pos.x) > 1.4 || abs(pos.z) > 0.95) return 1.0;

  // UV coordinates on the paper surface
  vec2 paperUv = pos.xz * vec2(0.36, 0.53) + 0.5;

  float imgHeight = lfImageHeight(paperUv, emergence, tension, melPitch, timeVal);
  return pos.y - (paperY + imgHeight);
}

// ═══════════════════════════════════════════════════════
// Darkroom environment: walls, ceiling, counter, enlarger
// ═══════════════════════════════════════════════════════

float lfDarkroom(vec3 pos) {
  // Floor
  float floorPlane = lfSdPlane(pos, -0.5);

  // Back wall
  float backWall = lfSdBox(pos - vec3(0.0, 2.0, 3.0), vec3(5.0, 3.0, 0.1));

  // Side walls
  float leftWall = lfSdBox(pos - vec3(-3.5, 2.0, 0.0), vec3(0.1, 3.0, 4.0));
  float rightWall = lfSdBox(pos - vec3(3.5, 2.0, 0.0), vec3(0.1, 3.0, 4.0));

  // Ceiling
  float ceiling = -(pos.y - 3.5);

  // Counter/workbench the tray sits on
  float counter = lfSdBox(pos - vec3(0.0, -0.18, 0.0), vec3(2.5, 0.08, 1.8));

  float room = min(floorPlane, min(backWall, min(leftWall, min(rightWall, ceiling))));
  room = min(room, counter);

  return room;
}

// ═══════════════════════════════════════════════════════
// Tongs and chemical bottles (darkroom props)
// ═══════════════════════════════════════════════════════

float lfProps(vec3 pos) {
  // Tongs resting on counter edge
  float tongHandle = lfSdBox(pos - vec3(2.0, 0.05, -0.8), vec3(0.02, 0.015, 0.25));
  float tongTip = lfSdBox(pos - vec3(2.0, 0.01, -0.5), vec3(0.025, 0.005, 0.06));
  float tongs = min(tongHandle, tongTip);

  // Chemical bottles on the back counter
  float bottle1 = lfSdBox(pos - vec3(-1.8, 0.15, 1.4), vec3(0.08, 0.2, 0.08));
  float bottle2 = lfSdBox(pos - vec3(-1.5, 0.12, 1.4), vec3(0.06, 0.15, 0.06));
  float bottle3 = lfSdBox(pos - vec3(-1.2, 0.18, 1.4), vec3(0.07, 0.22, 0.07));

  return min(tongs, min(bottle1, min(bottle2, bottle3)));
}

// ═══════════════════════════════════════════════════════
// Combined Scene SDF
// ═══════════════════════════════════════════════════════

float lfMap(vec3 pos, float bass, float drumOnset, float beatSnap, float emergence,
            float tension, float melPitch, float timeVal) {
  float tray = lfTray(pos);
  float fluid = lfFluid(pos, bass, drumOnset, beatSnap, timeVal);
  float image = lfImage(pos, emergence, tension, melPitch, timeVal);
  float room = lfDarkroom(pos);
  float props = lfProps(pos);

  float scene = min(tray, min(fluid, min(image, min(room, props))));
  return scene;
}

${lfNormalGLSL}
${lfAOGLSL}

// ═══════════════════════════════════════════════════════
// Chemical Swirl Pattern (visible in fluid surface)
// ═══════════════════════════════════════════════════════

vec3 lfChemicalSwirl(vec2 surfaceUv, float slowEnergy, float timeVal) {
  float swirlTime = timeVal * (0.08 + slowEnergy * 0.12);

  // Layered curl-like swirls
  float s1 = fbm6(vec3(surfaceUv * 3.0, swirlTime));
  float s2 = fbm3(vec3(surfaceUv * 5.0 + vec2(s1 * 0.6), swirlTime * 0.7 + 50.0));
  float s3 = snoise(vec3(surfaceUv * 8.0 + vec2(s2 * 0.4), swirlTime * 1.2 + 100.0));

  float pattern = s1 * 0.5 + s2 * 0.3 + s3 * 0.2;

  // Chemical colors: amber developer, slightly greenish stop bath, purple tones
  vec3 devColor = vec3(0.35, 0.22, 0.08);   // warm amber developer
  vec3 stopColor = vec3(0.15, 0.18, 0.10);  // greenish stop bath
  vec3 fixerColor = vec3(0.18, 0.12, 0.20); // purple-ish fixer

  vec3 chemColor = mix(devColor, stopColor, smoothstep(-0.3, 0.3, pattern));
  chemColor = mix(chemColor, fixerColor, smoothstep(0.1, 0.6, s3));

  return chemColor;
}

// ═══════════════════════════════════════════════════════
// Fluid Caustics (projected onto submerged surfaces)
// ═══════════════════════════════════════════════════════

float lfCaustics(vec2 surfacePos, float highs, float timeVal) {
  float caustTime = timeVal * 0.3;

  // Two deformed grid patterns that interfere
  vec2 p1 = surfacePos * 6.0 + vec2(sin(caustTime * 0.5), cos(caustTime * 0.3));
  vec2 p2 = surfacePos * 8.0 + vec2(cos(caustTime * 0.4 + 2.0), sin(caustTime * 0.6 + 1.0));

  float c1 = sin(p1.x + sin(p1.y + caustTime)) * cos(p1.y + cos(p1.x + caustTime * 0.7));
  float c2 = sin(p2.x + cos(p2.y + caustTime * 0.8)) * cos(p2.y + sin(p2.x + caustTime * 0.5));

  float caustic = (c1 + c2) * 0.5;
  caustic = pow(abs(caustic), mix(2.0, 0.8, highs)); // highs sharpen caustics

  return caustic;
}

// ═══════════════════════════════════════════════════════
// Safelight (the red darkroom lamp)
// ═══════════════════════════════════════════════════════

vec3 lfSafelight(vec3 pos, vec3 nrm, float vocalPresence, float tender) {
  // Safelight mounted on the wall, upper left
  vec3 safelightPos = vec3(-2.0, 2.8, 1.5);
  vec3 toLamp = safelightPos - pos;
  float lampDist = length(toLamp);
  vec3 lampDir = toLamp / lampDist;

  // Diffuse lighting
  float diff = max(dot(nrm, lampDir), 0.0);

  // Inverse-square attenuation with vocal-driven brightness
  float brightness = (0.6 + vocalPresence * 0.8) / (1.0 + lampDist * lampDist * 0.08);

  // Classic darkroom safelight: deep amber-red
  // Vocal presence makes it brighter, tender pushes warmer
  vec3 safeColor = vec3(0.85, 0.12, 0.03);
  safeColor = mix(safeColor, vec3(0.9, 0.25, 0.08), tender * 0.4);
  safeColor = mix(safeColor, vec3(0.95, 0.18, 0.05), vocalPresence * 0.3);

  return safeColor * diff * brightness;
}

// ═══════════════════════════════════════════════════════
// Secondary fill light (dim, cool — simulates light leak under door)
// ═══════════════════════════════════════════════════════

vec3 lfFillLight(vec3 pos, vec3 nrm) {
  vec3 fillPos = vec3(2.5, 0.0, -2.5);
  vec3 toFill = normalize(fillPos - pos);
  float fillDiff = max(dot(nrm, toFill), 0.0);
  float fillDist = length(fillPos - pos);
  float fillAtten = 0.04 / (1.0 + fillDist * fillDist * 0.15);
  return vec3(0.04, 0.06, 0.10) * fillDiff * fillAtten;
}

// ═══════════════════════════════════════════════════════
// Splash droplet particles (drum onset)
// ═══════════════════════════════════════════════════════

vec3 lfSplashDroplets(vec3 rayOrigin, vec3 rayDir, float drumOnset, float timeVal) {
  if (drumOnset < 0.1) return vec3(0.0);

  vec3 droplets = vec3(0.0);
  for (int i = 0; i < LF_SPLASH_COUNT; i++) {
    float fi = float(i);
    vec3 seed = lfHash3(fi * 13.7 + 5.3);

    // Droplets spray upward from random positions in the tray
    float life = fract(seed.x * 4.3 + timeVal * 1.5);
    float dropY = life * (0.3 + drumOnset * 0.4) - life * life * 0.5; // parabolic arc
    if (dropY < 0.0) continue;

    vec2 dropXZ = (seed.yz - 0.5) * vec2(2.0, 1.5); // within tray bounds
    vec3 dropPos = vec3(dropXZ.x, 0.05 + dropY, dropXZ.y);

    // Ray-sphere test
    vec3 toDrop = dropPos - rayOrigin;
    float tProj = dot(toDrop, rayDir);
    if (tProj < 0.0) continue;
    vec3 closest = rayOrigin + rayDir * tProj;
    float distToDrop = length(closest - dropPos);

    float dropSize = 0.008 + seed.x * 0.005;
    float glow = smoothstep(dropSize * 4.0, 0.0, distToDrop);

    // Red-tinted from safelight
    vec3 dropColor = vec3(0.7, 0.15, 0.05) * drumOnset;
    float lifeFade = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.6, life);

    droplets += dropColor * glow * lifeFade;
  }
  return droplets;
}

// ═══════════════════════════════════════════════════════
// Material identification for shading
// ═══════════════════════════════════════════════════════

// Material IDs: 0=room, 1=tray, 2=fluid, 3=image, 4=props
int lfMaterialId(vec3 pos, float bass, float drumOnset, float beatSnap, float emergence,
                 float tension, float melPitch, float timeVal) {
  float tray = lfTray(pos);
  float fluid = lfFluid(pos, bass, drumOnset, beatSnap, timeVal);
  float image = lfImage(pos, emergence, tension, melPitch, timeVal);
  float room = lfDarkroom(pos);
  float props = lfProps(pos);

  float minD = room;
  int matId = 0;
  if (tray < minD) { minD = tray; matId = 1; }
  if (fluid < minD) { minD = fluid; matId = 2; }
  if (image < minD) { minD = image; matId = 3; }
  if (props < minD) { minD = props; matId = 4; }
  return matId;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

void main() {
  vec2 rawUv = vUv;
  rawUv = applyCameraCut(rawUv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 centeredP = (rawUv - 0.5) * aspect;

  // ─── Audio parameter clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0) * clamp(uMelodicConfidence, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float tender = clamp(uSemanticTender, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);

  // ─── Section type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Emergence: how much of the photo has developed ───
  // jam=rapid development, space=blank paper, chorus=full reveal, solo=selective (dodging)
  float baseEmergence = clamp(energy * 0.6 + uSlowEnergy * 0.4, 0.0, 1.0);
  baseEmergence = mix(baseEmergence, min(1.0, baseEmergence * 2.0), sJam);       // jam: rapid
  baseEmergence = mix(baseEmergence, baseEmergence * 0.05, sSpace);               // space: near blank
  baseEmergence = mix(baseEmergence, 1.0, sChorus * 0.8);                         // chorus: full reveal
  baseEmergence = mix(baseEmergence, baseEmergence * 0.7 + 0.3, sSolo);           // solo: mid-develop
  baseEmergence *= (1.0 - spaceScore * 0.8);                                      // space score dampens

  // ─── Climax reactivity ───
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // Climax: overexpose to white, then reset to new image
  float emergence = baseEmergence;
  float overexpose = 0.0;
  if (climaxBoost > 0.0) {
    // First half of climax: overexpose (image blows out to white)
    overexpose = climaxBoost;
    emergence = min(1.0, emergence + climaxBoost * 0.5);
  }

  float timeVal = uDynamicTime;

  // ─── Camera setup: looking down at the tray from above, slight angle ───
  float camSway = sin(timeVal * 0.04) * 0.1;
  vec3 camPosition = vec3(
    camSway + effectiveBeat * 0.03,
    2.2 + bass * 0.14,
    -1.8
  );
  vec3 lookAtPt = vec3(0.0, 0.0, 0.1);
  vec3 camForward = normalize(lookAtPt - camPosition);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRightDir = normalize(cross(camForward, worldUp));
  vec3 camUpDir = cross(camRightDir, camForward);
  float fov = 1.0;
  vec3 rayDir = normalize(camForward * fov + camRightDir * centeredP.x + camUpDir * centeredP.y);

  // ─── Raymarch ───
  float marchDist = 0.0;
  bool sceneHitFlag = false;
  vec3 sceneHitPos = vec3(0.0);

  for (int i = 0; i < LF_MAX_STEPS; i++) {
    vec3 marchPos = camPosition + rayDir * marchDist;
    float sceneDist = lfMap(marchPos, bass, drumOnset, effectiveBeat, emergence, tension, melPitch, timeVal);
    if (sceneDist < LF_SURF_DIST) {
      sceneHitPos = marchPos;
      sceneHitFlag = true;
      break;
    }
    marchDist += sceneDist;
    if (marchDist > LF_MAX_DIST) break;
  }

  // ─── Background: dark darkroom ceiling/walls ───
  vec3 col = vec3(0.015, 0.008, 0.005);
  // Subtle atmospheric haze in the room
  col += vec3(0.02, 0.005, 0.002) * (1.0 + ambient * 0.5);

  // ─── Shade hit surface ───
  if (sceneHitFlag) {
    vec3 nrm = lfNormal(sceneHitPos);
    int matId = lfMaterialId(sceneHitPos, bass, drumOnset, effectiveBeat, emergence, tension, melPitch, timeVal);
    float occl = lfAmbientOcclusion(sceneHitPos, nrm);

    // Safelight illumination (primary)
    vec3 safeLight = lfSafelight(sceneHitPos, nrm, vocalPresence, tender);
    // Fill light (secondary)
    vec3 fillLight = lfFillLight(sceneHitPos, nrm);

    // Combined light
    vec3 totalLight = safeLight + fillLight;

    if (matId == 0) {
      // Room surfaces: dark walls, counter
      vec3 roomColor = vec3(0.04, 0.03, 0.025);
      // Counter is slightly lighter
      float isCounter = 1.0 - smoothstep(-0.15, -0.10, sceneHitPos.y);
      roomColor = mix(roomColor, vec3(0.08, 0.06, 0.04), isCounter);
      col = roomColor * totalLight * occl;
    }
    else if (matId == 1) {
      // Tray: white plastic, picks up red safelight beautifully
      vec3 trayColor = vec3(0.7, 0.68, 0.65);
      // Chemical staining on tray edges
      float stainNoise = fbm3(vec3(sceneHitPos.xz * 4.0, 0.0));
      trayColor = mix(trayColor, vec3(0.5, 0.4, 0.25), stainNoise * 0.3);
      col = trayColor * totalLight * occl;
    }
    else if (matId == 2) {
      // Fluid surface: reflective, chemical swirls, caustics

      // Chemical swirl colors in the fluid
      vec3 chemSwirl = lfChemicalSwirl(sceneHitPos.xz, slowE, timeVal);

      // Caustics projected from above (safelight through rippled surface)
      float causticVal = lfCaustics(sceneHitPos.xz, highs, timeVal);
      vec3 causticColor = vec3(0.6, 0.08, 0.02) * causticVal * (0.15 + vocalPresence * 0.2);

      // Fresnel-like reflection of safelight on fluid surface
      float fresnel = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);
      vec3 reflectionColor = vec3(0.5, 0.08, 0.02) * fresnel * (0.5 + vocalPresence * 0.5);

      // Fluid base color (slightly translucent amber)
      vec3 fluidBase = vec3(0.12, 0.08, 0.04);
      fluidBase = mix(fluidBase, chemSwirl, 0.4);

      col = fluidBase * totalLight + causticColor + reflectionColor;
      col *= occl;

      // Dynamic range affects surface tension appearance
      col *= mix(0.8, 1.2, dynRange);
    }
    else if (matId == 3) {
      // Developing image: the star of the scene

      // Paper base: bright white
      vec2 paperUv = sceneHitPos.xz * vec2(0.36, 0.53) + 0.5;
      float imgVal = lfImageHeight(paperUv, emergence, tension, melPitch, timeVal);
      float normalizedImg = clamp(imgVal / max(0.05, 0.03 + melPitch * 0.02), 0.0, 1.0);

      // Black-and-white photograph tones
      vec3 paperWhite = vec3(0.85, 0.82, 0.78);
      vec3 imageBlack = vec3(0.02, 0.015, 0.01);

      // The developed image: dark areas are the image, light areas are paper
      vec3 imageColor = mix(paperWhite, imageBlack, normalizedImg * emergence);

      // Solo section: dodging/burning (selective lightening/darkening)
      if (sSolo > 0.0) {
        float dodgeMask = smoothstep(0.3, 0.7, sin(paperUv.x * 4.0 + timeVal * 0.2) * 0.5 + 0.5);
        imageColor = mix(imageColor, imageColor * 1.3, dodgeMask * sSolo * 0.3);
      }

      // Overexposure during climax: blow out to white
      imageColor = mix(imageColor, vec3(1.0, 0.98, 0.95), overexpose * 0.8);

      // Wet paper glistens under safelight
      float wetGloss = pow(max(dot(reflect(rayDir, nrm), normalize(vec3(-2.0, 2.8, 1.5) - sceneHitPos)), 0.0), 16.0);
      vec3 glossColor = vec3(0.6, 0.1, 0.03) * wetGloss * 0.3;

      col = imageColor * totalLight + glossColor;
      col *= occl;

      // Under fluid: tint with chemical color and darken
      float underFluid = smoothstep(0.04, 0.02, sceneHitPos.y);
      vec3 fluidTint = vec3(0.8, 0.7, 0.5);
      col *= mix(vec3(1.0), fluidTint, underFluid * 0.3);
    }
    else if (matId == 4) {
      // Props: tongs, bottles (metal/glass)
      vec3 propColor = vec3(0.25, 0.22, 0.20);
      float specular = pow(max(dot(reflect(rayDir, nrm), normalize(vec3(-2.0, 2.8, 1.5) - sceneHitPos)), 0.0), 24.0);
      col = propColor * totalLight * occl + vec3(0.5, 0.08, 0.02) * specular * 0.2;
    }

    // ─── Depth fog: red-tinted atmospheric haze ───
    float fogDist = length(sceneHitPos - camPosition);
    float fogAmount = 1.0 - exp(-fogDist * 0.06 * (1.0 + ambient * 0.5));
    vec3 fogColor = vec3(0.06, 0.015, 0.008);
    col = mix(col, fogColor, fogAmount);
  }

  // ─── Splash droplets (drum onset) ───
  col += lfSplashDroplets(camPosition, rayDir, drumOnset, timeVal);

  // ─── Safelight glow on screen (atmospheric scatter from the lamp itself) ───
  {
    vec3 safelightScreenPos = vec3(-2.0, 2.8, 1.5);
    vec3 toSafe = safelightScreenPos - camPosition;
    float safeProj = dot(normalize(toSafe), rayDir);
    float safeGlow = smoothstep(0.85, 1.0, safeProj);
    float safeBrightness = 0.15 + vocalPresence * 0.25;
    vec3 safeGlowColor = vec3(0.8, 0.1, 0.02) * safeGlow * safeBrightness;
    // Diffuse halo around the lamp
    float halo = smoothstep(0.7, 0.95, safeProj) * 0.08;
    col += safeGlowColor + vec3(0.4, 0.06, 0.01) * halo * (1.0 + vocalPresence * 0.5);
  }

  // ─── Fluid caustic pattern projected onto tray walls (red-tinted) ───
  {
    float causticProj = lfCaustics(centeredP * 0.5, highs, timeVal);
    float trayMask = smoothstep(0.8, 0.4, abs(centeredP.x)) * smoothstep(0.6, 0.3, abs(centeredP.y));
    col += vec3(0.3, 0.04, 0.01) * causticProj * trayMask * 0.04 * (0.5 + energy * 0.5);
  }

  // ─── Beat snap: tray vibration flash ───
  {
    float vibFlash = effectiveBeat * 0.06;
    col += vec3(0.4, 0.06, 0.02) * vibFlash;
  }

  // ─── Climax overexposure wash ───
  if (overexpose > 0.0) {
    // Whole scene washes toward blown-out white under red safelight
    vec3 blowoutColor = vec3(1.0, 0.5, 0.3);
    col = mix(col, blowoutColor, overexpose * 0.4);
    // Brightness surge
    col *= 1.0 + overexpose * 0.8;
  }

  // ─── Semantic modulations ───
  col = mix(col, col * vec3(1.1, 0.95, 0.85), tender * 0.15);
  col *= 1.0 + ambient * 0.08;

  // ─── Strong vignette: darkroom corners are pitch black ───
  {
    float vigScale = mix(0.55, 0.42, energy + vocalPresence * 0.2);
    float vigDot = dot(centeredP * vigScale, centeredP * vigScale);
    float vigVal = 1.0 - vigDot;
    vigVal = smoothstep(-0.05, 0.7, vigVal);
    vec3 vigTint = vec3(0.01, 0.003, 0.001);
    col = mix(vigTint, col, vigVal);
  }

  // ─── SDF iconography ───
  {
    vec3 iconC1 = paletteHueColor(uPalettePrimary, uPaletteSaturation, 1.0);
    vec3 iconC2 = paletteHueColor(uPaletteSecondary, uPaletteSaturation, 1.0);
    float noiseField = fbm3(vec3(centeredP * 2.0, timeVal * 0.1));
    col += iconEmergence(centeredP, uTime, energy, bass, iconC1, iconC2, noiseField, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(centeredP, uTime, energy, bass, iconC1, iconC2, noiseField, uSectionIndex);
  }

  // ─── Post-processing (shared chain) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, centeredP);

  gl_FragColor = vec4(col, 1.0);
  ${lfDepthAlpha}
}
`;
