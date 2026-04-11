/**
 * Truchet Labyrinth — raymarched 3D pipe maze.
 * Each cell of a 3D grid contains quarter-torus pipe segments that connect
 * to neighbors, forming an infinite flowing labyrinth. Luminous fluid
 * travels through the pipes while the camera flies through the network.
 *
 * Visual aesthetic:
 *   - Quiet: dim metallic pipes, faint fluid glow, slow camera drift
 *   - Building: fluid brightens, pipes pulse wider, camera accelerates
 *   - Peak: full flow, pipes burst open, volumetric spray fills cells
 *   - Release: fluid drains, pipes thin, ambient reflections linger
 *
 * Audio reactivity:
 *   uBass            → pipe diameter pulse (thicker on low-end hits)
 *   uEnergy          → fluid flow speed + glow intensity
 *   uDrumOnset       → pressure wave (expanding ring through pipe network)
 *   uVocalPresence   → fluid warmth (amber shift)
 *   uHarmonicTension → pipe connection randomness (maze complexity)
 *   uSectionType     → jam=rapid flow, space=empty pipes, chorus=full flow
 *   uClimaxPhase     → pipes burst open releasing fluid as volumetric spray
 *   uMelodicPitch    → fluid hue cycling
 *   uSlowEnergy      → camera orbit radius
 *   uBeatStability   → pipe surface smoothness
 *   uOnsetSnap       → flash at pipe junctions
 *   uSpaceScore      → pipe network sparsity
 *   uTimbralBrightness → specular highlight sharpness
 *   uDynamicRange    → contrast between pipe metal and fluid glow
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const truchetTilingVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const ttNormalGLSL = buildRaymarchNormal("ttMap($P, basePipeRadius, baseFluidRadius, tension, flowPhase, burstAmount, pressureWave, pressureOrigin).x", { eps: 0.003, name: "ttNormal" });
const ttAOGLSL = buildRaymarchAO("ttMap($P, basePipeRadius, baseFluidRadius, tension, flowPhase, burstAmount, pressureWave, pressureOrigin).x", { steps: 5, stepBase: 0.0, stepScale: 0.02, weightDecay: 0.85, finalMult: 6.0, name: "ttOcclusion" });

export const truchetTilingFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 96
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ─── Hash helpers ───
float ttHash(float n) { return fract(sin(n) * 43758.5453); }
float ttHash3(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.53));
  p += dot(p, p.yzx + 45.32);
  return fract(p.x * p.y * p.z);
}

// ─── SDF primitives ───
float ttSdTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float ttSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float ttSdCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float ttSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ─── Quarter-torus pipe segment ───
// A quarter-torus in the XZ plane connecting two faces of a unit cell.
// axis: 0=XY bend, 1=YZ bend, 2=XZ bend
// flip: mirrors the arc direction
float ttQuarterTorus(vec3 pos, int axis, float flip, float majorR, float minorR) {
  vec3 q = pos;
  // Rotate to align the torus with the desired axis pair
  if (axis == 1) { q = q.zxy; }
  else if (axis == 2) { q = q.xzy; }

  // Offset to corner and flip if needed
  q.xz -= vec2(0.5) * flip;

  // Quarter-torus: only the positive quadrant
  vec2 xz = vec2(abs(q.x), abs(q.z));
  if (flip < 0.0) { xz = vec2(q.x, q.z); }

  vec2 ring = vec2(length(xz) - majorR, q.y);
  return length(ring) - minorR;
}

// ─── Pipe cell: 3D Truchet connections ───
// Each cell has 3 axes; each axis gets one of 2 orientations based on hash.
// Returns: x=pipe distance, y=fluid distance, z=junction glow
vec3 ttCell(vec3 cellPos, vec3 cellId, float pipeRadius, float fluidRadius,
            float tension, float flowPhase, float burstAmount) {
  float h1 = ttHash3(cellId);
  float h2 = ttHash3(cellId + 71.0);
  float h3 = ttHash3(cellId + 137.0);

  // Tension increases randomness of connections
  float threshold = 0.5 + tension * 0.3 * (ttHash3(cellId + 200.0) - 0.5);

  float flip1 = step(threshold, h1) * 2.0 - 1.0;
  float flip2 = step(threshold, h2) * 2.0 - 1.0;
  float flip3 = step(threshold, h3) * 2.0 - 1.0;

  float majorR = 0.5;

  // Three quarter-torus pipes per cell (one per axis pair)
  vec3 q1 = cellPos; q1.xz -= 0.5 * flip1; q1.xz = abs(q1.xz);
  float d1 = length(vec2(length(q1.xz) - majorR, q1.y)) - pipeRadius;

  vec3 q2 = cellPos.yzx; q2.xz -= 0.5 * flip2; q2.xz = abs(q2.xz);
  float d2 = length(vec2(length(q2.xz) - majorR, q2.y)) - pipeRadius;

  vec3 q3 = cellPos.zxy; q3.xz -= 0.5 * flip3; q3.xz = abs(q3.xz);
  float d3 = length(vec2(length(q3.xz) - majorR, q3.y)) - pipeRadius;

  // Combine pipes with smooth union
  float pipeDist = ttSmoothUnion(d1, ttSmoothUnion(d2, d3, 0.04), 0.04);

  // Fluid inside pipes (thinner radius, offset by flow phase)
  float fluidOff = sin(flowPhase + dot(cellId, vec3(1.7, 2.3, 3.1))) * 0.1;
  float fd1 = length(vec2(length(q1.xz) - majorR, q1.y + fluidOff)) - fluidRadius;
  float fd2 = length(vec2(length(q2.xz) - majorR, q2.y + fluidOff)) - fluidRadius;
  float fd3 = length(vec2(length(q3.xz) - majorR, q3.y + fluidOff)) - fluidRadius;
  float fluidDist = min(fd1, min(fd2, fd3));

  // Junction glow: where pipes from different axes meet (cell center)
  float junctionDist = length(cellPos) - 0.15;

  // Climax burst: pipes fracture open
  if (burstAmount > 0.01) {
    float fracture = burstAmount * 0.3;
    pipeDist += fracture * sin(cellPos.x * 12.0 + cellPos.y * 8.0 + cellPos.z * 10.0) * 0.1;
    fluidDist -= burstAmount * 0.2; // fluid expands outside pipes
  }

  return vec3(pipeDist, fluidDist, junctionDist);
}

// ─── Scene map: returns vec2(distance, materialId) ───
// materialId: 0=pipe, 1=fluid, 2=junction, 3=burst spray
vec2 ttMap(vec3 pos, float pipeRadius, float fluidRadius, float tension,
           float flowPhase, float burstAmount, float pressureWave, vec3 pressureOrigin) {
  vec3 cellId = floor(pos + 0.5);
  vec3 cellPos = fract(pos + 0.5) - 0.5;

  // Check current cell + neighbors for smooth boundaries
  float bestPipe = 1e6;
  float bestFluid = 1e6;
  float bestJunction = 1e6;

  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dz = -1; dz <= 1; dz++) {
        vec3 offset = vec3(float(dx), float(dy), float(dz));
        vec3 neighborId = cellId + offset;
        vec3 neighborPos = pos - neighborId;

        // Skip far cells for performance
        if (dot(neighborPos, neighborPos) > 3.0) continue;

        // Sparsity: some cells are empty when space score is high
        float sparsity = ttHash3(neighborId + 500.0);
        float sparsityThreshold = 0.0;
        // Use burstAmount as proxy — we'll pass adjusted values
        if (sparsity < sparsityThreshold) continue;

        vec3 cellResult = ttCell(neighborPos, neighborId, pipeRadius, fluidRadius,
                                 tension, flowPhase, burstAmount);

        bestPipe = min(bestPipe, cellResult.x);
        bestFluid = min(bestFluid, cellResult.y);
        bestJunction = min(bestJunction, cellResult.z);
      }
    }
  }

  // Pressure wave from drum onset: expanding ring
  if (pressureWave > 0.01) {
    float waveDist = abs(length(pos - pressureOrigin) - pressureWave * 8.0) - 0.15;
    bestFluid = ttSmoothUnion(bestFluid, waveDist, 0.2);
  }

  // Find closest surface and material
  float dist = bestPipe;
  float matId = 0.0;

  if (bestFluid < dist) {
    dist = bestFluid;
    matId = 1.0;
  }

  if (bestJunction < dist - 0.05) {
    dist = bestJunction;
    matId = 2.0;
  }

  // Burst spray: volumetric blobs during climax
  if (burstAmount > 0.1) {
    float sprayNoise = fbm3(pos * 3.0 + flowPhase * 0.5) * burstAmount;
    float sprayDist = length(cellPos) - 0.3 * burstAmount + sprayNoise * 0.2;
    if (sprayDist < dist) {
      dist = sprayDist;
      matId = 3.0;
    }
  }

  return vec2(dist, matId);
}

// ─── Raymarching ───
vec2 ttMarch(vec3 rayOrigin, vec3 rayDir, float pipeRadius, float fluidRadius,
             float tension, float flowPhase, float burstAmount,
             float pressureWave, vec3 pressureOrigin) {
  float traveled = 0.0;
  float matId = -1.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = rayOrigin + rayDir * traveled;
    vec2 scene = ttMap(pos, pipeRadius, fluidRadius, tension, flowPhase,
                       burstAmount, pressureWave, pressureOrigin);
    float dist = scene.x;

    if (dist < SURF_DIST) {
      matId = scene.y;
      break;
    }
    traveled += dist * 0.7; // relaxation factor for safety
    if (traveled > MAX_DIST) break;
  }

  return vec2(traveled, matId);
}

${ttNormalGLSL}
${ttAOGLSL}

// ─── Fluid glow (volumetric accumulation along ray) ───
vec3 ttFluid(vec3 rayOrigin, vec3 rayDir, float maxT, float flowPhase,
             float fluidIntensity, vec3 fluidColor, float burstAmount) {
  vec3 glow = vec3(0.0);
  float stepSize = 0.15;
  int steps = 24;

  for (int i = 0; i < 24; i++) {
    float t = float(i) * stepSize;
    if (t > maxT) break;
    vec3 pos = rayOrigin + rayDir * t;

    vec3 cellId = floor(pos + 0.5);
    vec3 cellPos = fract(pos + 0.5) - 0.5;

    // Distance to pipe centerline in this cell
    float h = ttHash3(cellId);
    float flip = step(0.5, h) * 2.0 - 1.0;
    vec3 q = cellPos; q.xz -= 0.5 * flip; q.xz = abs(q.xz);
    float centerDist = abs(length(q.xz) - 0.5);

    // Flow animation along pipe
    float flow = sin(flowPhase + dot(cellId, vec3(2.1, 3.7, 1.3)) + t * 2.0);
    flow = flow * 0.5 + 0.5;

    // Glow intensity falls off from pipe center
    float glowStr = exp(-centerDist * 12.0) * flow * fluidIntensity;

    // Burst spray: extra volumetric glow in cells
    if (burstAmount > 0.1) {
      float sprayGlow = exp(-length(cellPos) * 4.0) * burstAmount * 0.5;
      glowStr += sprayGlow;
    }

    glow += fluidColor * glowStr * stepSize;
  }

  return glow;
}

// ─── Pipe material shading ───
vec3 ttPipe(vec3 pos, vec3 norm, vec3 rayDir, vec3 lightDir, float matId,
            float occlusionVal, vec3 fluidColor, float energy, float vocalWarmth,
            float timbralSpec, float dynamicContrast, float beatStab) {
  vec3 col = vec3(0.0);

  if (matId < 0.5) {
    // ── Metallic pipe surface ──
    vec3 baseColor = mix(vec3(0.15, 0.14, 0.18), vec3(0.25, 0.22, 0.20), vocalWarmth);

    // Roughness from beat stability (stable = smoother)
    float roughness = mix(0.4, 0.15, beatStab);

    // Diffuse
    float diff = max(dot(norm, lightDir), 0.0) * 0.6;

    // Specular (Blinn-Phong with variable sharpness from timbral brightness)
    vec3 halfVec = normalize(lightDir - rayDir);
    float specPower = mix(16.0, 128.0, timbralSpec);
    float spec = pow(max(dot(norm, halfVec), 0.0), specPower);
    vec3 specColor = mix(vec3(0.8, 0.75, 0.7), vec3(1.0, 0.95, 0.9), timbralSpec);

    // Fresnel reflection
    float fresnel = pow(1.0 - abs(dot(norm, -rayDir)), 3.0);
    vec3 reflColor = mix(baseColor * 1.5, fluidColor * 0.3, fresnel * 0.4);

    // Inner glow bleeding through pipe walls
    float innerGlow = exp(-abs(dot(norm, rayDir)) * 3.0) * energy * 0.3;

    col = baseColor * (0.08 + diff) + specColor * spec * (0.5 + energy * 0.5)
        + reflColor * fresnel * 0.3 + fluidColor * innerGlow;

    // Dynamic range: contrast between dark metal and bright highlights
    col = mix(col * 0.5, col * 1.5, dynamicContrast * 0.3 + 0.5);

  } else if (matId < 1.5) {
    // ── Luminous fluid ──
    col = fluidColor * (1.5 + energy * 2.0);

    // Subsurface scattering effect
    float scatter = pow(max(dot(rayDir, lightDir), 0.0), 3.0);
    col += fluidColor * scatter * 0.8;

    // Pulsing core brightness
    col *= 1.0 + sin(pos.x * 4.0 + pos.y * 3.0 + pos.z * 5.0) * 0.2;

  } else if (matId < 2.5) {
    // ── Junction node ──
    col = fluidColor * 2.0 + vec3(0.5, 0.4, 0.3);
    float pulse = sin(pos.x + pos.y + pos.z + energy * TAU) * 0.5 + 0.5;
    col *= 1.0 + pulse * 0.5;

  } else {
    // ── Burst spray (climax) ──
    col = fluidColor * 3.0;
    col += vec3(1.0, 0.8, 0.5) * energy;
    // Volumetric scatter
    float scatter = pow(max(dot(rayDir, lightDir), 0.0), 2.0);
    col += vec3(1.0, 0.9, 0.7) * scatter * 1.5;
  }

  // Apply ambient occlusion
  col *= occlusionVal;

  return col;
}

// ─── Camera path through pipe network ───
vec3 ttCameraPath(float timeVal, float slowE, float orbitMod) {
  float speed = 0.3 + slowE * 0.2;
  float pathT = timeVal * speed;
  return vec3(
    sin(pathT * 0.7) * 2.0 + cos(pathT * 0.3) * 1.5,
    cos(pathT * 0.5) * 1.8 + sin(pathT * 0.4) * 1.0,
    pathT * 1.5 + sin(pathT * 0.6) * 0.8
  ) * (1.0 + orbitMod * 0.3);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // ─── Audio parameter extraction ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float accelBoost = 1.0 + uEnergyAccel * 0.1;
  float chromaHueMod = uChromaHue * 0.15;

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Flow speed: jam=rapid, space=near-still, chorus=full, solo=dramatic
  float flowSpeed = mix(1.0, 2.5, sJam) * mix(1.0, 0.1, sSpace)
                   * mix(1.0, 1.5, sChorus) * mix(1.0, 1.8, sSolo);
  float flowPhase = uDynamicTime * (0.5 + energy * 2.0) * flowSpeed * accelBoost;

  // Pipe radius: bass-pulsed
  float basePipeRadius = 0.06 + bass * 0.04;
  basePipeRadius *= mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace);

  // Fluid radius (inside pipes)
  float baseFluidRadius = basePipeRadius * 0.4 * mix(1.0, 1.6, sChorus) * mix(1.0, 0.2, sSpace);

  // Climax burst
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * uClimaxIntensity;
  float burstAmount = climaxIntensity * smoothstep(0.3, 1.0, climaxIntensity);

  // Pressure wave from drum onset
  float pressureWave = drumOnset;

  // Sparsity from space score (reduce pipe density)
  // (handled implicitly through thinner pipes and less fluid)

  // ─── Camera setup ───
  float camTime = uDynamicTime * 0.04;
  vec3 camOrigin = ttCameraPath(camTime, slowE, energy);

  // Look-ahead along path
  vec3 camLookAt = ttCameraPath(camTime + 0.3, slowE, energy);

  // Camera offset from uniforms
  camOrigin += vec3(uCamOffset.x, uCamOffset.y, 0.0) * 0.5;

  // Build camera matrix
  vec3 camForward = normalize(camLookAt - camOrigin);
  vec3 worldUp = vec3(sin(camTime * 0.15) * 0.1, 1.0, cos(camTime * 0.1) * 0.05);
  worldUp = normalize(worldUp);
  vec3 camSide = normalize(cross(camForward, worldUp));
  vec3 camUp = cross(camSide, camForward);

  float fov = 0.8 + energy * 0.2;
  vec3 rayDir = normalize(screenPos.x * camSide + screenPos.y * camUp + fov * camForward);

  // Pressure wave origin tracks camera with slight lag
  vec3 pressureOrigin = ttCameraPath(camTime - 0.5, slowE, energy);

  // ─── Fluid color from palette + audio ───
  float fluidHue = uPalettePrimary + melodicPitch * 0.2 + chromaHueMod;
  float fluidSat = mix(0.6, 1.0, energy) * uPaletteSaturation;
  float vocalWarmShift = vocalPresence * 0.08; // shift toward amber
  vec3 fluidColor = hsv2rgb(vec3(fluidHue + vocalWarmShift, fluidSat, 0.8 + energy * 0.2));

  // ─── Raymarch the scene ───
  vec2 marchResult = ttMarch(camOrigin, rayDir, basePipeRadius, baseFluidRadius,
                             tension, flowPhase, burstAmount, pressureWave, pressureOrigin);
  float travelDist = marchResult.x;
  float matId = marchResult.y;

  // ─── Background: deep void with subtle gradient ───
  vec3 col = mix(vec3(0.01, 0.008, 0.015), vec3(0.02, 0.015, 0.03),
                 screenPos.y * 0.5 + 0.5);

  // Volumetric fluid glow (always accumulated, even on miss)
  float fluidGlowIntensity = (0.3 + energy * 0.7) * mix(1.0, 0.05, sSpace)
                             * mix(1.0, 1.5, sChorus);
  vec3 volGlow = ttFluid(camOrigin, rayDir, min(travelDist, MAX_DIST * 0.5),
                         flowPhase, fluidGlowIntensity, fluidColor, burstAmount);
  col += volGlow * 0.4;

  if (matId >= 0.0 && travelDist < MAX_DIST) {
    vec3 surfPos = camOrigin + rayDir * travelDist;

    // Normal
    vec3 surfNorm = ttNormal(surfPos);

    // Light direction: follows camera loosely + fixed fill
    vec3 lightDir1 = normalize(vec3(0.5, 0.8, -0.3) + camForward * 0.3);
    vec3 lightDir2 = normalize(vec3(-0.3, -0.2, 0.8));

    // Ambient occlusion
    float occVal = ttOcclusion(surfPos, surfNorm);

    // Main shading
    vec3 surfCol = ttPipe(surfPos, surfNorm, rayDir, lightDir1, matId,
                          occVal, fluidColor, energy, vocalPresence,
                          timbralBright, dynRange, beatStab);

    // Fill light (cooler)
    float fillDiff = max(dot(surfNorm, lightDir2), 0.0) * 0.15;
    vec3 fillColor = hsv2rgb(vec3(uPaletteSecondary, 0.3, 0.5));
    surfCol += fillColor * fillDiff * occVal;

    // Reflections: fake environment reflection using fbm
    {
      vec3 reflDir = reflect(rayDir, surfNorm);
      float reflNoise = fbm3(reflDir * 2.0 + uDynamicTime * 0.02);
      vec3 reflCol = hsv2rgb(vec3(fluidHue + 0.15, 0.4, 0.3 + reflNoise * 0.3));
      float fresnel = pow(1.0 - abs(dot(surfNorm, -rayDir)), 4.0);
      surfCol += reflCol * fresnel * 0.25 * (0.5 + energy * 0.5);
    }

    // Onset flash at junctions
    if (onsetSnap > 0.3 && matId > 1.5 && matId < 2.5) {
      surfCol += vec3(1.0, 0.95, 0.85) * onsetSnap * 0.8;
    }

    // Distance fog
    float fogAmount = 1.0 - exp(-travelDist * 0.04);
    vec3 fogColor = fluidColor * 0.05 + vec3(0.01);
    surfCol = mix(surfCol, fogColor, fogAmount);

    col = surfCol;
    // Re-add volumetric glow on top (screen blend)
    col = col + volGlow * 0.3 - col * volGlow * 0.15;
  }

  // ─── Climax burst spray bloom ───
  if (burstAmount > 0.1) {
    float sprayBloom = burstAmount * energy * 0.3;
    vec3 sprayColor = fluidColor * 2.0 + vec3(0.3, 0.2, 0.1);
    col += sprayColor * sprayBloom * (1.0 - length(screenPos) * 0.8);
  }

  // ─── Pressure wave flash ───
  if (pressureWave > 0.1) {
    float waveBright = pressureWave * 0.15;
    col += fluidColor * waveBright;
  }

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.03));
    vec3 iconCol1 = hsv2rgb(vec3(fluidHue, fluidSat, 1.0));
    vec3 iconCol2 = hsv2rgb(vec3(uPaletteSecondary, fluidSat, 1.0));
    col += iconEmergence(screenPos, uTime, energy, bass, iconCol1, iconCol2, nf,
                         uClimaxPhase, uSectionIndex) * 0.5;
  }

  // ─── Hero icon emergence ───
  if (uHeroIconTrigger > 0.5) {
    float nf = fbm3(vec3(screenPos * 1.5, uDynamicTime * 0.02));
    vec3 heroCol1 = fluidColor * 1.5;
    vec3 heroCol2 = hsv2rgb(vec3(uPaletteSecondary + 0.1, 0.9, 1.0));
    col += heroIconEmergence(screenPos, uTime, energy, bass, heroCol1, heroCol2, nf,
                             uClimaxPhase, uHeroIconProgress) * 0.7;
  }

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
