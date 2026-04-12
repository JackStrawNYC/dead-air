/**
 * Prism Refraction — raymarched 3D prism optics scene.
 * A large triangular prism SDF refracting a beam of white light into spectrum.
 * Refracted beams exist as volumetric colored light shafts in 3D space.
 * Multiple prisms at different angles for complex spectral patterns.
 * Full raymarching with AO, diffuse+specular+Fresnel, volumetric light shafts.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> dispersion angle + beam brightness
 *   uBass            -> prism pulse/scale
 *   uHighs           -> spectral band sharpness
 *   uMids            -> secondary prism brightness
 *   uOnsetSnap       -> bright flash through prism
 *   uSlowEnergy      -> rotation speed
 *   uBeatSnap        -> prism facet strobe
 *   uMelodicPitch    -> beam direction shift
 *   uMelodicDirection -> prism tilt
 *   uHarmonicTension -> internal caustic patterns
 *   uBeatStability   -> clean vs scattered refraction
 *   uChromaHue       -> spectral hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> full spectrum burst
 *   uVocalEnergy     -> internal glow
 *   uCoherence       -> beam coherence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const pr2NormalGLSL = buildRaymarchNormal(
  "pr2SceneSDFScalar($P, sceneTime, bass, tiltDir)",
  { eps: 0.005, name: "pr2CalcNormal" },
);
const pr2AOGLSL = buildRaymarchAO(
  "pr2SceneSDFScalar($P, sceneTime, bass, tiltDir)",
  { steps: 5, stepBase: 0.0, stepScale: 0.15, weightDecay: 0.6, finalMult: 0.8, name: "pr2CalcOcclusion" },
);
const pr2DepthAlpha = buildDepthAlphaOutput("marchDist", "PR2_MAX_DIST");

export const prismRefractionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const prismRefractionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  anaglyphEnabled: true,
  flareEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define PR2_MAX_STEPS 80
#define PR2_MAX_DIST 50.0
#define PR2_SURF_DIST 0.001

// ---- Rotation matrix ----
mat3 pr2RotY(float angle) {
  float c = cos(angle); float s = sin(angle);
  return mat3(c, 0, s, 0, 1, 0, -s, 0, c);
}
mat3 pr2RotX(float angle) {
  float c = cos(angle); float s = sin(angle);
  return mat3(1, 0, 0, 0, c, -s, 0, s, c);
}
mat3 pr2RotZ(float angle) {
  float c = cos(angle); float s = sin(angle);
  return mat3(c, -s, 0, s, c, 0, 0, 0, 1);
}

// ---- Triangular prism SDF ----
float pr2SdTriPrism(vec3 pos, vec2 hw) {
  // h = half-height of triangular cross-section, w = half-width (extrusion)
  vec3 q = abs(pos);
  return max(q.z - hw.y, max(q.x * 0.866025 + pos.y * 0.5, -pos.y) - hw.x * 0.5);
}

// ---- Spectral wavelength to RGB ----
vec3 pr2WavelengthRGB(float lambda) {
  // lambda in 0..1 maps through visible spectrum
  float x = lambda * 6.0;
  vec3 c;
  c.r = smoothstep(0.0, 1.0, 1.0 - abs(x - 3.0) / 3.0) + smoothstep(5.0, 6.0, x) + smoothstep(1.0, 0.0, x);
  c.g = smoothstep(1.0, 2.0, x) - smoothstep(4.0, 5.0, x);
  c.b = smoothstep(3.0, 4.0, x) - smoothstep(5.5, 6.0, x);
  return clamp(c, 0.0, 1.0);
}

// ---- Scene SDF ----
float pr2SceneSDF(vec3 pos, float time, float bass, float tiltDir, out int pr2ObjId) {
  pr2ObjId = 0;
  float minDist = 1e6;

  // Main prism (centered, rotates slowly)
  vec3 p1 = pr2RotY(time * 0.1 + tiltDir * 0.2) * pos;
  p1 = pr2RotX(0.15) * p1;
  float prism1 = pr2SdTriPrism(p1, vec2(1.0 + bass * 0.30, 1.5));
  if (prism1 < minDist) { minDist = prism1; pr2ObjId = 1; }

  // Secondary prism (offset, different angle)
  vec3 p2 = pos - vec3(3.5, 0.5, 2.0);
  p2 = pr2RotY(time * 0.08 + PI * 0.3) * pr2RotZ(0.4) * p2;
  float prism2 = pr2SdTriPrism(p2, vec2(0.7, 1.0));
  if (prism2 < minDist) { minDist = prism2; pr2ObjId = 2; }

  // Third prism (opposite side)
  vec3 p3 = pos - vec3(-3.0, -0.3, 1.5);
  p3 = pr2RotY(time * 0.12 - PI * 0.2) * pr2RotX(-0.3) * p3;
  float prism3 = pr2SdTriPrism(p3, vec2(0.5, 0.8));
  if (prism3 < minDist) { minDist = prism3; pr2ObjId = 3; }

  // Ground plane (subtle)
  float groundPlane = pos.y + 2.5;
  if (groundPlane < minDist) { minDist = groundPlane; pr2ObjId = 4; }

  return minDist;
}

// ---- Scalar wrapper for shared raymarching utilities ----
float pr2SceneSDFScalar(vec3 pos, float time, float bass, float tiltDir) {
  int dummyId;
  return pr2SceneSDF(pos, time, bass, tiltDir, dummyId);
}

${pr2NormalGLSL}
${pr2AOGLSL}

// ---- Volumetric light shaft sampling ----
vec3 pr2VolumetricBeams(vec3 samplePos, float time, float energy, float dispAngle,
                         float stability, float coherence, float hueShift) {
  vec3 beamAccum = vec3(0.0);

  // White light beam entry direction
  vec3 beamDir = normalize(vec3(0.7, -0.2, -0.5));
  vec3 beamOrigin = vec3(-5.0, 1.5, -3.0);

  // Distance from sample point to beam axis
  vec3 toSample = samplePos - beamOrigin;
  float projOnBeam = dot(toSample, beamDir);
  vec3 projPoint = beamOrigin + beamDir * projOnBeam;
  float beamDist = length(samplePos - projPoint);

  // Incoming white beam (before prism)
  if (projOnBeam > 0.0 && projOnBeam < 6.0) {
    float inBeam = exp(-beamDist * beamDist * 20.0);
    beamAccum += vec3(0.9, 0.92, 1.0) * inBeam * 0.3 * energy;
  }

  // Dispersed beams (after prism) - 7 spectral beams fanning out
  vec3 exitPoint = vec3(1.0, 0.0, 0.0);
  for (int b = 0; b < 7; b++) {
    float fb = float(b);
    float beamAngle = (fb / 6.0 - 0.5) * dispAngle;
    vec3 specBeamDir = normalize(vec3(
      cos(beamAngle) * 0.8,
      sin(beamAngle) * 0.3 + (fb - 3.0) * 0.05,
      0.6
    ));

    vec3 toSampleSpec = samplePos - exitPoint;
    float projSpec = dot(toSampleSpec, specBeamDir);
    if (projSpec < 0.0) continue;
    vec3 projPointSpec = exitPoint + specBeamDir * projSpec;
    float specDist = length(samplePos - projPointSpec);

    // Beam width: tighter at source, fans out
    float beamWidth = 0.1 + projSpec * 0.02;
    // Stability affects scatter
    beamWidth += (1.0 - stability) * 0.05;

    float inSpec = exp(-specDist * specDist / (beamWidth * beamWidth));
    float falloff = exp(-projSpec * 0.05);

    // Spectral color
    vec3 specColor = pr2WavelengthRGB(fb / 6.0 + hueShift * 0.15);
    // Coherence affects color purity
    float purity = mix(0.5, 1.0, coherence);
    specColor = mix(vec3(dot(specColor, vec3(0.33))), specColor, purity);

    beamAccum += specColor * inSpec * falloff * 0.15 * energy;
  }

  return beamAccum;
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
  float slowTime = uDynamicTime * 0.015;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionDisp = mix(1.0, 1.8, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 0.7, sSolo);
  float sectionVivid = mix(1.0, 1.4, sChorus) * mix(1.0, 1.2, sSolo);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.08, 0.95, e2) * uPaletteSaturation;

  // ---- Camera ----
  float sceneTime = slowTime * mix(1.0, 1.3, sJam) * mix(1.0, 0.3, sSpace);
  vec3 rayOrig = vec3(
    sin(sceneTime * 0.15) * 4.0,
    1.5 + sin(sceneTime * 0.1) * 0.5 + melodicPitch * 0.5,
    -6.0 + cos(sceneTime * 0.12) * 1.5
  );
  vec3 camLookAt = vec3(0.0, 0.0, 0.5);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(55.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background ----
  vec3 bgColor = vec3(0.003, 0.002, 0.005);
  float bgGrad = smoothstep(-0.3, 0.5, rayDir.y);
  vec3 col = mix(bgColor * 1.5, bgColor, bgGrad);

  // ---- Dispersion angle ----
  float dispAngle = (0.5 + energy * 1.0 + climaxBoost * 0.5) * sectionDisp;
  float tiltDir = melodicDir;

  // ---- Raymarch scene ----
  float marchDist = 0.0;
  int objId = 0;
  bool didCollide = false;

  for (int i = 0; i < PR2_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = pr2SceneSDF(marchPos, sceneTime, bass, tiltDir, objId);
    if (sdf < PR2_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > PR2_MAX_DIST) break;
    marchDist += sdf * 0.8;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = pr2CalcNormal(collidePos);
    float occl = pr2CalcOcclusion(collidePos, nrm);

    // Light direction
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diffuse = max(dot(nrm, lightDir), 0.0);

    // Specular (Blinn-Phong)
    vec3 halfVec = normalize(lightDir - rayDir);
    float specular = pow(max(dot(nrm, halfVec), 0.0), 64.0);

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 4.0);

    if (objId >= 1 && objId <= 3) {
      // Prism: crystal material
      vec3 crystalBase = vec3(0.05, 0.06, 0.08);

      // Internal caustics
      float caustic1 = abs(snoise(vec3(collidePos * 8.0, sceneTime * 0.5)));
      float caustic2 = abs(snoise(vec3(collidePos * 12.0 + 50.0, sceneTime * 0.35)));
      float caustics = (caustic1 * 0.6 + caustic2 * 0.4) * tension;

      // Iridescent reflection
      float iridThick = 2.0 + snoise(vec3(collidePos * 4.0, sceneTime * 0.2)) * 0.5;
      float iridAngle = max(dot(nrm, -rayDir), 0.0);
      float iridDelta = 2.0 * iridThick * iridAngle;
      vec3 iridColor = vec3(
        0.5 + 0.5 * cos(TAU * (iridDelta * 1.0)),
        0.5 + 0.5 * cos(TAU * (iridDelta * 1.1 + 0.33)),
        0.5 + 0.5 * cos(TAU * (iridDelta * 1.2 + 0.67))
      );

      vec3 prismCol = crystalBase;
      prismCol += vec3(0.1, 0.12, 0.15) * diffuse * occl;
      prismCol += vec3(0.8, 0.85, 1.0) * specular * 0.5 * occl;
      prismCol += iridColor * fresnelVal * 0.3 * (0.1 + e2 * 0.9);
      prismCol += vec3(0.6, 0.7, 1.0) * caustics * 0.1 * e2;
      prismCol += vec3(1.0, 0.97, 0.9) * vocalGlow * 0.3;

      // Beat facet strobe
      prismCol *= 1.0 + effectiveBeat * 0.3;

      // Secondary prisms dimmer
      float prismBright = objId == 1 ? 1.0 : 0.6 + mids * 0.3;
      col = prismCol * prismBright * (0.3 + e2 * 0.7);

    } else if (objId == 4) {
      // Ground: dark with spectral caustic projections
      vec3 groundCol = vec3(0.01, 0.008, 0.015);
      groundCol += vec3(0.03) * diffuse * occl;

      // Project spectral caustics onto ground
      for (int b = 0; b < 7; b++) {
        float fb = float(b);
        float bandAngle = (fb / 6.0 - 0.5) * dispAngle;
        vec2 caustDir = vec2(cos(bandAngle) * 0.8, sin(bandAngle) * 0.3);
        float caustDist = abs(dot(collidePos.xz - vec2(1.0, 0.0), vec2(-caustDir.y, caustDir.x)));
        float caustLine = exp(-caustDist * caustDist * 10.0);
        vec3 bandCol = pr2WavelengthRGB(fb / 6.0 + chromaHueMod * 0.15);
        groundCol += bandCol * caustLine * 0.1 * e2 * sectionVivid;
      }
      col = groundCol;
    }

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.03);
    col = mix(col, bgColor, fogFactor);
  }

  // ---- Volumetric light beams ----
  {
    int volSteps = int(mix(20.0, 40.0, energy));
    float volStepSize = min(PR2_MAX_DIST, marchDist > 0.0 ? marchDist : 30.0) / float(volSteps);
    vec3 volAccum = vec3(0.0);

    for (int i = 0; i < 40; i++) {
      if (i >= volSteps) break;
      float fi = float(i);
      float volT = 0.5 + fi * volStepSize;
      vec3 volPos = rayOrig + rayDir * volT;
      volAccum += pr2VolumetricBeams(volPos, sceneTime, energy, dispAngle,
                                      stability, coherence, chromaHueMod);
    }
    volAccum *= volStepSize * 0.3 * sectionVivid;
    col += volAccum;
  }

  // ---- Onset flash ----
  col += vec3(1.0, 0.98, 0.94) * onset * 0.2 * exp(-length(screenP) * 2.0);

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
  col = mix(bgColor, col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${pr2DepthAlpha}
}
`;
