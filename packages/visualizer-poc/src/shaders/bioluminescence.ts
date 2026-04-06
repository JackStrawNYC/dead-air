/**
 * Bioluminescence — raymarched deep sea bioluminescent scene.
 * Jellyfish bell SDFs with trailing tentacles, dinoflagellate particle clouds,
 * anglerfish lure light. Pure darkness except organism emission.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> organism glow intensity + count
 *   uBass            -> jellyfish bell pulse
 *   uHighs           -> dinoflagellate sparkle
 *   uMids            -> tentacle glow intensity
 *   uOnsetSnap       -> bioluminescent flash cascade
 *   uSlowEnergy      -> drift speed
 *   uBeatSnap        -> rhythmic bell contraction
 *   uMelodicPitch    -> vertical organism drift
 *   uMelodicDirection -> current direction
 *   uHarmonicTension -> tentacle complexity
 *   uBeatStability   -> drift stability
 *   uChromaHue       -> hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section-aware modulation
 *   uClimaxPhase     -> full luminescence
 *   uVocalEnergy     -> anglerfish lure brightness
 *   uCoherence       -> organism pattern stability
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const bioluminescenceVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const bioluminescenceFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  dofEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define BL_MAX_STEPS 80
#define BL_MAX_DIST 40.0
#define BL_SURF_DIST 0.002

// ---- Hash ----
float blHash(float n) { return fract(sin(n) * 43758.5453); }
vec2 blHash2(float n) { return vec2(blHash(n), blHash(n + 7.13)); }

// ---- Smooth minimum for metaball blending ----
float blSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- Jellyfish bell SDF ----
float blJellyfishBell(vec3 pos, vec3 center, float radius, float pulsePhase) {
  vec3 localP = pos - center;
  // Oblate spheroid (bell shape)
  float bellSquash = 0.6 + sin(pulsePhase) * 0.15; // breathing
  vec3 scaled = localP / vec3(radius, radius * bellSquash, radius);
  float sphere = length(scaled) - 1.0;
  // Carve out bottom hemisphere to make bell shape
  float cutPlane = -localP.y - radius * 0.1;
  float bell = max(sphere, cutPlane);
  // Add rippled edge
  float edgeAngle = atan(localP.z, localP.x);
  float edgeRipple = sin(edgeAngle * 8.0 + pulsePhase * 2.0) * 0.05 * radius;
  bell += edgeRipple * smoothstep(-0.1, 0.1, cutPlane);
  return bell * radius; // undo scaling
}

// ---- Tentacle SDF (series of spheres along a curve) ----
float blTentacle(vec3 pos, vec3 anchor, float seed, float len, float time, float tension) {
  float minDist = 1e6;
  int segments = 12;
  float segLen = len / float(segments);
  vec3 currPos = anchor;
  vec3 dir = vec3(0.0, -1.0, 0.0);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float taper = 1.0 - fi / float(segments) * 0.8;
    float radius = (0.02 + tension * 0.01) * taper;

    // Curve the tentacle with noise
    float sway = snoise(vec3(seed + fi * 0.5, time * 0.3, seed * 3.0));
    float sway2 = snoise(vec3(seed * 2.0 + fi * 0.3, time * 0.25, seed));
    currPos += dir * segLen;
    currPos.x += sway * 0.04 * (1.0 + tension);
    currPos.z += sway2 * 0.04 * (1.0 + tension);
    dir = normalize(dir + vec3(sway * 0.15, -0.8, sway2 * 0.15));

    float dist = length(pos - currPos) - radius;
    minDist = min(minDist, dist);
  }
  return minDist;
}

// ---- Scene SDF with jellyfish ----
float blSceneSDF(vec3 pos, float time, float bass, float tension, float energy,
                  out int blClosestId, out vec3 blClosestEmission) {
  float minDist = 1e6;
  blClosestId = -1;
  blClosestEmission = vec3(0.0);

  // 5 jellyfish at different positions
  for (int j = 0; j < 5; j++) {
    float fj = float(j);
    float seed = fj * 7.13 + 42.0;
    vec3 jfCenter = vec3(
      sin(time * 0.1 + seed) * 4.0 + cos(seed * 3.0) * 2.0,
      sin(time * 0.08 + seed * 2.0) * 2.0 + fj * 1.5 - 2.0,
      cos(time * 0.12 + seed) * 3.0 + sin(seed * 5.0) * 2.0
    );
    float pulsePhase = time * 1.5 + fj * 1.2 + bass * 2.0;
    float bellRadius = 0.3 + fj * 0.08 + energy * 0.1;
    float bellDist = blJellyfishBell(pos, jfCenter, bellRadius, pulsePhase);

    // Tentacles
    float tentDist = 1e6;
    int tentCount = 3 + int(tension * 3.0);
    for (int t = 0; t < 6; t++) {
      if (t >= tentCount) break;
      float ft = float(t);
      float angle = ft / float(tentCount) * TAU;
      vec3 anchor = jfCenter + vec3(cos(angle) * bellRadius * 0.6, -bellRadius * 0.3, sin(angle) * bellRadius * 0.6);
      float td = blTentacle(pos, anchor, seed + ft * 3.0, 0.6 + energy * 0.4, time, tension);
      tentDist = min(tentDist, td);
    }

    float jfDist = blSmin(bellDist, tentDist, 0.05);
    if (jfDist < minDist) {
      minDist = jfDist;
      blClosestId = j;
    }
  }

  // Anglerfish lure (single glowing sphere)
  vec3 anglerPos = vec3(sin(time * 0.07) * 6.0, -2.0 + sin(time * 0.15) * 1.0, cos(time * 0.09) * 5.0);
  float anglerDist = length(pos - anglerPos) - 0.08;
  if (anglerDist < minDist) {
    minDist = anglerDist;
    blClosestId = 10; // anglerfish ID
  }

  return minDist;
}

// ---- Normal estimation ----
vec3 blCalcNormal(vec3 pos, float time, float bass, float tension, float energy) {
  float eps = 0.005;
  int dummyId; vec3 dummyEmit;
  float ref = blSceneSDF(pos, time, bass, tension, energy, dummyId, dummyEmit);
  return normalize(vec3(
    blSceneSDF(pos + vec3(eps, 0, 0), time, bass, tension, energy, dummyId, dummyEmit) - ref,
    blSceneSDF(pos + vec3(0, eps, 0), time, bass, tension, energy, dummyId, dummyEmit) - ref,
    blSceneSDF(pos + vec3(0, 0, eps), time, bass, tension, energy, dummyId, dummyEmit) - ref
  ));
}

// ---- Occlusion ----
float blCalcOcclusion(vec3 pos, vec3 nrm, float time, float bass, float tension, float energy) {
  float occl = 0.0;
  float weight = 1.0;
  int dummyId; vec3 dummyEmit;
  for (int i = 1; i <= 4; i++) {
    float sampleDist = float(i) * 0.15;
    float sdf = blSceneSDF(pos + nrm * sampleDist, time, bass, tension, energy, dummyId, dummyEmit);
    occl += weight * (sampleDist - sdf);
    weight *= 0.5;
  }
  return clamp(1.0 - occl * 2.0, 0.0, 1.0);
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
  float vocalGlow = uVocalEnergy * 0.15;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.02;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionGlow = mix(1.0, 1.3, sChorus) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.5, sSolo);
  float sectionDrift = mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.1, 1.0, e2) * uPaletteSaturation;

  // ---- Camera ----
  float sceneTime = slowTime * sectionDrift;
  vec3 rayOrig = vec3(
    sin(sceneTime * 0.15) * 5.0,
    melodicPitch * 2.0 - 1.0 + sin(sceneTime * 0.1) * 1.5,
    cos(sceneTime * 0.12) * 5.0 - 8.0
  );
  vec3 camLookAt = vec3(sin(sceneTime * 0.08) * 2.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(55.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Deep ocean black ----
  vec3 col = vec3(0.001, 0.002, 0.004);

  // ---- Raymarch scene ----
  float marchDist = 0.0;
  int closestId = -1;
  vec3 closestEmit = vec3(0.0);
  bool didCollide = false;

  for (int i = 0; i < BL_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = blSceneSDF(marchPos, sceneTime, bass, tension, energy, closestId, closestEmit);
    if (sdf < BL_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > BL_MAX_DIST) break;
    marchDist += sdf * 0.8;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = blCalcNormal(collidePos, sceneTime, bass, tension, energy);
    float occl = blCalcOcclusion(collidePos, nrm, sceneTime, bass, tension, energy);

    // Fresnel
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);

    // Organism emission color based on ID
    float orgHue;
    float orgBright;
    if (closestId == 10) {
      // Anglerfish lure: warm golden glow
      orgHue = fract(hue2 + 0.1);
      orgBright = 0.8 + vocalGlow * 2.0;
    } else {
      // Jellyfish: cycling bioluminescent palette
      float fId = float(closestId);
      float colorPhase = fract(fId * 0.33 + sceneTime * 0.1 + chromaHueMod);
      orgHue = fract(mix(hue1, hue2, colorPhase));
      orgBright = 0.5 + e2 * 0.5;
    }

    vec3 emissionCol = hsv2rgb(vec3(orgHue, sat, orgBright));

    // Subsurface scattering approximation (jellyfish are translucent)
    float sss = pow(max(dot(rayDir, nrm), 0.0), 2.0) * 0.4;

    // Diffuse from self-illumination (emissive organisms)
    float selfLight = 0.3 + 0.7 * occl;

    col = emissionCol * (selfLight + sss) * sectionGlow;
    col += emissionCol * fresnelVal * 0.3;

    // Beat pulse on jellyfish bells
    col *= 1.0 + effectiveBeat * 0.3;

    // Distance fog (deep ocean absorbs light)
    float fogFactor = 1.0 - exp(-marchDist * 0.08);
    col = mix(col, vec3(0.001, 0.002, 0.004), fogFactor);
  }

  // ---- Volumetric god rays from organisms ----
  {
    float godRayAccum = 0.0;
    vec3 godRayColor = vec3(0.0);
    int grSteps = int(mix(16.0, 32.0, energy));
    float grStepSize = min(BL_MAX_DIST, 20.0) / float(grSteps);
    for (int i = 0; i < 32; i++) {
      if (i >= grSteps) break;
      float fi = float(i);
      float grT = 1.0 + fi * grStepSize;
      vec3 grPos = rayOrig + rayDir * grT;

      // Check proximity to each jellyfish
      for (int j = 0; j < 5; j++) {
        float fj = float(j);
        float seed = fj * 7.13 + 42.0;
        vec3 jfCenter = vec3(
          sin(sceneTime * 0.1 + seed) * 4.0 + cos(seed * 3.0) * 2.0,
          sin(sceneTime * 0.08 + seed * 2.0) * 2.0 + fj * 1.5 - 2.0,
          cos(sceneTime * 0.12 + seed) * 3.0 + sin(seed * 5.0) * 2.0
        );
        float jfDist = length(grPos - jfCenter);
        float scatter = exp(-jfDist * jfDist * 0.5) * 0.01;
        float jfHue = fract(hue1 + fj * 0.15 + sceneTime * 0.05);
        godRayColor += hsv2rgb(vec3(jfHue, sat * 0.7, 1.0)) * scatter;
      }

      // Anglerfish lure scatter
      vec3 anglerPos = vec3(sin(sceneTime * 0.07) * 6.0, -2.0 + sin(sceneTime * 0.15) * 1.0, cos(sceneTime * 0.09) * 5.0);
      float anglerDist = length(grPos - anglerPos);
      godRayColor += hsv2rgb(vec3(fract(hue2 + 0.1), 0.8, 1.0)) * exp(-anglerDist * anglerDist * 2.0) * 0.015 * (1.0 + vocalGlow);
    }
    col += godRayColor * e2 * sectionGlow;
  }

  // ---- Dinoflagellate particles (sparkle field) ----
  {
    for (int k = 0; k < 30; k++) {
      float fk = float(k);
      float seed = fk * 13.7 + 100.0;
      vec3 particlePos = vec3(
        sin(sceneTime * 0.2 + seed) * 6.0,
        cos(sceneTime * 0.15 + seed * 2.0) * 4.0,
        sin(sceneTime * 0.18 + seed * 0.5) * 6.0
      );
      // Project to screen
      vec3 toParticle = particlePos - rayOrig;
      float projDist = dot(toParticle, rayDir);
      if (projDist < 0.5) continue;
      vec3 projPoint = rayOrig + rayDir * projDist;
      float screenDist = length(particlePos - projPoint);
      float sparkle = exp(-screenDist * screenDist * 200.0) * (0.02 + highs * 0.06);
      // Twinkle
      sparkle *= 0.5 + 0.5 * sin(uDynamicTime * 5.0 + seed * TAU);
      vec3 sparkleCol = hsv2rgb(vec3(fract(hue1 + fk * 0.05), 0.6, 1.0));
      col += sparkleCol * sparkle * e2;
    }
  }

  // ---- Onset flash cascade ----
  if (onset > 0.1) {
    col += vec3(0.05, 0.08, 0.12) * onset * exp(-length(screenP) * 2.0);
  }

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.6;

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
  col = mix(vec3(0.001, 0.001, 0.003), col, vignette);

  // ---- Post-processing ----
  col = applyPostProcess(col, vUv, screenP);

  // ---- Feedback trails ----
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay_fb = mix(0.93, 0.86, energy);
  float feedbackDecay = baseDecay_fb + sJam * 0.04 + sSpace * 0.06 - sChorus * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
