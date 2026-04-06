/**
 * Molten Glass — raymarched glassblowing scene.
 * A glob of molten glass on a blowpipe, rotating and stretching.
 * The glass is translucent with internal color swirls, surface tension shaping,
 * gravity pulling it downward. Hot orange core, cooler amber edges.
 * Full 3D SDF raymarching with subsurface scattering and refraction.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → glass temperature (glow intensity), rotation speed
 *   uBass             → glass mass pulse, gravity sag amount
 *   uHighs            → surface specular sharpness, refraction detail
 *   uOnsetSnap        → crack/burst in glass surface, bubble ejection
 *   uBeatSnap         → rotation sync pulse, internal swirl speed
 *   uSlowEnergy       → ambient kiln glow, drift speed
 *   uHarmonicTension  → internal stress patterns, color complexity
 *   uBeatStability    → glass stability (high=smooth, low=molten chaos)
 *   uMelodicPitch     → glass stretch height, color temperature shift
 *   uChromaHue        → internal color swirl palette shift
 *   uChordIndex       → color band micro-rotation
 *   uVocalEnergy      → core brightness (blowpipe heat)
 *   uSpectralFlux     → bubble formation rate
 *   uSectionType      → jam=vigorous rotation, space=gentle cooling, solo=focused shape
 *   uClimaxPhase      → white-hot maximum emission
 *   uPalettePrimary/Secondary → glass color palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const moltenGlassVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const moltenGlassFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true, caEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 96
#define MAX_DIST 15.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — mgl namespace
// ═══════════════════════════════════════════════════════════

float mglSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float mglSdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

float mglSdEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float mglSdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float mglSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float mglSmoothSub(float d1, float d2, float k) {
  float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
  return mix(d1, -d2, h) + k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════════
// Molten glass blob SDF — tear-shaped mass with surface tension
// ═══════════════════════════════════════════════════════════

float mglGlassBlob(vec3 pos, float bassPulse, float rotAngle, float stability, float flowTime) {
  // Rotate around blowpipe axis (Y)
  float cr = cos(rotAngle);
  float sr = sin(rotAngle);
  pos.xz = mat2(cr, -sr, sr, cr) * pos.xz;

  // Main glass mass: ellipsoid
  vec3 mainRadii = vec3(0.6, 0.8 + bassPulse * 0.15, 0.6);
  // Gravity sag: the bottom stretches downward
  float gravitySag = (1.0 - stability) * 0.3;
  pos.y += smoothstep(0.0, -0.8, pos.y) * gravitySag;

  float mainBody = mglSdEllipsoid(pos, mainRadii);

  // Surface tension noise — organic glass surface
  float surfaceNoise = snoise(vec3(pos * 3.0 + flowTime * 0.2)) * 0.05;
  surfaceNoise += snoise(vec3(pos * 7.0 + flowTime * 0.3)) * 0.02;
  mainBody += surfaceNoise * (0.3 + stability * 0.7);

  // Neck (where it attaches to blowpipe): taper toward top
  vec3 neckPos = pos - vec3(0.0, 0.9, 0.0);
  float neck = mglSdCappedCylinder(neckPos, 0.15, 0.3);
  mainBody = mglSmoothUnion(mainBody, neck, 0.2);

  // Bottom drip: gravity pulls a tear drop
  vec3 dripPos = pos - vec3(0.0, -1.0 - gravitySag * 0.5, 0.0);
  float drip = mglSdEllipsoid(dripPos, vec3(0.15, 0.3, 0.15));
  mainBody = mglSmoothUnion(mainBody, drip, 0.15);

  // Internal bubbles (onset-triggered)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float bubbleAngle = fi * TAU / 3.0 + flowTime * 0.5;
    float bubbleR = 0.3 + fi * 0.1;
    vec3 bubblePos = pos - vec3(
      cos(bubbleAngle) * bubbleR * 0.4,
      sin(flowTime * 0.3 + fi * 2.0) * 0.3,
      sin(bubbleAngle) * bubbleR * 0.4
    );
    float bubble = mglSdSphere(bubblePos, 0.05 + 0.02 * sin(flowTime * 2.0 + fi));
    mainBody = mglSmoothSub(mainBody, bubble, 0.03);
  }

  return mainBody;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — glass + blowpipe + kiln environment
// ═══════════════════════════════════════════════════════════

vec2 mglSceneSDF(vec3 pos, float bassPulse, float rotAngle, float stability, float flowTime) {
  float matId = 0.0;
  float minDist = 100.0;

  // Molten glass blob
  vec3 glassPos = pos - vec3(0.0, 0.0, 0.0);
  float glass = mglGlassBlob(glassPos, bassPulse, rotAngle, stability, flowTime);
  if (glass < minDist) { minDist = glass; matId = 0.0; }

  // Blowpipe: long thin cylinder extending upward
  vec3 pipePos = pos - vec3(0.0, 1.8, 0.0);
  float pipe = mglSdCappedCylinder(pipePos, 0.04, 1.5);
  if (pipe < minDist) { minDist = pipe; matId = 1.0; }

  // Kiln opening: curved arch behind the glass
  vec3 kilnPos = pos - vec3(0.0, 0.0, 2.5);
  float kilnOuter = mglSdSphere(kilnPos, 1.5);
  float kilnInner = mglSdSphere(kilnPos, 1.3);
  float kilnCut = mglSdBox(kilnPos - vec3(0.0, 0.0, -1.0), vec3(2.0, 2.0, 1.0));
  float kiln = max(kilnOuter, -kilnInner);
  kiln = max(kiln, kilnCut); // open front
  if (kiln < minDist) { minDist = kiln; matId = 2.0; }

  // Kiln interior glow (emissive back wall)
  float kilnBack = mglSdSphere(kilnPos - vec3(0.0, 0.0, 0.3), 1.0);
  if (kilnBack < minDist) { minDist = kilnBack; matId = 3.0; }

  // Work surface (table)
  float table = mglSdBox(pos - vec3(0.0, -2.0, 0.0), vec3(2.5, 0.1, 2.0));
  if (table < minDist) { minDist = table; matId = 4.0; }

  return vec2(minDist, matId);
}

// ═══════════════════════════════════════════════════════════
// Normal, AO
// ═══════════════════════════════════════════════════════════

vec3 mglCalcNormal(vec3 pos, float bassPulse, float rotAngle, float stability, float flowTime) {
  vec2 eps = vec2(0.002, 0.0);
  float d0 = mglSceneSDF(pos, bassPulse, rotAngle, stability, flowTime).x;
  return normalize(vec3(
    mglSceneSDF(pos + eps.xyy, bassPulse, rotAngle, stability, flowTime).x - d0,
    mglSceneSDF(pos + eps.yxy, bassPulse, rotAngle, stability, flowTime).x - d0,
    mglSceneSDF(pos + eps.yyx, bassPulse, rotAngle, stability, flowTime).x - d0
  ));
}

float mglCalcAO(vec3 pos, vec3 norm, float bassPulse, float rotAngle, float stability, float flowTime) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = float(i) * 0.08;
    float sampled = mglSceneSDF(pos + norm * dist, bassPulse, rotAngle, stability, flowTime).x;
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 3.0, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Internal color swirl — subsurface scattering approximation
// ═══════════════════════════════════════════════════════════

vec3 mglInternalColor(vec3 pos, float flowTime, float chromaH, float chordHue, float hue1, float hue2) {
  // Swirling internal color bands
  float swirl = fbm6(vec3(pos * 2.0 + flowTime * 0.15, sin(pos.y * 3.0 + flowTime * 0.2)));
  float band = sin(pos.y * 5.0 + swirl * 3.0 + flowTime * 0.3) * 0.5 + 0.5;

  // Color 1: hot orange-red core
  vec3 hotCore = hsv2rgb(vec3(hue1 + chromaH * 0.1 + chordHue, 0.9, 1.0));
  hotCore = mix(hotCore, vec3(1.0, 0.5, 0.1), 0.3);

  // Color 2: cooler amber edge
  vec3 coolEdge = hsv2rgb(vec3(hue2 + chromaH * 0.08 + chordHue * 0.5, 0.7, 0.8));
  coolEdge = mix(coolEdge, vec3(0.8, 0.6, 0.2), 0.3);

  // Color 3: accent swirl
  vec3 accent = hsv2rgb(vec3(fract(hue1 + 0.3 + chromaH * 0.15), 0.85, 0.9));

  vec3 internalCol = mix(hotCore, coolEdge, band);
  internalCol = mix(internalCol, accent, swirl * 0.3);

  return internalCol;
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

void main() {
  vec2 fragUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (fragUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float flowTime = uDynamicTime * (0.08 + flux * 0.03);
  float bassPulse = bass;

  // Glass rotation speed: energy-driven
  float rotSpeed = (0.3 + energy * 0.8) * mix(1.0, 1.8, sJam) * mix(1.0, 0.2, sSpace);
  float rotAngle = uDynamicTime * rotSpeed;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.1 + chordHue;
  float hue2 = uPaletteSecondary + chromaH * 0.08;
  float sat = mix(0.6, 0.95, energy) * uPaletteSaturation;
  vec3 palCol1 = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.85));

  // Temperature: glass glow temperature
  float glassTemp = mix(0.2, 1.0, energy) + vocalE * 0.3 + climaxBoost * 0.3;

  // ═══ Camera ═══
  float slowTime = uDynamicTime * 0.03;
  float camAngle = slowTime * 0.4;
  float camDist = 3.5 + sin(slowTime * 0.3) * 0.5;
  vec3 camOrigin = vec3(
    cos(camAngle) * camDist,
    0.5 + melPitch * 0.8 + cos(slowTime * 0.25) * 0.3,
    sin(camAngle) * camDist - 1.0
  );
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);
  float fov = 1.3;
  vec3 rayDir = normalize(screenPos.x * camRt + screenPos.y * camUpDir + fov * camFwd);

  // ═══ Raymarch ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = mglSceneSDF(marchPos, bassPulse, rotAngle, stability, flowTime);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.7;
  }

  // Background: dark workshop with kiln glow
  vec3 col = vec3(0.02, 0.015, 0.01);
  // Kiln warm ambient
  col += vec3(0.06, 0.03, 0.01) * smoothstep(0.3, 0.7, 1.0 - length(screenPos));

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = mglCalcNormal(hitPos, bassPulse, rotAngle, stability, flowTime);
    float ambOcc = mglCalcAO(hitPos, normal, bassPulse, rotAngle, stability, flowTime);

    // Kiln light (warm, from behind)
    vec3 kilnLightDir = normalize(vec3(0.0, 0.2, 1.0));
    float kilnDiff = max(dot(normal, kilnLightDir), 0.0);

    // Key light (from above-right)
    vec3 keyLightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(normal, keyLightDir), 0.0);
    vec3 halfVec = normalize(keyLightDir - rayDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 24.0 + highs * 64.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 4.0);

    if (matId < 0.5) {
      // MOLTEN GLASS — the star of the show
      vec3 internalCol = mglInternalColor(hitPos, flowTime, chromaH, chordHue, hue1, hue2);

      // Subsurface scattering: light transmission through glass
      float sss = pow(max(dot(-normal, kilnLightDir), 0.0), 2.0) * 0.5;
      sss += pow(max(dot(-normal, keyLightDir), 0.0), 3.0) * 0.3;

      // Glass surface: translucent emission
      vec3 emissionColor = internalCol * glassTemp;
      vec3 surfaceColor = emissionColor * (0.3 + sss * 0.7);

      // Surface specular (glass is reflective)
      surfaceColor += vec3(1.0, 0.95, 0.85) * spec * (0.4 + highs * 0.6);

      // Fresnel rim (glass edge glow)
      vec3 rimColor = mix(internalCol, vec3(1.0, 0.8, 0.5), 0.5);
      surfaceColor += rimColor * fresnel * glassTemp * 0.8;

      // Diffuse from key + kiln
      surfaceColor += internalCol * (diff * 0.15 + kilnDiff * 0.2);

      // Beat pulse: glass heats on beat
      surfaceColor *= 1.0 + effectiveBeat * 0.2;

      // Onset: bubble burst flash
      surfaceColor += vec3(1.0, 0.9, 0.7) * onset * 0.3 * energy;

      col = surfaceColor;
    } else if (matId < 1.5) {
      // Blowpipe: metallic steel
      vec3 metalCol = vec3(0.35, 0.35, 0.38);
      col = metalCol * (0.1 + diff * 0.3);
      col += vec3(0.6, 0.6, 0.65) * spec * 0.4;
      col += metalCol * fresnel * 0.1;
      // Heat glow near glass connection
      float heatGrad = smoothstep(1.2, 0.8, hitPos.y);
      col += vec3(0.8, 0.3, 0.05) * heatGrad * glassTemp * 0.3;
    } else if (matId < 2.5) {
      // Kiln exterior: refractory brick
      vec3 brickCol = vec3(0.12, 0.06, 0.03);
      col = brickCol * (0.3 + diff * 0.2);
    } else if (matId < 3.5) {
      // Kiln interior: orange-white glow
      vec3 kilnGlow = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.9, 0.7), energy);
      col = kilnGlow * (0.4 + energy * 0.6 + vocalE * 0.2);
    } else {
      // Work surface
      vec3 tableCol = vec3(0.06, 0.05, 0.04);
      col = tableCol * (0.2 + diff * 0.15);
      col += vec3(0.8, 0.4, 0.1) * kilnDiff * 0.05;
    }

    col *= ambOcc;

    float fogDist = totalDist / MAX_DIST;
    col = mix(col, vec3(0.03, 0.02, 0.015), fogDist * fogDist * 0.5);
  }

  // ═══ Volumetric glass glow ═══
  {
    vec3 glassGlow = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float marchT = float(i) * 0.4 + 0.2;
      vec3 samplePos = camOrigin + rayDir * marchT;
      float distToGlass = length(samplePos);
      float glow = exp(-distToGlass * 1.2) * 0.02;
      glow *= glassTemp;
      vec3 glowColor = mix(vec3(1.0, 0.5, 0.1), palCol1, 0.3);
      glassGlow += glowColor * glow;
    }
    col += glassGlow;
  }

  // Heat shimmer
  {
    float shimmer = snoise(vec3(screenPos * 8.0, uDynamicTime * 2.0)) * 0.003 * energy;
    col += col * shimmer * 3.0;
  }

  col *= 1.0 + effectiveBeat * 0.1;
  col *= 1.0 + climaxBoost * 0.4;

  // Vignette
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.015, 0.01, 0.008), col, vignette);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  // Feedback
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.92, 0.85, energy);
  float feedbackDecay = clamp(baseDecay + sJam * 0.04 + sSpace * 0.06, 0.80, 0.97);
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
