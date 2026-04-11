/**
 * Canyon — raymarched slot canyon.
 * Narrow canyon with layered sandstone walls (horizontal sediment color bands),
 * light shaft from above hitting canyon floor, water puddle with sky reflection,
 * tumbleweeds. Ancient, timeless, sacred.
 *
 * Audio reactivity:
 *   uBass             → wall vibration, deep resonance glow
 *   uEnergy           → beam intensity, gap width (narrow→wide)
 *   uDrumOnset        → beam flicker, tumbleweed launch
 *   uVocalPresence    → warmth in beam color
 *   uHarmonicTension  → wall crack intensity
 *   uBeatSnap         → dust mote pulse
 *   uSectionType      → jam=walls pulse with rhythm, space=narrow dark, solo=spotlight beam
 *   uClimaxPhase      → canyon opens wide, full illumination
 *   uSlowEnergy       → ambient wall warmth
 *   uHighs            → dust mote density
 *   uOnsetSnap        → secondary beam flicker
 *   uMelodicPitch     → beam angle shift
 *   uChromaHue        → sandstone hue cycling
 *   uPalettePrimary   → wall base color
 *   uPaletteSecondary → beam accent color
 *   uSpectralFlux     → wall texture complexity
 *   uDynamicRange     → shadow depth contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const canyonVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const canNormalGLSL = buildRaymarchNormal("canMap($P, gapWidth, timeVal).x", { eps: 0.002, name: "canNormal" });
const canAOGLSL = buildRaymarchAO("canMap($P, gapWidth, timeVal).x", { steps: 5, stepBase: 0.01, stepScale: 0.05, weightDecay: 0.65, finalMult: 3.0, name: "canAO" });

export const canyonFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  dofEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 25.0
#define SURF_DIST 0.002

// ============================================================
// Prefixed utilities (can = canyon)
// ============================================================
mat2 canRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float canHash(float n) { return fract(sin(n) * 43758.5453123); }
float canHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ============================================================
// SDF primitives
// ============================================================
float canSDSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float canSDBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float canSDCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float canSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Canyon wall profile: sinuous narrow passage
// ============================================================
float canWallProfile(vec3 pos, float gapWidth, float timeVal) {
  // Canyon runs along Z-axis
  // Wall surfaces with noise-modulated curves
  float wallNoise1 = snoise(vec3(0.0, pos.y * 0.5, pos.z * 0.3 + 1.0)) * 0.3;
  float wallNoise2 = snoise(vec3(5.0, pos.y * 0.7, pos.z * 0.4)) * 0.2;
  float wallNoise3 = snoise(vec3(10.0, pos.y * 1.5, pos.z * 0.8)) * 0.08;

  // Distance from each wall plane (positive = inside canyon air)
  float leftDist  = pos.x + gapWidth + wallNoise1 + wallNoise3; // distance from x=-gap
  float rightDist = -pos.x + gapWidth + wallNoise2 + wallNoise3; // distance from x=+gap

  // Slot canyon: narrows higher up
  float narrowFactor = smoothstep(0.0, 8.0, pos.y) * 0.4;
  leftDist  -= narrowFactor;
  rightDist -= narrowFactor;

  // Standard SDF convention: positive in free space (canyon air), negative in
  // rock. Previously this returned -min(...) which flipped the sign and made
  // every ray instantly "hit" at the camera origin, producing a flat frame.
  return min(leftDist, rightDist);
}

// ============================================================
// Sandstone texture layers
// ============================================================
float canSandstoneLayer(vec3 pos, float detail) {
  float strata = 0.0;
  strata += snoise(vec3(pos.x * 0.3, pos.y * 6.0, pos.z * 0.2)) * 0.35;
  strata += snoise(vec3(pos.x * 0.8, pos.y * 14.0, pos.z * 0.5 + 5.0)) * 0.2;
  strata += snoise(vec3(pos.x * 1.5, pos.y * 28.0, pos.z * 1.0 + 10.0)) * 0.1 * detail;
  // Erosion pockets
  float erosion = snoise(vec3(pos.x * 2.0, pos.y * 3.0, pos.z * 2.0 + 15.0));
  erosion = smoothstep(0.35, 0.6, erosion) * 0.15;
  return strata + erosion;
}

// ============================================================
// Tumbleweed SDF
// ============================================================
float canTumbleweed(vec3 pos, float radius) {
  float sphere = canSDSphere(pos, radius);
  // Spiky noise displacement for twig texture
  float spikes = snoise(pos * 12.0) * 0.02 + snoise(pos * 24.0) * 0.01;
  return sphere + spikes;
}

// ============================================================
// Full scene: floor + walls + tumbleweeds + puddle
// matID: 0=floor, 1=wall, 2=tumbleweed, 3=puddle
// ============================================================
vec2 canMap(vec3 pos, float gapWidth, float timeVal) {
  // Floor
  float floor = pos.y;
  vec2 result = vec2(floor, 0.0);

  // Puddle on floor
  float puddleCenter = 5.0;
  float puddleDist = length(pos.xz - vec2(0.0, puddleCenter));
  float puddleRadius = 0.8;
  if (puddleDist < puddleRadius && pos.y < 0.01) {
    result = vec2(pos.y - 0.005, 3.0);
  }

  // Canyon walls
  float walls = canWallProfile(pos, gapWidth, timeVal);
  if (walls < result.x) {
    result = vec2(walls, 1.0);
  }

  // Ceiling: cap the canyon
  float ceiling = -(pos.y - 10.0);
  float ceilNoise = snoise(vec3(pos.xz * 0.5, 20.0)) * 0.5;
  ceiling += ceilNoise;
  if (ceiling < result.x) {
    result = vec2(ceiling, 1.0);
  }

  // Tumbleweeds
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float twSeed = canHash(fi * 7.3 + 1.0);
    float twZ = 2.0 + fi * 3.0 + sin(timeVal * 0.3 + fi * 2.0) * 0.5;
    float twX = (twSeed - 0.5) * gapWidth * 0.8;
    float twRadius = 0.08 + twSeed * 0.06;
    vec3 twPos = vec3(twX, twRadius, twZ);
    float tw = canTumbleweed(pos - twPos, twRadius);
    if (tw < result.x) {
      result = vec2(tw, 2.0);
    }
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${canNormalGLSL}
${canAOGLSL}

// ============================================================
// God ray: volumetric light shaft through the slot
// ============================================================
vec3 canGodRay(vec3 ro, vec3 rd, float marchDist, float gapWidth,
               float timeVal, float energy, float beamIntensity,
               vec3 beamColor, float melPitch) {
  vec3 light = vec3(0.0);
  float stepSize = 0.3;
  vec3 lightDir = normalize(vec3(sin(melPitch * 0.5 - 0.25) * 0.3, 1.0, 0.1));

  for (int i = 0; i < 32; i++) {
    float tRay = float(i) * stepSize + 0.5;
    if (tRay > marchDist) break;
    vec3 pos = ro + rd * tRay;

    // Ray is lit if there's a clear path straight up to the sky
    float gapDist = abs(pos.x);
    float inBeam = smoothstep(gapWidth * 0.8, gapWidth * 0.2, gapDist);

    // Height attenuation: beam stronger at top
    float heightFade = smoothstep(0.0, 6.0, pos.y);

    // Volumetric scattering noise
    float scatterNoise = fbm3(vec3(pos * 0.5 + vec3(0.0, -timeVal * 0.05, 0.0)));
    float scatter = 0.3 + 0.7 * (scatterNoise * 0.5 + 0.5);

    // Dust density variation
    float dustDensity = fbm3(vec3(pos * 1.5 + vec3(timeVal * 0.02, -timeVal * 0.03, 0.0)));
    dustDensity = 0.5 + 0.5 * dustDensity;

    float density = inBeam * heightFade * scatter * dustDensity * beamIntensity * 0.05;
    light += beamColor * density * stepSize;
  }
  return light;
}

// ============================================================
// Dust motes in beams
// ============================================================
vec3 canDustMotes(vec3 ro, vec3 rd, float marchDist, float timeVal,
                  float density, float gapWidth) {
  vec3 motes = vec3(0.0);
  int moteCount = int(mix(8.0, 24.0, density));
  for (int i = 0; i < 24; i++) {
    if (i >= moteCount) break;
    float fi = float(i);
    vec3 seed = vec3(canHash(fi * 3.1), canHash(fi * 7.7), canHash(fi * 13.3));

    vec3 motePos = vec3(
      (seed.x - 0.5) * gapWidth * 1.5,
      seed.y * 8.0 + sin(timeVal * 0.3 + fi) * 0.5,
      seed.z * 10.0 + 1.0
    );

    // Slow drift
    motePos.x += sin(timeVal * 0.15 + fi * 2.0) * 0.1;
    motePos.y += cos(timeVal * 0.1 + fi * 1.5) * 0.2;

    vec3 toMote = motePos - ro;
    float proj = dot(toMote, rd);
    if (proj < 0.0 || proj > marchDist) continue;
    vec3 closest = ro + rd * proj;
    float dist = length(closest - motePos);

    float moteSize = 0.008 + seed.x * 0.005;
    float glow = smoothstep(moteSize * 5.0, 0.0, dist);
    float twinkle = 0.5 + 0.5 * sin(timeVal * 3.0 + fi * 5.0);

    motes += vec3(0.95, 0.85, 0.6) * glow * twinkle * 0.15;
  }
  return motes;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float timeVal = uDynamicTime * 0.1;

  // Gap width: energy-driven
  float gapWidth = mix(0.3, 1.2, energy);
  gapWidth *= mix(1.0, 0.5, sSpace);
  gapWidth *= mix(1.0, 1.4, sChorus);
  gapWidth += climaxBoost * 0.3;
  // Jam: walls pulse with beat
  gapWidth += sJam * beatPulse(uMusicalTime) * 0.1;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.06;
  float hue2 = uPaletteSecondary + chromaH * 0.04;
  float palSat = mix(0.4, 0.7, energy) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, palSat, mix(0.7, 0.9, energy)));
  vec3 palCol2 = hsv2rgb(vec3(hue2, palSat * 0.8, mix(0.6, 0.85, energy)));

  // Camera: walking through canyon
  float camSpeed = 0.15 + energy * 0.05;
  float camZ = uTime * camSpeed;
  vec3 camOrigin = vec3(sin(uTime * 0.04) * gapWidth * 0.2, 1.5, camZ);
  vec3 camTarget = camOrigin + vec3(0.0, 0.3 + sin(uTime * 0.03) * 0.5, 3.0);
  vec3 camForward = normalize(camTarget - camOrigin);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRt = normalize(cross(camForward, camWorldUp));
  vec3 camUpV = cross(camRt, camForward);

  vec3 rd = normalize(screenPos.x * camRt + screenPos.y * camUpV + 1.2 * camForward);

  // ─── Raymarching ───
  float marchDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = camOrigin + rd * marchDist;
    vec2 dist = canMap(pos, gapWidth, timeVal);
    if (dist.x < SURF_DIST) {
      marchResult = vec2(marchDist, dist.y);
      break;
    }
    marchDist += dist.x * 0.6;
    if (marchDist > MAX_DIST) break;
  }

  vec3 col;

  if (marchResult.y < 0.0) {
    // Sky through canyon slot — brightened from prior dim values so the slot
    // actually pops against the dark walls. Palette-tinted + warm horizon glow.
    float skyGrad = rd.y * 0.5 + 0.5;
    vec3 skyHigh = mix(vec3(0.45, 0.65, 0.95), palCol2 * 1.4, 0.25);
    vec3 skyLow = mix(vec3(0.95, 0.7, 0.4), palCol1 * 1.3, 0.25);
    col = mix(skyLow, skyHigh, smoothstep(0.0, 0.7, skyGrad));
    // Sun glow toward horizon
    col += vec3(1.0, 0.85, 0.55) * smoothstep(0.4, 0.0, abs(rd.y - 0.05)) * 0.35;
    // Energy boost on the slot
    col *= 1.0 + energy * 0.3 + climaxBoost * 0.4;
  } else {
    vec3 hitPos = camOrigin + rd * marchResult.x;
    vec3 norm = canNormal(hitPos);
    float matID = marchResult.y;
    float ambOcc = canAO(hitPos, norm);

    // Light direction: from above through slot
    vec3 lightDir = normalize(vec3(0.0, 1.0, 0.2));
    float diffuse = max(dot(norm, lightDir), 0.0);

    // Specular
    vec3 viewDir = normalize(camOrigin - hitPos);
    vec3 halfDir = normalize(lightDir + viewDir);
    float specPow = matID > 2.5 ? 64.0 : 16.0;
    float specular = pow(max(dot(norm, halfDir), 0.0), specPow);

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(viewDir, norm), 0.0), 3.0);

    vec3 matColor;
    vec3 specCol;

    if (matID < 0.5) {
      // Floor: dark sandy ground
      float floorNoise = fbm3(vec3(hitPos.xz * 3.0, 0.0));
      matColor = mix(vec3(0.12, 0.08, 0.05), vec3(0.18, 0.12, 0.07), floorNoise);
      specCol = vec3(0.05);
    } else if (matID < 1.5) {
      // Canyon walls: layered sandstone
      float wallDetail = 0.5 + flux * 0.5;
      float tex = canSandstoneLayer(hitPos, wallDetail);

      // Sediment color bands
      vec3 darkStone = mix(vec3(0.35, 0.18, 0.08), palCol1 * 0.3, 0.1);
      vec3 brightStone = mix(vec3(0.6, 0.32, 0.15), palCol2 * 0.35, 0.08);
      vec3 redBand = vec3(0.55, 0.2, 0.1);

      float bandSelect = sin(hitPos.y * 4.0 + snoise(vec3(hitPos.y * 2.0, hitPos.x * 0.3, 0.0)) * 0.5);
      matColor = mix(darkStone, brightStone, smoothstep(-0.3, 0.3, bandSelect));
      matColor = mix(matColor, redBand, smoothstep(0.5, 0.8, bandSelect) * 0.5);
      matColor += tex * 0.1;

      // Crack lines from tension
      float cracks = snoise(vec3(hitPos.x * 8.0, hitPos.y * 2.0, hitPos.z * 1.5));
      float crackMask = smoothstep(0.7, 0.75, abs(cracks)) * tension * 0.3;
      matColor = mix(matColor, darkStone * 0.5, crackMask);

      // Warm ambient from slow energy
      matColor += vec3(0.03, 0.015, 0.005) * slowE;
      // Bass resonance glow
      matColor += vec3(0.04, 0.015, 0.005) * bass * 0.2;

      specCol = matColor * 0.2;
    } else if (matID < 2.5) {
      // Tumbleweed
      matColor = vec3(0.35, 0.28, 0.15);
      specCol = vec3(0.1, 0.08, 0.04);
    } else {
      // Puddle: dark reflective water
      matColor = vec3(0.02, 0.03, 0.05);
      // Sky reflection in puddle
      vec3 reflDir = reflect(rd, norm);
      float skyRefl = smoothstep(0.0, 0.5, reflDir.y);
      matColor += mix(vec3(0.1, 0.15, 0.25), vec3(0.3, 0.4, 0.6), skyRefl) * 0.3;
      specCol = vec3(0.3, 0.3, 0.35);
    }

    // ─── Compose lighting ───
    // CANYON LIGHTING REWRITE: prior values were so dim the canyon walls
    // rendered near-black against a near-black sky, producing an unviewable
    // image. Brightened ambient + added warm bounced fill from the canyon
    // floor + cool sky fill from above, and tinted ambient with the palette.
    vec3 ambientLight = mix(vec3(0.18, 0.13, 0.08), palCol1 * 0.35, 0.3);
    col = matColor * ambientLight * ambOcc;
    col += matColor * vec3(1.05, 0.9, 0.65) * diffuse * 0.85;
    col += specCol * specular * 0.45;
    col += matColor * fresnelVal * 0.18;

    // ─── Sky fill light from above (cool) ───
    float skyFill = max(0.0, dot(norm, vec3(0.0, 1.0, 0.0))) * 0.35;
    col += matColor * vec3(0.45, 0.55, 0.75) * skyFill * ambOcc;

    // ─── Warm bounced light from canyon floor (warmer for chorus/peak) ───
    float floorBounce = max(0.0, dot(norm, vec3(0.0, -1.0, 0.0))) * 0.25;
    vec3 bounceCol = mix(vec3(0.55, 0.32, 0.15), palCol2, 0.2);
    col += matColor * bounceCol * floorBounce * (0.6 + sChorus * 0.4 + climaxBoost * 0.5);

    // ─── Energy-driven warmth and brightness lift ───
    col *= 1.0 + energy * 0.35 + climaxBoost * 0.25;

    // Dynamic range contrast
    col *= mix(0.9, 1.25, dynRange * diffuse);

    // Distance fog inside canyon: warm atmospheric haze (was nearly-black)
    float fogAmount = 1.0 - exp(-marchResult.x * 0.06);
    vec3 fogColor = mix(vec3(0.18, 0.10, 0.05), palCol1 * 0.5, 0.4);
    col = mix(col, fogColor, fogAmount * 0.55);
  }

  // ─── Volumetric god rays ───
  float beamIntensity = mix(0.15, 0.9, energy);
  beamIntensity += onset * 0.3 + drumOnset * 0.2;
  beamIntensity += climaxBoost * 0.4;
  beamIntensity *= mix(1.0, 0.15, sSpace);
  beamIntensity *= mix(1.0, 2.0, sSolo);

  vec3 beamColor = vec3(0.9, 0.75, 0.5);
  beamColor = mix(beamColor, palCol1 * 1.2, 0.15);
  beamColor = mix(beamColor, beamColor * vec3(1.1, 1.0, 0.9), vocalP * 0.3);

  float maxMarchDist = marchResult.y < 0.0 ? MAX_DIST : marchResult.x;
  col += canGodRay(camOrigin, rd, maxMarchDist, gapWidth, timeVal, energy, beamIntensity, beamColor, melPitch);

  // ─── Dust motes ───
  float dustDensity = highs * 0.5 + energy * 0.3 + beatSnap * 0.2;
  col += canDustMotes(camOrigin, rd, maxMarchDist, timeVal, dustDensity, gapWidth);

  // ─── Icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, timeVal));
    vec3 iconLight = iconEmergence(screenPos, uTime, energy, bass,
      vec3(0.55, 0.30, 0.15), beamColor, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }
  {
    float nf = fbm3(vec3(screenPos * 1.5, timeVal + 5.0));
    vec3 heroLight = heroIconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uSectionIndex);
    col += heroLight;
  }

  // ─── Vignette ───
  // Was mixing toward near-black edges which crushed the entire frame; now
  // mixes toward a warm canyon-shadow color so edges stay readable.
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vignetteCol = mix(vec3(0.10, 0.06, 0.04), palCol1 * 0.18, 0.4);
  col = mix(vignetteCol, col, vignette);

  // ─── Darkness texture ───
  col += darknessTexture(uv, uTime, energy);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
