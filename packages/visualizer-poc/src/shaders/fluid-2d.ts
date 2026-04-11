/**
 * Fluid Cavern — raymarched 3D underground river cavern.
 *
 * Full SDF scene: water surface with reflections, stalactites/stalagmites
 * as SDF geometry, water erosion patterns on cave walls, volumetric mist.
 * Camera glides through an immense subterranean space.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass            -> water surface ripple amplitude, stalactite pulse
 *   uEnergy          -> mist density, step count, overall brightness
 *   uOnsetSnap       -> water splash burst, stalagmite growth spike
 *   uDrumOnset       -> cavern shake, ripple impulse
 *   uVocalEnergy     -> bioluminescent glow on cave walls
 *   uVocalPresence   -> warm mist tint
 *   uHighs           -> water surface specular sharpness
 *   uSlowEnergy      -> camera drift speed, mist drift
 *   uBeatSnap        -> stalactite drip flash
 *   uHarmonicTension -> cave wall erosion complexity
 *   uMelodicPitch    -> water color depth
 *   uChordIndex      -> palette hue shift
 *   uStemBass        -> sub-surface water glow
 *   uTimbralBrightness -> specular highlight intensity
 *   uClimaxPhase     -> cavern opens up, light floods in
 *   uPalettePrimary/Secondary -> cave/water palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

const f2NormalGLSL = buildRaymarchNormal(
  "f2SceneMap($P, flowTime, bass, drumOnset, tension, onset).x",
  { eps: 0.003, name: "f2CalcNormal" },
);
const f2AOGLSL = buildRaymarchAO(
  "f2SceneMap($P, flowTime, bass, drumOnset, tension, onset).x",
  { steps: 5, stepBase: 0.02, stepScale: 0.06, weightDecay: 0.7, finalMult: 3.0, name: "f2CalcAO" },
);

export const fluid2DVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fluid2DFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', bloomEnabled: true, halationEnabled: true, caEnabled: true, dofEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define F2_MAX_STEPS 80
#define F2_MAX_DIST 40.0
#define F2_SURF_DIST 0.002
#define F2_MIST_STEPS 24

// ─── Prefixed SDF primitives ───

float f2Sphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float f2Box(vec3 pos, vec3 dims) {
  vec3 q = abs(pos) - dims;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float f2Cylinder(vec3 pos, float radius, float halfHeight) {
  vec2 d = vec2(length(pos.xz) - radius, abs(pos.y) - halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float f2Capsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 ab = b - a;
  float param = clamp(dot(pos - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(pos - a - param * ab) - radius;
}

float f2SmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float f2SmoothMax(float a, float b, float k) {
  return -f2SmoothMin(-a, -b, k);
}

// ─── Stalactite SDF: elongated cone with noise displacement ───
float f2Stalactite(vec3 pos, vec3 base, float length2, float radius, float seed, float timeVal) {
  vec3 local = pos - base;
  float param = clamp(-local.y / length2, 0.0, 1.0);
  float coneR = radius * (1.0 - param * 0.85);
  float dist2D = length(local.xz) - coneR;
  float distY = max(-local.y - length2, local.y);
  float dist = max(dist2D, distY);
  // Noise displacement for organic feel
  float noiseDisp = snoise(vec3(pos.xz * 2.0 + seed, timeVal * 0.02)) * 0.06 * param;
  return dist + noiseDisp;
}

// ─── Stalagmite SDF: inverted stalactite growing up ───
float f2Stalagmite(vec3 pos, vec3 base, float height, float radius, float seed, float timeVal) {
  vec3 local = pos - base;
  float param = clamp(local.y / height, 0.0, 1.0);
  float coneR = radius * (1.0 - param * 0.9);
  float dist2D = length(local.xz) - coneR;
  float distY = max(local.y - height, -local.y);
  float dist = max(dist2D, distY);
  float noiseDisp = snoise(vec3(pos.xz * 2.5 + seed + 50.0, timeVal * 0.015)) * 0.05 * param;
  return dist + noiseDisp;
}

// ─── Cave walls: infinite tube with FBM displacement ───
float f2CaveWalls(vec3 pos, float timeVal, float tension) {
  float tubeR = 4.5 + sin(pos.z * 0.15) * 1.2 + cos(pos.z * 0.08 + 1.0) * 0.8;
  float tubeDist = tubeR - length(pos.xy);

  // Erosion patterns: ridged FBM displacement
  int erosionOctaves = 3 + int(tension * 3.0);
  float erosion = ridgedMultifractal(vec3(pos.xz * 0.3, pos.y * 0.2 + timeVal * 0.01), erosionOctaves, 2.2, 0.5);
  tubeDist -= erosion * 0.6;

  // Large-scale warping
  tubeDist -= fbm3(vec3(pos * 0.15 + timeVal * 0.005)) * 0.8;

  return -tubeDist;
}

// ─── Water surface: infinite plane with ripples ───
float f2WaterSurface(vec3 pos, float timeVal, float bass, float drumOnset) {
  float waterY = -1.8;
  // Multi-frequency ripples
  float ripple = sin(pos.x * 3.0 + timeVal * 1.2) * 0.04
               + sin(pos.z * 2.5 - timeVal * 0.8) * 0.03
               + sin(pos.x * 7.0 + pos.z * 5.0 + timeVal * 2.5) * 0.015;
  // Bass drives big waves
  ripple += sin(pos.x * 1.2 + pos.z * 0.8 + timeVal * 0.6) * bass * 0.1;
  // Drum impulse splash
  float splashDist = length(pos.xz);
  ripple += sin(splashDist * 8.0 - timeVal * 6.0) * drumOnset * 0.08 * exp(-splashDist * 0.3);

  return pos.y - waterY - ripple;
}

// ─── Full scene SDF ───
// Returns vec2(distance, materialID): 0=cave, 1=stalactite, 2=stalagmite, 3=water
vec2 f2SceneMap(vec3 pos, float timeVal, float bass, float drumOnset, float tension, float onset) {
  // Cave walls
  float cave = f2CaveWalls(pos, timeVal, tension);
  vec2 result = vec2(cave, 0.0);

  // Water surface
  float water = f2WaterSurface(pos, timeVal, bass, drumOnset);
  if (water < result.x) result = vec2(water, 3.0);

  // Stalactites (ceiling)
  for (int idx = 0; idx < 6; idx++) {
    float fi = float(idx);
    float seedVal = fi * 7.31;
    vec3 sBase = vec3(
      sin(seedVal * 1.3 + 2.0) * 3.0,
      2.5 + sin(seedVal * 0.7) * 0.5,
      fi * 2.5 - 6.0 + sin(seedVal) * 1.5
    );
    float sLen = 1.2 + sin(seedVal * 2.1) * 0.6 + onset * 0.3;
    float sRad = 0.15 + sin(seedVal * 3.7) * 0.05;
    float stal = f2Stalactite(pos, sBase, sLen, sRad, seedVal, timeVal);
    if (stal < result.x) result = vec2(stal, 1.0);
  }

  // Stalagmites (floor)
  for (int idx = 0; idx < 5; idx++) {
    float fi = float(idx);
    float seedVal = fi * 11.17 + 100.0;
    vec3 mBase = vec3(
      sin(seedVal * 1.7) * 3.5,
      -1.8,
      fi * 3.0 - 5.0 + cos(seedVal * 0.5) * 2.0
    );
    float mH = 0.8 + sin(seedVal * 2.3) * 0.4 + onset * 0.2;
    float mR = 0.2 + sin(seedVal * 3.1) * 0.08;
    float mite = f2Stalagmite(pos, mBase, mH, mR, seedVal, timeVal);
    if (mite < result.x) result = vec2(mite, 2.0);
  }

  return result;
}

${f2NormalGLSL}
${f2AOGLSL}

// ─── Soft shadow ───
float f2SoftShadow(vec3 ro2, vec3 rd2, float minT, float maxT, float k2, float timeVal, float bass, float drumOnset, float tension, float onset) {
  float result = 1.0;
  float marchT = minT;
  for (int idx = 0; idx < 32; idx++) {
    if (marchT > maxT) break;
    float dist = f2SceneMap(ro2 + rd2 * marchT, timeVal, bass, drumOnset, tension, onset).x;
    if (dist < 0.001) return 0.0;
    result = min(result, k2 * dist / marchT);
    marchT += clamp(dist, 0.01, 0.5);
  }
  return clamp(result, 0.0, 1.0);
}

// ─── Volumetric mist density ───
float f2MistDensity(vec3 pos, float timeVal, float energy) {
  float baseD = fbm3(vec3(pos.xz * 0.2, pos.y * 0.3 + timeVal * 0.03));
  // Mist concentrated near water level
  float heightMask = exp(-pow(pos.y + 1.0, 2.0) * 0.8);
  return clamp(baseD * 0.5 + 0.2, 0.0, 1.0) * heightMask * (0.3 + energy * 0.7);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  float timeVal = uDynamicTime;
  float flowTime = timeVal * (0.06 + slowE * 0.04);

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float mistMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.1, sChorus);
  float lightMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.2, sChorus);

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Palette
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 caveTint = paletteHueColor(hue1, 0.65, 0.85);
  vec3 waterTint = paletteHueColor(hue2, 0.7, 0.9);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera positioned inside cavern, drifting forward
  ro += vec3(sin(flowTime * 0.3) * 1.5, 0.0, flowTime * 2.0);

  // Light source: bioluminescent glow from ahead + above
  vec3 lightPos = ro + vec3(2.0, 3.0 + climaxBoost * 2.0, 5.0);
  vec3 lightDir = normalize(lightPos - ro);

  // === PRIMARY RAYMARCH ===
  float marchDist = 0.0;
  vec2 marchResult = vec2(0.0);
  bool marchHitSurface = false;

  for (int idx = 0; idx < F2_MAX_STEPS; idx++) {
    vec3 marchPos = ro + rd * marchDist;
    marchResult = f2SceneMap(marchPos, flowTime, bass, drumOnset, tension, onset);
    if (marchResult.x < F2_SURF_DIST) {
      marchHitSurface = true;
      break;
    }
    if (marchDist > F2_MAX_DIST) break;
    marchDist += marchResult.x * 0.8;
  }

  vec3 col = vec3(0.0);

  if (marchHitSurface) {
    vec3 marchPos = ro + rd * marchDist;
    vec3 norm = f2CalcNormal(marchPos);
    float matID = marchResult.y;

    // Ambient occlusion
    float occl = f2CalcAO(marchPos, norm);

    // Lighting
    vec3 toLightDir = normalize(lightPos - marchPos);
    float lightDist = length(lightPos - marchPos);
    float attenuation = 1.0 / (1.0 + lightDist * 0.05 + lightDist * lightDist * 0.01);

    // Diffuse
    float diffuse = max(dot(norm, toLightDir), 0.0);

    // Specular (Blinn-Phong)
    vec3 halfVec = normalize(toLightDir - rd);
    float specPower = 32.0 + highs * 64.0 + timbralBright * 32.0;
    float specular = pow(max(dot(norm, halfVec), 0.0), specPower);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    // Soft shadow
    float shadow = f2SoftShadow(marchPos + norm * 0.02, toLightDir, 0.05, lightDist, 16.0, flowTime, bass, drumOnset, tension, onset);

    // Material coloring
    vec3 matColor;
    float specMult = 0.0;

    if (matID < 0.5) {
      // Cave walls
      float erosionTex = ridged4(vec3(marchPos * 0.4 + flowTime * 0.005));
      matColor = caveTint * 0.3 * (0.5 + erosionTex * 0.5);
      // Bioluminescent patches driven by vocals
      float bioGlow = smoothstep(0.4, 0.8, fbm3(vec3(marchPos * 0.8 + 20.0)));
      matColor += waterTint * bioGlow * vocalE * 0.5;
      specMult = 0.15;
    } else if (matID < 1.5) {
      // Stalactites
      matColor = caveTint * 0.5;
      float dripGlow = smoothstep(0.7, 1.0, fract(marchPos.y * 3.0 - flowTime * 0.5));
      matColor += vec3(0.8, 0.9, 1.0) * dripGlow * beatSnap * 0.4;
      specMult = 0.3;
    } else if (matID < 2.5) {
      // Stalagmites
      matColor = caveTint * 0.4;
      matColor += vec3(0.1, 0.05, 0.0) * fbm3(vec3(marchPos * 2.0));
      specMult = 0.2;
    } else {
      // Water surface
      float depth = melodicPitch * 0.3;
      matColor = waterTint * (0.3 + depth);
      // Sub-surface glow from stem bass
      matColor += waterTint * 0.4 * stemBass;
      specMult = 0.8 + timbralBright * 0.4;

      // Water reflection: second march upward
      vec3 reflDir = reflect(rd, norm);
      float reflDist = 0.0;
      bool reflHitSurface = false;
      for (int ridx = 0; ridx < 40; ridx++) {
        vec3 reflPos = marchPos + reflDir * reflDist;
        vec2 reflResult = f2SceneMap(reflPos, flowTime, bass, drumOnset, tension, onset);
        if (reflResult.x < F2_SURF_DIST) {
          reflHitSurface = true;
          break;
        }
        if (reflDist > 20.0) break;
        reflDist += reflResult.x * 0.9;
      }
      if (reflHitSurface) {
        vec3 reflPos = marchPos + reflDir * reflDist;
        vec3 reflNorm = f2CalcNormal(reflPos);
        float reflDiff = max(dot(reflNorm, toLightDir), 0.0);
        vec3 reflCol = caveTint * 0.3 * reflDiff;
        matColor = mix(matColor, reflCol, fresnel * 0.5);
      }
    }

    // Compose lighting
    vec3 lightColor = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.85), climaxBoost);
    vec3 ambient = matColor * 0.15 * occl;
    vec3 diffuseCol = matColor * diffuse * attenuation * shadow * lightMod;
    vec3 specCol = lightColor * specular * specMult * attenuation * shadow;
    vec3 fresnelCol = waterTint * fresnel * 0.2;

    col = ambient + diffuseCol + specCol + fresnelCol;

    // Distance fog
    float fogAmount = 1.0 - exp(-marchDist * 0.04);
    vec3 fogColor = caveTint * 0.08;
    col = mix(col, fogColor, fogAmount);

  } else {
    // No surface hit: deep cave darkness with subtle glow
    col = caveTint * 0.02;
  }

  // === VOLUMETRIC MIST ===
  {
    vec3 mistAccum = vec3(0.0);
    float mistAlpha = 0.0;
    float mistMaxDist = marchHitSurface ? marchDist : F2_MAX_DIST;
    float mistStep = mistMaxDist / float(F2_MIST_STEPS);

    for (int midx = 0; midx < F2_MIST_STEPS; midx++) {
      float mistT = float(midx) * mistStep + mistStep * 0.5;
      vec3 mistPos = ro + rd * mistT;

      float density = f2MistDensity(mistPos, flowTime, energy) * mistMod;
      density *= 0.04;

      if (density > 0.001) {
        float alpha = density * (1.0 - mistAlpha);

        // Mist lighting
        vec3 mistToLight = normalize(lightPos - mistPos);
        float mistScatter = pow(max(dot(rd, mistToLight), 0.0), 4.0);

        vec3 mistColor = mix(caveTint * 0.15, waterTint * 0.2, mistScatter);
        // Vocal warmth in mist
        mistColor += vec3(0.08, 0.04, 0.02) * vocalP * 0.3;
        mistColor *= (1.0 + mistScatter * energy * 0.8);

        mistAccum += mistColor * alpha;
        mistAlpha += alpha;
        if (mistAlpha > 0.95) break;
      }
    }

    col = mix(col, col + mistAccum, 1.0 - mistAlpha * 0.3);
    col += mistAccum * 0.7;
  }

  // Energy brightness
  col *= 0.8 + energy * 0.4 + climaxBoost * 0.3;

  // === DEAD ICONOGRAPHY ===
  float _nf = fbm3(vec3(screenP * 2.0, uTime * 0.1));
  col += iconEmergence(screenP, uTime, energy, bass, caveTint, waterTint, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(screenP, uTime, energy, bass, caveTint, waterTint, _nf, uSectionIndex);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
