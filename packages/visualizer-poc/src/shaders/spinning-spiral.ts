/**
 * Spinning Spiral — raymarched 3D logarithmic spiral sculpture.
 * A massive nautilus-shell cross-section as SDF geometry, with the camera
 * traveling along the spiral interior. Golden ratio proportions,
 * Fibonacci sequence visible in the geometry. Full raymarching with
 * AO, diffuse+specular+Fresnel, volumetric interior glow.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> spiral detail + glow intensity
 *   uBass            -> spiral pulse/breathing
 *   uHighs           -> surface detail + edge shimmer
 *   uMids            -> mid-spiral glow
 *   uOnsetSnap       -> flash radiating from center
 *   uSlowEnergy      -> drift speed
 *   uBeatSnap        -> rotation acceleration
 *   uMelodicPitch    -> camera altitude
 *   uMelodicDirection -> rotation direction
 *   uHarmonicTension -> spiral complexity
 *   uBeatStability   -> geometry stability
 *   uChromaHue       -> hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> max spiral intensity
 *   uVocalEnergy     -> inner chamber glow
 *   uTempoDerivative -> rotation rate modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

export const spinningSpiralVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const ssNormalGLSL = buildRaymarchNormal("ssMapScalar($P, slowTime, bass, tension)", { eps: 0.003, name: "ssCalcNormal" });
const ssAOGLSL = buildRaymarchAO("ssMapScalar($P, slowTime, bass, tension)", { steps: 5, stepBase: 0.0, stepScale: 0.1, weightDecay: 0.6, finalMult: 2.0, name: "ssCalcOcclusion" });
const ssDepthAlpha = buildDepthAlphaOutput("marchDist", "SS_MAX_DIST");

export const spinningSpiralFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  paletteCycleEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define PHI 1.6180339887
#define SS_MAX_STEPS 90
#define SS_MAX_DIST 30.0
#define SS_SURF_DIST 0.001

// ---- Logarithmic spiral SDF ----
// A golden spiral tube: r = a * phi^(theta/2pi)
float ssSpiralTube(vec3 pos, float time, float bass, float tension) {
  // Project to XZ plane for polar
  float posR = length(pos.xz);
  float posTheta = atan(pos.z, pos.x);

  // Logarithmic spiral parameters
  float growthRate = log(PHI) / TAU; // golden ratio growth per revolution
  float spiralA = 0.3 + bass * 0.14;

  // Find nearest spiral arm
  float nearestDist = 1e6;

  // Check multiple spiral windings
  for (int w = -3; w < 6; w++) {
    float fw = float(w);
    float armTheta = posTheta + fw * TAU;

    // Expected radius at this theta
    float expectedR = spiralA * exp(growthRate * armTheta);

    // Skip if too far from expected
    if (abs(posR - expectedR) > 1.5) continue;

    // Tube center follows the spiral
    vec3 tubeCenter = vec3(cos(armTheta) * expectedR, 0.0, sin(armTheta) * expectedR);

    // Tube radius grows with spiral (Fibonacci proportions)
    float tubeRadius = expectedR * 0.18 * (1.0 + tension * 0.1);

    // Add vertical extent with noise modulation
    float verticalWave = sin(armTheta * 3.0 + time * 0.3) * 0.1 * tubeRadius;
    tubeCenter.y += verticalWave;

    // Distance to tube
    float dist = length(pos - tubeCenter) - tubeRadius;

    // Surface detail from noise
    float surfDetail = snoise(vec3(pos * 3.0 + armTheta * 0.5, time * 0.1)) * 0.02 * tubeRadius;
    dist += surfDetail;

    nearestDist = min(nearestDist, dist);
  }

  return nearestDist;
}

// ---- Central column SDF ----
float ssCentralPillar(vec3 pos, float bass) {
  float cylRadius = 0.15 + bass * 0.03;
  float cylDist = length(pos.xz) - cylRadius;
  // Limit height
  float capDist = abs(pos.y) - 2.0;
  return max(cylDist, capDist);
}

// ---- Fibonacci chamber walls ----
float ssChamberWalls(vec3 pos, float time, float tension) {
  float posR = length(pos.xz);
  float posTheta = atan(pos.z, pos.x);
  float growthRate = log(PHI) / TAU;
  float spiralA = 0.3;

  // Thin radial walls at Fibonacci intervals
  float minDist = 1e6;
  for (int f = 0; f < 8; f++) {
    float ff = float(f);
    // Fibonacci numbers: 1, 1, 2, 3, 5, 8, 13, 21
    float fibAngle = ff * TAU * PHI; // golden angle spacing
    float wallR = spiralA * exp(growthRate * fibAngle);
    if (abs(posR - wallR) > 0.5) continue;

    // Thin wall perpendicular to spiral
    float wallAngle = fibAngle;
    float wallNx = cos(wallAngle);
    float wallNz = sin(wallAngle);
    float wallDist = abs(pos.x * wallNx + pos.z * wallNz) - 0.02;

    // Only near the spiral radius
    float radialMask = smoothstep(0.3, 0.0, abs(posR - wallR));
    float dist = wallDist / max(radialMask, 0.01);
    minDist = min(minDist, max(wallDist, -radialMask + 0.5));
  }
  return minDist;
}

// ---- Full scene SDF ----
float ssSceneSDF(vec3 pos, float time, float bass, float tension, out int ssObjId) {
  ssObjId = 0;
  float spiral = ssSpiralTube(pos, time, bass, tension);
  float pillar = ssCentralPillar(pos, bass);
  float walls = ssChamberWalls(pos, time, tension);

  float minDist = spiral;
  ssObjId = 1; // spiral

  if (pillar < minDist) { minDist = pillar; ssObjId = 2; }
  if (walls < minDist) { minDist = walls; ssObjId = 3; }

  return minDist;
}

// ---- Scalar map wrapper (hides out int for shared raymarching utilities) ----
float ssMapScalar(vec3 p, float time, float bass, float tension) {
  int _ssDummy;
  return ssSceneSDF(p, time, bass, tension, _ssDummy);
}

${ssNormalGLSL}
${ssAOGLSL}

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
  float chromaHueMod = uChromaHue * 0.2;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1 * chordConf;
  float vocalGlow = uVocalEnergy * 0.12;
  float e2 = energy * energy;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionRotSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.3, sSolo);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.4, 1.0, energy) * uPaletteSaturation;

  // ---- Rotation ----
  float tempoAccel = 1.0 + uTempoDerivative * 0.3;
  float rotSpeed = 0.15 * tempoAccel * sectionRotSpeed;
  float rotDir = sign(melodicDir + 0.001);
  float rotation = uDynamicTime * rotSpeed * rotDir + effectiveBeat * 0.3 * rotDir;
  float slowTime = uDynamicTime * 0.08 * sectionRotSpeed;

  // ---- Camera: travels along spiral interior ----
  float camTheta = rotation;
  float growthRate = log(PHI) / TAU;
  float camR = 0.3 * exp(growthRate * camTheta) * 2.0;
  camR = clamp(camR, 1.0, 6.0);
  vec3 rayOrig = vec3(
    cos(camTheta) * camR,
    0.5 + melodicPitch * 1.0 + sin(slowTime * 0.5) * 0.3,
    sin(camTheta) * camR
  );
  // Look toward spiral center with slight forward bias
  float lookTheta = camTheta + 0.5;
  float lookR = camR * 0.3;
  vec3 camLookAt = vec3(cos(lookTheta) * lookR, 0.2, sin(lookTheta) * lookR);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(60.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background: deep psychedelic void ----
  vec3 bgPrimary = hsv2rgb(vec3(hue1, 0.3 * uPaletteSaturation, 0.03));
  vec3 bgSecondary = hsv2rgb(vec3(hue2, 0.25 * uPaletteSaturation, 0.02));
  float bgNebula = fbm3(vec3(rayDir * 2.0, slowTime * 0.1));
  vec3 col = vec3(0.01, 0.005, 0.02) + mix(bgPrimary, bgSecondary, bgNebula * 0.5 + 0.5) * 0.3;

  // ---- Raymarch ----
  float marchDist = 0.0;
  int objId = 0;
  bool didCollide = false;

  for (int i = 0; i < SS_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = ssSceneSDF(marchPos, slowTime, bass, tension, objId);
    if (sdf < SS_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > SS_MAX_DIST) break;
    marchDist += sdf * 0.7;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = ssCalcNormal(collidePos);
    float occl = ssCalcOcclusion(collidePos, nrm);

    // Lighting
    vec3 lightDir = normalize(vec3(0.3, 1.0, -0.5));
    float diffuse = max(dot(nrm, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specular = pow(max(dot(nrm, halfVec), 0.0), 48.0);
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);

    // Material color based on object and position
    float posR = length(collidePos.xz);
    float posTheta = atan(collidePos.z, collidePos.x);
    float spiralPhase = posR / max(posR, 0.01); // normalized radial position

    vec3 surfaceCol;
    if (objId == 1) {
      // Spiral tube: golden pearlescent
      float shellHue = fract(hue1 + posTheta / TAU * 0.2 + posR * 0.05);
      surfaceCol = hsv2rgb(vec3(shellHue, sat * 0.7, 0.6 + e2 * 0.3));
      // Nacre iridescence
      float nacreDelta = 2.0 * (1.0 + snoise(vec3(collidePos * 5.0, slowTime * 0.1))) * max(dot(nrm, -rayDir), 0.0);
      vec3 nacreCol = vec3(
        0.5 + 0.5 * cos(TAU * nacreDelta),
        0.5 + 0.5 * cos(TAU * (nacreDelta + 0.33)),
        0.5 + 0.5 * cos(TAU * (nacreDelta + 0.67))
      );
      surfaceCol = mix(surfaceCol, nacreCol, 0.3 * fresnelVal);
    } else if (objId == 2) {
      // Central pillar: warm golden
      surfaceCol = hsv2rgb(vec3(fract(hue1 + 0.1), sat * 0.8, 0.7));
    } else {
      // Chamber walls: subtle pattern
      surfaceCol = hsv2rgb(vec3(fract(hue2 + posTheta * 0.1), sat * 0.5, 0.4));
    }

    // Apply lighting
    vec3 ambient = surfaceCol * 0.15;
    vec3 litCol = ambient + surfaceCol * diffuse * 0.6 * occl;
    litCol += vec3(0.9, 0.85, 0.7) * specular * 0.4 * occl;
    litCol += surfaceCol * fresnelVal * 0.25;

    // Edge shimmer from highs
    litCol += surfaceCol * highs * fresnelVal * 0.3;

    // Mid-spiral glow
    float midRadial = smoothstep(0.5, 2.0, posR) * smoothstep(5.0, 2.0, posR);
    litCol *= 1.0 + mids * midRadial * 0.2;

    // Vocal inner glow
    litCol += hsv2rgb(vec3(fract(hue1 + 0.05), 0.6, 0.5)) * vocalGlow * occl;

    col = litCol * (0.3 + e2 * 0.7);

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.05);
    col = mix(col, vec3(0.01, 0.005, 0.02), fogFactor);
  }

  // ---- Volumetric inner glow along spiral center ----
  {
    int volSteps = int(mix(16.0, 32.0, energy));
    float volStepSize = min(SS_MAX_DIST, marchDist > 0.0 ? marchDist : 15.0) / float(volSteps);
    vec3 volAccum = vec3(0.0);

    for (int i = 0; i < 32; i++) {
      if (i >= volSteps) break;
      float fi = float(i);
      float volT = 0.5 + fi * volStepSize;
      vec3 volPos = rayOrig + rayDir * volT;

      // Glow near spiral center axis
      float centerDist = length(volPos.xz);
      float axialGlow = exp(-centerDist * centerDist * 2.0) * 0.005;

      // Glow near spiral tube surfaces
      float posR = length(volPos.xz);
      float spiralGlow = exp(-abs(posR - 0.3 * exp(log(PHI) / TAU * atan(volPos.z, volPos.x))) * 2.0) * 0.003;

      float totalGlow = (axialGlow + spiralGlow) * e2;
      vec3 glowCol = hsv2rgb(vec3(fract(hue1 + posR * 0.1), sat * 0.6, 1.0));
      volAccum += glowCol * totalGlow;
    }
    col += volAccum;
  }

  // ---- Onset flash from center ----
  float centerGlow = exp(-length(screenP) * length(screenP) * 8.0);
  col += vec3(1.0, 0.95, 0.85) * onset * centerGlow * 0.3;

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.4;

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
  col = mix(vec3(0.01, 0.005, 0.02), col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${ssDepthAlpha}
}
`;
