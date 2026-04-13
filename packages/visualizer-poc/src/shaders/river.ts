/**
 * River — raymarched mountain river scene.
 * Rushing water surface SDF with white rapids/foam, river rocks as sphere SDFs,
 * pine tree silhouettes on banks, mist rising from rapids, golden hour light.
 *
 * Audio reactivity:
 *   uBass             → low-frequency swell amplitude, rock vibration
 *   uEnergy           → flow speed, rapids intensity, foam density
 *   uDrumOnset        → splash burst
 *   uVocalPresence    → mist density
 *   uHarmonicTension  → choppiness / cross-wave turbulence
 *   uBeatSnap         → ripple pulse
 *   uSectionType      → jam=rapids, space=still pool, solo=focused current
 *   uClimaxPhase      → white water eruption
 *   uSlowEnergy       → ambient drift, golden hour warmth
 *   uHighs            → surface sparkle
 *   uMelodicPitch     → reflection brightness
 *   uChromaHue        → water color temperature shift
 *   uPalettePrimary   → deep water hue
 *   uPaletteSecondary → sky/reflection hue
 *   uSpectralFlux     → current turbulence
 *   uDynamicRange     → depth contrast
 *   uBeatStability    → wave pattern regularity
 *   uStemBass         → deep undertow foam churning
 *   uShaderHoldProgress → scene time-of-day: morning → afternoon → golden hour
 *   uSemanticPsychedelic → vivid water colors, intense reflections
 *   uSemanticAmbient  → enhanced mist, softened contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const riverVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const rivNormalGLSL = buildRaymarchNormal("rivMap($P, timeVal, energy, bass, tension, sJam, sSpace).x", { eps: 0.002, name: "rivNormal" });
const rivAOGLSL = buildRaymarchAO("rivMap($P, timeVal, energy, bass, tension, sJam, sSpace).x", { steps: 5, stepBase: 0.01, stepScale: 0.05, weightDecay: 0.65, finalMult: 3.0, name: "rivAO" });
const rivDepthAlpha = buildDepthAlphaOutput("marchDist", "MAX_DIST");

export const riverFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  halationEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 35.0
#define SURF_DIST 0.003

// ============================================================
// Prefixed utilities (riv = river)
// ============================================================
mat2 rivRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float rivHash(float n) { return fract(sin(n) * 43758.5453123); }
float rivHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 rivHash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ============================================================
// SDF primitives
// ============================================================
float rivSDSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float rivSDEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float rivSDCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float rivSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Terrain: river banks with slope
// ============================================================
float rivBankHeight(vec2 xz) {
  // River channel runs along Z. Banks rise on either side.
  float riverWidth = 3.0 + snoise(vec3(0.0, 0.0, xz.y * 0.1)) * 0.8;
  float distFromCenter = abs(xz.x);
  float bank = smoothstep(riverWidth * 0.5, riverWidth * 0.5 + 2.0, distFromCenter);
  float h = bank * 1.5;
  // Rolling bank terrain
  h += snoise(vec3(xz * 0.15, 0.0)) * 0.5 * bank;
  h += snoise(vec3(xz * 0.4, 5.0)) * 0.2 * bank;
  return h;
}

// ============================================================
// Water surface: animated wave SDF
// ============================================================
float rivWaterHeight(vec2 xz, float timeVal, float energy, float bass, float tension,
                     float sJam, float sSpace) {
  // Widened flow speed: nearly still at quiet (0.15), rushing at loud (3.5)
  float flowSpeed = mix(0.15, 3.5, energy) * mix(1.0, 1.8, sJam) * mix(1.0, 0.10, sSpace);
  float flowZ = xz.y - timeVal * flowSpeed;

  float h = 0.0;
  // Broad swells — widened bass response (1.0x quiet → 2.0x loud)
  h += sin(flowZ * 0.3 + xz.x * 0.1) * 0.08 * (0.5 + bass * 1.2);
  // Mid waves — widened energy multiplier
  h += sin(flowZ * 1.2 + xz.x * 0.5 + 2.0) * 0.06 * energy;
  h += sin(flowZ * 2.5 - xz.x * 0.8) * 0.04 * energy;
  // FBM texture
  h += snoise(vec3(xz.x * 0.3, flowZ * 0.5, timeVal * 0.1)) * 0.06 * energy;
  // Cross-chop from tension — widened 4x (was 0.03, invisible)
  h += sin(xz.x * 2.0 + flowZ * 2.0 + timeVal) * tension * 0.12;
  return h - 0.2;
}

// ============================================================
// River rocks
// ============================================================
float rivRocks(vec3 pos, float timeVal) {
  float rocks = 1e5;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec3 seed = rivHash3(fi * 7.1 + 3.0);
    float rockX = (seed.x - 0.5) * 5.0;
    float rockZ = seed.y * 20.0 + 2.0;
    float rockSize = 0.15 + seed.z * 0.25;

    vec3 rockPos = vec3(rockX, -0.2 + rockSize * 0.4, rockZ);
    // Slightly flattened ellipsoid for natural look
    vec3 rockRadii = vec3(rockSize, rockSize * 0.6, rockSize * 0.9);
    float rock = rivSDEllipsoid(pos - rockPos, rockRadii);
    rocks = min(rocks, rock);
  }
  return rocks;
}

// ============================================================
// Pine tree silhouette SDF (simplified cone + trunk)
// ============================================================
float rivPineTree(vec3 pos, float seed) {
  float treeH = 2.0 + seed * 1.5;
  // Trunk
  float trunk = rivSDCapsule(pos, vec3(0.0), vec3(0.0, treeH * 0.4, 0.0), 0.05);
  // Cone canopy: stacked cones
  float canopy = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float coneY = treeH * (0.3 + fi * 0.2);
    float coneRadius = (0.5 - fi * 0.1) * (1.0 + seed * 0.3);
    float coneH = 0.6;
    vec3 conePos = pos - vec3(0.0, coneY, 0.0);
    // Cone approximation: inverted sphere at base, clipped
    float cone = length(conePos.xz) - coneRadius * (1.0 - conePos.y / coneH);
    cone = max(cone, -conePos.y);
    cone = max(cone, conePos.y - coneH);
    canopy = min(canopy, cone);
  }
  return min(trunk, canopy);
}

// ============================================================
// Scene map: terrain + water + rocks + trees
// matID: 0=bank ground, 1=water, 2=rock, 3=tree
// ============================================================
vec2 rivMap(vec3 pos, float timeVal, float energy, float bass, float tension,
            float sJam, float sSpace) {
  // Bank terrain
  float bankH = rivBankHeight(pos.xz);
  float bank = pos.y - bankH;
  vec2 result = vec2(bank, 0.0);

  // Water surface
  float riverWidth = 3.0 + snoise(vec3(0.0, 0.0, pos.z * 0.1)) * 0.8;
  float inRiver = 1.0 - smoothstep(riverWidth * 0.5 - 0.5, riverWidth * 0.5, abs(pos.x));
  if (inRiver > 0.1) {
    float waterH = rivWaterHeight(pos.xz, timeVal, energy, bass, tension, sJam, sSpace);
    float water = pos.y - waterH;
    if (water < result.x) {
      result = vec2(water, 1.0);
    }
  }

  // Rocks
  float rocks = rivRocks(pos, timeVal);
  if (rocks < result.x) {
    result = vec2(rocks, 2.0);
  }

  // Pine trees on banks
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float treeSeed = rivHash(fi * 11.3);
    float treeX = (fi < 4.0 ? -1.0 : 1.0) * (riverWidth * 0.5 + 1.5 + treeSeed * 3.0);
    float treeZ = treeSeed * 25.0 + 1.0;
    vec3 treeBase = vec3(treeX, rivBankHeight(vec2(treeX, treeZ)), treeZ);
    float tree = rivPineTree(pos - treeBase, treeSeed);
    if (tree < result.x) {
      result = vec2(tree, 3.0);
    }
  }

  return result;
}

// Normal & AO — generated by shared raymarching utilities
${rivNormalGLSL}
${rivAOGLSL}

// ============================================================
// Soft shadow
// ============================================================
float rivSoftShadow(vec3 ro, vec3 rd, float mint, float maxt,
                    float timeVal, float energy, float bass, float tension,
                    float sJam, float sSpace) {
  float res = 1.0;
  float tSh = mint;
  for (int i = 0; i < 32; i++) {
    float h = rivMap(ro + rd * tSh, timeVal, energy, bass, tension, sJam, sSpace).x;
    res = min(res, 8.0 * h / tSh);
    tSh += clamp(h, 0.02, 0.3);
    if (h < 0.001 || tSh > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ============================================================
// Sky
// ============================================================
vec3 rivSky(vec3 rd, float slowE, vec3 sunDir, vec3 palCol1, vec3 palCol2) {
  float skyGrad = rd.y * 0.5 + 0.5;
  vec3 skyBottom = mix(vec3(0.9, 0.65, 0.35), vec3(1.0, 0.7, 0.4), slowE);
  vec3 skyTop = mix(vec3(0.4, 0.55, 0.85), palCol2 * 0.7, 0.15);
  vec3 sky = mix(skyBottom, skyTop, skyGrad);

  float sunDot = max(dot(rd, sunDir), 0.0);
  sky += vec3(1.0, 0.85, 0.55) * pow(sunDot, 96.0) * 2.5;
  sky += vec3(1.0, 0.75, 0.4) * pow(sunDot, 12.0) * 0.3;

  // Clouds
  float cloudN = fbm3(vec3(rd.xz * 3.0 / max(rd.y, 0.05), uDynamicTime * 0.015));
  float cloudMask = smoothstep(0.1, 0.6, rd.y) * smoothstep(0.9, 0.5, rd.y);
  sky += vec3(1.0, 0.95, 0.85) * smoothstep(0.35, 0.65, cloudN) * cloudMask * 0.2;

  return sky;
}

// ============================================================
// Volumetric mist from rapids
// ============================================================
vec3 rivMist(vec3 ro, vec3 rd, float marchDist, float timeVal, float energy,
             float vocalP) {
  vec3 mist = vec3(0.0);
  // Widened mist: barely visible at quiet, thick atmospheric at loud
  float mistIntensity = vocalP * 0.6 + energy * 0.35;
  if (mistIntensity < 0.02) return mist;

  float stepSize = 0.5;
  for (int i = 0; i < 20; i++) {
    float tM = float(i) * stepSize + 0.5;
    if (tM > marchDist) break;
    vec3 mPos = ro + rd * tM;

    // Mist near water surface
    float heightMask = smoothstep(-0.5, 0.2, mPos.y) * smoothstep(1.5, 0.3, mPos.y);
    // Only near river channel
    float riverWidth = 3.0 + snoise(vec3(0.0, 0.0, mPos.z * 0.1)) * 0.8;
    float channelMask = smoothstep(riverWidth, riverWidth * 0.3, abs(mPos.x));

    float noiseDensity = fbm3(vec3(mPos.x * 0.3, mPos.z * 0.3 - timeVal * 0.1, timeVal * 0.05));
    noiseDensity = smoothstep(0.3, 0.7, noiseDensity);

    float density = heightMask * channelMask * noiseDensity * mistIntensity * 0.04;
    vec3 mistColor = vec3(0.85, 0.88, 0.92);
    mist += mistColor * density * stepSize;
  }
  return mist;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uDrumOnset, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float timeVal = uDynamicTime * 0.15;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.06;
  float hue2 = uPaletteSecondary + chromaH * 0.04;
  float palSat = mix(0.5, 0.85, slowE) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, palSat, mix(0.5, 0.8, energy)));
  vec3 palCol2 = hsv2rgb(vec3(hue2, palSat * 0.8, mix(0.6, 0.85, energy)));

  // Camera: alongside the river
  float camZ = uTime * 0.15 + 2.0;
  float camX = -2.0 + sin(uTime * 0.03) * 0.5;
  float camY = 1.2 + sin(uTime * 0.05) * 0.1;
  vec3 camOrigin = vec3(camX, camY + rivBankHeight(vec2(camX, camZ)) * 0.3, camZ);
  vec3 camTarget = camOrigin + vec3(1.5, -0.3, 3.0);
  vec3 camForward = normalize(camTarget - camOrigin);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRt = normalize(cross(camForward, camWorldUp));
  vec3 camUpV = cross(camRt, camForward);

  vec3 rd = normalize(screenPos.x * camRt + screenPos.y * camUpV + 1.5 * camForward);

  // Sun: golden hour low angle
  vec3 sunDir = normalize(vec3(0.6, 0.25, 0.3));

  // ─── Raymarching ───
  float marchDist = 0.0;
  vec2 marchResult = vec2(MAX_DIST, -1.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = camOrigin + rd * marchDist;
    vec2 dist = rivMap(pos, timeVal, energy, bass, tension, sJam, sSpace);
    if (dist.x < SURF_DIST) {
      marchResult = vec2(marchDist, dist.y);
      break;
    }
    marchDist += dist.x * 0.7;
    if (marchDist > MAX_DIST) break;
  }

  vec3 col;

  if (marchResult.y < 0.0) {
    col = rivSky(rd, slowE, sunDir, palCol1, palCol2);
  } else {
    vec3 hitPos = camOrigin + rd * marchResult.x;
    vec3 norm = rivNormal(hitPos);
    float matID = marchResult.y;
    float ambOcc = rivAO(hitPos, norm);

    float diffuse = max(dot(norm, sunDir), 0.0);
    float shadow = rivSoftShadow(hitPos + norm * 0.01, sunDir, 0.05, 10.0,
                                  timeVal, energy, bass, tension, sJam, sSpace);
    diffuse *= shadow;

    vec3 viewDir = normalize(camOrigin - hitPos);
    vec3 halfDir = normalize(sunDir + viewDir);
    float fresnelVal = pow(1.0 - max(dot(viewDir, norm), 0.0), 3.0);

    vec3 matColor;
    vec3 specCol;
    float specPow;

    if (matID < 0.5) {
      // Bank: grass/earth
      float grassN = fbm3(vec3(hitPos.xz * 2.0, 0.0));
      matColor = mix(vec3(0.15, 0.35, 0.08), vec3(0.25, 0.45, 0.12), grassN);
      matColor = mix(matColor, vec3(0.3, 0.22, 0.1), smoothstep(0.5, 0.0, hitPos.y) * 0.5);
      specCol = vec3(0.08, 0.1, 0.04);
      specPow = 8.0;
    } else if (matID < 1.5) {
      // Water surface
      // Widened water depth: shallow/clear at quiet, deep/rich at loud
      float waterDepth = 0.3 + energy * 0.6;
      vec3 deepColor = mix(vec3(0.05, 0.15, 0.2), palCol1 * 0.4, 0.2);
      vec3 shallowColor = mix(vec3(0.1, 0.25, 0.3), palCol2 * 0.5, 0.15);
      matColor = mix(deepColor, shallowColor, 0.5);

      // Sky reflection via fresnel
      vec3 reflDir = reflect(rd, norm);
      vec3 skyRefl = rivSky(reflDir, slowE, sunDir, palCol1, palCol2);
      matColor = mix(matColor, skyRefl, fresnelVal * 0.7);

      // Foam at rapids: high displacement = foam — matching widened flow speed
      float flowSpeed = mix(0.15, 3.5, energy) * mix(1.0, 1.8, sJam) * mix(1.0, 0.10, sSpace);
      float foamNoise = fbm3(vec3(hitPos.xz * 1.5 + vec2(0.0, -timeVal * flowSpeed * 0.3), timeVal * 0.2));
      float foamMask = smoothstep(0.4, 0.7, foamNoise) * energy;
      foamMask += onset * 0.3;
      foamMask += climaxBoost * 0.2;
      // Stem bass adds deep undertow foam churning
      foamMask += stemBass * 0.15;
      matColor = mix(matColor, vec3(0.9, 0.92, 0.95), clamp(foamMask, 0.0, 0.7) * 0.6);

      // Sparkle from highs
      float sparkle = smoothstep(0.9, 0.95, snoise(vec3(hitPos.xz * 10.0, uDynamicTime * 0.5)));
      matColor += vec3(1.0, 0.95, 0.85) * sparkle * highs * 0.5;

      // Subsurface caustics
      float causticN = fbm3(vec3(hitPos.xz * 0.8 + vec2(0.0, -timeVal * flowSpeed * 0.1), timeVal * 0.08));
      causticN = pow(max(causticN * 0.5 + 0.5, 0.0), 2.5);
      matColor += shallowColor * causticN * 0.15 * (1.0 - fresnelVal);

      specCol = vec3(0.5, 0.5, 0.6);
      specPow = 64.0;
    } else if (matID < 2.5) {
      // Rocks: wet stone
      float rockN = fbm3(vec3(hitPos * 3.0));
      matColor = mix(vec3(0.2, 0.18, 0.15), vec3(0.35, 0.3, 0.25), rockN);
      // Wet sheen
      matColor *= 0.7 + 0.3 * smoothstep(-0.3, 0.1, hitPos.y);
      specCol = vec3(0.2, 0.18, 0.15);
      specPow = 32.0;
    } else {
      // Pine trees: dark green silhouette
      matColor = vec3(0.05, 0.12, 0.04);
      specCol = vec3(0.02, 0.04, 0.01);
      specPow = 4.0;
    }

    float specular = pow(max(dot(norm, halfDir), 0.0), specPow) * shadow;

    // Compose lighting
    vec3 sunColor = vec3(1.0, 0.85, 0.6); // golden hour
    vec3 ambientLight = vec3(0.1, 0.12, 0.15);

    col = matColor * ambientLight * ambOcc;
    col += matColor * sunColor * diffuse * 0.65;
    col += specCol * sunColor * specular * 0.4;
    if (matID > 0.5 && matID < 1.5) {
      col += matColor * fresnelVal * 0.15; // extra fresnel on water
    }

    // Distance fog
    float fogDist = marchResult.x;
    float fogAmount = 1.0 - exp(-fogDist * 0.03);
    vec3 fogColor = mix(vec3(0.7, 0.6, 0.45), palCol2 * 0.5, 0.2);
    col = mix(col, fogColor, fogAmount);
  }

  // ─── Volumetric mist ───
  float mistMarchDist = marchResult.y < 0.0 ? MAX_DIST : marchResult.x;
  col += rivMist(camOrigin, rd, mistMarchDist, timeVal, energy, vocalP);

  // ─── Icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, timeVal));
    vec3 iconLight = iconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }
  {
    float nf = fbm3(vec3(screenPos * 1.5, timeVal + 8.0));
    vec3 heroLight = heroIconEmergence(screenPos, uTime, energy, bass,
      palCol1, palCol2, nf, uSectionIndex);
    col += heroLight;
  }

  // ─── Hold progress: scene evolves from morning → afternoon → golden hour ───
  float goldenHour = smoothstep(0.7, 1.0, holdP);
  col = mix(col, col * vec3(1.08, 0.98, 0.88), goldenHour * 0.3); // warm golden tint

  // ─── Semantic atmosphere ───
  // Psychedelic: water colors more vivid, reflections more intense
  col = mix(col, col * vec3(1.1, 0.95, 1.05), psyche * 0.3);
  // Ambient: enhances mist/haze, softens harsh contrast
  col = mix(col, col * 0.9 + vec3(0.02, 0.025, 0.03), ambient * 0.2);

  // ─── Vignette ───
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.05, 0.04, 0.02), col, vignette);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
  ${rivDepthAlpha}
}
`;

// Legacy exports for backward compatibility
export const riverWaterVert = riverVert;
export const riverWaterFrag = riverFrag;
