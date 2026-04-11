/**
 * Spectral Analyzer — raymarched 3D equalizer cityscape.
 *
 * Each frequency band is a glowing skyscraper SDF that rises and falls
 * with the FFT data. Camera flies through this audio-reactive city of
 * light columns. Reflective floor plane, volumetric glow between towers.
 *
 * Audio reactivity (14+ uniforms):
 *   uContrast0/uContrast1 -> 7-band spectral energy drives tower heights
 *   uBass         -> floor reflection intensity, tower base pulse
 *   uEnergy       -> overall brightness, volumetric glow density
 *   uOnsetSnap    -> tower height spike on transients
 *   uBeatSnap     -> tower width pulse on beats
 *   uDrumOnset    -> floor shake, tower jitter
 *   uHighs        -> specular sharpness on tower surfaces
 *   uVocalEnergy  -> warm glow halos around towers
 *   uHarmonicTension -> inter-tower lightning/arcs
 *   uMelodicPitch -> camera height modulation
 *   uTimbralBrightness -> emission intensity
 *   uStemDrums    -> bass tower reinforcement
 *   uBeatStability -> tower grid regularity
 *   uChordIndex   -> palette hue shift
 *   uPalettePrimary/Secondary -> tower/glow palette
 *   uClimaxPhase  -> all towers peak, city ignites
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const spectralAnalyzerVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const saNormalGLSL = buildRaymarchNormal("saSceneMap($P, timeVal, onset, beatSnap2, drumOnset, beatStab).x", { eps: 0.003, name: "saCalcNormal" });
const saAOGLSL = buildRaymarchAO("saSceneMap($P, timeVal, onset, beatSnap2, drumOnset, beatStab).x", { steps: 5, stepBase: -0.05, stepScale: 0.08, weightDecay: 0.65, finalMult: 3.0, name: "saCalcAO" });

export const spectralAnalyzerFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, caEnabled: true, crtEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define SA_MAX_STEPS 80
#define SA_MAX_DIST 50.0
#define SA_SURF_DIST 0.002
#define SA_NUM_BANDS 7
#define SA_GRID_ROWS 5

// ─── Get frequency band energy by index ───
float saGetBand(int idx) {
  if (idx < 4) {
    if (idx == 0) return uContrast0.x;
    if (idx == 1) return uContrast0.y;
    if (idx == 2) return uContrast0.z;
    return uContrast0.w;
  }
  if (idx == 4) return uContrast1.x;
  if (idx == 5) return uContrast1.y;
  return uContrast1.z;
}

// ─── SDF primitives ───

float saBox(vec3 pos, vec3 dims) {
  vec3 q = abs(pos) - dims;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float saCylinder(vec3 pos, float radius, float halfHeight) {
  vec2 d = vec2(length(pos.xz) - radius, abs(pos.y) - halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float saSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float saRoundBox(vec3 pos, vec3 dims, float radius) {
  return saBox(pos, dims) - radius;
}

// ─── Tower SDF: a single skyscraper with beveled edges ───
float saTower(vec3 pos, vec3 center, float width, float height) {
  vec3 local = pos - center;
  local.y -= height * 0.5;
  vec3 dims = vec3(width, height * 0.5, width);
  return saRoundBox(local, dims, width * 0.15);
}

// ─── Floor plane ───
float saFloor(vec3 pos) {
  return pos.y + 0.01;
}

// ─── Full scene: tower grid + floor ───
// Returns vec2(dist, matID): 0=floor, 1-7=tower band
vec2 saSceneMap(vec3 pos, float timeVal, float onset, float beatSnap2, float drumOnset, float beatStab) {
  // Floor
  float floorDist = saFloor(pos);
  vec2 result = vec2(floorDist, 0.0);

  // Tower grid: SA_NUM_BANDS columns x SA_GRID_ROWS rows
  float spacing = 2.2 + (1.0 - beatStab) * 0.4;
  float gridWidth = float(SA_NUM_BANDS) * spacing;
  float gridDepth = float(SA_GRID_ROWS) * spacing;

  for (int bandIdx = 0; bandIdx < SA_NUM_BANDS; bandIdx++) {
    float bandE = saGetBand(bandIdx);
    bandE += onset * 0.3;
    bandE = clamp(bandE, 0.0, 1.0);

    for (int rowIdx = 0; rowIdx < SA_GRID_ROWS; rowIdx++) {
      float fi = float(bandIdx);
      float fj = float(rowIdx);

      vec3 center = vec3(
        fi * spacing - gridWidth * 0.5 + spacing * 0.5,
        0.0,
        fj * spacing - gridDepth * 0.5 + spacing * 0.5
      );

      // Per-tower variation using hash
      float seedVal = fract(sin(dot(vec2(fi, fj), vec2(127.1, 311.7))) * 43758.5453);
      float rowMod = 0.6 + seedVal * 0.4;

      float towerHeight = bandE * 6.0 * rowMod + 0.2;
      float towerWidth = 0.35 + beatSnap2 * 0.08;

      // Drum jitter
      center.x += sin(timeVal * 50.0 + seedVal * 100.0) * drumOnset * 0.03;

      float tDist = saTower(pos, center, towerWidth, towerHeight);
      if (tDist < result.x) {
        result = vec2(tDist, fi + 1.0);
      }
    }
  }

  return result;
}

${saNormalGLSL}
${saAOGLSL}

// ─── Soft shadow ───
float saSoftShadow(vec3 shadowRo, vec3 shadowRd, float minT, float maxT, float kShadow, float timeVal, float onset, float beatSnap2, float drumOnset, float beatStab) {
  float result = 1.0;
  float marchT = minT;
  for (int idx = 0; idx < 32; idx++) {
    if (marchT > maxT) break;
    float dist = saSceneMap(shadowRo + shadowRd * marchT, timeVal, onset, beatSnap2, drumOnset, beatStab).x;
    if (dist < 0.001) return 0.0;
    result = min(result, kShadow * dist / marchT);
    marchT += clamp(dist, 0.01, 0.5);
  }
  return clamp(result, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap2 = clamp(uBeatSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);

  float timeVal = uDynamicTime;
  float slowTime = timeVal * 0.08;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float glowMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.2, sChorus);
  float heightMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.15, sChorus);

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Palette
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.7, 1.0, energy) * uPaletteSaturation;
  // Shortest-arc hue distance for band-tinted multi-band coloring
  float saHueDiff = fract(hue2 - hue1 + 0.5) - 0.5;

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera flies through the city
  float camHeight = 2.5 + melodicPitch * 2.0 + sin(slowTime * 0.5) * 0.5;
  ro += vec3(sin(slowTime * 0.3) * 4.0, camHeight, slowTime * 3.0 - 8.0);

  // Lighting
  vec3 lightPos = ro + vec3(3.0, 8.0 + climaxBoost * 3.0, 5.0);

  // === PRIMARY RAYMARCH ===
  float marchDist = 0.0;
  vec2 marchResult = vec2(0.0);
  bool marchHitSurface = false;

  for (int idx = 0; idx < SA_MAX_STEPS; idx++) {
    vec3 marchPos = ro + rd * marchDist;
    marchResult = saSceneMap(marchPos, timeVal, onset, beatSnap2, drumOnset, beatStab);
    if (marchResult.x < SA_SURF_DIST) {
      marchHitSurface = true;
      break;
    }
    if (marchDist > SA_MAX_DIST) break;
    marchDist += marchResult.x * 0.85;
  }

  // Sky: deep night gradient
  vec3 skyColor = mix(vec3(0.01, 0.005, 0.03), vec3(0.03, 0.02, 0.06), rd.y * 0.5 + 0.5);
  vec3 col = skyColor;

  if (marchHitSurface) {
    vec3 marchPos = ro + rd * marchDist;
    vec3 norm = saCalcNormal(marchPos);
    float matID = marchResult.y;

    float occl = saCalcAO(marchPos, norm);

    vec3 toLightDir = normalize(lightPos - marchPos);
    float lightDist = length(lightPos - marchPos);
    float attenuation = 1.0 / (1.0 + lightDist * 0.02 + lightDist * lightDist * 0.005);

    float diffuse = max(dot(norm, toLightDir), 0.0);
    vec3 halfVec = normalize(toLightDir - rd);
    float specPower = 32.0 + highs * 64.0;
    float specular = pow(max(dot(norm, halfVec), 0.0), specPower);
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);
    float shadow = saSoftShadow(marchPos + norm * 0.02, toLightDir, 0.05, lightDist, 12.0, timeVal, onset, beatSnap2, drumOnset, beatStab);

    if (matID < 0.5) {
      // Floor: reflective dark surface
      vec3 floorCol = vec3(0.02, 0.015, 0.03);

      // Floor reflection via secondary march
      vec3 reflDir = reflect(rd, norm);
      float reflDist = 0.0;
      bool reflHitSurface = false;
      vec2 reflResult = vec2(0.0);
      for (int ridx = 0; ridx < 40; ridx++) {
        vec3 reflPos = marchPos + reflDir * reflDist + norm * 0.05;
        reflResult = saSceneMap(reflPos, timeVal, onset, beatSnap2, drumOnset, beatStab);
        if (reflResult.x < SA_SURF_DIST) {
          reflHitSurface = true;
          break;
        }
        if (reflDist > 20.0) break;
        reflDist += reflResult.x * 0.9;
      }

      if (reflHitSurface && reflResult.y > 0.5) {
        // Reflected tower: tint by band
        int bandIdx = int(reflResult.y - 1.0);
        float bandE = saGetBand(bandIdx);
        float bandHue = fract(hue1 + saHueDiff * (float(bandIdx) / 6.0));
        vec3 towerCol = paletteHueColor(bandHue, sat, 0.95);
        float reflFade = exp(-reflDist * 0.08) * bass * 0.6;
        floorCol += towerCol * bandE * reflFade;
      }

      // Grid lines on floor
      float gridX = smoothstep(0.02, 0.0, abs(fract(marchPos.x * 0.5) - 0.5));
      float gridZ = smoothstep(0.02, 0.0, abs(fract(marchPos.z * 0.5) - 0.5));
      floorCol += vec3(0.03, 0.02, 0.05) * (gridX + gridZ) * energy;

      col = floorCol * occl + floorCol * fresnel * 0.3;

    } else {
      // Tower surface
      int bandIdx = int(matID - 1.0);
      float bandE = saGetBand(bandIdx);
      float bandHue = fract(hue1 + saHueDiff * (float(bandIdx) / 6.0));
      vec3 towerCol = paletteHueColor(bandHue, sat, 0.95);

      // Self-emission: towers glow based on their band energy
      float emission = bandE * (0.4 + timbralBright * 0.4 + climaxBoost * 0.5) * glowMod;

      // Window pattern on tower face
      float windowX = smoothstep(0.04, 0.0, abs(fract(marchPos.x * 4.0) - 0.5));
      float windowY = smoothstep(0.04, 0.0, abs(fract(marchPos.y * 2.0) - 0.5));
      float windowMask = windowX * windowY;
      vec3 windowGlow = towerCol * 1.5 * windowMask * bandE;

      // Compose tower material
      vec3 ambient = towerCol * 0.1 * occl;
      vec3 diff = towerCol * diffuse * attenuation * shadow;
      vec3 spec = vec3(1.0, 0.95, 0.9) * specular * attenuation * shadow * 0.3;
      vec3 emit = towerCol * emission;
      vec3 fres = towerCol * fresnel * 0.15;

      col = ambient + diff + spec + emit + windowGlow + fres;

      // Vocal halo: warm glow around towers when singing
      col += vec3(0.1, 0.06, 0.02) * vocalE * bandE * fresnel * 0.5;
    }

    // Distance fog
    float fogAmount = 1.0 - exp(-marchDist * 0.025);
    col = mix(col, skyColor, fogAmount);

    // Tension arcs: lightning between towers at high tension
    if (tension > 0.4) {
      float arcNoise = snoise(vec3(marchPos.xz * 2.0, timeVal * 3.0));
      float arcMask = smoothstep(0.6, 1.0, arcNoise) * (tension - 0.4) * 2.0;
      col += vec3(0.6, 0.7, 1.0) * arcMask * 0.3;
    }
  }

  // === VOLUMETRIC GLOW between towers ===
  {
    float glowAccum = 0.0;
    vec3 glowColorAccum = vec3(0.0);
    float glowMaxDist = marchHitSurface ? min(marchDist, 30.0) : 30.0;

    for (int gidx = 0; gidx < 16; gidx++) {
      float glowT = float(gidx) * glowMaxDist / 16.0;
      vec3 glowPos = ro + rd * glowT;

      // Sample closest tower distance
      vec2 glowScene = saSceneMap(glowPos, timeVal, onset, beatSnap2, drumOnset, beatStab);
      float proximity = exp(-glowScene.x * 1.5);

      if (glowScene.y > 0.5) {
        int bandIdx = int(glowScene.y - 1.0);
        float bandE = saGetBand(bandIdx);
        float bandHue = fract(hue1 + saHueDiff * (float(bandIdx) / 6.0));
        vec3 gCol = paletteHueColor(bandHue, sat, 0.95);
        glowColorAccum += gCol * proximity * bandE * 0.015 * glowMod;
      }
      glowAccum += proximity * 0.01;
    }

    col += glowColorAccum * energy;
  }

  // Beat pulse
  col *= 1.0 + beatSnap2 * 0.1 * (1.0 + climaxBoost * 0.3);

  // Drum jitter
  col += col * sin(timeVal * 50.0) * drumOnset * 0.01;

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(screenP * 2.0, uTime * 0.1));
  vec3 _ic1 = paletteHueColor(hue1, sat, 0.95);
  vec3 _ic2 = paletteHueColor(hue2, sat, 0.95);
  col += iconEmergence(screenP, uTime, energy, bass, _ic1, _ic2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(screenP, uTime, energy, bass, _ic1, _ic2, _nf, uSectionIndex);

  // Post-processing
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
