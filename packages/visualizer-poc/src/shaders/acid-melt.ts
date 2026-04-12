/**
 * Acid Melt — raymarched 3D melting geometry.
 * Solid geometric shapes (cubes, spheres, pyramids) that melt and drip
 * downward as if made of wax. The melting surface reveals glowing internal
 * structure. Gravity-driven deformation. Psychedelic color mapping.
 * Full raymarching with AO, diffuse+specular+Fresnel, emissive interior.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> melt intensity + glow brightness
 *   uBass            -> melt speed + drip size
 *   uHighs           -> surface detail sharpness
 *   uMids            -> mid-object glow
 *   uOnsetSnap       -> melt acceleration pulse
 *   uSlowEnergy      -> rotation speed
 *   uBeatSnap        -> shape morph pulse
 *   uMelodicPitch    -> vertical emphasis
 *   uMelodicDirection -> rotation direction
 *   uHarmonicTension -> internal structure complexity
 *   uBeatStability   -> melt coherence
 *   uChromaHue       -> psychedelic hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> maximum melt
 *   uVocalEnergy     -> inner glow warmth
 *   uCoherence       -> shape integrity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const amDepthAlpha = buildDepthAlphaOutput("marchDist", "AM_MAX_DIST");

export const acidMeltVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const acidMeltFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  dofEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define AM_MAX_STEPS 90
#define AM_MAX_DIST 30.0
#define AM_SURF_DIST 0.001

// ---- Smooth minimum ----
float amSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- Box SDF ----
float amSdBox(vec3 pos, vec3 halfSize) {
  vec3 d = abs(pos) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// ---- Octahedron SDF ----
float amSdOctahedron(vec3 pos, float s) {
  pos = abs(pos);
  float m = pos.x + pos.y + pos.z - s;
  vec3 q;
  if (3.0 * pos.x < m) q = pos.xyz;
  else if (3.0 * pos.y < m) q = pos.yzx;
  else if (3.0 * pos.z < m) q = pos.zxy;
  else return m * 0.57735027;
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

// ---- Melt displacement: gravity-driven downward deformation ----
vec3 amMeltDisplace(vec3 pos, float meltAmount, float time, float bass, float tension) {
  // Gravity: upper parts drip downward more
  float gravityFactor = smoothstep(-0.5, 1.5, pos.y) * meltAmount;

  // Noise-driven melt channels
  float channel1 = snoise(vec3(pos.xz * 2.0, time * 0.3)) * gravityFactor;
  float channel2 = snoise(vec3(pos.xz * 4.0 + 10.0, time * 0.2)) * gravityFactor * 0.5;

  // Drip: specific downward channels form
  float dripNoise = snoise(vec3(pos.x * 3.0, time * 0.5, pos.z * 3.0));
  float drip = max(dripNoise - 0.3, 0.0) * gravityFactor * 2.0;

  // Bass pushes melt faster
  float bMelt = bass * 0.3 * gravityFactor;

  // Tension adds viscous stretching
  float stretch = sin(pos.y * 3.0 + time * 0.4) * tension * gravityFactor * 0.2;

  vec3 displacement = vec3(
    channel1 * 0.3 + stretch,
    -(drip + bMelt + channel2 * 0.2),
    channel2 * 0.3
  );
  return displacement;
}

// ---- Scene SDF ----
float amSceneSDF(vec3 pos, float time, float meltAmount, float bass, float tension,
                  float energy, out int amObjId, out float amInternalGlow) {
  amObjId = 0;
  amInternalGlow = 0.0;

  float minDist = 1e6;

  // Shape 1: Melting cube
  {
    vec3 cubePos = pos - vec3(-2.0, 0.5, 0.0);
    vec3 meltOff = amMeltDisplace(cubePos, meltAmount, time, bass, tension);
    vec3 meltedPos = cubePos + meltOff;
    float cube = amSdBox(meltedPos, vec3(0.8));
    // Drip pools below
    float dripPool = length(vec3(cubePos.x, cubePos.y + 1.5, cubePos.z)) - 0.4 * meltAmount;
    cube = amSmin(cube, dripPool, 0.3);
    if (cube < minDist) {
      minDist = cube;
      amObjId = 1;
      amInternalGlow = smoothstep(0.0, -0.3, cube) * meltAmount;
    }
  }

  // Shape 2: Melting sphere
  {
    vec3 sphPos = pos - vec3(0.0, 0.8, 0.0);
    vec3 meltOff = amMeltDisplace(sphPos, meltAmount, time + 1.5, bass, tension);
    vec3 meltedPos = sphPos + meltOff;
    float sphere = length(meltedPos) - 1.0;
    // Drip tendrils
    float dripT = length(vec3(sphPos.x * 0.5, sphPos.y + 2.0, sphPos.z * 0.5)) - 0.3 * meltAmount;
    sphere = amSmin(sphere, dripT, 0.4);
    if (sphere < minDist) {
      minDist = sphere;
      amObjId = 2;
      amInternalGlow = smoothstep(0.0, -0.3, sphere) * meltAmount;
    }
  }

  // Shape 3: Melting octahedron (pyramid-like)
  {
    vec3 octPos = pos - vec3(2.0, 0.6, 0.0);
    vec3 meltOff = amMeltDisplace(octPos, meltAmount, time + 3.0, bass, tension);
    vec3 meltedPos = octPos + meltOff;
    float oct = amSdOctahedron(meltedPos, 0.9);
    float dripO = length(vec3(octPos.x, octPos.y + 1.8, octPos.z)) - 0.25 * meltAmount;
    oct = amSmin(oct, dripO, 0.25);
    if (oct < minDist) {
      minDist = oct;
      amObjId = 3;
      amInternalGlow = smoothstep(0.0, -0.3, oct) * meltAmount;
    }
  }

  // Ground plane (catches drips)
  float ground = pos.y + 1.5;
  // Melted wax pools on ground
  float poolNoise = snoise(vec3(pos.xz * 2.0, time * 0.1)) * 0.1 * meltAmount;
  ground -= poolNoise;
  if (ground < minDist) {
    minDist = ground;
    amObjId = 4;
    amInternalGlow = max(poolNoise, 0.0) * 2.0;
  }

  return minDist;
}

// ---- Normal ----
vec3 amCalcNormal(vec3 pos, float time, float meltAmount, float bass, float tension, float energy) {
  float eps = 0.003;
  int dummyId; float dummyGlow;
  float ref = amSceneSDF(pos, time, meltAmount, bass, tension, energy, dummyId, dummyGlow);
  return normalize(vec3(
    amSceneSDF(pos + vec3(eps, 0, 0), time, meltAmount, bass, tension, energy, dummyId, dummyGlow) - ref,
    amSceneSDF(pos + vec3(0, eps, 0), time, meltAmount, bass, tension, energy, dummyId, dummyGlow) - ref,
    amSceneSDF(pos + vec3(0, 0, eps), time, meltAmount, bass, tension, energy, dummyId, dummyGlow) - ref
  ));
}

// ---- Occlusion ----
float amCalcOcclusion(vec3 pos, vec3 nrm, float time, float meltAmount, float bass,
                       float tension, float energy) {
  float occl = 0.0;
  float weight = 1.0;
  int dummyId; float dummyGlow;
  for (int i = 1; i <= 5; i++) {
    float sd = float(i) * 0.12;
    float sdf = amSceneSDF(pos + nrm * sd, time, meltAmount, bass, tension, energy, dummyId, dummyGlow);
    occl += weight * max(sd - sdf, 0.0);
    weight *= 0.55;
  }
  return clamp(1.0 - occl * 2.5, 0.0, 1.0);
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
  float coherence = clamp(uCoherence, 0.0, 2.0);
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.15;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.015;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionMelt = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.4, sSolo);
  float sectionSat = mix(1.0, 1.15, sChorus) * mix(1.0, 0.6, sSpace);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.3, 0.9, energy) * uPaletteSaturation * sectionSat;

  // ---- Melt amount: energy + time driven ----
  float meltAmount = mix(0.05, 0.8, e2) * sectionMelt;
  meltAmount += climaxBoost * 0.3;
  meltAmount += onset * 0.15; // onset pulse
  // Coherence: high = less melt, low = aggressive melt
  meltAmount *= mix(1.3, 0.6, coherence);
  meltAmount = clamp(meltAmount, 0.0, 1.0);

  // ---- Camera ----
  float sceneTime = slowTime * mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace);
  float camAngle = sceneTime * 0.2 * sign(melodicDir + 0.001);
  camAngle += effectiveBeat * 0.05;
  float camAlt = 2.0 + sin(sceneTime * 0.15) * 0.5 + melodicPitch * 1.0;
  float camDist = 5.5 + sin(sceneTime * 0.1) * 0.5;
  vec3 rayOrig = vec3(cos(camAngle) * camDist, camAlt, sin(camAngle) * camDist);
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(55.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background: psychedelic gradient ----
  float bgNoise = fbm3(vec3(rayDir * 2.0, sceneTime * 0.08));
  vec3 bgCol1 = hsv2rgb(vec3(hue1, sat * 0.3, 0.04));
  vec3 bgCol2 = hsv2rgb(vec3(hue2, sat * 0.25, 0.03));
  vec3 col = mix(bgCol1, bgCol2, bgNoise * 0.5 + 0.5) + vec3(0.01, 0.005, 0.015);

  // ---- Raymarch ----
  float marchDist = 0.0;
  int objId = 0;
  float internalGlow = 0.0;
  bool didCollide = false;

  for (int i = 0; i < AM_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = amSceneSDF(marchPos, sceneTime, meltAmount, bass, tension, energy, objId, internalGlow);
    if (sdf < AM_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > AM_MAX_DIST) break;
    marchDist += sdf * 0.7;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = amCalcNormal(collidePos, sceneTime, meltAmount, bass, tension, energy);
    float occl = amCalcOcclusion(collidePos, nrm, sceneTime, meltAmount, bass, tension, energy);

    // Lighting
    vec3 lightDir = normalize(vec3(0.4, 1.0, -0.3));
    float diffuse = max(dot(nrm, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specPow = mix(16.0, 48.0, highs);
    float specular = pow(max(dot(nrm, halfVec), 0.0), specPow);
    float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 3.0);

    // Object color: psychedelic mapping based on position + melt
    float warpNoise = fbm3(vec3(collidePos * 1.5 + sceneTime * 0.1));
    float surfHue;
    if (objId == 1) surfHue = fract(hue1 + warpNoise * 0.3);
    else if (objId == 2) surfHue = fract(hue2 + warpNoise * 0.25);
    else if (objId == 3) surfHue = fract((hue1 + hue2) * 0.5 + warpNoise * 0.35);
    else surfHue = fract(hue1 + 0.1 + warpNoise * 0.2); // ground pools

    vec3 surfaceCol = hsv2rgb(vec3(surfHue, sat, 0.6 + e2 * 0.3));

    // Surface detail from highs
    float surfDetail = snoise(vec3(collidePos * 8.0, sceneTime * 0.5));
    surfDetail = smoothstep(0.3, 0.8, surfDetail) * highs * 0.15;

    // Apply lighting
    vec3 litCol = surfaceCol * (0.15 + diffuse * 0.5) * occl;
    litCol += vec3(0.9, 0.85, 0.75) * specular * 0.3 * occl;
    litCol += surfaceCol * fresnelVal * 0.2;
    litCol += surfaceCol * surfDetail;

    // Internal glowing structure revealed by melt
    if (internalGlow > 0.01 && objId != 4) {
      float intNoise = ridged4(collidePos * 3.0 + vec3(sceneTime * 0.15, 0.0, 0.0));
      float intHue = fract(surfHue + 0.33 + intNoise * 0.2);
      vec3 intColor = hsv2rgb(vec3(intHue, 1.0, 1.0));
      // Emissive internal structure
      litCol += intColor * internalGlow * (0.3 + e2 * 0.7) * (1.0 + tension * 0.5);
      litCol += intColor * intNoise * internalGlow * 0.2;
    }

    // Ground pools glow from below
    if (objId == 4) {
      float poolGlow = max(internalGlow, 0.0);
      vec3 poolEmit = hsv2rgb(vec3(fract(hue1 + collidePos.x * 0.1), sat, 0.6));
      litCol += poolEmit * poolGlow * e2 * 0.5;
    }

    // Mids glow
    float midZone = smoothstep(-0.5, 0.5, collidePos.y) * smoothstep(1.5, 0.5, collidePos.y);
    litCol *= 1.0 + mids * midZone * 0.2;

    // Vocal warmth
    litCol += vec3(0.06, 0.03, 0.01) * vocalGlow * e2;

    // Beat morph pulse
    litCol *= 1.0 + effectiveBeat * 0.15;

    col = litCol;

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.04);
    vec3 fogCol = hsv2rgb(vec3(fract(hue1 + 0.03), 0.08, 0.02));
    col = mix(col, fogCol, fogFactor);
  }

  // ---- Volumetric internal glow (emissive leaking from melted shapes) ----
  {
    int volSteps = int(mix(12.0, 24.0, energy));
    float maxDist = marchDist > 0.0 ? marchDist : 15.0;
    float volStepSize = maxDist / float(volSteps);
    vec3 volAccum = vec3(0.0);

    for (int i = 0; i < 24; i++) {
      if (i >= volSteps) break;
      float fi = float(i);
      float volT = 0.5 + fi * volStepSize;
      vec3 volPos = rayOrig + rayDir * volT;

      // Emissive near shapes
      for (int s = 0; s < 3; s++) {
        float fs = float(s);
        vec3 shapeCenter = vec3(fs * 2.0 - 2.0, 0.5, 0.0);
        float shapeDist = length(volPos - shapeCenter);
        float emitGlow = exp(-shapeDist * shapeDist * 0.5) * meltAmount * 0.003;
        float emitHue = fract(hue1 + fs * 0.15);
        volAccum += hsv2rgb(vec3(emitHue, 0.8, 1.0)) * emitGlow * e2;
      }
    }
    col += volAccum;
  }

  // ---- Onset flash ----
  col += vec3(1.0, 0.97, 0.92) * onset * 0.2 * exp(-length(screenP) * 2.0);

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
  float vigScale = mix(0.32, 0.24, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.008, 0.005, 0.012), col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${amDepthAlpha}
}
`;
