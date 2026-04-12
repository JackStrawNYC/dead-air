/**
 * Concert Beams — raymarched 3D concert venue with volumetric stage lighting.
 * Full SDF scene: stage truss structures, moving head light fixtures casting
 * volumetric beam cones through haze, crowd silhouettes, and stage floor.
 * A real concert lighting rig rendered in 3D with proper raymarching.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → beam intensity, haze density, active beam count
 *   uBass             → truss vibration, camera shake, beam width pulse
 *   uHighs            → specular on truss metal, beam edge sharpness
 *   uOnsetSnap        → beam position snap, strobe flash
 *   uBeatSnap         → beam sweep speed sync
 *   uSlowEnergy       → haze drift speed, ambient light level
 *   uHarmonicTension  → beam angle complexity, color cycling speed
 *   uBeatStability    → beam sweep steadiness vs erratic
 *   uMelodicPitch     → beam tilt vertical angle
 *   uChromaHue        → beam color palette rotation
 *   uChordIndex       → per-beam hue micro-offset
 *   uVocalEnergy      → center-stage spotlight warmth
 *   uSpectralFlux     → haze turbulence
 *   uSectionType      → jam=rapid sweep, space=dim ambient, solo=single spot
 *   uClimaxPhase      → all beams active, maximum intensity
 *   uPalettePrimary/Secondary → beam color palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

export const concertBeamsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const cbNormalGLSL = buildRaymarchNormal(
  "cbSceneSDF($P, bassVib).x",
  { eps: 0.003, name: "cbCalcNormal" },
);
const cbAOGLSL = buildRaymarchAO(
  "cbSceneSDF($P, bassVib).x",
  { steps: 5, stepBase: 0.0, stepScale: 0.15, weightDecay: 0.6, finalMult: 2.0, name: "cbCalcAO" },
);
const cbDepthAlpha = buildDepthAlphaOutput("totalDist", "MAX_DIST");

export const concertBeamsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({ halationEnabled: true, bloomEnabled: true, caEnabled: true, bloomThresholdOffset: -0.08 })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — cb namespace
// ═══════════════════════════════════════════════════════════

float cbSdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cbSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float cbSdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

float cbSdCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 ab = b - a;
  float param = clamp(dot(pos - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(pos - a - ab * param) - radius;
}

float cbSdRoundBox(vec3 pos, vec3 bounds, float rad) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - rad;
}

float cbSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════════
// Truss SDF — triangular box truss cross-section
// ═══════════════════════════════════════════════════════════

float cbTrussSegment(vec3 pos, float halfLen, float trussRadius, float pipeRadius) {
  // Main horizontal pipe
  float mainPipe = cbSdCappedCylinder(pos.xzy, pipeRadius, halfLen);
  // Top pipe (offset up)
  vec3 topPos = pos - vec3(0.0, trussRadius, 0.0);
  float topPipe = cbSdCappedCylinder(topPos.xzy, pipeRadius, halfLen);
  // Bottom-left pipe
  vec3 blPos = pos - vec3(-trussRadius * 0.866, -trussRadius * 0.5, 0.0);
  float blPipe = cbSdCappedCylinder(blPos.xzy, pipeRadius, halfLen);
  // Bottom-right pipe
  vec3 brPos = pos - vec3(trussRadius * 0.866, -trussRadius * 0.5, 0.0);
  float brPipe = cbSdCappedCylinder(brPos.xzy, pipeRadius, halfLen);
  // Cross braces (diagonals) — simplified as boxes
  float crossBrace1 = cbSdCapsule(pos,
    vec3(0.0, trussRadius, -halfLen * 0.8),
    vec3(trussRadius * 0.866, -trussRadius * 0.5, -halfLen * 0.4),
    pipeRadius * 0.6);
  float crossBrace2 = cbSdCapsule(pos,
    vec3(0.0, trussRadius, halfLen * 0.4),
    vec3(-trussRadius * 0.866, -trussRadius * 0.5, halfLen * 0.8),
    pipeRadius * 0.6);
  float truss = min(mainPipe, min(topPipe, min(blPipe, brPipe)));
  truss = min(truss, min(crossBrace1, crossBrace2));
  return truss;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — the concert venue
// ═══════════════════════════════════════════════════════════

vec2 cbSceneSDF(vec3 pos, float bassVib) {
  float matId = 0.0;
  float minDist = 100.0;

  // Stage floor
  float stageFloor = pos.y + 2.0;
  if (stageFloor < minDist) { minDist = stageFloor; matId = 0.0; }

  // Back wall
  float backWall = -(pos.z - 8.0);
  if (backWall < minDist) { minDist = backWall; matId = 1.0; }

  // Overhead truss: two horizontal runs + cross piece
  {
    // Left horizontal truss
    vec3 trussL = pos - vec3(-3.5, 5.0 + bassVib * 0.02, 3.0);
    float tL = cbTrussSegment(trussL, 5.0, 0.15, 0.03);
    if (tL < minDist) { minDist = tL; matId = 2.0; }

    // Right horizontal truss
    vec3 trussR = pos - vec3(3.5, 5.0 + bassVib * 0.02, 3.0);
    float tR = cbTrussSegment(trussR, 5.0, 0.15, 0.03);
    if (tR < minDist) { minDist = tR; matId = 2.0; }

    // Cross truss (perpendicular)
    vec3 trussX = pos - vec3(0.0, 5.0, 3.0);
    trussX = trussX.zyx; // rotate 90 degrees
    float tX = cbTrussSegment(trussX, 3.5, 0.15, 0.03);
    if (tX < minDist) { minDist = tX; matId = 2.0; }

    // Front cross truss
    vec3 trussFront = pos - vec3(0.0, 4.5, -1.0);
    trussFront = trussFront.zyx;
    float tF = cbTrussSegment(trussFront, 4.0, 0.12, 0.025);
    if (tF < minDist) { minDist = tF; matId = 2.0; }
  }

  // Moving head light fixtures (8 fixtures on the truss)
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float fixtureX = (fi - 3.5) * 1.2;
    float fixtureZ = mix(-1.0, 5.0, step(4.0, fi));
    float fixtureY = mix(4.5, 5.0, step(4.0, fi));
    vec3 fPos = pos - vec3(fixtureX, fixtureY, fixtureZ);
    // Fixture body: cylinder + sphere head
    float fixtureBody = cbSdCappedCylinder(fPos, 0.08, 0.12);
    float fixtureHead = cbSdSphere(fPos - vec3(0.0, -0.15, 0.0), 0.1);
    float fixture = min(fixtureBody, fixtureHead);
    if (fixture < minDist) { minDist = fixture; matId = 3.0 + fi * 0.1; }
  }

  // Crowd silhouettes (bumpy surface at floor level in front)
  {
    float crowdZ = pos.z + 3.0;
    if (crowdZ > 0.0 && pos.y > -2.5 && pos.y < -0.5) {
      float crowdNoise = snoise(vec3(pos.x * 3.0, pos.y * 2.0, 0.0)) * 0.3;
      crowdNoise += snoise(vec3(pos.x * 8.0, 0.0, 0.0)) * 0.1;
      float crowdHeight = -0.8 + crowdNoise;
      float crowdDist = pos.y - crowdHeight;
      crowdDist = max(crowdDist, crowdZ);
      crowdDist = max(crowdDist, -(pos.z + 6.0));
      if (crowdDist < minDist) { minDist = crowdDist; matId = 4.0; }
    }
  }

  // Stage monitors (wedge shapes at front of stage)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 monPos = pos - vec3((fi - 1.0) * 2.5, -1.7, -1.5);
    float monitor = cbSdRoundBox(monPos, vec3(0.3, 0.15, 0.25), 0.02);
    if (monitor < minDist) { minDist = monitor; matId = 5.0; }
  }

  return vec2(minDist, matId);
}

${cbNormalGLSL}
${cbAOGLSL}

// ═══════════════════════════════════════════════════════════
// Volumetric beam cone — evaluated along ray
// ═══════════════════════════════════════════════════════════

float cbBeamCone(vec3 pos, vec3 beamOrigin, vec3 beamDir, float coneAngle, float beamLen) {
  vec3 toPos = pos - beamOrigin;
  float alongBeam = dot(toPos, beamDir);
  if (alongBeam < 0.0 || alongBeam > beamLen) return 0.0;
  vec3 perpVec = toPos - beamDir * alongBeam;
  float perpDist = length(perpVec);
  float coneRadius = tan(coneAngle) * alongBeam;
  float beam = smoothstep(coneRadius, coneRadius * 0.3, perpDist);
  float falloff = 1.0 / (1.0 + alongBeam * 0.3);
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
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float slowTime = uDynamicTime * 0.05;
  float bassVib = bass * 0.3;
  float tempoScale = uLocalTempo / 120.0;

  // ═══ Camera ═══
  float camSwayX = sin(slowTime * 0.4) * 0.8;
  float camBobY = cos(slowTime * 0.3) * 0.2;
  vec3 camOrigin = vec3(camSwayX, 0.5 + camBobY, -6.0);
  // Bass shake
  float shakeGate = smoothstep(0.2, 0.5, energy);
  camOrigin.x += snoise(vec3(uTime * 6.0, 0.0, 0.0)) * bass * 0.03 * shakeGate;
  camOrigin.y += snoise(vec3(0.0, uTime * 6.0, 0.0)) * bass * 0.02 * shakeGate;

  vec3 camLookAt = vec3(0.0, 1.5 + melPitch * 1.5, 4.0);
  camLookAt = mix(camLookAt, vec3(0.0, 2.0, 3.0), sSolo * 0.4);

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
    vec2 sceneResult = cbSceneSDF(marchPos, bassVib);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.8;
  }

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.2 + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 palCol1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.95);

  vec3 col = vec3(0.01, 0.008, 0.015); // dark venue background

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = cbCalcNormal(hitPos);
    float ambOcc = cbCalcAO(hitPos, normal);

    // Simple overhead key light
    vec3 keyLightDir = normalize(vec3(0.3, 1.0, -0.5));
    float diffuse = max(dot(normal, keyLightDir), 0.0);
    vec3 halfVec = normalize(keyLightDir - rayDir);
    float specular = pow(max(dot(normal, halfVec), 0.0), 24.0 + highs * 32.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    vec3 surfaceColor;
    if (matId < 0.5) {
      // Stage floor: dark reflective
      surfaceColor = vec3(0.02, 0.02, 0.025) + diffuse * 0.06;
      surfaceColor += specular * 0.1 * vec3(1.0, 0.95, 0.9);
      surfaceColor += fresnel * 0.03 * palCol1;
    } else if (matId < 1.5) {
      // Back wall
      surfaceColor = vec3(0.015, 0.012, 0.02);
      surfaceColor += diffuse * 0.04;
    } else if (matId < 2.5) {
      // Truss: metallic silver
      vec3 metalColor = vec3(0.5, 0.5, 0.55);
      surfaceColor = metalColor * (0.05 + diffuse * 0.2);
      surfaceColor += vec3(0.8, 0.8, 0.85) * specular * 0.5 * (0.3 + highs * 0.7);
      surfaceColor += metalColor * fresnel * 0.15;
    } else if (matId < 4.0) {
      // Light fixtures: dark body with emissive head
      float fixtureIdx = (matId - 3.0) * 10.0;
      surfaceColor = vec3(0.02, 0.02, 0.03);
      // Emissive lens glow
      surfaceColor += palCol1 * 0.2 * energy;
    } else if (matId < 4.5) {
      // Crowd: dark silhouette
      surfaceColor = vec3(0.015, 0.012, 0.02);
    } else {
      // Stage monitors
      surfaceColor = vec3(0.03, 0.03, 0.035);
      surfaceColor += diffuse * 0.05;
    }

    col = surfaceColor * ambOcc;

    // Distance fog
    float fogFactor = smoothstep(0.0, 1.0, totalDist / MAX_DIST);
    col = mix(col, vec3(0.01, 0.008, 0.015), fogFactor);
  }

  // ═══ Volumetric beams — the main visual feature ═══
  {
    float activeBeams = 3.0 + energy * 5.0;
    activeBeams *= mix(1.0, 1.3, sJam) * mix(1.0, 0.3, sSpace);
    activeBeams += climaxBoost * 3.0;
    float sweepSpeed = mix(0.2, 0.8, energy) * tempoScale * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
    float hazeAmount = mix(0.3, 1.0, slowE) + flux * 0.2;

    vec3 beamAccum = vec3(0.0);

    for (int b = 0; b < 8; b++) {
      float fb = float(b);
      if (fb >= activeBeams) break;

      float fixtureX = (fb - 3.5) * 1.2;
      float fixtureZ = mix(-1.0, 5.0, step(4.0, fb));
      float fixtureY = mix(4.5, 5.0, step(4.0, fb));
      vec3 beamOrigin = vec3(fixtureX, fixtureY, fixtureZ);

      // Beam direction: sweeping with audio
      float sweepAngle = sin(uDynamicTime * sweepSpeed + fb * 1.618 * TAU) * (0.4 + tension * 0.3);
      sweepAngle *= mix(1.0, 0.3, stability * 0.5);
      float tiltAngle = -PI * 0.35 - melPitch * 0.2 + cos(uDynamicTime * sweepSpeed * 0.7 + fb * 2.3) * 0.15;

      // Solo: all beams converge to center stage
      float soloConverge = sSolo * 0.7;
      vec3 soloTarget = vec3(0.0, -1.5, 2.0);
      vec3 defaultDir = normalize(vec3(sin(sweepAngle), sin(tiltAngle), cos(sweepAngle) * 0.5));
      vec3 soloDir = normalize(soloTarget - beamOrigin);
      vec3 beamDir = normalize(mix(defaultDir, soloDir, soloConverge));

      float coneAngle = 0.08 + energy * 0.04 + bass * 0.02;
      float beamIntensity = (0.3 + energy * 0.7) * mix(1.0, 0.2, sSpace);
      beamIntensity += effectiveBeat * 0.2;
      beamIntensity += climaxBoost * 0.3;

      // Beam color
      float beamHue = hue1 + fb * 0.08 + mod(uSectionIndex * 0.1, 1.0);
      vec3 beamColor = paletteHueColor(beamHue, 0.85, 0.95);
      // Warm white alternating
      if (b == 0 || b == 4) beamColor = mix(beamColor, vec3(1.0, 0.95, 0.85), 0.4);
      // Vocal warmth on center beams
      if (b == 3 || b == 4) beamColor += vec3(0.1, 0.05, 0.0) * vocalE;

      // Volumetric beam march (16 samples along ray)
      for (int s = 0; s < 16; s++) {
        float marchT = float(s) * 1.2 + 0.5;
        vec3 samplePos = camOrigin + rayDir * marchT;
        float beamVal = cbBeamCone(samplePos, beamOrigin, beamDir, coneAngle, 12.0);
        // Haze density modulation
        float haze = fbm3(vec3(samplePos * 0.2, uDynamicTime * 0.08 * (1.0 + flux))) * 0.5 + 0.5;
        beamVal *= haze * hazeAmount;
        beamAccum += beamColor * beamVal * beamIntensity * 0.025;
      }
    }

    col += beamAccum;
  }

  // ═══ Strobe flash on onset ═══
  if (onset > 0.5) {
    col += vec3(1.0, 0.95, 0.9) * (onset - 0.5) * 1.2 * energy;
  }

  // ═══ Beat flash ═══
  col += vec3(1.0, 0.97, 0.92) * effectiveBeat * 0.12;

  // ═══ Crowd silhouette bottom edge ═══
  {
    float crowdY = 0.12 + snoise(vec3(fragUv.x * 20.0, uDynamicTime * 0.3, 0.0)) * 0.02
                 + snoise(vec3(fragUv.x * 50.0, 0.0, uDynamicTime * 0.1)) * 0.008;
    float crowdMask = smoothstep(crowdY + 0.01, crowdY - 0.01, fragUv.y);
    col = mix(col, vec3(0.02, 0.015, 0.025), crowdMask * 0.5);
  }

  // ═══ Climax boost ═══
  col *= 1.0 + climaxBoost * 0.4;

  // ═══ Vignette ═══
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = palCol2 * 0.02;
  col = mix(vigTint, col, vignette);

  // ═══ Icon emergence ═══
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // ═══ Post-processing ═══
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
  ${cbDepthAlpha}
}
`;
