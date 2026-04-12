/**
 * Plasma Field — raymarched plasma containment chamber (tokamak-inspired).
 * Magnetic field lines visible as glowing tube SDFs. Plasma blobs trapped
 * in magnetic bottles, swirling and colliding. Scientific/industrial aesthetic
 * with a tokamak ring geometry confining superheated plasma.
 *
 * Full raymarched 3D SDF scene with proper lighting:
 *   - Containment ring (toroidal metallic shell)
 *   - Magnetic field line tubes (glowing parametric curves)
 *   - Plasma blobs (animated metaball clusters inside the torus)
 *   - Proper emission, metallic specular, AO, fresnel
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → plasma density / blob size
 *   uEnergy            → containment field strength / plasma brightness
 *   uDrumOnset         → plasma instability burst (sparks + displacement)
 *   uVocalPresence     → magnetic field line glow intensity
 *   uHarmonicTension   → containment stability (stable=smooth, tense=plasma leaking)
 *   uSectionType       → jam=plasma turbulence, space=cold containment, chorus=hot plasma
 *   uClimaxPhase       → containment breach — plasma erupts outward
 *   uBeatSnap          → plasma pulse flash
 *   uSlowEnergy        → plasma drift speed
 *   uMelodicPitch      → field line oscillation frequency
 *   uBeatStability     → containment field coherence
 *   uDynamicRange      → plasma temperature contrast
 *   uTimbralBrightness → plasma core brightness
 *   uSpaceScore        → cold shutdown mode
 *   uHighs             → specular sharpness on containment ring
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const pf2NormalGLSL = buildRaymarchNormal(
  "pf2Map($P, majorR, minorR, bass, energy, drumOnset, tension, stability, vocalGlow, melodicFreq, flowTime, turbulence, breachAmount).x",
  { eps: 0.003, name: "pf2Normal" },
);
const pf2OccGLSL = buildRaymarchAO(
  "pf2Map($P, majorR, minorR, bass, energy, drumOnset, tension, stability, vocalGlow, melodicFreq, flowTime, turbulence, breachAmount).x",
  { steps: 5, stepBase: 0.02, stepScale: 0.08, weightDecay: 0.65, finalMult: 3.5, name: "pf2Occlusion" },
);
const pf2DepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

export const plasmaFieldVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.10,
  halationEnabled: true,
  caEnabled: true,
  dofEnabled: true,
  grainStrength: "light",
  eraGradingEnabled: true,
  lightLeakEnabled: true,
  thermalShimmerEnabled: true,
});

export const plasmaFieldFrag = /* glsl */ `
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

// ═══════════════════════════════════════════════════════════
// Plasma color ramp: deep blue → electric cyan → white-hot → pink-violet
// Scientific plasma emission spectrum
// ═══════════════════════════════════════════════════════════

vec3 pf2PlasmaColor(float temp, float hueShift) {
  float t = clamp(temp, 0.0, 1.0);
  // Cold plasma: deep blue/violet
  vec3 col = vec3(0.05, 0.02, 0.15) * smoothstep(0.0, 0.15, t);
  // Warm-up: electric blue
  col += vec3(0.0, 0.2, 0.8) * smoothstep(0.1, 0.35, t);
  // Hot: cyan-white
  col += vec3(0.2, 0.7, 0.9) * smoothstep(0.3, 0.6, t);
  // Very hot: white core
  col += vec3(0.8, 0.9, 1.0) * smoothstep(0.55, 0.8, t);
  // Extreme: pink-violet fringe (Cherenkov-like)
  col += vec3(0.6, 0.2, 0.5) * smoothstep(0.75, 1.0, t);

  // Palette hue rotation
  float angle = hueShift * TAU * 0.06;
  float cs = cos(angle);
  float sn = sin(angle);
  col.rg = vec2(cs * col.r - sn * col.g, sn * col.r + cs * col.g);
  return max(col, vec3(0.0));
}

// ═══════════════════════════════════════════════════════════
// Containment ring SDF — toroidal metallic shell
// The tokamak vessel that confines the plasma
// ═══════════════════════════════════════════════════════════

float pf2Ring(vec3 pos, float majorRadius, float minorRadius) {
  // Torus SDF: distance to torus centered at origin, lying in xz plane
  vec2 q = vec2(length(pos.xz) - majorRadius, pos.y);
  return length(q) - minorRadius;
}

// Containment ring with paneling detail and port geometry
float pf2Containment(vec3 pos, float majorR, float minorR, float tension, float stability) {
  float torus = pf2Ring(pos, majorR, minorR);

  // Panel seam lines: hexagonal tiling on the torus surface
  float theta = atan(pos.z, pos.x); // toroidal angle
  float phi = atan(pos.y, length(pos.xz) - majorR); // poloidal angle
  float seamTheta = abs(sin(theta * 8.0)) * 0.015;
  float seamPhi = abs(sin(phi * 12.0)) * 0.012;
  float seams = min(seamTheta, seamPhi);
  torus -= seams * 0.5; // indent at seams

  // Tension causes micro-fractures in containment
  float fractures = ridgedMultifractal(pos * 4.0 + tension * 0.5, 3, 2.2, 0.45);
  torus += fractures * tension * 0.02 * (1.0 - stability * 0.6);

  // Diagnostic port protrusions (4 evenly spaced)
  for (int i = 0; i < 4; i++) {
    float portAngle = float(i) * TAU / 4.0;
    vec3 portDir = vec3(cos(portAngle), 0.0, sin(portAngle));
    vec3 portCenter = portDir * majorR;
    float portDist = length(pos - portCenter) - minorR * 0.4;
    // Elongate the port outward
    vec3 localP = pos - portCenter;
    float radialDist = dot(localP, portDir);
    float portCylinder = length(localP - portDir * radialDist) - minorR * 0.25;
    portCylinder = max(portCylinder, -radialDist);
    portCylinder = max(portCylinder, radialDist - minorR * 0.8);
    torus = min(torus, portCylinder);
  }

  return torus;
}

// ═══════════════════════════════════════════════════════════
// Magnetic field line tubes — parametric curves as tube SDFs
// Poloidal + toroidal field lines visible as glowing conduits
// ═══════════════════════════════════════════════════════════

float pf2FieldLine(vec3 pos, float majorR, float flowTime, float vocalGlow,
                   float melodicFreq, float fieldStrength) {
  float minDist = 1e5;

  // 6 poloidal field lines wrapping around the torus
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    // Toroidal angle offset for each field line
    float thetaOffset = fi * TAU / 6.0;
    // Poloidal winding: the field line spirals around the torus cross-section
    float windingRatio = 3.0 + melodicFreq * 2.0; // safety factor q

    // Sample closest point on the helical field line
    // Use the toroidal angle of the query point as parameter
    float theta = atan(pos.z, pos.x);
    float phi = theta * windingRatio + thetaOffset + flowTime * 0.3;

    // Point on the field line
    float tubeR = majorR * 0.52; // field lines sit inside containment
    vec3 linePoint = vec3(
      (majorR + tubeR * 0.6 * cos(phi)) * cos(theta),
      tubeR * 0.6 * sin(phi),
      (majorR + tubeR * 0.6 * cos(phi)) * sin(theta)
    );

    float dist = length(pos - linePoint);

    // Tube radius: thinner when field is strong, fatter when weak
    float tubeThickness = mix(0.04, 0.08, 1.0 - fieldStrength) + vocalGlow * 0.02;

    // Pulsing glow makes tube radius oscillate
    tubeThickness += sin(phi * 4.0 + flowTime * 2.0) * 0.01 * fieldStrength;

    dist -= tubeThickness;
    minDist = min(minDist, dist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Plasma blobs — metaball-style plasma clumps trapped in torus
// ═══════════════════════════════════════════════════════════

float pf2Plasma(vec3 pos, float majorR, float flowTime, float bass,
                float drumOnset, float turbulence, float breachAmount) {
  float density = 0.0;

  // 5 plasma blobs orbiting inside the torus
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Each blob orbits at a different speed and poloidal position
    float orbitSpeed = 0.4 + fi * 0.15;
    float theta = flowTime * orbitSpeed + fi * TAU / 5.0;

    // Poloidal wobble
    float phi = sin(flowTime * 0.7 + fi * 2.3) * 0.8;

    // Blob center on the torus cross-section
    float blobR = majorR * 0.35 + sin(fi * 1.7 + flowTime * 0.3) * majorR * 0.1;
    vec3 blobCenter = vec3(
      (majorR + blobR * cos(phi)) * cos(theta),
      blobR * sin(phi),
      (majorR + blobR * cos(phi)) * sin(theta)
    );

    // Blob radius: bass makes them fatter, drum onset makes them burst
    float blobSize = 0.15 + bass * 0.12 + drumOnset * 0.08;
    blobSize *= 0.8 + fi * 0.08;

    // Turbulence displaces blob shape
    vec3 turbOffset = vec3(
      snoise(vec3(blobCenter * 0.5 + flowTime * 0.4)),
      snoise(vec3(blobCenter * 0.5 + flowTime * 0.4 + 50.0)),
      snoise(vec3(blobCenter * 0.5 + flowTime * 0.4 + 100.0))
    ) * turbulence * 0.15;

    vec3 displaced = pos - blobCenter - turbOffset;

    // Breach: plasma expands outward radially
    if (breachAmount > 0.01) {
      vec3 radialDir = normalize(vec3(blobCenter.x, 0.0, blobCenter.z));
      displaced -= radialDir * breachAmount * 0.5 * (0.5 + fi * 0.2);
    }

    // Metaball contribution (smooth falloff)
    float dist = length(displaced);
    density += blobSize * blobSize / (dist * dist + 0.001);
  }

  // Threshold: convert density field to SDF-like distance
  float isoValue = 0.8 + bass * 0.2;
  return (isoValue - density) * 0.3;
}

// ═══════════════════════════════════════════════════════════
// Breach tendrils — plasma arcs escaping containment during climax
// ═══════════════════════════════════════════════════════════

float pf2BreachTendril(vec3 pos, float majorR, float flowTime, float breachAmount) {
  if (breachAmount < 0.05) return 1e5;

  float minDist = 1e5;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float angle = fi * TAU / 4.0 + flowTime * 0.2;

    // Tendril base on the torus surface
    vec3 basePoint = vec3(cos(angle), 0.0, sin(angle)) * majorR;
    vec3 outDir = normalize(vec3(cos(angle), sin(fi * 2.0 + flowTime * 0.5) * 0.5, sin(angle)));

    // Parametric tendril: curved arc escaping outward
    float tendrilLen = breachAmount * 3.0;
    // Project pos onto tendril axis
    vec3 toPos = pos - basePoint;
    float param = clamp(dot(toPos, outDir) / tendrilLen, 0.0, 1.0);
    vec3 tendrilPoint = basePoint + outDir * param * tendrilLen;

    // Curl the tendril with noise
    vec3 curlOffset = vec3(
      snoise(vec3(param * 3.0 + fi, flowTime * 0.8, 0.0)),
      snoise(vec3(param * 3.0 + fi, flowTime * 0.8, 50.0)),
      snoise(vec3(param * 3.0 + fi, flowTime * 0.8, 100.0))
    ) * 0.3 * param; // more curl at tip
    tendrilPoint += curlOffset;

    float dist = length(pos - tendrilPoint);
    // Tendril thins toward tip
    float thickness = mix(0.12, 0.02, param) * breachAmount;
    dist -= thickness;

    minDist = min(minDist, dist);
  }

  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — returns vec2(distance, materialId)
//   matId: 0=containment ring, 1=field lines, 2=plasma blobs, 3=breach tendrils
// ═══════════════════════════════════════════════════════════

vec2 pf2Map(vec3 pos, float majorR, float minorR, float bass, float energy,
            float drumOnset, float tension, float stability, float vocalGlow,
            float melodicFreq, float flowTime, float turbulence, float breachAmount) {

  // Containment ring (the tokamak vessel)
  float containment = pf2Containment(pos, majorR, minorR, tension, stability);
  vec2 result = vec2(containment, 0.0);

  // Magnetic field line tubes
  float fieldLines = pf2FieldLine(pos, majorR, flowTime, vocalGlow, melodicFreq, energy);
  if (fieldLines < result.x) {
    result = vec2(fieldLines, 1.0);
  }

  // Plasma blobs
  float plasma = pf2Plasma(pos, majorR, flowTime, bass, drumOnset, turbulence, breachAmount);
  if (plasma < result.x) {
    result = vec2(plasma, 2.0);
  }

  // Breach tendrils (only during climax)
  float tendrils = pf2BreachTendril(pos, majorR, flowTime, breachAmount);
  if (tendrils < result.x) {
    result = vec2(tendrils, 3.0);
  }

  return result;
}

${pf2NormalGLSL}
${pf2OccGLSL}

// ═══════════════════════════════════════════════════════════
// Fresnel approximation (Schlick)
// ═══════════════════════════════════════════════════════════

float pf2Fresnel(vec3 viewDir, vec3 norm, float f0) {
  float cosTheta = max(0.0, dot(viewDir, norm));
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// ═══════════════════════════════════════════════════════════
// Volumetric plasma glow — accumulates emission along the ray
// inside the containment region for hot plasma volume rendering
// ═══════════════════════════════════════════════════════════

vec3 pf2PlasmaVolume(vec3 rayOrigin, vec3 rayDir, float majorR, float tStart, float tEnd,
                     float bass, float energy, float flowTime, float hueShift,
                     float plasmaTemp, float turbulence) {
  vec3 accum = vec3(0.0);
  float alpha = 0.0;
  int volSteps = 16;
  float stepLen = (tEnd - tStart) / float(volSteps);

  for (int i = 0; i < 16; i++) {
    if (alpha > 0.92) break;
    float marchT = tStart + (float(i) + 0.5) * stepLen;
    vec3 samplePos = rayOrigin + rayDir * marchT;

    // Distance from torus centerline
    float distFromCenter = length(samplePos.xz);
    float toroidalDist = length(vec2(distFromCenter - majorR, samplePos.y));
    float insideTorus = smoothstep(majorR * 0.55, majorR * 0.2, toroidalDist);

    if (insideTorus < 0.01) continue;

    // Plasma density from turbulent noise
    vec3 noiseP = samplePos * 1.2;
    noiseP += vec3(sin(flowTime * 0.3), cos(flowTime * 0.2), sin(flowTime * 0.4)) * 0.5;
    float density = fbm3(noiseP) * 0.5 + 0.5;
    density *= insideTorus;
    density *= (0.2 + bass * 0.4 + energy * 0.4);

    // Turbulence adds hot/cold patches
    float hotSpot = snoise(vec3(samplePos * 0.8 + flowTime * 0.5));
    hotSpot = hotSpot * 0.5 + 0.5;
    float localTemp = plasmaTemp * (0.6 + hotSpot * 0.4 + turbulence * 0.3);

    if (density > 0.02) {
      vec3 plasmaCol = pf2PlasmaColor(localTemp, hueShift);
      float sampleAlpha = density * stepLen * 1.5;
      accum += plasmaCol * sampleAlpha * (1.0 - alpha) * (1.0 + energy);
      alpha += sampleAlpha * (1.0 - alpha);
    }
  }

  return accum;
}

// ═══════════════════════════════════════════════════════════
// MAIN — single void main()
// ═══════════════════════════════════════════════════════════

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO CLAMPING ===
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.04;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.10;

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section-driven modifiers:
  // jam=plasma turbulence cranked up, space=cold containment, chorus=hot plasma, solo=dramatic field lines
  float turbulenceMod = mix(1.0, 2.2, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.3, sChorus);
  float plasmaTempMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.6, sChorus) * mix(1.0, 1.3, sSolo);
  float fieldGlowMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.4, sSolo);
  float containmentMod = mix(1.0, 0.7, sJam) * mix(1.0, 1.3, sSpace) * mix(1.0, 0.9, sChorus);

  // === CLIMAX: CONTAINMENT BREACH ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  // Breach amount: plasma escapes containment during climax
  float breachAmount = climaxBoost * 0.8 + tension * climaxBoost * 0.4;
  breachAmount = clamp(breachAmount, 0.0, 1.5);

  // === DERIVED PARAMETERS ===
  float majorR = 2.5; // torus major radius
  float minorR = 0.6 + bass * 0.05; // torus tube radius (breathes with bass)
  float stability = beatStability * containmentMod * (1.0 - tension * 0.4);
  float turbulence = clamp(turbulenceMod * (0.3 + drumOnset * 0.4 + tension * 0.3), 0.0, 1.5);
  float plasmaTemp = clamp(plasmaTempMod * (0.3 + energy * 0.4 + bass * 0.2 + timbralBright * 0.1 + dynRange * 0.1), 0.0, 1.2);
  float vocalGlow = vocalPresence * fieldGlowMod;
  float melodicFreq = melodicPitch;
  float flowTime = uDynamicTime * (0.2 + slowEnergy * 0.15);

  // === PALETTE ===
  float hue1 = uPalettePrimary + chordHue + chromaHueMod;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float hueShift = uPalettePrimary + chromaHueMod;

  // === CAMERA ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Subtle camera shake from plasma instability
  float shakeAmp = drumOnset * 0.3 + tension * 0.15 + breachAmount * 0.2;
  shakeAmp *= mix(1.0, 0.1, sSpace);
  ro.x += sin(uDynamicTime * 11.0) * shakeAmp * 0.012;
  ro.y += cos(uDynamicTime * 9.0 + 1.7) * shakeAmp * 0.01;

  // === RAYMARCH ===
  float totalDist = 0.0;
  float matId = -1.0;
  vec3 marchPos = ro;
  bool marchFound = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    vec2 mapResult = pf2Map(marchPos, majorR, minorR, bass, energy, drumOnset,
                            tension, stability, vocalGlow, melodicFreq, flowTime,
                            turbulence, breachAmount);
    float dist = mapResult.x;
    matId = mapResult.y;

    if (abs(dist) < SURF_DIST) {
      marchFound = true;
      break;
    }
    if (totalDist > MAX_DIST) break;
    totalDist += dist * 0.7; // conservative stepping
  }

  // === LIGHTING SETUP ===
  // Primary: plasma core glow (warm/cool depending on temperature)
  vec3 plasmaLightDir = normalize(vec3(0.3, 0.5, -0.2));
  // Secondary: ambient lab lighting (cool fluorescent)
  vec3 labAmbientDir = normalize(vec3(-0.2, 1.0, 0.1));
  // Point light: plasma core center
  vec3 coreLightPos = vec3(0.0, 0.0, 0.0);

  vec3 viewDir = normalize(ro - marchPos);
  vec3 col = vec3(0.0);

  if (marchFound) {
    vec3 norm = pf2Normal(marchPos);

    float occVal = pf2Occlusion(marchPos, norm);

    // Distance from ray origin to surface for volumetric plasma pass
    float surfaceDist = totalDist;

    if (matId < 0.5) {
      // ──── CONTAINMENT RING MATERIAL ────
      // Industrial metallic: brushed steel / tungsten alloy
      float theta = atan(marchPos.z, marchPos.x);
      float phi = atan(marchPos.y, length(marchPos.xz) - majorR);

      // Brushed metal texture (directional noise along toroidal direction)
      float brushNoise = snoise(vec3(theta * 8.0, phi * 20.0, 0.0)) * 0.5 + 0.5;
      float microDetail = fbm3(marchPos * 12.0) * 0.5 + 0.5;

      // Base metal color: cool steel gray with palette tint
      vec3 metalBase = mix(vec3(0.25, 0.27, 0.30), vec3(0.35, 0.33, 0.30), brushNoise * 0.3);
      vec3 paletteTint = paletteHueColor(hue1, 0.7, 0.85);
      metalBase = mix(metalBase, paletteTint * 0.2, 0.08);

      // Diffuse lighting
      float diffPlasma = max(0.0, dot(norm, plasmaLightDir)) * 0.3;
      float diffAmbient = max(0.0, dot(norm, labAmbientDir)) * 0.12;

      // Core light illumination on ring interior
      vec3 toCoreDir = normalize(coreLightPos - marchPos);
      float coreDiff = max(0.0, dot(norm, toCoreDir))
                       / (1.0 + 0.08 * length(coreLightPos - marchPos));

      col = metalBase * (0.06 + diffPlasma * plasmaTemp + diffAmbient) * occVal;

      // Plasma illumination on containment interior (warm glow from confined plasma)
      vec3 plasmaIllum = pf2PlasmaColor(plasmaTemp * 0.5, hueShift);
      col += plasmaIllum * coreDiff * 0.4 * energy * occVal;

      // Specular: metallic reflections
      vec3 halfVec = normalize(plasmaLightDir + viewDir);
      float specPower = 48.0 + highs * 80.0;
      float specVal = pow(max(0.0, dot(norm, halfVec)), specPower);
      col += vec3(0.6, 0.65, 0.7) * specVal * 0.25 * (0.5 + energy * 0.5);

      // Panel seam darkening
      float seamDark = abs(sin(theta * 8.0)) * abs(sin(phi * 12.0));
      seamDark = smoothstep(0.95, 1.0, seamDark);
      col *= 1.0 - seamDark * 0.3;

      // Fresnel: metallic rim lighting from plasma
      float fresnelVal = pf2Fresnel(viewDir, norm, 0.06);
      col += pf2PlasmaColor(plasmaTemp * 0.3, hueShift) * fresnelVal * 0.12 * energy;

      // Tension: containment stress — warning glow at seams
      if (tension > 0.3) {
        float stressGlow = smoothstep(0.3, 0.8, tension);
        float seamHighlight = smoothstep(0.85, 0.95, abs(sin(theta * 8.0)))
                            + smoothstep(0.85, 0.95, abs(sin(phi * 12.0)));
        col += vec3(1.0, 0.3, 0.1) * seamHighlight * stressGlow * 0.15;
      }

      // Breach: containment glowing red-hot
      col += vec3(1.0, 0.2, 0.05) * breachAmount * 0.2 * (0.5 + brushNoise * 0.5);

    } else if (matId < 1.5) {
      // ──── MAGNETIC FIELD LINE MATERIAL ────
      // Emissive glowing conduits — field lines are self-luminous
      float theta = atan(marchPos.z, marchPos.x);
      float phi = atan(marchPos.y, length(marchPos.xz) - majorR);

      // Field line color: cyan-blue glow modulated by palette
      vec3 fieldBaseColor = pf2PlasmaColor(0.4 + vocalGlow * 0.2, hueShift);
      vec3 palColor = paletteHueColor(hue2, 0.85, 0.95);
      vec3 fieldColor = mix(fieldBaseColor, palColor, 0.2);

      // Emission intensity: vocal presence drives glow
      float emission = (0.4 + vocalGlow * 0.6 + energy * 0.3) * fieldGlowMod;

      // Pulsing along the field line
      float pulse = sin(theta * 6.0 - flowTime * 3.0) * 0.5 + 0.5;
      emission *= 0.7 + pulse * 0.3;

      // Beat snap brightens field lines
      emission += beatSnap * 0.3;

      col = fieldColor * emission;

      // Field lines dim when stability drops
      col *= 0.5 + stability * 0.5;

      // Fresnel glow on tube edges
      float fresnelField = pf2Fresnel(viewDir, norm, 0.02);
      col += fieldColor * fresnelField * 0.3;

    } else if (matId < 2.5) {
      // ──── PLASMA BLOB MATERIAL ────
      // Superheated plasma: intense emissive, no diffuse needed
      float blobNoise = fbm3(marchPos * 2.0 + flowTime * 0.8) * 0.5 + 0.5;
      float coreGlow = fbm6(vec3(marchPos * 1.5 + flowTime * 0.5)) * 0.5 + 0.5;

      // Temperature varies across the blob
      float localTemp = plasmaTemp * (0.5 + blobNoise * 0.5 + coreGlow * 0.3);
      localTemp = clamp(localTemp, 0.0, 1.0);

      // Emissive plasma color
      vec3 plasmaCol = pf2PlasmaColor(localTemp, hueShift);

      // Emission power: very bright at core
      float emission = (1.0 + energy * 1.5 + bass * 0.8 + timbralBright * 0.4)
                       * plasmaTempMod;

      col = plasmaCol * emission;

      // Plasma instability: drum onset causes bright flashes
      col += pf2PlasmaColor(0.9, hueShift) * drumOnset * 0.5;

      // Beat snap pulse
      col *= 1.0 + beatSnap * 0.3;

      // Dynamic range adds contrast between hot/cold zones
      col *= 0.7 + dynRange * 0.6 * blobNoise;

    } else {
      // ──── BREACH TENDRIL MATERIAL ────
      // Escaped plasma: bright, chaotic, rapidly cooling
      float tendrilNoise = fbm3(marchPos * 3.0 + flowTime * 1.5) * 0.5 + 0.5;
      float cooling = smoothstep(majorR * 0.5, majorR * 1.5, length(marchPos.xz));

      // Temperature decreases with distance from containment
      float tendrilTemp = clamp(plasmaTemp * (1.0 - cooling * 0.6), 0.0, 1.0);

      vec3 tendrilCol = pf2PlasmaColor(tendrilTemp, hueShift);
      float emission = (1.5 + climaxBoost * 1.0) * (1.0 - cooling * 0.5);
      col = tendrilCol * emission;

      // Chaotic flickering at tendril tips
      float flicker = snoise(vec3(marchPos * 5.0 + flowTime * 3.0));
      col *= 0.7 + abs(flicker) * 0.6;
    }

  } else {
    // === BACKGROUND: dark lab interior with subtle plasma ambient glow ===
    // Volumetric plasma glow through the torus interior
    vec3 volPlasma = pf2PlasmaVolume(ro, rd, majorR, 0.0, MAX_DIST * 0.5,
                                     bass, energy, flowTime, hueShift,
                                     plasmaTemp, turbulence);
    col = volPlasma;

    // Distant lab walls: very dark with subtle palette-tinted ambient
    vec3 labWall = vec3(0.01, 0.012, 0.018);
    vec3 labTint = paletteHueColor(hue1, 0.7, 0.85);
    labWall += labTint * 0.005;
    col += labWall;
  }

  // === VOLUMETRIC PLASMA OVERLAY ===
  // Add plasma volume glow on top of solid surfaces for depth
  if (marchFound && (matId < 0.5 || matId > 1.5)) {
    // Volume pass between camera and surface
    float volEnd = min(totalDist, MAX_DIST * 0.3);
    vec3 volGlow = pf2PlasmaVolume(ro, rd, majorR, 0.0, volEnd,
                                   bass, energy, flowTime, hueShift,
                                   plasmaTemp * 0.6, turbulence);
    col += volGlow * 0.4;
  }

  // === CONTAINMENT FIELD SHIMMER ===
  // Subtle energy barrier visible as a faint shell around the torus
  {
    float distFromTorus = abs(pf2Ring(ro + rd * totalDist, majorR, minorR + 0.1));
    float shellGlow = smoothstep(0.2, 0.0, distFromTorus) * energy * 0.15;
    vec3 shieldColor = mix(vec3(0.1, 0.3, 0.8), vec3(0.8, 0.2, 0.1), tension);
    col += shieldColor * shellGlow * (0.5 + stability * 0.5);
  }

  // === BEAT SNAP FLASH ===
  col *= 1.0 + beatSnap * 0.15 * (1.0 + climaxBoost * 0.3);

  // === SPACE SCORE: cold shutdown ===
  if (spaceScore > 0.3) {
    float coldAmount = smoothstep(0.3, 0.8, spaceScore);
    // Desaturate and cool the image
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 coldCol = mix(col, vec3(luma * 0.8, luma * 0.85, luma * 1.0), coldAmount * 0.4);
    col = coldCol;
  }

  // === DEAD ICONOGRAPHY ===
  {
    float iconNoise = fbm3(vec3(screenP * 2.0, uTime * 0.1));
    vec3 c1 = pf2PlasmaColor(0.5, hueShift);
    vec3 c2 = pf2PlasmaColor(0.3, hueShift);
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, iconNoise, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, iconNoise, uSectionIndex);
  }

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${pf2DepthAlpha}
}
`;
