/**
 * Neon Grid — raymarched retro-futuristic 3D landscape.
 * Infinite grid plane stretching to horizon with neon-lit edges, geometric mountain
 * wireframe silhouettes, retrowave sun disc, chrome sphere reflections.
 * 80s synthwave aesthetic rendered as a true 3D raymarched scene.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> grid glow intensity + scene brightness
 *   uBass            -> grid line thickness + chrome sphere pulse
 *   uHighs           -> scan line speed + sparkle
 *   uMids            -> mountain wireframe brightness
 *   uOnsetSnap       -> grid flash ripple
 *   uSlowEnergy      -> scroll speed
 *   uBeatSnap        -> intersection strobe
 *   uMelodicPitch    -> sun vertical position
 *   uMelodicDirection -> camera drift direction
 *   uHarmonicTension -> mountain complexity
 *   uBeatStability   -> grid regularity
 *   uChromaHue       -> neon hue shift
 *   uChordIndex      -> micro hue rotation
 *   uSectionType     -> section modulation
 *   uClimaxPhase     -> full neon intensity
 *   uVocalEnergy     -> sun corona glow
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const neonGridVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const neonGridFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  flareEnabled: true,
  anaglyphEnabled: true,
  dofEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define NG_MAX_STEPS 80
#define NG_MAX_DIST 80.0
#define NG_SURF_DIST 0.001

// ---- SDF primitives ----
float ngSdPlane(vec3 pos) {
  return pos.y;
}

float ngSdSphere(vec3 pos, vec3 center, float radius) {
  return length(pos - center) - radius;
}

// ---- Wireframe mountain profile ----
float ngMountainHeight(float xVal, float tension) {
  float h = 0.0;
  h += sin(xVal * 0.3) * 2.5;
  h += sin(xVal * 0.7 + 1.5) * 1.5;
  h += sin(xVal * 1.5 + 3.0) * 0.8 * tension;
  h += snoise(vec3(xVal * 0.2, 0.0, 0.0)) * 1.5;
  return max(h, 0.0);
}

// ---- Scene SDF ----
float ngSceneSDF(vec3 pos, float time, float bass, float tension,
                  out int ngObjId) {
  ngObjId = 0;

  // Ground plane
  float plane = ngSdPlane(pos);
  float minDist = plane;
  ngObjId = 1; // ground

  // Chrome spheres (3 reflective orbs)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 sphereCenter = vec3(
      sin(fi * 2.5 + time * 0.15) * 4.0,
      0.5 + sin(time * 0.3 + fi * 1.7) * 0.3 + bass * 0.2,
      8.0 + fi * 5.0 + sin(fi * 3.0) * 3.0
    );
    float sphereR = 0.4 + fi * 0.1;
    float sph = ngSdSphere(pos, sphereCenter, sphereR);
    if (sph < minDist) {
      minDist = sph;
      ngObjId = 2 + i; // chrome spheres
    }
  }

  return minDist;
}

// ---- Normal calculation ----
vec3 ngCalcNormal(vec3 pos, float time, float bass, float tension) {
  float eps = 0.005;
  int dummyId;
  float ref = ngSceneSDF(pos, time, bass, tension, dummyId);
  return normalize(vec3(
    ngSceneSDF(pos + vec3(eps, 0, 0), time, bass, tension, dummyId) - ref,
    ngSceneSDF(pos + vec3(0, eps, 0), time, bass, tension, dummyId) - ref,
    ngSceneSDF(pos + vec3(0, 0, eps), time, bass, tension, dummyId) - ref
  ));
}

// ---- Occlusion ----
float ngCalcOcclusion(vec3 pos, vec3 nrm, float time, float bass, float tension) {
  float occl = 0.0;
  float weight = 1.0;
  int dummyId;
  for (int i = 1; i <= 5; i++) {
    float sd = float(i) * 0.2;
    float sdf = ngSceneSDF(pos + nrm * sd, time, bass, tension, dummyId);
    occl += weight * (sd - sdf);
    weight *= 0.6;
  }
  return clamp(1.0 - occl * 0.8, 0.0, 1.0);
}

// ---- Neon grid pattern on ground plane ----
vec3 ngGridPattern(vec3 pos, float time, float energy, float bass, float highs,
                    float effectiveBeat, float onset, float density,
                    vec3 neonCyan, vec3 neonMagenta) {
  // Scrolling grid
  float scroll = time * (1.5 + energy * 1.0);
  vec2 gridUV = vec2(pos.x, pos.z + scroll);

  float gridDensity = density;
  float lineWidth = 0.02 + bass * 0.04;

  // Grid lines
  float gx = abs(fract(gridUV.x * gridDensity) - 0.5);
  float gz = abs(fract(gridUV.y * gridDensity * 0.5) - 0.5);
  float lineX = smoothstep(lineWidth, 0.0, gx);
  float lineZ = smoothstep(lineWidth * 0.8, 0.0, gz);

  // Distance fade
  float depthFade = exp(-pos.z * 0.04);

  vec3 gridCol = neonCyan * lineX * depthFade * 0.8;
  gridCol += neonMagenta * lineZ * depthFade * 0.6;

  // Intersection nodes on beat
  float nodeX = smoothstep(lineWidth * 2.0, 0.0, gx);
  float nodeZ = smoothstep(lineWidth * 2.0, 0.0, gz);
  float nodeMask = nodeX * nodeZ * depthFade;
  gridCol += mix(neonCyan, neonMagenta, 0.5) * nodeMask * effectiveBeat * 2.0;

  // Glow halos
  float glowW = lineWidth * 5.0;
  float glowX = smoothstep(glowW, 0.0, gx) * depthFade;
  float glowZ = smoothstep(glowW, 0.0, gz) * depthFade;
  gridCol += neonCyan * glowX * 0.08 * energy;
  gridCol += neonMagenta * glowZ * 0.06 * energy;

  // Onset ripple
  float rippleDist = length(vec2(pos.x, pos.z - 5.0));
  float ripple = exp(-pow((rippleDist - onset * 10.0) * 0.5, 2.0)) * onset;
  gridCol += vec3(1.0, 0.95, 0.9) * ripple * 0.5;

  // Highs scan line
  float scanPos = fract(time * (0.5 + highs * 1.5));
  float scanZ = mix(0.0, 40.0, scanPos);
  float scanDist = abs(pos.z - scanZ);
  float scanLine = exp(-scanDist * scanDist * 0.5) * (0.3 + highs * 0.7);
  gridCol += neonCyan * scanLine * 0.5;

  return gridCol * (0.3 + energy * 0.7);
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
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.1;
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.04;

  // ---- Section ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.25, sChorus);
  float sectionDensity = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Palette ----
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  vec3 neonCyan = hsv2rgb(vec3(fract(0.52 + hue1 * 0.3), sat, 1.0));
  vec3 neonMagenta = hsv2rgb(vec3(fract(0.83 + hue2 * 0.3), sat, 1.0));
  vec3 neonPurple = hsv2rgb(vec3(fract(0.75 + (hue1 + hue2) * 0.15), sat * 0.9, 0.9));

  // ---- Camera ----
  float camDrift = melodicDir * 0.3;
  vec3 rayOrig = vec3(
    sin(slowTime * 0.1 * sectionSpeed) * 2.0 + camDrift,
    1.8 + sin(slowTime * 0.15) * 0.3,
    -2.0
  );
  vec3 camLookAt = vec3(0.0, 1.0 + melodicPitch * 0.5, 20.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(60.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Sky: synthwave gradient ----
  float skyGrad = smoothstep(-0.1, 0.5, rayDir.y);
  vec3 skyDark = vec3(0.01, 0.005, 0.03);
  vec3 skyHorizon = vec3(0.06, 0.01, 0.08);
  vec3 col = mix(skyHorizon, skyDark, skyGrad);

  // ---- Retrowave sun disc ----
  float sunY = 0.15 + melodicPitch * 0.1;
  vec3 sunDir = normalize(vec3(0.0, sunY, 1.0));
  float sunDot = max(dot(rayDir, sunDir), 0.0);
  float sunDisc = smoothstep(0.992, 0.997, sunDot);
  float sunGlow = pow(sunDot, 32.0) * 0.5;
  float sunCorona = pow(sunDot, 8.0) * 0.15 * (1.0 + vocalGlow * 2.0);

  // Sun with horizontal stripes (retrowave style)
  vec3 sunColor = vec3(1.0, 0.3, 0.5);
  vec3 sunGlowColor = mix(neonMagenta, vec3(1.0, 0.5, 0.2), 0.5);
  // Horizontal stripe mask on sun
  float sunStripes = step(0.5, fract(rayDir.y * 40.0 - slowTime * 0.5));
  float sunBody = sunDisc * mix(0.8, 1.0, sunStripes);
  col += sunColor * sunBody * (0.5 + e2 * 0.5);
  col += sunGlowColor * sunGlow * (0.3 + e2 * 0.7);
  col += neonMagenta * sunCorona;

  // ---- Raymarch scene ----
  float marchDist = 0.0;
  int objId = 0;
  bool didCollide = false;
  float sceneTime = slowTime * sectionSpeed;

  for (int i = 0; i < NG_MAX_STEPS; i++) {
    vec3 marchPos = rayOrig + rayDir * marchDist;
    float sdf = ngSceneSDF(marchPos, sceneTime, bass, tension, objId);
    if (sdf < NG_SURF_DIST) {
      didCollide = true;
      break;
    }
    if (marchDist > NG_MAX_DIST) break;
    marchDist += sdf * 0.8;
  }

  if (didCollide) {
    vec3 collidePos = rayOrig + rayDir * marchDist;
    vec3 nrm = ngCalcNormal(collidePos, sceneTime, bass, tension);
    float occl = ngCalcOcclusion(collidePos, nrm, sceneTime, bass, tension);

    if (objId == 1) {
      // Ground plane: neon grid
      float gridDensity = (0.3 + energy * 0.3) * sectionDensity;
      vec3 gridCol = ngGridPattern(collidePos, sceneTime, energy, bass, highs,
                                    effectiveBeat, onset, gridDensity,
                                    neonCyan, neonMagenta);
      // Ground base color (very dark)
      vec3 groundBase = vec3(0.005, 0.003, 0.01);
      col = groundBase + gridCol * occl;

      // Reflect sun on ground
      vec3 reflDir = reflect(rayDir, nrm);
      float reflSun = pow(max(dot(reflDir, sunDir), 0.0), 16.0);
      col += sunGlowColor * reflSun * 0.1 * e2;

    } else {
      // Chrome spheres: reflective with neon environment
      vec3 reflDir = reflect(rayDir, nrm);
      float fresnelVal = pow(1.0 - max(dot(nrm, -rayDir), 0.0), 4.0);

      // Environment reflection (fake): sun + sky + grid glow
      float reflSun = pow(max(dot(reflDir, sunDir), 0.0), 32.0);
      vec3 envRefl = sunColor * reflSun * 0.5;
      envRefl += mix(neonCyan, neonMagenta, reflDir.x * 0.5 + 0.5) * 0.1;
      envRefl += skyDark * 0.2;

      // Specular highlight
      vec3 lightDir = normalize(vec3(0.5, 1.0, -0.3));
      vec3 halfVec = normalize(lightDir - rayDir);
      float specular = pow(max(dot(nrm, halfVec), 0.0), 64.0);

      vec3 chromeCol = mix(vec3(0.05), envRefl, 0.7 + fresnelVal * 0.3);
      chromeCol += neonCyan * specular * 0.5;
      chromeCol *= occl;

      col = chromeCol * (0.5 + e2 * 0.5);
    }

    // Distance fog
    float fogFactor = 1.0 - exp(-marchDist * 0.02);
    col = mix(col, mix(skyHorizon, skyDark, 0.5) * 0.5, fogFactor);
  }

  // ---- Wireframe mountain silhouettes (ray vs height profile) ----
  {
    float mountainZ = 30.0;
    float tMountain = (mountainZ - rayOrig.z) / rayDir.z;
    if (tMountain > 0.0 && (marchDist < 0.0 || tMountain < marchDist || !didCollide)) {
      vec3 mPos = rayOrig + rayDir * tMountain;
      float mHeight = ngMountainHeight(mPos.x, tension);
      float mY = mPos.y;

      // Wireframe: draw lines at height intervals
      if (mY > 0.0 && mY < mHeight + 0.5) {
        float wireH = fract(mY * 2.0);
        float wireX = fract(mPos.x * 0.5);
        float hLine = smoothstep(0.02, 0.0, abs(wireH - 0.5) - 0.48);
        float vLine = smoothstep(0.02, 0.0, abs(wireX - 0.5) - 0.48);
        float wire = max(hLine, vLine) * smoothstep(mHeight + 0.5, mHeight - 0.5, mY);

        float mFade = exp(-(mountainZ - rayOrig.z) * 0.03);
        vec3 wireCol = mix(neonPurple, neonCyan, mY / max(mHeight, 1.0));
        col += wireCol * wire * mFade * (0.15 + mids * 0.3 + e2 * 0.3);
      }
    }
  }

  // ---- Horizon glow line ----
  float horizEdge = exp(-pow(rayDir.y * 15.0, 2.0));
  col += mix(neonMagenta, neonPurple, 0.5) * horizEdge * (0.1 + energy * 0.2 + vocalGlow);

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
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.005, 0.02), col, vignette);

  // ---- Post-processing ----
  col = applyPostProcess(col, vUv, screenP);

  // ---- Feedback trails ----
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.90, 0.83, energy);
  float feedbackDecay = baseDecay + sJam * 0.04 + sSpace * 0.06 - sChorus * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
