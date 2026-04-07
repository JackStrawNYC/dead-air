/**
 * Smoke and Mirrors — raymarched 3D smoke chamber with mirror plane SDFs.
 * Volumetric smoke density field with reflective mirror surfaces that show
 * distorted reflections of the smoke. Light bounces between mirrors.
 * Full 3D raymarched scene with proper AO, diffuse+specular+fresnel lighting.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → smoke density, mirror visibility, overall brightness
 *   uBass             → smoke thickness pulse, mirror vibration
 *   uHighs            → mirror specular sharpness, smoke detail level
 *   uOnsetSnap        → mirror surface reveals, smoke burst
 *   uBeatSnap         → smoke pulse, mirror flash
 *   uSlowEnergy       → smoke drift speed, ambient glow
 *   uHarmonicTension  → smoke turbulence, mirror angle complexity
 *   uMelodicPitch     → light direction shift, smoke color temperature
 *   uChromaHue        → smoke + mirror tint shift
 *   uChordIndex       → per-chord mirror hue rotation
 *   uVocalEnergy      → center spotlight warmth through smoke
 *   uVocalPresence    → god ray spotlight cone
 *   uSpectralFlux     → smoke advection speed
 *   uSectionType      → jam=dense smoke, space=still+reflective, solo=spotlight
 *   uClimaxPhase      → maximum density + all mirrors active
 *   uPalettePrimary/Secondary → smoke + mirror palette colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const smokeAndMirrorsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const smokeAndMirrorsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true, caEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — sam namespace
// ═══════════════════════════════════════════════════════════

float samSdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float samSdPlane(vec3 pos, vec3 normal, float offset) {
  return dot(pos, normal) - offset;
}

float samSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float samSdRoundBox(vec3 pos, vec3 bounds, float rad) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rad;
}

// ═══════════════════════════════════════════════════════════
// Smoke density field
// ═══════════════════════════════════════════════════════════

float samSmokeDensity(vec3 pos, float bassDensity, float flowTime, float energyVal, float turbulence) {
  // Upward drift
  pos.y -= flowTime * 0.4;
  pos.x += sin(pos.y * 0.5 + flowTime * 0.2) * 0.3;
  pos.z += cos(pos.y * 0.4 + flowTime * 0.15) * 0.2;

  // Curl noise advection for fluid motion (energy gated)
  if (energyVal > 0.15) {
    vec3 curl = curlNoise(vec3(pos.xy * 0.8, flowTime * 0.08));
    pos += curl * (0.2 + turbulence * 0.3) * smoothstep(0.15, 0.5, energyVal);
  }

  float density = fbm6(pos * 0.6);
  density += fbm3(pos * 1.2 + 3.0) * 0.4;
  density += curlNoise(vec3(pos.xy * 0.5, flowTime * 0.06)).z * 0.2;
  density *= 0.5 + bassDensity * 0.5;
  return clamp(density * 0.5 + 0.3, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Mirror scene SDF — physical mirror objects in the chamber
// ═══════════════════════════════════════════════════════════

struct SamMirrorInfo {
  vec3 normal;
  float dist;
  int mirrorIdx;
};

vec2 samSceneSDF(vec3 pos, float flowTime, float bassVib) {
  float matId = 0.0;

  // Chamber walls (inverted box)
  float chamber = -samSdBox(pos, vec3(5.0, 4.0, 8.0));
  float minDist = chamber;

  // Floor
  float floorD = pos.y + 3.0;
  if (floorD < minDist) { minDist = floorD; matId = 1.0; }

  // Ceiling
  float ceilD = -(pos.y - 3.5);
  if (ceilD < minDist) { minDist = ceilD; matId = 2.0; }

  // Mirror 1: large angled plane on left
  {
    float angle1 = flowTime * 0.08 + bassVib * 0.1;
    vec3 n1 = normalize(vec3(cos(angle1) * 0.8, 0.1, sin(angle1) * 0.5));
    vec3 mirrorCenter1 = vec3(-3.0, 0.0, 2.0 + sin(flowTime * 0.1) * 0.5);
    float mirrorD1 = abs(samSdPlane(pos - mirrorCenter1, n1, 0.0)) - 0.02;
    // Bound the mirror to a reasonable rectangle
    float mirrorBound1 = samSdBox(pos - mirrorCenter1, vec3(0.03, 2.0, 1.5));
    mirrorD1 = max(mirrorD1, mirrorBound1);
    if (mirrorD1 < minDist) { minDist = mirrorD1; matId = 3.0; }
  }

  // Mirror 2: right side, different angle
  {
    float angle2 = flowTime * 0.06 + 2.1;
    vec3 n2 = normalize(vec3(-cos(angle2) * 0.7, -0.15, sin(angle2) * 0.6));
    vec3 mirrorCenter2 = vec3(3.0, 0.5, 1.0 + cos(flowTime * 0.08) * 0.3);
    float mirrorD2 = abs(samSdPlane(pos - mirrorCenter2, n2, 0.0)) - 0.02;
    float mirrorBound2 = samSdBox(pos - mirrorCenter2, vec3(0.03, 1.8, 1.8));
    mirrorD2 = max(mirrorD2, mirrorBound2);
    if (mirrorD2 < minDist) { minDist = mirrorD2; matId = 4.0; }
  }

  // Mirror 3: ceiling-angled, looking down
  {
    vec3 n3 = normalize(vec3(0.1, -0.9, 0.15 + sin(flowTime * 0.05) * 0.1));
    vec3 mirrorCenter3 = vec3(0.0, 3.0, 3.0);
    float mirrorD3 = abs(samSdPlane(pos - mirrorCenter3, n3, 0.0)) - 0.015;
    float mirrorBound3 = samSdBox(pos - mirrorCenter3, vec3(2.0, 0.02, 1.5));
    mirrorD3 = max(mirrorD3, mirrorBound3);
    if (mirrorD3 < minDist) { minDist = mirrorD3; matId = 5.0; }
  }

  // Mirror 4: floor mirror (puddle-like)
  {
    vec3 n4 = vec3(0.0, 1.0, 0.0);
    vec3 mirrorCenter4 = vec3(0.5, -2.98, 2.0);
    float mirrorD4 = abs(samSdPlane(pos - mirrorCenter4, n4, 0.0)) - 0.01;
    float mirrorBound4 = samSdBox(pos - mirrorCenter4, vec3(1.5, 0.02, 2.0));
    mirrorD4 = max(mirrorD4, mirrorBound4);
    if (mirrorD4 < minDist) { minDist = mirrorD4; matId = 6.0; }
  }

  return vec2(minDist, matId);
}

// ═══════════════════════════════════════════════════════════
// Normal, AO
// ═══════════════════════════════════════════════════════════

vec3 samCalcNormal(vec3 pos, float flowTime, float bassVib) {
  vec2 eps = vec2(0.003, 0.0);
  float d0 = samSceneSDF(pos, flowTime, bassVib).x;
  return normalize(vec3(
    samSceneSDF(pos + eps.xyy, flowTime, bassVib).x - d0,
    samSceneSDF(pos + eps.yxy, flowTime, bassVib).x - d0,
    samSceneSDF(pos + eps.yyx, flowTime, bassVib).x - d0
  ));
}

float samCalcAO(vec3 pos, vec3 norm, float flowTime, float bassVib) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = float(i) * 0.12;
    float sampled = samSceneSDF(pos + norm * dist, flowTime, bassVib).x;
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Get mirror normal by material ID
// ═══════════════════════════════════════════════════════════

vec3 samGetMirrorNormal(float matId, float flowTime, float bassVib) {
  if (matId < 3.5) {
    float angle1 = flowTime * 0.08 + bassVib * 0.1;
    return normalize(vec3(cos(angle1) * 0.8, 0.1, sin(angle1) * 0.5));
  } else if (matId < 4.5) {
    float angle2 = flowTime * 0.06 + 2.1;
    return normalize(vec3(-cos(angle2) * 0.7, -0.15, sin(angle2) * 0.6));
  } else if (matId < 5.5) {
    return normalize(vec3(0.1, -0.9, 0.15 + sin(flowTime * 0.05) * 0.1));
  } else {
    return vec3(0.0, 1.0, 0.0);
  }
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
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float flowTime = uDynamicTime * (0.08 + flux * 0.04) * mix(1.0, 1.3, sJam) * mix(1.0, 0.4, sSpace);
  float bassVib = bass * 0.15;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.2 + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 fogTint = paletteHueColor(hue1, 0.6, 0.85);
  fogTint = mix(fogTint, vec3(0.4, 0.45, 0.5), 0.3); // push toward smoke neutral
  fogTint += vec3(0.04, 0.02, 0.0) * vocalE; // vocal warmth
  vec3 mirrorTint = paletteHueColor(hue2, 0.85, 0.95);

  // ═══ Camera ═══
  float slowTime = uDynamicTime * 0.04;
  float camSwayX = sin(slowTime * 0.5) * 1.5;
  float camBob = cos(slowTime * 0.35) * 0.3;
  vec3 camOrigin = vec3(camSwayX, 0.0 + camBob + melPitch * 0.5, -4.0);
  vec3 camLookAt = vec3(sin(slowTime * 0.3) * 0.8, 0.3 + melPitch * 0.3, 3.0);
  camLookAt = mix(camLookAt, vec3(0.0, 0.0, 2.0), sSolo * 0.5);

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);
  float fov = 1.3 + bass * 0.1;
  vec3 rayDir = normalize(screenPos.x * camRt + screenPos.y * camUpDir + fov * camFwd);

  // ═══ Raymarch scene ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = samSceneSDF(marchPos, flowTime, bassVib);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8;
  }

  vec3 col = vec3(0.02, 0.018, 0.025);

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = samCalcNormal(hitPos, flowTime, bassVib);
    float ambOcc = samCalcAO(hitPos, normal, flowTime, bassVib);

    vec3 lightDir = normalize(vec3(0.3 + melPitch * 0.3, 1.0, -0.3));
    float diffuse = max(dot(normal, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specular = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 48.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    bool isMirror = matId >= 3.0 && matId <= 6.5;

    if (!isMirror) {
      // Chamber walls/floor/ceiling
      vec3 surfaceColor = vec3(0.02, 0.018, 0.025);
      surfaceColor += fogTint * diffuse * 0.06;
      col = surfaceColor * ambOcc;
    } else {
      // Mirror surface: reflective with specular
      float mirrorVis = smoothstep(0.15, 0.5, energy) * (0.5 + onset * 0.5);
      mirrorVis += climaxBoost * 0.3;

      vec3 mirrorNorm = samGetMirrorNormal(matId, flowTime, bassVib);
      vec3 reflDir = reflect(rayDir, mirrorNorm);

      // March reflected smoke
      vec3 reflectedFog = vec3(0.0);
      float reflAlpha = 0.0;
      for (int j = 0; j < 12; j++) {
        float rt = 0.3 + float(j) * 0.4;
        vec3 rpos = hitPos + reflDir * rt;
        float rd = samSmokeDensity(rpos, bass, flowTime, energy, tension) * 0.05;
        if (rd > 0.001) {
          float rAlpha = rd * (1.0 - reflAlpha);
          vec3 rc = mix(fogTint * 0.3, mirrorTint * 0.2, float(j) / 12.0);
          reflectedFog += rc * rAlpha;
          reflAlpha += rAlpha;
        }
      }

      // Mirror specular
      float mirrorSpec = pow(max(dot(reflect(rayDir, mirrorNorm), lightDir), 0.0), 16.0 + highs * 32.0);
      vec3 mirrorColor = mix(vec3(0.7, 0.75, 0.8), mirrorTint, 0.3);

      col = mirrorColor * 0.1 * ambOcc;
      col += mirrorSpec * vec3(1.0, 0.98, 0.95) * 0.6 * mirrorVis;
      col += reflectedFog * mirrorVis;
      col += fresnel * mirrorTint * 0.2 * mirrorVis;
    }

    float fogDist = totalDist / MAX_DIST;
    col = mix(col, fogTint * 0.05, fogDist * fogDist);
  }

  // ═══ Volumetric fog raymarch ═══
  {
    vec3 fogAccum = vec3(0.0);
    float fogAlpha = 0.0;

    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float marchT = 0.3 + fi * 0.3;
      if (marchT > totalDist && didHitSurface) break;
      vec3 samplePos = camOrigin + rayDir * marchT;

      float density = samSmokeDensity(samplePos, bass, flowTime, energy, tension);
      density *= 0.06;

      if (density > 0.001) {
        float alpha = density * (1.0 - fogAlpha);
        vec3 smokeColor = mix(fogTint * 0.4, fogTint * 0.15, fi / 24.0);

        // Forward scattering
        float scatter = exp(-density * 3.0) * energy * 0.25;
        smokeColor += scatter * vec3(0.8, 0.85, 0.9);

        fogAccum += smokeColor * alpha;
        fogAlpha += alpha;
      }
    }

    col += fogAccum;
  }

  // ═══ God rays ═══
  {
    vec3 lightPos = vec3(melPitch * 0.5 + vocalPres * 0.2, 2.5, -1.0);
    float godRayAccum = 0.0;
    for (int g = 0; g < 12; g++) {
      float gt = 0.4 + float(g) * 0.3;
      vec3 gpos = camOrigin + rayDir * gt;
      vec3 toLightDir = normalize(lightPos - gpos);
      float lightDensity = samSmokeDensity(gpos + toLightDir * 0.3, bass, flowTime, energy, tension);
      float fogDen = samSmokeDensity(gpos, bass, flowTime, energy, tension);
      float inscatter = fogDen * exp(-lightDensity * 3.0);
      godRayAccum += inscatter * 0.03;
    }
    float spotCone = smoothstep(0.4, 0.0, length(screenPos - vec2(0.0, 0.2))) * vocalPres * 0.3;
    vec3 rayColor = mix(fogTint * 0.5, vec3(0.9, 0.85, 0.75), 0.3 + melPitch * 0.2);
    col += rayColor * godRayAccum * (1.0 + spotCone * 2.0 + climaxBoost * 0.5);
  }

  // Beat + climax
  col *= 1.0 + effectiveBeat * 0.15;
  col *= 1.0 + climaxBoost * 0.3;

  // Onset smoke burst
  if (onset > 0.3) {
    col += fogTint * (onset - 0.3) * 0.4 * energy;
  }

  // Vignette
  float vigScale = mix(0.34, 0.26, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.018, 0.025), col, vignette);

  // Icon emergence
  {
    float nf = snoise(vec3(screenPos * 2.0, uTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, fogTint, mirrorTint, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, fogTint, mirrorTint, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
