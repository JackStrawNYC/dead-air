/**
 * Electric Arc Chamber — raymarched Tesla coil laboratory.
 * Multiple Tesla coils as SDF geometry with branching electric arcs jumping
 * between them. Jacob's ladder arcs climbing. Volumetric plasma glow.
 * Industrial/steampunk aesthetic with copper coils and glass insulators.
 *
 * Feedback: Yes (arc persistence trails via uPrevFrame)
 *
 * Audio reactivity:
 *   uBass             → coil resonance / arc thickness
 *   uEnergy           → arc count / brightness
 *   uDrumOnset        → massive arc discharge between coils
 *   uVocalPresence    → ambient plasma glow
 *   uHarmonicTension  → arc instability / branching
 *   uSectionType      → jam=continuous arcing, space=single dim coil,
 *                        chorus=full discharge, solo=focused arc
 *   uClimaxPhase      → all coils discharge simultaneously creating a plasma ball
 *   uMids             → branching factor
 *   uMelodicPitch     → arc color temperature
 *   uBeatStability    → arc straightness
 *   uTimbralBrightness → specular intensity on copper
 *   uSpaceScore       → ambient hum expansion
 *   uTempoDerivative  → arc flicker rate
 *   uDynamicRange     → contrast between dim/bright arcs
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const electricArcVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.2,
  caEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
  thermalShimmerEnabled: true,
  temporalBlendEnabled: true,
  lightLeakEnabled: false,
  dofEnabled: true,
});

const eaNormalGLSL = buildRaymarchNormal("eaMap($P)", { eps: 0.004, name: "eaNormal" });
const eaAOGLSL = buildRaymarchAO("eaMap($P)", { steps: 5, stepBase: 0.0, stepScale: 0.12, weightDecay: 0.6, finalMult: 2.0, name: "eaAmbientOcc" });

export const electricArcFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 90
#define MAX_DIST 30.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════
// Hash utilities
// ═══════════════════════════════════════════════════
float eaHash(float n) { return fract(sin(n) * 43758.5453); }
float eaHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ═══════════════════════════════════════════════════
// Smooth min / max for organic blends
// ═══════════════════════════════════════════════════
float eaSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════
// SDF Primitives
// ═══════════════════════════════════════════════════

// Capped cylinder along Y axis
float eaCylinder(vec3 p, float radius, float halfHeight) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(radius, halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Torus lying flat in XZ plane
float eaTorus(vec3 p, float majorR, float minorR) {
  vec2 q = vec2(length(p.xz) - majorR, p.y);
  return length(q) - minorR;
}

// Box SDF
float eaBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Sphere SDF
float eaSphere(vec3 p, float r) {
  return length(p) - r;
}

// ═══════════════════════════════════════════════════
// Tesla Coil SDF — full coil with toroid, secondary,
// primary winding, base insulator, and spark gap
// ═══════════════════════════════════════════════════
float eaCoil(vec3 p, float bassResonance, float coilScale) {
  p /= coilScale;
  float scene = MAX_DIST;

  // Base platform — heavy copper/steel slab
  float basePlate = eaBox(p - vec3(0.0, -2.2, 0.0), vec3(0.9, 0.12, 0.9));
  scene = min(scene, basePlate);

  // Glass insulator stack (3 ridged discs)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float iy = -2.0 + fi * 0.25;
    float insulR = 0.35 + sin(fi * 2.5) * 0.06;
    float insul = eaCylinder(p - vec3(0.0, iy, 0.0), insulR, 0.08);
    scene = min(scene, insul);
  }

  // Primary winding — wide flat coil at the base (thick copper tube)
  float primaryY = -1.3;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float coilR = 0.6 + fi * 0.12;
    float windY = primaryY + fi * 0.09;
    // Bass resonance wobble
    float wobble = sin(fi * 3.0 + uDynamicTime * 4.0 * bassResonance) * bassResonance * 0.015;
    float winding = eaTorus(p - vec3(wobble, windY, wobble * 0.7), coilR, 0.04);
    scene = min(scene, winding);
  }

  // Secondary coil — tall thin cylinder (many tight windings)
  float secondary = eaCylinder(p - vec3(0.0, 0.0, 0.0), 0.15, 1.5);
  scene = min(scene, secondary);

  // Helical winding texture on secondary — modulate distance with sine
  float windingDetail = sin(p.y * 40.0 + uDynamicTime * bassResonance * 2.0) * 0.01;
  secondary += windingDetail;
  scene = min(scene, secondary);

  // Top toroid — the discharge terminal (donut shape)
  float toroidY = 1.7;
  float toroidPulse = 1.0 + bassResonance * 0.08;
  float toroid = eaTorus(p - vec3(0.0, toroidY, 0.0), 0.45 * toroidPulse, 0.15);
  scene = min(scene, toroid);

  // Spark gap sphere on top of toroid
  float sparkBall = eaSphere(p - vec3(0.0, toroidY + 0.22, 0.0), 0.08);
  scene = min(scene, sparkBall);

  return scene * coilScale;
}

// ═══════════════════════════════════════════════════
// Jacob's Ladder — two parallel vertical rods with
// a climbing arc gap
// ═══════════════════════════════════════════════════
float eaJacobsLadder(vec3 p) {
  // Two diverging rods (wider at top)
  float spread = 0.15 + p.y * 0.06;
  float rodL = eaCylinder(vec3(p.x + spread, p.y, p.z), 0.03, 2.0);
  float rodR = eaCylinder(vec3(p.x - spread, p.y, p.z), 0.03, 2.0);

  // Cross-brace at base
  float brace = eaBox(p - vec3(0.0, -2.0, 0.0), vec3(0.3, 0.04, 0.04));

  float scene = min(rodL, rodR);
  scene = min(scene, brace);
  return scene;
}

// ═══════════════════════════════════════════════════
// Floor plane — industrial steel grate
// ═══════════════════════════════════════════════════
float eaFloor(vec3 p) {
  return p.y + 2.5;
}

// ═══════════════════════════════════════════════════
// Material IDs:
//   0 = copper/metal, 1 = glass insulator, 2 = floor,
//   3 = toroid (discharge terminal), 4 = jacob's ladder rod
// ═══════════════════════════════════════════════════
float eaMaterialID(vec3 p, float bassRes) {
  float floorD = eaFloor(p);
  if (floorD < SURF_DIST * 3.0) return 2.0;

  // Check toroid proximity for each coil
  float coilPositions[3];
  coilPositions[0] = -3.5;
  coilPositions[1] = 0.0;
  coilPositions[2] = 3.5;

  for (int i = 0; i < 3; i++) {
    float cx = coilPositions[i];
    vec3 cp = p - vec3(cx, 0.0, 0.0);
    float toroidD = eaTorus(cp - vec3(0.0, 1.7, 0.0), 0.45, 0.15);
    if (toroidD < SURF_DIST * 5.0) return 3.0;

    // Glass insulator check
    for (int j = 0; j < 3; j++) {
      float fy = -2.0 + float(j) * 0.25;
      float insD = eaCylinder(cp - vec3(0.0, fy, 0.0), 0.35, 0.08);
      if (insD < SURF_DIST * 5.0) return 1.0;
    }
  }

  // Jacob's ladder rods
  vec3 jlp = p - vec3(0.0, 0.0, -3.0);
  float jlD = eaJacobsLadder(jlp);
  if (jlD < SURF_DIST * 5.0) return 4.0;

  return 0.0; // copper/metal default
}

// ═══════════════════════════════════════════════════
// Complete scene map — all geometry
// ═══════════════════════════════════════════════════
float eaMap(vec3 p) {
  float scene = MAX_DIST;
  float bassRes = clamp(uBass, 0.0, 1.0);

  // Floor
  scene = min(scene, eaFloor(p));

  // Three Tesla coils in a triangle arrangement
  float coil1 = eaCoil(p - vec3(-3.5, 0.0, 0.0), bassRes, 1.0);
  float coil2 = eaCoil(p - vec3(3.5, 0.0, 0.0), bassRes, 1.0);
  float coil3 = eaCoil(p - vec3(0.0, 0.0, 3.0), bassRes, 0.85);
  scene = min(scene, min(coil1, min(coil2, coil3)));

  // Jacob's ladder in the background
  float jacobs = eaJacobsLadder(p - vec3(0.0, 0.0, -3.0));
  scene = min(scene, jacobs);

  // Back wall (industrial concrete)
  float backWall = -(p.z + 5.0);
  scene = min(scene, backWall);

  // Side walls
  float wallL = -(p.x + 6.0);
  float wallR = p.x - 6.0;
  scene = min(scene, min(wallL, wallR));

  // Ceiling
  float ceiling = -(p.y - 5.0);
  scene = min(scene, ceiling);

  return scene;
}

${eaNormalGLSL}
${eaAOGLSL}

// ═══════════════════════════════════════════════════
// Electric arc between two 3D points — noise-displaced
// lightning bolt evaluated at a world-space point
// ═══════════════════════════════════════════════════
float eaArc(vec3 p, vec3 arcStart, vec3 arcEnd, float thickness, float chaos, float arcTime) {
  vec3 arcDir = arcEnd - arcStart;
  float arcLen = length(arcDir);
  if (arcLen < 0.01) return MAX_DIST;
  vec3 arcNorm = arcDir / arcLen;

  // Project point onto arc axis
  vec3 toP = p - arcStart;
  float proj = clamp(dot(toP, arcNorm), 0.0, arcLen);
  vec3 closest = arcStart + arcNorm * proj;

  // Perpendicular distance
  float perpDist = length(p - closest);

  // Fractional position along arc for displacement
  float frac = proj / arcLen;

  // Multi-octave fractal displacement perpendicular to arc
  vec3 noisePos = vec3(frac * 12.0, arcTime * 3.0, eaHash(arcTime) * 100.0);
  float disp = ridged4(noisePos) * chaos * 0.12;
  disp += ridged4(noisePos * 2.3 + 7.0) * chaos * 0.04;

  // Third octave for fine crackling detail
  disp += snoise(noisePos * 5.0 + 13.0) * chaos * 0.015;

  float adjustedDist = abs(perpDist - disp);

  // Taper at endpoints
  float taper = smoothstep(0.0, 0.08, frac) * smoothstep(1.0, 0.92, frac);
  float effectiveThick = thickness * taper;

  return adjustedDist - effectiveThick;
}

// ═══════════════════════════════════════════════════
// Plasma glow field — volumetric emission around
// coil terminals and arc paths
// ═══════════════════════════════════════════════════
vec3 eaPlasma(vec3 pos, float energy, float vocalGlow, float climaxMix,
              float palHue1, float palHue2, float arcTime) {
  vec3 plasmaAccum = vec3(0.0);

  // Coil terminal positions (top of toroid)
  vec3 terminals[3];
  terminals[0] = vec3(-3.5, 1.92, 0.0);
  terminals[1] = vec3(3.5, 1.92, 0.0);
  terminals[2] = vec3(0.0, 1.62, 3.0); // smaller coil, lower toroid

  // Plasma corona around each terminal
  for (int i = 0; i < 3; i++) {
    vec3 toTerm = pos - terminals[i];
    float dist = length(toTerm);

    // Corona glow (inverse square falloff)
    float corona = 1.0 / (1.0 + dist * dist * 8.0);

    // Noise-modulated corona shape
    float coronaNoise = fbm3(vec3(normalize(toTerm) * 3.0 + arcTime * 0.5));
    corona *= 0.7 + coronaNoise * 0.6;

    // Base plasma color: electric blue-violet shifting to white at high energy
    float hue = palHue1 + float(i) * 0.08 + coronaNoise * 0.05;
    vec3 plasmaCol = hsv2rgb(vec3(hue, mix(0.8, 0.3, energy), 1.0));

    // Vocal presence adds warm ambient plasma between coils
    float vocalWarm = vocalGlow * 0.4 / (1.0 + dist * dist * 2.0);
    vec3 warmPlasma = hsv2rgb(vec3(palHue2 + 0.05, 0.6, 0.8));

    plasmaAccum += plasmaCol * corona * (0.15 + energy * 0.25);
    plasmaAccum += warmPlasma * vocalWarm;
  }

  // Climax: central plasma ball between all coils
  if (climaxMix > 0.01) {
    vec3 center = vec3(0.0, 1.0, 1.0);
    float ballDist = length(pos - center);
    float ballRadius = 0.5 + climaxMix * 1.5;
    float ball = smoothstep(ballRadius, 0.0, ballDist);

    // Turbulent plasma surface
    float turbulence = ridged4(vec3(normalize(pos - center) * 4.0 + arcTime * 2.0));
    ball *= 0.6 + turbulence * 0.8;

    vec3 ballColor = mix(
      hsv2rgb(vec3(palHue1, 0.7, 1.0)),
      vec3(1.0, 0.95, 0.9),
      climaxMix * 0.6
    );
    plasmaAccum += ballColor * ball * climaxMix * 2.0;
  }

  return plasmaAccum;
}

// ═══════════════════════════════════════════════════
// Jacob's ladder climbing arc
// ═══════════════════════════════════════════════════
float eaJacobArc(vec3 p, float arcTime, float chaos) {
  // Arc climbs from bottom to top, then resets
  float climbCycle = fract(arcTime * 0.15);
  float arcY = mix(-1.8, 1.8, climbCycle);

  // Spread widens as arc climbs (rods diverge)
  float spread = 0.15 + arcY * 0.06;

  vec3 arcStart = vec3(-spread, arcY, -3.0);
  vec3 arcEnd = vec3(spread, arcY, -3.0);

  return eaArc(p, arcStart, arcEnd, 0.005 + chaos * 0.003, chaos * 0.5, arcTime * 7.0);
}

// ═══════════════════════════════════════════════════
// Copper material color
// ═══════════════════════════════════════════════════
vec3 eaCopperColor(vec3 p, vec3 n, vec3 viewDir, float timbralSpec) {
  // Base copper: warm orange-brown
  vec3 copper = vec3(0.72, 0.45, 0.20);

  // Patina variation via noise
  float patina = fbm3(vec3(p * 5.0));
  copper = mix(copper, vec3(0.35, 0.55, 0.45), patina * 0.15);

  // Specular reflection — Blinn-Phong with timbral brightness modulation
  vec3 lightDir = normalize(vec3(0.3, 1.0, -0.5));
  vec3 halfDir = normalize(viewDir + lightDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 32.0);
  spec *= 0.4 + timbralSpec * 0.6;

  // Fresnel-like edge brightening
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

  copper += vec3(1.0, 0.85, 0.6) * spec * 0.5;
  copper += vec3(0.6, 0.5, 0.3) * fresnel * 0.2;

  return copper;
}

// ═══════════════════════════════════════════════════
// Glass insulator material
// ═══════════════════════════════════════════════════
vec3 eaGlassColor(vec3 p, vec3 n, vec3 viewDir, float plasmaGlow) {
  // Deep green/teal glass (classic insulator color)
  vec3 glass = vec3(0.1, 0.35, 0.3);

  // Internal refraction caustics
  float caustic = snoise(vec3(p * 10.0 + uDynamicTime * 0.1));
  glass += vec3(0.05, 0.15, 0.12) * caustic * 0.3;

  // Fresnel: glass gets brighter at grazing angles
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
  glass += vec3(0.3, 0.5, 0.4) * fresnel * 0.4;

  // Plasma illumination from nearby coil activity
  glass += vec3(0.2, 0.3, 0.8) * plasmaGlow * 0.3;

  return glass;
}

// ═══════════════════════════════════════════════════
// Steel floor material with grating pattern
// ═══════════════════════════════════════════════════
vec3 eaFloorColor(vec3 p) {
  // Diamond plate pattern
  vec2 grate = fract(p.xz * 3.0);
  float pattern = smoothstep(0.4, 0.45, abs(grate.x - 0.5) + abs(grate.y - 0.5));

  vec3 steel = mix(vec3(0.12, 0.12, 0.13), vec3(0.18, 0.18, 0.19), pattern);

  // Subtle oil stain variation
  float oil = fbm3(vec3(p.xz * 2.0, 0.0));
  steel = mix(steel, vec3(0.08, 0.06, 0.10), oil * 0.2);

  return steel;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  // ═══════════════════════════════════════════════════
  // Audio extraction + clamping
  // ═══════════════════════════════════════════════════
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float tempoD = clamp(uTempoDerivative, -1.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float beatConf = clamp(uBeatConfidence, 0.0, 1.0);

  // FFT bands
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.08;
  float chromaHueMod = uChromaHue * 0.12;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.08;

  // ═══════════════════════════════════════════════════
  // Section type modulation
  // (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space)
  // ═══════════════════════════════════════════════════
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Section-driven arc behavior
  // Jam: continuous multi-arc chaos
  // Space: single dim coil, minimal arcing
  // Chorus: full discharge, all coils active
  // Solo: focused bright single arc
  float arcCountMod = sJam * 4.0 - sSpace * 3.0 + sChorus * 3.0 + sSolo * 1.0;
  float chaosMod = sJam * 0.6 - sSpace * 0.4 + sChorus * 0.3 + sSolo * 0.2;
  float brightMod = -sSpace * 0.5 + sChorus * 0.4 + sSolo * 0.3 + climaxIntensity * 0.6;

  // Climax: all coils discharge → plasma ball
  float climaxMix = climaxIntensity;

  // ═══════════════════════════════════════════════════
  // Arc parameters (audio-driven)
  // ═══════════════════════════════════════════════════
  float arcThickness = 0.006 + bass * 0.012 + fftBass * 0.005 + stemDrums * 0.004;
  float chaos = mix(0.4, 2.0, 1.0 - stability) + chaosMod + tension * 0.5 + fftMid * 0.2;
  float arcFlickerRate = 1.0 + abs(tempoD) * 2.0; // tempo changes cause flicker
  float arcTime = slowTime * arcFlickerRate;

  int arcCount = max(1, int(2.0 + energy * 4.0 + drumOnset * 4.0 + arcCountMod + fftHigh * 2.0));
  arcCount = min(arcCount, 12);

  // Palette
  float palHue1 = uPalettePrimary + chromaHueMod + chordHue;
  float palHue2 = uPaletteSecondary + chromaHueMod;

  // ═══════════════════════════════════════════════════
  // Camera setup (3D camera uniforms)
  // ═══════════════════════════════════════════════════
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // ═══════════════════════════════════════════════════
  // SDF Raymarch
  // ═══════════════════════════════════════════════════
  float totalDist = 0.0;
  float marchDist = 0.0;
  bool marchHasHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    marchDist = eaMap(marchPos);

    if (marchDist < SURF_DIST) {
      marchHasHit = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += marchDist;
  }

  // ═══════════════════════════════════════════════════
  // Shading
  // ═══════════════════════════════════════════════════
  vec3 col = vec3(0.0);

  if (marchHasHit) {
    vec3 surfPos = marchPos;
    vec3 surfNorm = eaNormal(surfPos);
    vec3 viewDir = -rd;
    float matID = eaMaterialID(surfPos, bass);
    float ambOcc = eaAmbientOcc(surfPos, surfNorm);

    // Lighting: two colored point lights (coil plasma glow) + ambient
    vec3 light1Pos = vec3(-3.5, 2.5, 0.0);
    vec3 light2Pos = vec3(3.5, 2.5, 0.0);
    vec3 light3Pos = vec3(0.0, 2.2, 3.0);

    float light1Str = 0.6 + energy * 0.4;
    float light2Str = 0.5 + energy * 0.3;
    float light3Str = 0.4 + energy * 0.3;

    // Light colors: electric blue/violet tinted by palette
    vec3 light1Col = hsv2rgb(vec3(palHue1, 0.7, 1.0)) * light1Str;
    vec3 light2Col = hsv2rgb(vec3(palHue2, 0.6, 1.0)) * light2Str;
    vec3 light3Col = hsv2rgb(vec3(palHue1 + 0.15, 0.5, 0.9)) * light3Str;

    // Diffuse lighting from each light
    vec3 toL1 = normalize(light1Pos - surfPos);
    vec3 toL2 = normalize(light2Pos - surfPos);
    vec3 toL3 = normalize(light3Pos - surfPos);

    float diff1 = max(dot(surfNorm, toL1), 0.0) / (1.0 + length(light1Pos - surfPos) * 0.15);
    float diff2 = max(dot(surfNorm, toL2), 0.0) / (1.0 + length(light2Pos - surfPos) * 0.15);
    float diff3 = max(dot(surfNorm, toL3), 0.0) / (1.0 + length(light3Pos - surfPos) * 0.15);

    vec3 diffuse = light1Col * diff1 + light2Col * diff2 + light3Col * diff3;
    vec3 ambient = vec3(0.02, 0.015, 0.03) * (1.0 + spaceScore * 0.3);

    // Material-specific color
    vec3 matColor;
    if (matID < 0.5) {
      // Copper/metal
      matColor = eaCopperColor(surfPos, surfNorm, viewDir, timbralBright);
    } else if (matID < 1.5) {
      // Glass insulator
      float nearPlasma = 0.3 + energy * 0.4;
      matColor = eaGlassColor(surfPos, surfNorm, viewDir, nearPlasma);
    } else if (matID < 2.5) {
      // Floor
      matColor = eaFloorColor(surfPos);
    } else if (matID < 3.5) {
      // Toroid — bright reflective copper with plasma illumination
      matColor = eaCopperColor(surfPos, surfNorm, viewDir, timbralBright) * 1.3;
      matColor += hsv2rgb(vec3(palHue1, 0.5, 0.4)) * energy;
    } else {
      // Jacob's ladder rods — darker steel
      matColor = vec3(0.15, 0.14, 0.16);
      float rodSpec = pow(max(dot(surfNorm, normalize(viewDir + vec3(0.0, 1.0, 0.0))), 0.0), 16.0);
      matColor += vec3(0.4, 0.35, 0.5) * rodSpec * 0.3;
    }

    col = matColor * (diffuse + ambient) * ambOcc;

    // Drum onset flash illumination on surfaces
    if (drumOnset > 0.4) {
      float flashStr = drumOnset * 0.6 * smoothstep(0.3, 0.7, beatConf);
      col += matColor * vec3(0.5, 0.4, 0.8) * flashStr;
    }

    // Distance fog (industrial haze)
    float fogDist = length(surfPos - ro);
    float fogAmount = 1.0 - exp(-fogDist * 0.06);
    vec3 fogColor = vec3(0.02, 0.015, 0.04) + hsv2rgb(vec3(palHue1, 0.3, 0.04)) * energy;
    col = mix(col, fogColor, fogAmount);

  } else {
    // Sky / background — dark industrial void with subtle plasma fog
    vec3 bgFog = vec3(0.01, 0.008, 0.02);
    float bgNoise = fbm3(vec3(rd * 2.0 + slowTime * 0.03));
    bgFog += hsv2rgb(vec3(palHue1 + bgNoise * 0.1, 0.4, 0.03)) * energy;
    col = bgFog;
  }

  // ═══════════════════════════════════════════════════
  // Volumetric electric arcs between coil terminals
  // ═══════════════════════════════════════════════════
  {
    // Coil terminal positions
    vec3 terminals[3];
    terminals[0] = vec3(-3.5, 1.92, 0.0);
    terminals[1] = vec3(3.5, 1.92, 0.0);
    terminals[2] = vec3(0.0, 1.62, 3.0);

    // March along the view ray sampling arc proximity
    for (int step = 0; step < 32; step++) {
      float ft = float(step);
      float marchT = 0.5 + ft * 0.5;
      if (marchT > totalDist && marchHasHit) break;
      vec3 samplePos = ro + rd * marchT;

      // Test each arc pair
      for (int arcIdx = 0; arcIdx < 12; arcIdx++) {
        if (arcIdx >= arcCount) break;
        float fi = float(arcIdx);

        // Determine arc start/end from terminal pairs (cycling through combinations)
        int srcIdx = int(mod(fi, 3.0));
        int dstIdx = int(mod(fi + 1.0 + floor(fi / 3.0), 3.0));

        vec3 arcStart = terminals[srcIdx];
        vec3 arcEnd = terminals[dstIdx];

        // Per-arc time offset for variety
        float perArcTime = arcTime + fi * 5.7 + eaHash(fi * 13.37) * 20.0;

        // Space section: only first coil active, dim
        if (sSpace > 0.5 && srcIdx > 0) continue;

        float arcDist = eaArc(samplePos, arcStart, arcEnd, arcThickness, chaos, perArcTime);

        // Core brightness (hot white-blue center)
        float coreMask = 1.0 - smoothstep(0.0, 0.004, arcDist);
        // Glow halo
        float glowMask = 1.0 - smoothstep(0.0, 0.06 + bass * 0.04, arcDist);

        // Arc color: melodic pitch shifts blue→orange, palette tinted
        float arcHue = palHue1 + mix(0.6, 0.1, melodicPitch) + fi * 0.04;
        float arcSat = mix(0.5, 0.9, energy) * uPaletteSaturation;
        float arcBri = 0.9 + energy * 0.1 + brightMod;

        vec3 coreColor = mix(vec3(0.9, 0.92, 1.0), hsv2rgb(vec3(arcHue, arcSat * 0.3, 1.0)), 0.3);
        vec3 glowColor = hsv2rgb(vec3(arcHue, arcSat, arcBri * 0.6));

        float volumeWeight = 0.035; // per-step contribution
        col += coreColor * coreMask * volumeWeight * 3.0;
        col += glowColor * glowMask * volumeWeight * 0.8;
      }

      // Jacob's ladder climbing arc
      {
        float jacobDist = eaJacobArc(samplePos, arcTime, chaos);
        float jacobCore = 1.0 - smoothstep(0.0, 0.003, jacobDist);
        float jacobGlow = 1.0 - smoothstep(0.0, 0.04, jacobDist);
        vec3 jacobColor = hsv2rgb(vec3(palHue2 + 0.1, 0.7, 1.0));
        col += jacobColor * jacobCore * 0.03;
        col += jacobColor * vec3(0.8, 0.7, 1.0) * jacobGlow * 0.012;
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // Volumetric plasma glow pass
  // ═══════════════════════════════════════════════════
  {
    vec3 plasmaTotal = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float marchT = 1.0 + fi * 1.5;
      vec3 samplePos = ro + rd * marchT;
      plasmaTotal += eaPlasma(samplePos, energy, vocalPres, climaxMix,
                              palHue1, palHue2, arcTime);
    }
    col += plasmaTotal * 0.02;
  }

  // ═══════════════════════════════════════════════════
  // Drum onset: massive discharge flash
  // ═══════════════════════════════════════════════════
  if (drumOnset > 0.5) {
    float flashPow = drumOnset * smoothstep(0.3, 0.7, beatConf);
    vec3 flashCol = hsv2rgb(vec3(palHue1 + 0.05, 0.4, 1.0));
    col += flashCol * flashPow * 0.35;
  }

  // Feedback trail handled by shared temporalBlendEnabled in postprocess.

  // ═══════════════════════════════════════════════════
  // SDF icon emergence
  // ═══════════════════════════════════════════════════
  {
    vec2 screenP = (uv - 0.5) * aspect;
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(palHue1, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(palHue2 + 0.2, 0.7, 1.0));
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ═══════════════════════════════════════════════════
  // Timbral brightness → arc color temperature
  // ═══════════════════════════════════════════════════
  float arcTemp = mix(0.0, 0.3, timbralBright);
  col = mix(col, col * vec3(0.7, 0.85, 1.0), arcTemp);

  // ═══════════════════════════════════════════════════
  // Vignette — industrial tunnel effect
  // ═══════════════════════════════════════════════════
  {
    vec2 screenP = (uv - 0.5) * aspect;
    float vigScale = mix(0.28, 0.20, energy);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    col = mix(vec3(0.005, 0.003, 0.015), col, vignette);
  }

  // ═══════════════════════════════════════════════════
  // Post-processing
  // ═══════════════════════════════════════════════════
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, (vUv - 0.5) * aspect);

  gl_FragColor = vec4(col, 1.0);
}
`;
