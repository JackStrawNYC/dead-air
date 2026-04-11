/**
 * Liquid Mandala — raymarched 3D liquid mercury mandala.
 * A mandala pattern formed by liquid mercury pools on a dark surface.
 * The mercury forms perfect geometric patterns that shift with the music.
 * Highly reflective surfaces with environment mapping. Full raymarching
 * with AO, diffuse+specular+Fresnel, mirror reflections.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> pool complexity + reflection intensity
 *   uBass            -> mercury ripple amplitude
 *   uHighs           -> surface specular sharpness
 *   uMids            -> mid-ring glow
 *   uOnsetSnap       -> ripple burst from center
 *   uSlowEnergy      -> pattern rotation speed
 *   uBeatSnap        -> mandala pulse sync
 *   uMelodicPitch    -> pattern altitude variation
 *   uMelodicDirection -> rotation direction
 *   uHarmonicTension -> geometric complexity (more petals)
 *   uBeatStability   -> pattern stability
 *   uChromaHue       -> hue shift in reflections
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> maximum mandala complexity
 *   uVocalEnergy     -> center pool glow
 *   uCoherence       -> pattern coherence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const liquidMandalaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const lmNormalGLSL = buildRaymarchNormal("lmSceneSDFScalar($P, sceneTime, energy, tension, bass, stability, rotation, coherence)", { eps: 0.003, name: "lmCalcNormal" });
const lmAOGLSL = buildRaymarchAO("lmSceneSDFScalar($P, sceneTime, energy, tension, bass, stability, rotation, coherence)", { steps: 4, stepBase: 0.0, stepScale: 0.1, weightDecay: 0.5, finalMult: 4.0, name: "lmCalcOcclusion" });
const lmDepthAlpha = buildDepthAlphaOutput("marchDist", "LM_MAX_DIST");

export const liquidMandalaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  paletteCycleEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define LM_MAX_STEPS 80
#define LM_MAX_DIST 30.0
#define LM_SURF_DIST 0.001

// ---- Mandala height function ----
float lmMandalaHeight(vec2 xz, float time, float energy, float tension, float bass,
                       float stability, float rotation, float coherence) {
  float radius = length(xz);
  float angle = atan(xz.y, xz.x) + rotation;

  // Mandala symmetry: 6-fold base, increasing with tension
  float symmetry = 6.0 + tension * 6.0;
  float symAngle = mod(angle, TAU / symmetry) * symmetry;

  // Concentric ring pattern
  float rings = sin(radius * (8.0 + energy * 12.0) + time * 0.3) * 0.5 + 0.5;
  rings *= smoothstep(0.0, 0.3, radius) * smoothstep(5.0, 3.0, radius);

  // Petal pattern
  float petals = sin(symAngle * 2.0 + radius * 3.0 - time * 0.5) * 0.5 + 0.5;
  petals *= smoothstep(0.3, 1.0, radius) * smoothstep(4.0, 2.5, radius);

  // Inner rosette
  float rosette = sin(symAngle * 4.0 - radius * 5.0 + time * 0.7) * 0.5 + 0.5;
  rosette *= smoothstep(0.2, 0.8, radius) * smoothstep(2.0, 0.5, radius);

  // Combine patterns
  float pattern = rings * 0.4 + petals * 0.35 + rosette * 0.25;

  // Bass ripple
  float ripple = sin(radius * 6.0 - time * 2.0) * bass * 0.02;

  // Stability noise
  float noiseWarp = snoise(vec3(xz * 0.5, time * 0.1)) * (1.0 - stability) * 0.08;

  // Mercury height: pools form where pattern > threshold
  float mercury = smoothstep(0.35, 0.65, pattern) * 0.08 * (0.3 + energy * 0.7);
  mercury += ripple + noiseWarp;

  // Coherence: high = clean patterns, low = chaotic
  float coherenceNoise = snoise(vec3(xz * 2.0, time * 0.2)) * (1.0 - coherence) * 0.04;
  mercury += coherenceNoise;

  // Center pool (always present)
  float centerPool = exp(-radius * radius * 4.0) * 0.05 * (0.5 + energy * 0.5);
  mercury += centerPool;

  return mercury;
}

// ---- Dark surface SDF ----
float lmSurfaceSDF(vec3 pos) {
  return pos.y + 0.01; // flat dark surface at y=0
}

// ---- Mercury pool SDF ----
float lmMercurySDF(vec3 pos, float time, float energy, float tension, float bass,
                    float stability, float rotation, float coherence) {
  float poolHeight = lmMandalaHeight(pos.xz, time, energy, tension, bass, stability, rotation, coherence);
  return pos.y - poolHeight;
}

// ---- Scene SDF ----
float lmSceneSDF(vec3 pos, float time, float energy, float tension, float bass,
                  float stability, float rotation, float coherence, out int lmObjId) {
  lmObjId = 0;
  float surface = lmSurfaceSDF(pos);
  float mercury = lmMercurySDF(pos, time, energy, tension, bass, stability, rotation, coherence);

  float minDist = surface;
  lmObjId = 1; // dark surface

  if (mercury < minDist) { minDist = mercury; lmObjId = 2; } // mercury

  return minDist;
}

// Scalar wrapper (discards material ID) for shared normal/AO generators
float lmSceneSDFScalar(vec3 pos, float time, float energy, float tension, float bass,
                       float stability, float rotation, float coherence) {
  int dummyId;
  return lmSceneSDF(pos, time, energy, tension, bass, stability, rotation, coherence, dummyId);
}

// Normal & AO — generated by shared raymarching utilities
${lmNormalGLSL}
${lmAOGLSL}

// ---- Environment map (procedural) ----
vec3 lmEnvMap(vec3 rd, float time, float hue1, float hue2, float sat, float energy) {
  // Dark void with colored nebula
  float nebula = fbm3(vec3(rd * 2.0, time * 0.05));
  vec3 nebulaCol1 = hsv2rgb(vec3(hue1, sat * 0.5, 0.15));
  vec3 nebulaCol2 = hsv2rgb(vec3(hue2, sat * 0.4, 0.1));
  vec3 envCol = mix(nebulaCol1, nebulaCol2, nebula * 0.5 + 0.5) * energy;

  // Stars
  float stars = smoothstep(0.97, 1.0, snoise(vec3(rd * 50.0)));
  envCol += vec3(0.8, 0.85, 1.0) * stars * 0.3;

  return envCol;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.03;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionRotSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.3, sChorus);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;

  // ---- Rotation ----
  float rotation = slowTime * 0.4 * sectionRotSpeed * sign(melodicDir + 0.001);
  rotation += effectiveBeat * 0.05;

  float sceneTime = slowTime * mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace);

  // ---- Camera ----
  float camAngle = sceneTime * 0.1;
  float camAlt = 3.0 + sin(sceneTime * 0.15) * 0.5 + melodicPitch * 1.0;
  float camDist = 4.5;
  vec3 rayOrig = vec3(cos(camAngle) * camDist, camAlt, sin(camAngle) * camDist);
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(50.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background ----
  vec3 col = lmEnvMap(rayDir, sceneTime, hue1, hue2, sat, e2);

  // ---- Raymarch ----
  float marchDist = 0.0;
  int objId = 0;
  bool didCollide = false;

  for (int i = 0; i < LM_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = lmSceneSDF(marchPos, sceneTime, energy, tension, bass, stability, rotation, coherence, objId);
    if (sdf < LM_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > LM_MAX_DIST) break;
    marchDist += sdf * 0.8;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = lmCalcNormal(collidePos);
    float occl = lmCalcOcclusion(collidePos, nrm);

    // Lighting
    vec3 lightDir = normalize(vec3(0.3, 1.0, -0.5));
    float diffuse = max(dot(nrm, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specPow = mix(32.0, 128.0, highs); // highs sharpen specular
    float specular = pow(max(dot(nrm, halfVec), 0.0), specPow);
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 4.0);

    if (objId == 1) {
      // Dark obsidian surface
      vec3 surfaceCol = vec3(0.015, 0.012, 0.02);
      surfaceCol += vec3(0.03) * diffuse * occl;
      surfaceCol += vec3(0.05) * specular * 0.2 * occl;
      col = surfaceCol;

    } else if (objId == 2) {
      // Mercury: highly reflective liquid metal
      vec3 reflDir = reflect(rayDir, nrm);

      // Environment reflection
      vec3 envRefl = lmEnvMap(reflDir, sceneTime, hue1, hue2, sat, e2) * 2.0;

      // Mercury base color: silver with palette tint
      vec3 mercuryBase = vec3(0.7, 0.72, 0.75);
      vec3 paletteTint = hsv2rgb(vec3(hue1, sat * 0.3, 0.8));
      mercuryBase = mix(mercuryBase, paletteTint, 0.15);

      // Reflection: very high (mercury is a mirror)
      float reflectivity = 0.7 + fresnelVal * 0.3;

      vec3 mercuryCol = mix(mercuryBase * 0.1, envRefl, reflectivity);
      mercuryCol += vec3(0.9, 0.92, 1.0) * specular * occl;
      mercuryCol += mercuryBase * diffuse * 0.1 * occl;

      // Mid-ring glow
      float radius = length(collidePos.xz);
      float midRing = smoothstep(1.0, 2.0, radius) * smoothstep(3.5, 2.5, radius);
      mercuryCol *= 1.0 + mids * midRing * 0.2;

      // Center pool vocal glow
      float centerDist = length(collidePos.xz);
      float centerVocal = exp(-centerDist * centerDist * 2.0) * vocalGlow * 2.0;
      mercuryCol += hsv2rgb(vec3(hue1, 0.5, 1.0)) * centerVocal;

      // Beat pulse
      mercuryCol *= 1.0 + effectiveBeat * 0.15;

      col = mercuryCol * (0.3 + e2 * 0.7);
    }

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.04);
    col = mix(col, vec3(0.01, 0.008, 0.015), fogFactor);
  }

  // ---- Onset ripple flash ----
  if (onset > 0.1) {
    float rippleDist = length(screenP);
    float ripple = exp(-pow((rippleDist - onset * 0.8) * 6.0, 2.0)) * onset;
    col += vec3(0.8, 0.85, 1.0) * ripple * 0.3;
  }

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.5;

  // ---- SDF icon emergence ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Vignette ----
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.004, 0.01), col, vignette);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ---- Post-processing ----
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${lmDepthAlpha}
}
`;
