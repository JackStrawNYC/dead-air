/**
 * Rain Street — raymarched rainy city street at night. Noir aesthetic.
 * Wet pavement with puddle reflections, falling rain particles, neon sign
 * reflections in puddles, streetlamp volumetric cones, building silhouettes.
 * Full 3D raymarched SDF scene with proper lighting and atmospheric effects.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → rain intensity, puddle activity, lamp brightness
 *   uBass             → ground fog pulse, deep puddle reflections
 *   uHighs            → rain streak sharpness, specular on wet surfaces
 *   uOnsetSnap        → puddle splash burst, lightning flash
 *   uBeatSnap         → puddle ripple sync
 *   uSlowEnergy       → ambient light level, reflection clarity
 *   uHarmonicTension  → fog turbulence, neon flicker
 *   uMelodicPitch     → camera angle shift, neon sign color temp
 *   uChromaHue        → reflected neon color shifts
 *   uChordIndex       → neon palette micro-rotation
 *   uVocalEnergy      → fog density at ground level
 *   uFlatness         → rain streak density
 *   uSpectralFlux     → rain speed variation
 *   uSectionType      → jam=driving rain, space=just puddle reflections, solo=spotlight
 *   uClimaxPhase      → full downpour + lightning
 *   uPalettePrimary/Secondary → neon reflection colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const rainStreetVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const rsNormalGLSL = buildRaymarchNormal("rsSceneSDF($P, flowTime).x", { eps: 0.003, name: "rsCalcNormal" });
const rsAOGLSL = buildRaymarchAO("rsSceneSDF($P, flowTime).x", { steps: 5, stepBase: 0.0, stepScale: 0.12, weightDecay: 0.6, finalMult: 2.5, name: "rsCalcAO" });

export const rainStreetFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "heavy", bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — rs namespace
// ═══════════════════════════════════════════════════════════

float rsSdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float rsSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float rsSdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

float rsSdRoundBox(vec3 pos, vec3 bounds, float rad) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rad;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — the rain-soaked noir street
// ═══════════════════════════════════════════════════════════

vec2 rsSceneSDF(vec3 pos, float flowTime) {
  float matId = 0.0;
  float minDist = 100.0;

  // Street surface: flat ground with puddle depressions
  float puddleNoise = snoise(vec3(pos.x * 2.0, pos.z * 2.0, 0.5)) * 0.03;
  float streetY = pos.y + puddleNoise;
  if (streetY < minDist) { minDist = streetY; matId = 0.0; }

  // Sidewalk curb (left and right)
  float curbL = rsSdBox(pos - vec3(-4.0, 0.08, 0.0), vec3(0.5, 0.08, 20.0));
  if (curbL < minDist) { minDist = curbL; matId = 1.0; }
  float curbR = rsSdBox(pos - vec3(4.0, 0.08, 0.0), vec3(0.5, 0.08, 20.0));
  if (curbR < minDist) { minDist = curbR; matId = 1.0; }

  // Buildings: left side
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float buildZ = fi * 5.0 - 5.0;
    float buildH = 4.0 + 2.0 * fract(sin(fi * 127.1) * 43758.5);
    float buildW = 2.0 + 0.5 * fract(sin(fi * 311.7) * 43758.5);
    float building = rsSdBox(pos - vec3(-6.0 - buildW, buildH * 0.5, buildZ), vec3(buildW, buildH * 0.5, 2.0));
    if (building < minDist) { minDist = building; matId = 2.0 + fi * 0.1; }
  }

  // Buildings: right side
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float buildZ = fi * 5.0 - 3.0;
    float buildH = 3.5 + 2.5 * fract(sin((fi + 10.0) * 127.1) * 43758.5);
    float buildW = 1.8 + 0.8 * fract(sin((fi + 10.0) * 311.7) * 43758.5);
    float building = rsSdBox(pos - vec3(6.0 + buildW, buildH * 0.5, buildZ), vec3(buildW, buildH * 0.5, 2.0));
    if (building < minDist) { minDist = building; matId = 2.0 + (fi + 4.0) * 0.1; }
  }

  // Street lamps (2 tall poles with spherical lights)
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float lampX = mix(-3.5, 3.5, fi);
    float lampZ = mix(-2.0, 5.0, fi);
    // Pole
    vec3 polePos = pos - vec3(lampX, 2.0, lampZ);
    float pole = rsSdCappedCylinder(polePos, 0.05, 2.0);
    // Arm
    vec3 armPos = pos - vec3(lampX + (fi < 0.5 ? 0.3 : -0.3), 3.8, lampZ);
    float arm = rsSdBox(armPos, vec3(0.3, 0.02, 0.02));
    // Lamp head
    vec3 lampHeadPos = pos - vec3(lampX + (fi < 0.5 ? 0.5 : -0.5), 3.7, lampZ);
    float lampHead = rsSdSphere(lampHeadPos, 0.12);
    float lamp = min(pole, min(arm, lampHead));
    if (lamp < minDist) { minDist = lamp; matId = 3.0 + fi * 0.1; }
  }

  // Neon signs on buildings
  {
    vec3 neonPos1 = pos - vec3(-5.0, 3.0, -2.0);
    float neon1 = rsSdRoundBox(neonPos1, vec3(0.03, 0.3, 0.8), 0.02);
    if (neon1 < minDist) { minDist = neon1; matId = 4.0; }

    vec3 neonPos2 = pos - vec3(5.2, 2.5, 4.0);
    float neon2 = rsSdRoundBox(neonPos2, vec3(0.03, 0.25, 0.6), 0.02);
    if (neon2 < minDist) { minDist = neon2; matId = 4.5; }
  }

  return vec2(minDist, matId);
}

// Normal & AO — generated by shared raymarching utilities
${rsNormalGLSL}
${rsAOGLSL}

// ═══════════════════════════════════════════════════════════
// Rain particles — screen-space for efficiency
// ═══════════════════════════════════════════════════════════

float rsRainStreak(vec2 fragUv, float seed, float rainTime, float speed) {
  float h1 = fract(sin(seed * 127.1) * 43758.5);
  float h2 = fract(sin(seed * 311.7) * 43758.5);
  float h3 = fract(sin(seed * 543.3) * 43758.5);
  float posX = h1;
  float fallSpeed = speed * (0.7 + h2 * 0.6);
  float posY = fract(h3 + rainTime * fallSpeed);
  float dx = abs(fragUv.x - posX);
  float dy = fragUv.y - (1.0 - posY);
  float streakLen = 0.025 + h2 * 0.035;
  float inStreak = step(0.0, dy) * step(dy, streakLen);
  float thin = smoothstep(0.0015, 0.0004, dx);
  return thin * inStreak * (0.5 + h3 * 0.5);
}

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
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float flowTime = uDynamicTime * 0.08;
  float rainIntensity = mix(0.05, 1.0, energy);
  rainIntensity *= mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace);
  rainIntensity += climaxBoost * 0.3;

  // Palette: neon noir
  float hue1 = uPalettePrimary + chromaH * 0.08 + chordHue;
  float hue2 = uPaletteSecondary + chromaH * 0.06 + chordHue * 0.5;
  float sat = mix(0.7, 1.0, slowE) * uPaletteSaturation;
  vec3 neonCol1 = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 neonCol2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.85));
  neonCol1 = mix(neonCol1, vec3(0.9, 0.2, 0.5), 0.2); // magenta tint
  neonCol2 = mix(neonCol2, vec3(0.2, 0.5, 0.9), 0.2); // cyan tint

  // Lamp positions
  vec3 lampPos1 = vec3(-3.2, 3.7, -2.0);
  vec3 lampPos2 = vec3(3.8, 3.7, 5.0);
  vec3 neonSignPos1 = vec3(-5.0, 3.0, -2.0);
  vec3 neonSignPos2 = vec3(5.2, 2.5, 4.0);
  vec3 lampColor1 = vec3(1.0, 0.85, 0.5); // sodium
  vec3 lampColor2 = mix(neonCol2, vec3(0.9, 0.9, 1.0), 0.4);

  // ═══ Camera ═══
  float slowTime = uDynamicTime * 0.03;
  float camX = sin(slowTime * 0.3) * 1.5;
  float camY = 1.5 + melPitch * 0.5 + cos(slowTime * 0.2) * 0.2;
  vec3 camOrigin = vec3(camX, camY, -5.0 + sin(slowTime * 0.15) * 2.0);
  vec3 camLookAt = vec3(0.0, 1.0, 6.0);
  camLookAt = mix(camLookAt, vec3(lampPos1.x, 2.0, lampPos1.z), sSolo * 0.3);

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);
  float fov = 1.2;
  vec3 rayDir = normalize(screenPos.x * camRt + screenPos.y * camUpDir + fov * camFwd);

  // ═══ Raymarch ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = rsSceneSDF(marchPos, flowTime);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8;
  }

  vec3 col = vec3(0.015, 0.015, 0.025); // dark overcast sky

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = rsCalcNormal(hitPos);
    float ambOcc = rsCalcAO(hitPos, normal);

    // Multi-light shading
    vec3 surfaceCol = vec3(0.0);
    for (int li = 0; li < 2; li++) {
      vec3 lightPos = li == 0 ? lampPos1 : lampPos2;
      vec3 lightCol = li == 0 ? lampColor1 : lampColor2;
      float intensity = mix(0.15, 0.4, slowE) + sSolo * 0.25 * float(li == 0);
      vec3 toLight = lightPos - hitPos;
      float lightDist = length(toLight);
      vec3 lightDir = toLight / lightDist;
      float atten = intensity / (1.0 + lightDist * lightDist * 0.15);
      float diff = max(dot(normal, lightDir), 0.0);
      vec3 halfVec = normalize(lightDir - rayDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 32.0);
      float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);
      surfaceCol += lightCol * diff * atten;
      surfaceCol += lightCol * spec * atten * 0.5;
      surfaceCol += lightCol * fresnel * atten * 0.15;
    }

    // Neon sign light
    for (int ni = 0; ni < 2; ni++) {
      vec3 neonPos = ni == 0 ? neonSignPos1 : neonSignPos2;
      vec3 neonCol = ni == 0 ? neonCol1 : neonCol2;
      vec3 toNeon = neonPos - hitPos;
      float neonDist = length(toNeon);
      float neonAtten = 0.3 / (1.0 + neonDist * neonDist * 0.2);
      float neonDiff = max(dot(normal, normalize(toNeon)), 0.0);
      surfaceCol += neonCol * neonDiff * neonAtten * energy;
    }

    // Material coloring
    if (matId < 0.5) {
      // Wet street: dark, reflective
      vec3 streetBase = vec3(0.015, 0.015, 0.02);
      // Puddle wetness increases reflections
      float wetness = 0.3 + energy * 0.4;
      surfaceCol = mix(streetBase, surfaceCol, wetness);
      // Specular wet highlights
      surfaceCol += surfaceCol * 0.3 * highs;
    } else if (matId < 1.5) {
      // Curb: slightly lighter concrete
      surfaceCol *= 0.5;
      surfaceCol += vec3(0.03, 0.028, 0.025);
    } else if (matId < 3.0) {
      // Buildings: dark silhouettes with occasional lit windows
      vec3 buildCol = vec3(0.01, 0.01, 0.015);
      // Window grid
      vec2 winGrid = fract(vec2(hitPos.z * 4.0, hitPos.y * 3.0));
      float hasWindow = step(0.7, fract(sin(dot(floor(vec2(hitPos.z * 4.0, hitPos.y * 3.0)), vec2(127.1, 311.7))) * 43758.5));
      float winLight = step(0.25, winGrid.x) * step(winGrid.x, 0.75) * step(0.2, winGrid.y) * step(winGrid.y, 0.8) * hasWindow;
      buildCol += mix(neonCol1, neonCol2, fract(hitPos.z * 0.3)) * winLight * 0.15;
      surfaceCol = buildCol + surfaceCol * 0.1;
    } else if (matId < 3.5) {
      // Lamp: warm emissive head
      float lampIdx = fract((matId - 3.0) * 10.0);
      vec3 lc = lampIdx < 0.5 ? lampColor1 : lampColor2;
      surfaceCol = lc * (0.5 + energy * 0.5);
    } else if (matId < 5.0) {
      // Neon signs: bright emissive
      vec3 neonColor = matId < 4.25 ? neonCol1 : neonCol2;
      float flicker = 0.9 + 0.1 * sin(uDynamicTime * 8.0 + matId * 20.0) * (1.0 - clamp(uBeatStability, 0.0, 1.0));
      surfaceCol = neonColor * flicker * (0.6 + energy * 0.4);
    }

    col = surfaceCol * ambOcc;

    float fogDist = totalDist / MAX_DIST;
    vec3 fogColor = vec3(0.02, 0.02, 0.03);
    col = mix(col, fogColor, fogDist * fogDist * 0.6);
  }

  // ═══ Volumetric lamp cones ═══
  {
    vec3 volAccum = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float marchT = float(i) * 1.5 + 0.5;
      vec3 samplePos = camOrigin + rayDir * marchT;
      for (int li = 0; li < 2; li++) {
        vec3 lightPos = li == 0 ? lampPos1 : lampPos2;
        vec3 lightCol = li == 0 ? lampColor1 : lampColor2;
        vec3 toLamp = samplePos - lightPos;
        float distToLamp = length(toLamp);
        float coneAngle = dot(normalize(toLamp), vec3(0.0, -1.0, 0.0));
        float cone = smoothstep(0.7, 0.95, coneAngle);
        float scatter = cone * exp(-distToLamp * 0.4) * 0.015;
        float haze = fbm3(vec3(samplePos * 0.3, flowTime * 0.1)) * 0.5 + 0.5;
        volAccum += lightCol * scatter * haze;
      }
    }
    float lampIntensity = mix(0.15, 0.5, slowE) + sSolo * 0.25;
    col += volAccum * lampIntensity * (1.0 + climaxBoost * 0.3);
  }

  // ═══ Rain streaks (screen space) ═══
  {
    float rainSpeed = mix(0.8, 2.5, rainIntensity) + flux * 0.5;
    float rainCount = mix(20.0, 120.0, rainIntensity);
    float rainTotal = 0.0;
    for (int i = 0; i < 120; i++) {
      if (float(i) >= rainCount) break;
      rainTotal += rsRainStreak(fragUv, float(i) * 3.17 + 0.5, uDynamicTime, rainSpeed);
    }
    vec3 rainColor = vec3(0.4, 0.45, 0.55);
    col += rainColor * rainTotal * mix(0.06, 0.2, rainIntensity);
  }

  // ═══ Ground fog ═══
  {
    float fogAmount = vocalE * 0.3 + bass * 0.15 + 0.05;
    fogAmount *= mix(1.0, 0.3, sSpace);
    float fogHeight = smoothstep(0.4, 0.2, fragUv.y);
    float fogNoise = fbm3(vec3(screenPos.x * 2.0, flowTime * 0.2, flowTime * 0.1));
    vec3 fogColor = vec3(0.04, 0.04, 0.05) + lampColor1 * 0.03;
    col = mix(col, fogColor, fogHeight * fogAmount * (0.5 + fogNoise * 0.5));
  }

  // Onset splash flash
  if (onset > 0.4) {
    col += vec3(0.1, 0.08, 0.06) * (onset - 0.4) * 2.0 * energy;
  }

  // Lightning flash on climax
  if (climaxBoost > 0.3) {
    float lightning = fract(sin(uTime * 50.0) * 43758.5);
    if (lightning > 0.9) col += vec3(0.4, 0.42, 0.5) * climaxBoost;
  }

  col *= 1.0 + effectiveBeat * 0.1;

  // Vignette: strong noir
  float vigScale = mix(0.40, 0.28, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.003, 0.008), col, vignette);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, neonCol1, neonCol2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenPos, uTime, energy, bass, neonCol1, neonCol2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
