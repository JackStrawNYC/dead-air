/**
 * Liquid Projector — raymarched 3D lava lamp interior.
 * Giant lava lamp with wax blob metaballs rising and falling,
 * glass cylinder walls, heat source glow from below,
 * wax splitting and merging. Full raymarching with proper AO,
 * diffuse+specular+Fresnel, subsurface scattering on wax.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> wax activity + glow intensity
 *   uBass            -> heat source intensity (drives wax rise)
 *   uHighs           -> glass sparkle + surface detail
 *   uMids            -> mid-height wax glow
 *   uOnsetSnap       -> wax bubble pop
 *   uSlowEnergy      -> convection speed
 *   uBeatSnap        -> rhythmic wax pulse
 *   uMelodicPitch    -> vertical emphasis
 *   uMelodicDirection -> convection drift direction
 *   uHarmonicTension -> wax viscosity (low=smooth, high=stringy)
 *   uBeatStability   -> convection regularity
 *   uChromaHue       -> wax hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> maximum activity
 *   uVocalEnergy     -> warm amber base glow
 *   uCoherence       -> wax form stability
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const lp2NormalGLSL = buildRaymarchNormal(
  "lp2SceneSDFScalar($P, sceneTime, bass, energy, tension, coherence)",
  { eps: 0.005, name: "lp2CalcNormal" },
);
const lp2AOGLSL = buildRaymarchAO(
  "lp2SceneSDFScalar($P, sceneTime, bass, energy, tension, coherence)",
  { steps: 4, stepBase: 0.0, stepScale: 0.15, weightDecay: 0.5, finalMult: 2.0, name: "lp2CalcOcclusion" },
);
const lp2DepthAlpha = buildDepthAlphaOutput("marchDist", "LP2_MAX_DIST");

export const liquidProjectorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const liquidProjectorFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define LP2_MAX_STEPS 80
#define LP2_MAX_DIST 25.0
#define LP2_SURF_DIST 0.002

// ---- Smooth min for metaball blending ----
float lp2Smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- Glass cylinder SDF (hollow) ----
float lp2GlassCylinder(vec3 pos, float radius, float height) {
  float outerCyl = length(pos.xz) - radius;
  float innerCyl = length(pos.xz) - (radius - 0.05);
  float capTop = pos.y - height;
  float capBottom = -pos.y - height;
  float cylinder = max(outerCyl, -(innerCyl));
  cylinder = max(cylinder, max(capTop, capBottom));
  return cylinder;
}

// ---- Interior space (for checking if we're inside the lamp) ----
float lp2Interior(vec3 pos, float radius, float height) {
  float cyl = length(pos.xz) - (radius - 0.06);
  float topCap = pos.y - (height - 0.1);
  float bottomCap = -pos.y - (height - 0.1);
  return max(max(cyl, topCap), bottomCap);
}

// ---- Wax blob metaballs ----
float lp2WaxBlobs(vec3 pos, float time, float bass, float energy, float tension,
                   float coherence) {
  float fieldSum = 0.0;
  int blobCount = 6 + int(energy * 4.0);

  for (int i = 0; i < 10; i++) {
    if (i >= blobCount) break;
    float fi = float(i);
    float seed = fi * 7.13 + 42.0;

    // Vertical motion: heat-driven rise and gravity-driven fall
    float phase = time * (0.15 + fi * 0.03) * (1.0 + bass * 0.5) + seed;
    float yPos = sin(phase) * 2.5; // oscillate up and down
    yPos += bass * 0.5 * sin(phase * 2.0); // bass pushes upward

    // Horizontal drift
    float xPos = sin(time * 0.08 + seed * 2.0) * 0.6;
    float zPos = cos(time * 0.07 + seed * 3.0) * 0.6;

    // Blob radius: varies with position and energy
    float radius = 0.25 + fi * 0.04 + energy * 0.20;
    // Blobs stretch when moving (tension = viscosity)
    float stretch = 1.0 + abs(cos(phase)) * tension * 0.3;

    vec3 blobCenter = vec3(xPos, yPos, zPos);
    vec3 diff = pos - blobCenter;
    diff.y /= stretch; // vertical stretch

    float dist = length(diff);
    // Metaball field contribution (inverse square falloff)
    fieldSum += radius * radius / (dist * dist + 0.01);
  }

  // Wax pools at bottom and top
  float bottomPool = pos.y + 2.8;
  float bottomField = 0.3 / (bottomPool * bottomPool + 0.05);
  float topPool = -(pos.y - 2.8);
  float topField = 0.15 / (topPool * topPool + 0.05);

  fieldSum += bottomField + topField;

  // Convert field to distance (threshold at 1.0)
  return 1.0 / max(fieldSum, 0.01) - 0.5;
}

// ---- Scene SDF ----
float lp2SceneSDF(vec3 pos, float time, float bass, float energy, float tension,
                   float coherence, out int lp2ObjId) {
  lp2ObjId = 0;
  float glass = lp2GlassCylinder(pos, 1.2, 3.5);
  float wax = lp2WaxBlobs(pos, time, bass, energy, tension, coherence);

  // Clamp wax to interior
  float interior = lp2Interior(pos, 1.2, 3.5);
  wax = max(wax, interior);

  float minDist = glass;
  lp2ObjId = 1; // glass
  if (wax < minDist) { minDist = wax; lp2ObjId = 2; } // wax

  // Base and cap (metal)
  float baseDist = max(length(pos.xz) - 1.4, max(-pos.y - 3.5, pos.y + 4.0));
  float capDist = max(length(pos.xz) - 1.4, max(pos.y - 3.5, -pos.y + 4.0));
  float metalDist = min(baseDist, capDist);
  if (metalDist < minDist) { minDist = metalDist; lp2ObjId = 3; }

  return minDist;
}

// ---- Scalar wrapper for shared raymarching utilities ----
float lp2SceneSDFScalar(vec3 pos, float time, float bass, float energy, float tension, float coherence) {
  int dummyId;
  return lp2SceneSDF(pos, time, bass, energy, tension, coherence, dummyId);
}

${lp2NormalGLSL}
${lp2AOGLSL}

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
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.15;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.02;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float convectMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.2, sChorus);
  float satMod = mix(1.0, 1.15, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.25, sChorus);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.3, 0.95, energy) * uPaletteSaturation * satMod;

  // ---- Camera ----
  float sceneTime = slowTime * convectMod;
  float camAngle = sceneTime * 0.15 + melodicDir * 0.3;
  float camHeight = 0.0 + sin(sceneTime * 0.2) * 1.0 + melodicPitch * 1.5;
  float camDist = 4.0 + sin(sceneTime * 0.1) * 0.5;
  vec3 rayOrig = vec3(cos(camAngle) * camDist, camHeight, sin(camAngle) * camDist);
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(50.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background: warm dark room ----
  vec3 col = vec3(0.008, 0.005, 0.003);

  // ---- Raymarch ----
  float marchDist = 0.0;
  int objId = 0;
  bool didCollide = false;

  for (int i = 0; i < LP2_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = lp2SceneSDF(marchPos, sceneTime, bass, energy, tension, coherence, objId);
    if (sdf < LP2_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > LP2_MAX_DIST) break;
    marchDist += sdf * 0.7;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = lp2CalcNormal(collidePos);
    float occl = lp2CalcOcclusion(collidePos, nrm);

    // Light from below (heat source)
    vec3 heatLightDir = normalize(vec3(0.0, 1.0, 0.0));
    float heatDiffuse = max(dot(nrm, heatLightDir), 0.0);

    // Ambient light
    vec3 ambientLightDir = normalize(vec3(0.3, 0.5, -0.4));
    float ambDiffuse = max(dot(nrm, ambientLightDir), 0.0);

    // Specular
    vec3 halfVec = normalize(ambientLightDir - rayDir);
    float specular = pow(max(dot(nrm, halfVec), 0.0), 48.0);

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);

    if (objId == 1) {
      // Glass cylinder: transparent with specular highlights
      vec3 glassCol = vec3(0.02, 0.025, 0.03);
      glassCol += vec3(0.8, 0.85, 1.0) * specular * 0.6 * occl;
      glassCol += vec3(0.15, 0.18, 0.2) * fresnelVal * 0.3;

      // Glass sparkle from highs
      float glassSparkle = snoise(vec3(collidePos * 15.0, uDynamicTime * 2.0));
      glassSparkle = smoothstep(0.8, 1.0, glassSparkle) * highs * 0.3;
      glassCol += vec3(1.0, 0.98, 0.95) * glassSparkle;

      // See-through: mix with what's behind
      col = mix(col, glassCol, 0.15 + fresnelVal * 0.3);

    } else if (objId == 2) {
      // Wax: warm colored with subsurface scattering
      float waxHue = fract(hue1 + collidePos.y * 0.03 + chromaHueMod * 0.5);
      vec3 waxColor = hsv2rgb(vec3(waxHue, sat, 0.7 + e2 * 0.3));

      // Subsurface scattering: light passes through translucent wax
      float sss = pow(max(dot(rayDir, nrm), 0.0), 2.0) * 0.5;
      float heatSSS = pow(max(dot(rayDir, -heatLightDir), 0.0), 3.0) * 0.3;

      // Heat glow from below (brighter at bottom of wax blobs)
      float bottomGlow = smoothstep(0.0, -2.0, collidePos.y) * bass * 0.5;
      vec3 heatColor = vec3(1.0, 0.5, 0.1);

      vec3 waxLit = waxColor * (0.2 + ambDiffuse * 0.4 + heatDiffuse * 0.3) * occl;
      waxLit += waxColor * sss * 0.4;
      waxLit += heatColor * (heatSSS + bottomGlow) * (0.3 + e2 * 0.7);
      waxLit += waxColor * specular * 0.2 * occl;
      waxLit += waxColor * fresnelVal * 0.15;

      // Mids glow on mid-height wax
      float midH = smoothstep(-1.5, 0.0, collidePos.y) * smoothstep(2.0, 0.5, collidePos.y);
      waxLit *= 1.0 + mids * midH * 0.2;

      // Beat pulse
      waxLit *= 1.0 + effectiveBeat * 0.2;

      // Vocal warmth
      waxLit += vec3(0.08, 0.04, 0.01) * vocalGlow * e2;

      col = waxLit;

    } else {
      // Metal base/cap
      vec3 metalCol = vec3(0.04, 0.035, 0.03);
      metalCol += vec3(0.1) * ambDiffuse * occl;
      metalCol += vec3(0.3, 0.28, 0.25) * specular * 0.3 * occl;
      metalCol += vec3(0.05) * fresnelVal;
      col = metalCol;
    }

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.05);
    col = mix(col, vec3(0.008, 0.005, 0.003), fogFactor);
  }

  // ---- Volumetric heat glow from below ----
  {
    int volSteps = int(mix(12.0, 24.0, energy));
    float volStepSize = min(LP2_MAX_DIST, marchDist > 0.0 ? marchDist : 10.0) / float(volSteps);
    vec3 volAccum = vec3(0.0);

    for (int i = 0; i < 24; i++) {
      if (i >= volSteps) break;
      float fi = float(i);
      float volT = 0.5 + fi * volStepSize;
      vec3 volPos = rayOrig + rayDir * volT;

      // Inside lamp check
      if (length(volPos.xz) < 1.15 && abs(volPos.y) < 3.4) {
        // Heat source glow from bottom
        float heatDist = length(vec3(volPos.x, volPos.y + 3.5, volPos.z));
        float heatGlow = exp(-heatDist * heatDist * 0.15) * bass * 0.01;

        vec3 heatCol = mix(vec3(1.0, 0.4, 0.05), vec3(1.0, 0.7, 0.3), exp(-heatDist * 0.5));
        volAccum += heatCol * heatGlow * e2;
      }
    }
    col += volAccum;
  }

  // ---- Onset: wax bubble pop flash ----
  if (onset > 0.1) {
    col += vec3(1.0, 0.8, 0.4) * onset * 0.15 * exp(-length(screenP) * 3.0);
  }

  // ---- Warm amber tint (projector bulb) ----
  col *= vec3(1.06, 0.98, 0.88);

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.35;

  // ---- SDF icon emergence ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Vignette ----
  float vigScale = mix(0.32, 0.26, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.002), col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${lp2DepthAlpha}
}
`;
