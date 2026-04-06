/**
 * Blacklight Chamber — raymarched UV-lit room with fluorescent surfaces.
 * Full 3D SDF scene: a dark chamber illuminated by UV blacklight tubes.
 * Fluorescent paint patterns on walls emit vivid neon under UV excitation.
 * Glowing posters, neon body paint drips, and UV-reactive surface regions.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → overall UV excitation intensity, room brightness
 *   uBass             → wall pulse breathing, drip speed
 *   uHighs            → fluorescent sparkle sharpness, specular on tubes
 *   uOnsetSnap        → new paint drip trigger, UV flash
 *   uBeatSnap         → tube flicker sync, paint glow pulse
 *   uSlowEnergy       → drift of paint patterns on walls
 *   uHarmonicTension  → paint pattern complexity, color saturation shift
 *   uBeatStability    → tube flicker steadiness (high=steady, low=strobing)
 *   uMelodicPitch     → vertical position of brightest paint band
 *   uChromaHue        → hue rotation of fluorescent paint palette
 *   uChordIndex       → micro-rotate fluorescent hue per chord
 *   uVocalEnergy      → warm glow on central wall region
 *   uSpectralFlux     → paint pattern mutation rate
 *   uSectionType      → jam=strobing tubes, space=dim ambient UV, solo=spotlight
 *   uClimaxPhase      → full UV saturation blast
 *   uPalettePrimary/Secondary → base fluorescent colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const blacklightGlowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const blacklightGlowFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 96
#define MAX_DIST 20.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — bg2 namespace
// ═══════════════════════════════════════════════════════════

float bg2SdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float bg2SdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float bg2SdCylinder(vec3 pos, float radius, float halfH) {
  vec2 dxy = vec2(length(pos.xz) - radius, abs(pos.y) - halfH);
  return min(max(dxy.x, dxy.y), 0.0) + length(max(dxy, 0.0));
}

float bg2SdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

float bg2SdRoundBox(vec3 pos, vec3 bounds, float rad) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rad;
}

float bg2SdTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float bg2SmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════════
// Paint pattern functions — UV-reactive fluorescent regions
// ═══════════════════════════════════════════════════════════

float bg2PaintPattern(vec3 pos, float complexity, float flowTime) {
  // Layered organic paint shapes on surfaces
  vec3 patternPos = pos * 2.5;
  patternPos.x += snoise(vec3(pos.yz * 1.5, flowTime * 0.08)) * 0.3 * complexity;
  float n1 = fbm6(patternPos + vec3(flowTime * 0.05, 0.0, 0.0));
  float n2 = fbm3(patternPos * 2.0 + 10.0 + vec3(0.0, flowTime * 0.03, 0.0));
  float pattern = smoothstep(0.1, 0.4, n1) * (0.6 + 0.4 * n2);
  // Drip streaks: vertical bias
  float drips = smoothstep(0.2, 0.6, fbm3(vec3(pos.x * 5.0, pos.y * 1.5 - flowTime * 0.1, pos.z * 5.0)));
  pattern += drips * 0.4;
  return clamp(pattern, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — the blacklight chamber
// ═══════════════════════════════════════════════════════════

vec2 bg2SceneSDF(vec3 pos, float bassBreath, float flowTime) {
  // Material IDs: 0=wall, 1=floor, 2=ceiling, 3=tube, 4=poster, 5=drip
  float matId = 0.0;

  // Room box: inverted (we are inside)
  vec3 roomSize = vec3(4.0, 3.0, 6.0);
  float roomWalls = -bg2SdBox(pos, roomSize);

  // Floor with slight waviness
  float floorWave = snoise(vec3(pos.xz * 0.5, flowTime * 0.02)) * 0.03;
  float floorPlane = pos.y + 2.8 + floorWave;
  float ceilingPlane = -(pos.y - 2.8);

  float minDist = roomWalls;

  // Floor
  if (floorPlane < minDist) { minDist = floorPlane; matId = 1.0; }
  // Ceiling
  if (ceilingPlane < minDist) { minDist = ceilingPlane; matId = 2.0; }

  // UV Blacklight tubes (3 long cylinders on ceiling)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float tubeX = (fi - 1.0) * 2.2;
    vec3 tubePos = pos - vec3(tubeX, 2.5, 0.0);
    float tube = bg2SdCappedCylinder(tubePos.xzy, 0.06, 4.5);
    // Tube mount brackets
    float bracket1 = bg2SdBox(pos - vec3(tubeX, 2.65, -2.5), vec3(0.15, 0.12, 0.08));
    float bracket2 = bg2SdBox(pos - vec3(tubeX, 2.65, 2.5), vec3(0.15, 0.12, 0.08));
    float tubeAssembly = min(tube, min(bracket1, bracket2));
    if (tubeAssembly < minDist) { minDist = tubeAssembly; matId = 3.0; }
  }

  // Posters on walls (flat boxes protruding slightly)
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float posterZ = (fi - 1.5) * 2.5;
    // Left wall poster
    vec3 posterPosL = pos - vec3(-3.85, 0.3 * sin(fi * 2.1), posterZ);
    float posterL = bg2SdRoundBox(posterPosL, vec3(0.02, 0.6 + fi * 0.1, 0.5), 0.01);
    if (posterL < minDist) { minDist = posterL; matId = 4.0 + fi * 0.1; }
    // Right wall poster
    vec3 posterPosR = pos - vec3(3.85, 0.2 * cos(fi * 1.7), posterZ);
    float posterR = bg2SdRoundBox(posterPosR, vec3(0.02, 0.5 + fi * 0.08, 0.55), 0.01);
    if (posterR < minDist) { minDist = posterR; matId = 4.0 + fi * 0.1 + 0.5; }
  }

  // Paint drip stalactites from ceiling
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float dx = sin(fi * 3.7 + 1.2) * 3.0;
    float dz = cos(fi * 2.9 + 0.8) * 4.5;
    float dripLen = 0.3 + 0.4 * fract(sin(fi * 127.1) * 43758.5);
    dripLen += bassBreath * 0.15;
    vec3 dripPos = pos - vec3(dx, 2.8 - dripLen * 0.5, dz);
    float drip = bg2SdCappedCylinder(dripPos, 0.02 + 0.01 * sin(pos.y * 8.0), dripLen * 0.5);
    // Drip blob at bottom
    float blob = bg2SdSphere(pos - vec3(dx, 2.8 - dripLen, dz), 0.04);
    float dripShape = bg2SmoothUnion(drip, blob, 0.03);
    if (dripShape < minDist) { minDist = dripShape; matId = 5.0 + fi * 0.1; }
  }

  return vec2(minDist, matId);
}

// ═══════════════════════════════════════════════════════════
// Normal estimation via central differences
// ═══════════════════════════════════════════════════════════

vec3 bg2CalcNormal(vec3 pos, float bassBreath, float flowTime) {
  vec2 eps = vec2(0.003, 0.0);
  float d0 = bg2SceneSDF(pos, bassBreath, flowTime).x;
  return normalize(vec3(
    bg2SceneSDF(pos + eps.xyy, bassBreath, flowTime).x - d0,
    bg2SceneSDF(pos + eps.yxy, bassBreath, flowTime).x - d0,
    bg2SceneSDF(pos + eps.yyx, bassBreath, flowTime).x - d0
  ));
}

// ═══════════════════════════════════════════════════════════
// Ambient occlusion — 5-step
// ═══════════════════════════════════════════════════════════

float bg2CalcAO(vec3 pos, vec3 norm, float bassBreath, float flowTime) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = float(i) * 0.12;
    float sampled = bg2SceneSDF(pos + norm * dist, bassBreath, flowTime).x;
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Soft shadows
// ═══════════════════════════════════════════════════════════

float bg2SoftShadow(vec3 rayOrig, vec3 rayDir, float mint, float maxt, float k, float bassBreath, float flowTime) {
  float result = 1.0;
  float marchT = mint;
  for (int i = 0; i < 32; i++) {
    if (marchT > maxt) break;
    float sceneDist = bg2SceneSDF(rayOrig + rayDir * marchT, bassBreath, flowTime).x;
    if (sceneDist < 0.001) return 0.0;
    result = min(result, k * sceneDist / marchT);
    marchT += max(sceneDist, 0.02);
  }
  return clamp(result, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

void main() {
  vec2 fragUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (fragUv - 0.5) * aspect;

  // Clamp audio inputs
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
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;

  // Section type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float slowTime = uDynamicTime * 0.04;
  float flowTime = uDynamicTime * (0.05 + flux * 0.02) * mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace);
  float bassBreath = 1.0 + bass * 0.15;

  // ═══ Camera setup ═══
  float camSway = sin(slowTime * 0.6) * 0.3 * mix(1.0, 0.2, sSpace);
  float camBob = cos(slowTime * 0.4) * 0.15;
  vec3 camOrigin = vec3(camSway, -0.5 + camBob + melPitch * 0.5, -3.0 + sin(slowTime * 0.2) * 1.5);
  vec3 camLookAt = vec3(sin(slowTime * 0.3) * 1.5, 0.0 + melPitch * 0.8, 2.0);

  // Solo: tighter look
  camLookAt = mix(camLookAt, vec3(0.0, 0.3, 3.0), sSolo * 0.5);

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);
  float fov = 1.2 + bass * 0.15;
  vec3 rayDir = normalize(screenPos.x * camRt + screenPos.y * camUpDir + fov * camFwd);

  // ═══ Raymarch ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = bg2SceneSDF(marchPos, bassBreath, flowTime);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8;
  }

  // ═══ Palette colors ═══
  float hue1 = uPalettePrimary + chromaH * 0.2 + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.3, 1.0, energy) * uPaletteSaturation;

  // Fluorescent neon palette (UV-reactive colors)
  vec3 neonGreen = hsv2rgb(vec3(0.33 + chromaH * 0.1, 0.95, 1.0));
  vec3 neonPink = hsv2rgb(vec3(0.92 + chromaH * 0.05, 0.9, 1.0));
  vec3 neonBlue = hsv2rgb(vec3(0.65 + chromaH * 0.08, 0.95, 1.0));
  vec3 neonOrange = hsv2rgb(vec3(0.08 + chromaH * 0.06, 0.95, 1.0));
  vec3 palCol1 = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.85));

  // UV light color (deep violet)
  vec3 uvLightColor = vec3(0.15, 0.02, 0.45);

  vec3 col = vec3(0.005, 0.003, 0.012); // near-black background

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = bg2CalcNormal(hitPos, bassBreath, flowTime);
    float ambOcc = bg2CalcAO(hitPos, normal, bassBreath, flowTime);

    // UV light positions (matching tube positions on ceiling)
    vec3 uvLight1 = vec3(-2.2, 2.5, 0.0);
    vec3 uvLight2 = vec3(0.0, 2.5, 0.0);
    vec3 uvLight3 = vec3(2.2, 2.5, 0.0);

    // UV tube flicker
    float flickerBase = mix(0.7, 1.0, stability);
    float flicker1 = flickerBase + 0.3 * sin(uDynamicTime * 12.0 + 0.0) * (1.0 - stability);
    float flicker2 = flickerBase + 0.3 * sin(uDynamicTime * 14.0 + 2.1) * (1.0 - stability);
    float flicker3 = flickerBase + 0.3 * sin(uDynamicTime * 11.0 + 4.2) * (1.0 - stability);

    // Jam: strobing tubes
    float strobeGate = sJam * step(0.5, fract(uMusicalTime * 2.0));
    flicker1 *= 1.0 + strobeGate * 0.5;
    flicker2 *= 1.0 + strobeGate * 0.5;

    // UV intensity scales with energy
    float uvIntensity = mix(0.15, 1.0, energy) * mix(1.0, 0.3, sSpace) + climaxBoost * 0.4;

    // ═══ Lighting: 3 UV point lights ═══
    float diffuseAccum = 0.0;
    float specAccum = 0.0;
    float fresnelAccum = 0.0;

    vec3 uvLights[3];
    uvLights[0] = uvLight1;
    uvLights[1] = uvLight2;
    uvLights[2] = uvLight3;
    float flickers[3];
    flickers[0] = flicker1;
    flickers[1] = flicker2;
    flickers[2] = flicker3;

    for (int li = 0; li < 3; li++) {
      vec3 lightPos = uvLights[li];
      float flick = flickers[li];
      vec3 toLight = lightPos - hitPos;
      float lightDist = length(toLight);
      vec3 lightDir = toLight / lightDist;
      float atten = flick / (1.0 + lightDist * lightDist * 0.3);

      float diff = max(dot(normal, lightDir), 0.0);
      diffuseAccum += diff * atten;

      vec3 halfVec = normalize(lightDir - rayDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 48.0);
      specAccum += spec * atten;

      // Fresnel
      float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);
      fresnelAccum += fresnel * atten * 0.3;
    }

    // ═══ Material shading ═══
    vec3 surfaceColor = vec3(0.02, 0.015, 0.03); // dark base

    if (matId < 0.5) {
      // Walls: UV-reactive paint
      float paintAmount = bg2PaintPattern(hitPos, 1.0 + tension * 0.5, flowTime);
      float paintMask = smoothstep(0.2, 0.5, paintAmount);
      // Paint color varies by wall position
      float paintHue = fract(hitPos.x * 0.2 + hitPos.z * 0.15 + chromaH * 0.3 + chordHue);
      vec3 paintColor;
      if (paintHue < 0.25) paintColor = neonGreen;
      else if (paintHue < 0.5) paintColor = neonPink;
      else if (paintHue < 0.75) paintColor = neonBlue;
      else paintColor = neonOrange;
      paintColor = mix(paintColor, palCol1, 0.3);
      // UV-excitation glow: paint emits light under UV
      vec3 emission = paintColor * paintMask * uvIntensity * (0.4 + energy * 0.6);
      surfaceColor = vec3(0.01, 0.008, 0.02) + emission;
      // Vocal warmth on central areas
      surfaceColor += vec3(0.04, 0.02, 0.0) * vocalE * smoothstep(1.5, 0.0, abs(hitPos.x));
    } else if (matId < 1.5) {
      // Floor: dark with reflected UV glow
      surfaceColor = vec3(0.008, 0.006, 0.015);
      surfaceColor += uvLightColor * diffuseAccum * 0.15;
    } else if (matId < 2.5) {
      // Ceiling: dark with UV tube mount areas
      surfaceColor = vec3(0.01, 0.008, 0.02);
    } else if (matId < 3.5) {
      // UV tubes: bright purple-white emission
      float tubeGlow = uvIntensity * (0.8 + effectiveBeat * 0.3);
      surfaceColor = vec3(0.4, 0.1, 1.0) * tubeGlow;
      surfaceColor += vec3(0.6, 0.5, 1.0) * tubeGlow * 0.3; // white-hot center
    } else if (matId < 5.0) {
      // Posters: bright fluorescent rectangles
      float posterIndex = fract(matId * 10.0);
      vec3 posterColors[4];
      posterColors[0] = neonPink;
      posterColors[1] = neonGreen;
      posterColors[2] = neonBlue;
      posterColors[3] = neonOrange;
      int pIdx = int(posterIndex * 4.0);
      vec3 posterColor = posterColors[0];
      if (pIdx == 1) posterColor = posterColors[1];
      if (pIdx == 2) posterColor = posterColors[2];
      if (pIdx == 3) posterColor = posterColors[3];
      posterColor = mix(posterColor, palCol2, 0.3);
      // Poster detail: noise pattern
      float posterNoise = fbm3(vec3(hitPos.yz * 4.0, flowTime * 0.1 + posterIndex * 10.0));
      posterColor *= 0.6 + 0.4 * posterNoise;
      surfaceColor = posterColor * uvIntensity * (0.5 + energy * 0.5);
    } else {
      // Paint drips: bright neon emission
      float dripIndex = fract(matId * 10.0);
      vec3 dripColor = mix(neonGreen, neonPink, dripIndex);
      dripColor = mix(dripColor, palCol1, 0.25);
      surfaceColor = dripColor * uvIntensity * (0.6 + bass * 0.4);
      // Drip glow pulsing
      surfaceColor *= 1.0 + effectiveBeat * 0.3;
    }

    // Apply lighting
    col = surfaceColor;
    col += uvLightColor * diffuseAccum * 0.2 * uvIntensity;
    col += vec3(0.6, 0.4, 1.0) * specAccum * (0.3 + highs * 0.4);
    col += uvLightColor * fresnelAccum * uvIntensity * 0.5;
    col *= ambOcc;

    // Distance fog: UV-tinted
    float fogDist = totalDist / MAX_DIST;
    vec3 fogColor = uvLightColor * 0.08 * uvIntensity;
    col = mix(col, fogColor, smoothstep(0.0, 1.0, fogDist * fogDist));

  } else {
    // Background: deep UV void
    col = vec3(0.003, 0.002, 0.008);
  }

  // ═══ Volumetric UV light shafts ═══
  {
    float uvShaft = 0.0;
    for (int i = 0; i < 16; i++) {
      float marchT = float(i) * 0.8 + 0.3;
      vec3 samplePos = camOrigin + rayDir * marchT;
      // Distance to nearest UV tube
      for (int t = 0; t < 3; t++) {
        float tubeX = (float(t) - 1.0) * 2.2;
        vec3 tubePos = vec3(tubeX, 2.5, 0.0);
        float distToTube = length(samplePos - tubePos);
        float scatter = exp(-distToTube * 0.6) * 0.02;
        // Haze density from noise
        float haze = fbm3(vec3(samplePos * 0.3, flowTime * 0.1)) * 0.5 + 0.5;
        uvShaft += scatter * haze;
      }
    }
    float uvVolIntensity = mix(0.15, 1.0, energy) * mix(1.0, 0.3, sSpace) + climaxBoost * 0.3;
    col += uvLightColor * uvShaft * uvVolIntensity * 1.5;
  }

  // ═══ Beat flash ═══
  col *= 1.0 + effectiveBeat * 0.25;

  // ═══ Onset UV blast ═══
  if (onset > 0.3) {
    col += uvLightColor * (onset - 0.3) * 1.5 * energy;
    col += neonPink * (onset - 0.3) * 0.3;
  }

  // ═══ Climax full UV saturation ═══
  col *= 1.0 + climaxBoost * 0.5;

  // ═══ Vignette ═══
  float vigScale = mix(0.32, 0.24, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.002, 0.008), col, vignette);

  // ═══ Icon emergence ═══
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // ═══ Post-processing ═══
  col = applyPostProcess(col, vUv, screenPos);

  // ═══ Feedback trails ═══
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.92, 0.85, energy);
  float feedbackDecay = clamp(baseDecay + sJam * 0.04 + sSpace * 0.06, 0.80, 0.97);
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
