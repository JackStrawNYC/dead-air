/**
 * Concert Lighting — raymarched 3D concert venue with full stage rig.
 * PAR cans, moving heads, volumetric beams, stage platforms, speaker stacks,
 * and crowd. Different from concert-beams: this is about the full venue
 * environment and PAR can wash lighting rather than moving head beams.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → PAR intensity, number of active cans, wash brightness
 *   uBass             → stage floor throb, speaker stack vibration
 *   uHighs            → PAR specular edge sharpness, sparkle
 *   uOnsetSnap        → strobe flash, PAR snap to new position
 *   uBeatSnap         → PAR color change sync
 *   uSlowEnergy       → ambient house light level
 *   uHarmonicTension  → PAR color cycling speed, haze complexity
 *   uBeatStability    → steady wash vs chaotic flickering
 *   uMelodicPitch     → PAR tilt angle, color temperature shift
 *   uChromaHue        → PAR color palette rotation
 *   uChordIndex       → per-can hue offset
 *   uVocalEnergy      → center-stage spot warmth
 *   uSpectralFlux     → haze turbulence, particle density
 *   uSectionType      → jam=full rig, space=dim ambient, solo=single spot
 *   uClimaxPhase      → all PAR cans + strobe + maximum wash
 *   uPalettePrimary/Secondary → wash color palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const concertLightingVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const concertLightingFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ halationEnabled: true, bloomEnabled: true, caEnabled: true, bloomThresholdOffset: -0.06 })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — cl2 namespace
// ═══════════════════════════════════════════════════════════

float cl2SdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cl2SdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float cl2SdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

float cl2SdRoundBox(vec3 pos, vec3 bounds, float rad) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rad;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — concert venue with PAR cans
// ═══════════════════════════════════════════════════════════

vec2 cl2SceneSDF(vec3 pos, float bassVib) {
  float matId = 0.0;
  float minDist = 100.0;

  // Stage floor (raised platform)
  float stageFloor = pos.y + 1.5;
  float stageBounds = cl2SdBox(pos - vec3(0.0, -1.6, 3.0), vec3(6.0, 0.1, 5.0));
  if (stageFloor < minDist) { minDist = stageFloor; matId = 0.0; }

  // Stage platform (riser)
  float riser = cl2SdBox(pos - vec3(0.0, -1.2, 4.0), vec3(5.0, 0.3, 4.0));
  if (riser < minDist) { minDist = riser; matId = 0.5; }

  // Back wall
  float backWall = -(pos.z - 9.0);
  if (backWall < minDist) { minDist = backWall; matId = 1.0; }

  // Ceiling
  float ceiling = -(pos.y - 6.0);
  if (ceiling < minDist) { minDist = ceiling; matId = 1.5; }

  // Speaker stacks (left and right of stage)
  for (int i = 0; i < 2; i++) {
    float side = float(i) * 2.0 - 1.0;
    vec3 spkPos = pos - vec3(side * 5.5, 0.0 + bassVib * 0.01, 6.0);
    float speaker = cl2SdBox(spkPos, vec3(0.8, 1.5, 0.6));
    if (speaker < minDist) { minDist = speaker; matId = 2.0; }
    // Top speaker (tweeter array)
    vec3 topSpk = pos - vec3(side * 5.5, 2.0, 6.0);
    float topSpeaker = cl2SdBox(topSpk, vec3(0.6, 0.5, 0.5));
    if (topSpeaker < minDist) { minDist = topSpeaker; matId = 2.0; }
  }

  // PAR can light bar (horizontal pipe with PAR cans)
  // Front bar
  {
    vec3 barPos = pos - vec3(0.0, 5.5, 1.0);
    float bar = cl2SdCappedCylinder(barPos.xzy, 0.04, 5.5);
    if (bar < minDist) { minDist = bar; matId = 3.0; }
  }
  // Rear bar
  {
    vec3 barPos2 = pos - vec3(0.0, 5.5, 5.0);
    float bar2 = cl2SdCappedCylinder(barPos2.xzy, 0.04, 5.5);
    if (bar2 < minDist) { minDist = bar2; matId = 3.0; }
  }

  // PAR cans on bars (12 total: 6 front, 6 rear)
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float parX = (mod(fi, 6.0) - 2.5) * 1.8;
    float parZ = fi < 6.0 ? 1.0 : 5.0;
    float parY = 5.3;
    vec3 parPos = pos - vec3(parX, parY, parZ);
    // PAR can body: cylinder
    float parBody = cl2SdCappedCylinder(parPos, 0.12, 0.15);
    // Lens face
    float parLens = cl2SdSphere(parPos - vec3(0.0, -0.18, 0.0), 0.1);
    float parCan = min(parBody, parLens);
    if (parCan < minDist) { minDist = parCan; matId = 4.0 + fi * 0.05; }
  }

  // Crowd bumps (at floor level)
  {
    float crowdZ = pos.z + 2.0;
    if (crowdZ > 0.0 && pos.y > -2.0 && pos.y < 0.0) {
      float crowdNoise = snoise(vec3(pos.x * 3.0, pos.y * 2.0, 0.0)) * 0.25;
      float crowdHeight = -0.5 + crowdNoise;
      float crowdDist = pos.y - crowdHeight;
      crowdDist = max(crowdDist, crowdZ);
      crowdDist = max(crowdDist, -(pos.z + 5.0));
      if (crowdDist < minDist) { minDist = crowdDist; matId = 5.0; }
    }
  }

  return vec2(minDist, matId);
}

// ═══════════════════════════════════════════════════════════
// Normal, AO
// ═══════════════════════════════════════════════════════════

vec3 cl2CalcNormal(vec3 pos, float bassVib) {
  vec2 eps = vec2(0.003, 0.0);
  float d0 = cl2SceneSDF(pos, bassVib).x;
  return normalize(vec3(
    cl2SceneSDF(pos + eps.xyy, bassVib).x - d0,
    cl2SceneSDF(pos + eps.yxy, bassVib).x - d0,
    cl2SceneSDF(pos + eps.yyx, bassVib).x - d0
  ));
}

float cl2CalcAO(vec3 pos, vec3 norm, float bassVib) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = float(i) * 0.15;
    float sampled = cl2SceneSDF(pos + norm * dist, bassVib).x;
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.0, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// PAR can cone evaluation
// ═══════════════════════════════════════════════════════════

float cl2ParCone(vec3 pos, vec3 parOrigin, float coneAngle, float beamLen) {
  vec3 toPos = pos - parOrigin;
  float downward = -toPos.y; // PAR cans point down
  if (downward < 0.0 || downward > beamLen) return 0.0;
  float perpDist = length(toPos.xz);
  float coneRadius = tan(coneAngle) * downward;
  float beam = smoothstep(coneRadius, coneRadius * 0.4, perpDist);
  float falloff = 1.0 / (1.0 + downward * 0.15);
  return beam * falloff;
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
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float bassVib = bass * 0.2;
  float tempoScale = uLocalTempo / 120.0;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.2 + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 palCol1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.95);

  // ═══ Camera ═══
  float slowTime = uDynamicTime * 0.04;
  float camSwayX = sin(slowTime * 0.5) * 1.0;
  vec3 camOrigin = vec3(camSwayX, 1.0 + melPitch * 0.5, -5.0 + sin(slowTime * 0.2) * 1.0);
  vec3 camLookAt = vec3(0.0, 2.0, 5.0);

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
    vec2 sceneResult = cl2SceneSDF(marchPos, bassVib);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8;
  }

  vec3 col = vec3(0.01, 0.008, 0.015);

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = cl2CalcNormal(hitPos, bassVib);
    float ambOcc = cl2CalcAO(hitPos, normal, bassVib);

    vec3 lightDir = normalize(vec3(0.3, 1.0, -0.4));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 32.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    vec3 surfaceColor;
    if (matId < 0.6) {
      // Stage floor: dark wood
      surfaceColor = vec3(0.025, 0.02, 0.015);
      surfaceColor += diff * 0.04;
      surfaceColor += spec * 0.05 * vec3(0.8, 0.7, 0.6);
    } else if (matId < 2.0) {
      // Walls / ceiling
      surfaceColor = vec3(0.012, 0.01, 0.016);
      surfaceColor += diff * 0.03;
    } else if (matId < 2.5) {
      // Speakers: black with grill texture
      float grill = step(0.5, fract(hitPos.y * 15.0)) * step(0.5, fract(hitPos.x * 15.0));
      surfaceColor = vec3(0.015) * (0.7 + grill * 0.3);
    } else if (matId < 3.5) {
      // Light bars: silver metal
      surfaceColor = vec3(0.3, 0.3, 0.32) * (0.1 + diff * 0.2);
      surfaceColor += spec * 0.3 * vec3(0.8, 0.8, 0.85);
    } else if (matId < 5.0) {
      // PAR cans: dark body with emissive lens
      surfaceColor = vec3(0.02, 0.02, 0.03);
      // Emissive when pointing down at viewer
      float parIdx = (matId - 4.0) * 20.0;
      float parActive = step(parIdx, 3.0 + energy * 9.0);
      vec3 parColor = mix(palCol1, palCol2, fract(parIdx * 0.17 + chordHue));
      surfaceColor += parColor * parActive * energy * 0.3;
    } else {
      // Crowd: dark silhouette
      surfaceColor = vec3(0.015, 0.012, 0.02);
    }

    col = surfaceColor * ambOcc;

    float fogDist = totalDist / MAX_DIST;
    col = mix(col, vec3(0.01, 0.008, 0.015), fogDist * fogDist * 0.5);
  }

  // ═══ Volumetric PAR can wash ═══
  {
    float activePars = 4.0 + energy * 8.0;
    activePars *= mix(1.0, 1.2, sJam) * mix(1.0, 0.3, sSpace);
    activePars += climaxBoost * 4.0;
    float hazeAmount = mix(0.3, 0.8, slowE) + flux * 0.2;

    vec3 washAccum = vec3(0.0);

    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      if (fi >= activePars) break;

      float parX = (mod(fi, 6.0) - 2.5) * 1.8;
      float parZ = fi < 6.0 ? 1.0 : 5.0;
      vec3 parOrigin = vec3(parX, 5.3, parZ);

      float coneAngle = 0.2 + energy * 0.1;
      float washIntensity = (0.2 + energy * 0.6) * mix(1.0, 0.15, sSpace);
      washIntensity += effectiveBeat * 0.15;

      // PAR color: alternating palette with beat-locked changes
      float colorPhase = fi * 0.13 + mod(uSectionIndex * 0.12, 1.0);
      colorPhase += chordHue;
      vec3 parColor = mix(palCol1, palCol2, fract(colorPhase));
      // Warm white on some cans
      if (int(fi) == 2 || int(fi) == 8) parColor = mix(parColor, vec3(1.0, 0.95, 0.85), 0.4);
      // Center vocal warmth
      if (int(fi) == 3 || int(fi) == 9) parColor += vec3(0.1, 0.05, 0.0) * vocalE;

      // Volumetric wash march
      for (int s = 0; s < 10; s++) {
        float marchT = float(s) * 1.5 + 0.5;
        vec3 samplePos = camOrigin + rayDir * marchT;
        float washVal = cl2ParCone(samplePos, parOrigin, coneAngle, 7.0);
        float haze = fbm3(vec3(samplePos * 0.2, uDynamicTime * 0.06)) * 0.5 + 0.5;
        washAccum += parColor * washVal * washIntensity * haze * hazeAmount * 0.02;
      }
    }

    col += washAccum;
  }

  // ═══ Strobe flash ═══
  if (onset > 0.6) {
    col += vec3(1.0, 0.95, 0.9) * (onset - 0.6) * 2.5 * energy;
  }

  // Beat + climax
  col *= 1.0 + effectiveBeat * 0.1;
  col *= 1.0 + climaxBoost * 0.35;

  // Crowd heads at bottom
  {
    float crowdY = 0.1 + snoise(vec3(fragUv.x * 25.0, uDynamicTime * 0.3, 0.0)) * 0.015;
    float crowdMask = smoothstep(crowdY + 0.01, crowdY - 0.01, fragUv.y);
    col = mix(col, vec3(0.02, 0.015, 0.025), crowdMask * 0.5);
  }

  // Vignette
  float vigScale = mix(0.30, 0.25, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = palCol2 * 0.015;
  col = mix(vigTint, col, vignette);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
