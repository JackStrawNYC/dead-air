/**
 * Fractal Cavern — raymarched 3D Mandelbox fractal interior.
 * Camera flies through crystalline cavities of a folded fractal structure.
 * Real 3D geometry with diffuse/specular lighting, orbit trap coloring,
 * ambient occlusion, and interior volumetric glow.
 *
 * Audio reactivity:
 *   uBass             → fractal scale parameter (opens/closes cavities)
 *   uEnergy           → iteration count (detail level 4-8)
 *   uDrumOnset        → fold parameter snap (sharp geometry distortion)
 *   uVocalPresence    → interior volumetric glow intensity
 *   uHarmonicTension  → fold distortion (asymmetric folds warp geometry)
 *   uSectionType      → jam=deep zoom, space=pulled back, chorus=full detail
 *   uClimaxPhase      → fractal parameter shift (dramatic structural transformation)
 *   uMelodicPitch     → camera vertical drift
 *   uChromaHue        → orbit trap hue rotation
 *   uPalettePrimary   → primary surface hue
 *   uPaletteSecondary → secondary cavity hue
 *   uSlowEnergy       → camera movement speed
 *   uBeatSnap         → specular highlight pulse
 *   uTimbralBrightness→ surface metallic sheen
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fractalZoomVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  caEnabled: true,
  halationEnabled: true,
  temporalBlendEnabled: true,
  dofEnabled: true,
});

export const fractalZoomFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;
${noiseGLSL}
${postProcess}

varying vec2 vUv;

#define FZ_PI 3.14159265
#define FZ_MAX_STEPS 80
#define FZ_MAX_DIST 40.0
#define FZ_SURF_DIST 0.001

// ─── Mandelbox fold-and-scale SDF ───
// Returns vec2(distance, orbitTrapMinDist) for coloring

vec3 fzBoxFold(vec3 pt, float foldLimit) {
  return clamp(pt, -foldLimit, foldLimit) * 2.0 - pt;
}

float fzSphereFold(inout vec3 pt, inout float dr, float minR2, float fixedR2) {
  float r2 = dot(pt, pt);
  if (r2 < minR2) {
    float temp = fixedR2 / minR2;
    pt *= temp;
    dr *= temp;
  } else if (r2 < fixedR2) {
    float temp = fixedR2 / r2;
    pt *= temp;
    dr *= temp;
  }
  return r2;
}

vec2 fzFractal(vec3 pos, float scale, float foldLimit, int iterations, float foldDistort) {
  vec3 pt = pos;
  float dr = 1.0;
  float orbitTrap = 1e10;
  float minR2 = 0.25;
  float fixedR2 = 1.0;

  for (int i = 0; i < 12; i++) {
    if (i >= iterations) break;

    // Box fold with harmonic tension distortion
    pt = fzBoxFold(pt, foldLimit);

    // Asymmetric fold distortion from harmonic tension
    pt.x += foldDistort * 0.1 * sin(float(i) * 1.7);
    pt.z += foldDistort * 0.08 * cos(float(i) * 2.3);

    // Sphere fold
    fzSphereFold(pt, dr, minR2, fixedR2);

    // Scale and translate
    pt = pt * scale + pos;
    dr = dr * abs(scale) + 1.0;

    // Orbit trap: track minimum distance to axes for coloring
    float trapDist = min(length(pt.xz), min(length(pt.xy), length(pt.yz)));
    orbitTrap = min(orbitTrap, trapDist);
  }

  float dist = length(pt) / abs(dr);
  return vec2(dist, orbitTrap);
}

// ─── Scene distance function ───
vec2 fzMap(vec3 pos, float scale, float foldLimit, int iterations, float foldDistort) {
  return fzFractal(pos, scale, foldLimit, iterations, foldDistort);
}

// ─── Orbit trap coloring ───
vec3 fzOrbitTrap(float trap, float hueBase, float hueSecondary, float satMult) {
  // Map orbit trap distance to palette colors
  float t1 = exp(-trap * 3.0);
  float t2 = exp(-trap * 6.0);

  vec3 col1 = hsv2rgb(vec3(hueBase + trap * 0.2, 0.7 * satMult, 0.6 + t1 * 0.3));
  vec3 col2 = hsv2rgb(vec3(hueSecondary + trap * 0.15, 0.8 * satMult, 0.5 + t2 * 0.4));
  vec3 col3 = hsv2rgb(vec3(hueBase + 0.5, 0.5 * satMult, 0.8)); // bright highlight

  return mix(mix(col1, col2, smoothstep(0.0, 0.5, trap)), col3, t2 * 0.3);
}

// ─── Normal estimation via central differences ───
vec3 fzNormal(vec3 pos, float scale, float foldLimit, int iterations, float foldDistort) {
  vec2 offset = vec2(0.001, 0.0);
  float d0 = fzMap(pos, scale, foldLimit, iterations, foldDistort).x;
  return normalize(vec3(
    fzMap(pos + offset.xyy, scale, foldLimit, iterations, foldDistort).x - d0,
    fzMap(pos + offset.yxy, scale, foldLimit, iterations, foldDistort).x - d0,
    fzMap(pos + offset.yyx, scale, foldLimit, iterations, foldDistort).x - d0
  ));
}

// ─── Soft shadow via short-range marching ───
float fzSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float sharpness,
                   float scale, float foldLimit, int iterations, float foldDistort) {
  float shade = 1.0;
  float t_val = mint;
  for (int i = 0; i < 24; i++) {
    if (t_val > maxt) break;
    float d = fzMap(ro + rd * t_val, scale, foldLimit, iterations, foldDistort).x;
    shade = min(shade, sharpness * d / t_val);
    if (d < 0.0005) return 0.0;
    t_val += clamp(d, 0.005, 0.2);
  }
  return clamp(shade, 0.0, 1.0);
}

// ─── Ambient occlusion via distance-field sampling ───
float fzAmbientOcclusion(vec3 pos, vec3 norm, float scale, float foldLimit, int iterations, float foldDistort) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float hr = 0.01 + 0.06 * float(i);
    float dd = fzMap(pos + norm * hr, scale, foldLimit, iterations, foldDistort).x;
    occ += (hr - dd) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

void main() {
  vec2 screenUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 pixelPos = (screenUv - 0.5) * aspect;

  // ─── Audio parameter extraction ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumSnap = clamp(uDrumOnset, 0.0, 1.0);
  float vocalGlow = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float climax = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float melPitch = uMelodicPitch * uMelodicConfidence;
  float beatPulseVal = clamp(uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence), 0.0, 1.0);
  float timbralSheen = clamp(uTimbralBrightness, 0.0, 1.0);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  // jam (5): deep zoom into fractal interior
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  // space (7): pulled back, contemplative
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  // chorus (2): full detail, vivid
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // solo (4): dramatic, tight camera
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Fractal parameters ───
  // Scale: bass opens cavities (negative scale inverts geometry)
  float fzScale = -2.0 - bass * 0.8 + climax * 0.3;
  // Climax: dramatic structural shift
  fzScale += sin(climax * FZ_PI * 0.5) * 0.5 * climaxI;

  // Fold limit: drum onset snaps geometry
  float fzFoldLimit = 1.0 + drumSnap * 0.3 + tension * 0.2;

  // Iteration count: energy drives detail level
  int fzIterations = 4 + int(energy * 4.0);
  // Chorus: full detail; space: reduced
  fzIterations += int(sChorus * 2.0);
  fzIterations -= int(sSpace * 2.0);
  // Clamp to safe range
  fzIterations = max(4, min(fzIterations, 10));

  // Fold distortion from harmonic tension
  float fzFoldDistort = tension * 0.8 + drumSnap * 0.3;

  // ─── Camera path: fly through fractal interior ───
  float camSpeed = 0.15 + slowE * 0.1;
  // Section speed modifiers
  camSpeed *= 1.0 + sJam * 0.5 - sSpace * 0.6 + sSolo * 0.2;

  float camTime = uDynamicTime * camSpeed;

  // Winding path through fractal cavities
  vec3 camPos = vec3(
    sin(camTime * 0.37) * 1.5 + cos(camTime * 0.13) * 0.8,
    sin(camTime * 0.23) * 0.8 + melPitch * 0.5,
    camTime * 0.8 + sin(camTime * 0.41) * 0.5
  );

  // Jam: push camera deeper into tight spaces
  camPos *= 1.0 - sJam * 0.3;
  // Space: pull camera back to see more structure
  camPos *= 1.0 + sSpace * 0.6;

  // Look-at point: slightly ahead on the path
  float lookAhead = 0.5 + energy * 0.3;
  float futureTime = camTime + lookAhead;
  vec3 camLookAt = vec3(
    sin(futureTime * 0.37) * 1.5 + cos(futureTime * 0.13) * 0.8,
    sin(futureTime * 0.23) * 0.8 + melPitch * 0.5,
    futureTime * 0.8 + sin(futureTime * 0.41) * 0.5
  );
  camLookAt *= 1.0 - sJam * 0.3;
  camLookAt *= 1.0 + sSpace * 0.6;

  // ─── Camera matrix ───
  vec3 camForward = normalize(camLookAt - camPos);
  vec3 camWorldUp = vec3(sin(camTime * 0.07) * 0.15, 1.0, 0.0); // gentle roll
  vec3 camSide = normalize(cross(camForward, camWorldUp));
  vec3 camVertical = cross(camSide, camForward);

  // FOV: tighter during solo, wider during space
  float fov = 1.2 + sSolo * 0.3 - sSpace * 0.2;

  // Ray direction
  vec3 rayDir = normalize(pixelPos.x * camSide + pixelPos.y * camVertical + fov * camForward);

  // ─── Raymarching ───
  float totalDist = 0.0;
  float orbitTrap = 0.0;
  bool surfaceFound = false;
  int marchSteps = 0;

  for (int i = 0; i < FZ_MAX_STEPS; i++) {
    vec3 marchPos = camPos + rayDir * totalDist;
    vec2 mapResult = fzMap(marchPos, fzScale, fzFoldLimit, fzIterations, fzFoldDistort);
    float stepDist = mapResult.x;
    orbitTrap = mapResult.y;
    marchSteps = i;

    if (stepDist < FZ_SURF_DIST) {
      surfaceFound = true;
      break;
    }
    if (totalDist > FZ_MAX_DIST) break;

    totalDist += stepDist * 0.7; // conservative stepping for fractal safety
  }

  vec3 col = vec3(0.0);

  if (surfaceFound) {
    vec3 surfPos = camPos + rayDir * totalDist;

    // ─── Surface normal ───
    vec3 norm = fzNormal(surfPos, fzScale, fzFoldLimit, fzIterations, fzFoldDistort);

    // ─── Lighting ───
    // Two-point lighting: key + fill
    vec3 lightDir1 = normalize(vec3(0.8, 1.0, -0.3));
    vec3 lightDir2 = normalize(vec3(-0.5, 0.3, 0.8));
    vec3 lightCol1 = vec3(1.0, 0.95, 0.9) * (1.0 + beatPulseVal * 0.3);
    vec3 lightCol2 = vec3(0.4, 0.5, 0.7);

    // Diffuse
    float diff1 = max(dot(norm, lightDir1), 0.0);
    float diff2 = max(dot(norm, lightDir2), 0.0);

    // Specular (Blinn-Phong)
    vec3 viewDir = normalize(camPos - surfPos);
    vec3 halfDir1 = normalize(lightDir1 + viewDir);
    vec3 halfDir2 = normalize(lightDir2 + viewDir);
    float specPow = 32.0 + timbralSheen * 64.0; // metallic sheen from timbral brightness
    float spec1 = pow(max(dot(norm, halfDir1), 0.0), specPow);
    float spec2 = pow(max(dot(norm, halfDir2), 0.0), specPow * 0.5);

    // Soft shadow from key light
    float shadow = fzSoftShadow(surfPos + norm * 0.01, lightDir1, 0.02, 5.0, 8.0,
                                fzScale, fzFoldLimit, fzIterations, fzFoldDistort);

    // Ambient occlusion
    float occl = fzAmbientOcclusion(surfPos, norm, fzScale, fzFoldLimit, fzIterations, fzFoldDistort);

    // ─── Orbit trap coloring ───
    float hueBase = uPalettePrimary + uChromaHue / 360.0;
    float hueSecondary = uPaletteSecondary + uChromaHue / 360.0;
    vec3 surfCol = fzOrbitTrap(orbitTrap, hueBase, hueSecondary, uPaletteSaturation);

    // ─── Composite lighting ───
    vec3 ambient = surfCol * 0.15 * occl;
    vec3 diffuse = surfCol * (diff1 * lightCol1 * shadow + diff2 * lightCol2 * 0.4);
    float specIntensity = 0.3 + timbralSheen * 0.4 + beatPulseVal * 0.2;
    vec3 specular = (spec1 * lightCol1 + spec2 * lightCol2 * 0.3) * specIntensity;

    col = ambient + diffuse + specular;

    // ─── Interior glow from vocal presence ───
    // Deep cavities glow warmly when vocals are present
    float cavityDepth = 1.0 - occl; // deeper cavities have lower AO
    vec3 glowCol = hsv2rgb(vec3(hueBase + 0.1, 0.6 * uPaletteSaturation, 0.8));
    col += glowCol * cavityDepth * vocalGlow * 0.5;

    // ─── Distance fog inside cavern ───
    float fogDist = 1.0 - exp(-totalDist * 0.08);
    vec3 fogCol = hsv2rgb(vec3(hueSecondary, 0.3 * uPaletteSaturation, 0.1));
    col = mix(col, fogCol, fogDist * 0.6);

  } else {
    // ─── Background: deep void with subtle nebula ───
    float bgNoise = fbm3(vec3(rayDir.xy * 3.0, uDynamicTime * 0.02));
    float hueBase = uPalettePrimary + uChromaHue / 360.0;
    col = hsv2rgb(vec3(hueBase + bgNoise * 0.1, 0.4 * uPaletteSaturation, 0.03 + bgNoise * 0.04));

    // Vocal glow in void areas
    col += hsv2rgb(vec3(uPaletteSecondary, 0.5, 0.05)) * vocalGlow * 0.3;

    // Glow from near-misses (ray got close but didn't converge)
    float glowFactor = float(marchSteps) / float(FZ_MAX_STEPS);
    vec3 nearGlow = hsv2rgb(vec3(uPaletteSecondary + 0.15, 0.7 * uPaletteSaturation, 0.6));
    col += nearGlow * glowFactor * glowFactor * 0.25;
  }

  // ─── Climax transformation ───
  if (climax > 1.5) {
    // Intensify colors and add chromatic bloom during climax
    col *= 1.2 + climaxI * 0.3;
    vec3 lumVec = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
    col = mix(lumVec, col, 1.2 + climaxI * 0.3); // boost saturation
  }

  // ─── Semantic modulation ───
  col *= 1.0 + uSemanticPsychedelic * 0.15;
  col *= 1.0 + uSemanticCosmic * 0.1;

  // ─── Dead Iconography ───
  vec2 iconUv = (screenUv - 0.5) * aspect;
  float iconNoise = snoise(vec3(iconUv * 2.0, uTime * 0.1));
  float hueShift = uChromaHue / 360.0 + float(uChordIndex) * 0.083;
  vec3 iconCol1 = hsv2rgb(vec3(uPalettePrimary + hueShift, 0.8 * uPaletteSaturation, 0.7));
  vec3 iconCol2 = hsv2rgb(vec3(uPaletteSecondary + hueShift, 0.7 * uPaletteSaturation, 0.8));
  col += iconEmergence(iconUv, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(iconUv, uTime, energy, bass, iconCol1, iconCol2, iconNoise, uSectionIndex);

  // ─── Post-processing ───
  vec2 postUv = screenUv;
  vec2 postP = (postUv - 0.5) * aspect;
  col = applyPostProcess(col, postUv, postP);

  // ─── Feedback trails ───
  vec3 prev = texture2D(uPrevFrame, screenUv).rgb;
  float baseDecay = mix(0.92, 0.88, energy);
  // Section-type feedback: jam=long trails, space=long ethereal, chorus=fast refresh
  float feedbackDecay = baseDecay + sJam * 0.04 + sSpace * 0.05 - sChorus * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.96);
  // Jam phase modulation
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.04 - jpResolve * 0.05;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.96);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
