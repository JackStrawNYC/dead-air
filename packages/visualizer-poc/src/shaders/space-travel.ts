/**
 * Space Travel — raymarched wormhole transit.
 * Spiraling tunnel of spacetime, star streaks, event horizon membrane,
 * destination star visible at the far end. Full 3D SDF raymarched scene
 * replacing the previous 2D warping implementation.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → wormhole transit speed, tunnel distortion intensity
 *   uBass             → tunnel breathing pulse, event horizon throb
 *   uHighs            → star streak sharpness, tunnel detail
 *   uOnsetSnap        → gravitational lensing flash, burst forward
 *   uBeatSnap         → tunnel ring pulse sync
 *   uSlowEnergy       → ambient star glow, tunnel luminosity
 *   uHarmonicTension  → spacetime distortion, tunnel twist rate
 *   uBeatStability    → smooth transit vs turbulent passage
 *   uMelodicPitch     → tunnel curvature, color temperature
 *   uChromaHue        → tunnel wall color shift
 *   uChordIndex       → ring hue micro-rotation
 *   uVocalEnergy      → destination star brightness
 *   uSpectralFlux     → plasma stream density in tunnel
 *   uSectionType      → jam=warp speed, space=floating in void, solo=approach dest
 *   uClimaxPhase      → event horizon crossing, maximum distortion
 *   uPalettePrimary/Secondary → tunnel + destination colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const spaceTravelVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const st2NormalGLSL = buildRaymarchNormal("st2SceneSDF($P, tunnelRadius, twist, flowTime, bassBreath).x", { eps: 0.003, name: "st2CalcNormal" });
const st2AOGLSL = buildRaymarchAO("st2SceneSDF($P, tunnelRadius, twist, flowTime, bassBreath).x", { steps: 5, stepBase: 0.0, stepScale: 0.1, weightDecay: 0.6, finalMult: 2.5, name: "st2CalcAO" });

export const spaceTravelFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({ grainStrength: "light", flareEnabled: true, halationEnabled: true, caEnabled: true, bloomEnabled: true, bloomThresholdOffset: -0.1 })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 96
#define MAX_DIST 40.0
#define SURF_DIST 0.003

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — st2 namespace
// ═══════════════════════════════════════════════════════════

float st2SdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float st2SdTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float st2SdCappedCylinder(vec3 pos, float radius, float halfH) {
  float dR = length(pos.xz) - radius;
  float dY = abs(pos.y) - halfH;
  return min(max(dR, dY), 0.0) + length(max(vec2(dR, dY), 0.0));
}

// ═══════════════════════════════════════════════════════════
// Wormhole tunnel SDF — spiraling tube with interior detail
// ═══════════════════════════════════════════════════════════

float st2WormholeTunnel(vec3 pos, float tunnelRadius, float twist, float flowTime, float bassBreath) {
  // Tunnel: inverted cylinder (we are inside)
  float tunnelR = tunnelRadius * (1.0 + bassBreath * 0.1);

  // Spiral twist: rotate XZ as we go along Y (tunnel axis)
  float twistAngle = pos.y * twist + flowTime * 0.3;
  float tc = cos(twistAngle);
  float ts = sin(twistAngle);
  vec2 twistedXZ = mat2(tc, -ts, ts, tc) * pos.xz;

  // Distance to tunnel wall (inverted — inside)
  float distToWall = tunnelR - length(twistedXZ);

  // Surface detail: ridges along the tunnel
  float ridges = sin(pos.y * 4.0 + flowTime * 2.0) * 0.1;
  ridges += snoise(vec3(twistedXZ * 2.0, pos.y * 0.5 + flowTime * 0.2)) * 0.08;
  distToWall += ridges;

  return distToWall;
}

// Event horizon membrane — thin spherical shell
float st2EventHorizon(vec3 pos, float radius, float flowTime) {
  float shellDist = abs(length(pos) - radius) - 0.05;
  // Distortion noise on the membrane
  float distortion = fbm3(vec3(pos * 1.5 + flowTime * 0.1)) * 0.15;
  shellDist += distortion;
  return shellDist;
}

// Ring structures inside the wormhole
float st2TunnelRings(vec3 pos, float tunnelRadius, float flowTime) {
  float minDist = 100.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ringY = mod(pos.y + flowTime * 3.0 + fi * 3.0, 18.0) - 9.0;
    vec3 ringPos = vec3(pos.x, ringY, pos.z);
    float ring = st2SdTorus(ringPos, tunnelRadius * 0.8, 0.03 + 0.02 * sin(fi * 2.1));
    minDist = min(minDist, ring);
  }
  return minDist;
}

// ═══════════════════════════════════════════════════════════
// Scene SDF
// ═══════════════════════════════════════════════════════════

vec2 st2SceneSDF(vec3 pos, float tunnelRadius, float twist, float flowTime, float bassBreath) {
  float matId = 0.0;

  // Tunnel wall
  float tunnel = st2WormholeTunnel(pos, tunnelRadius, twist, flowTime, bassBreath);
  float minDist = -tunnel; // invert: we want to hit the wall from inside
  matId = 0.0;

  // Tunnel rings
  float rings = st2TunnelRings(pos, tunnelRadius, flowTime);
  if (rings < minDist) { minDist = rings; matId = 1.0; }

  // Event horizon at entrance (behind camera initially)
  float horizon = st2EventHorizon(pos - vec3(0.0, -15.0, 0.0), 3.0, flowTime);
  if (horizon < minDist) { minDist = horizon; matId = 2.0; }

  // Destination star at far end
  float destStar = st2SdSphere(pos - vec3(0.0, 25.0, 0.0), 1.5);
  if (destStar < minDist) { minDist = destStar; matId = 3.0; }

  return vec2(minDist, matId);
}

// Normal & AO — generated by shared raymarching utilities
${st2NormalGLSL}
${st2AOGLSL}

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
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Transit speed: massive dynamic range
  float transitSpeed = mix(0.5, 6.0, energy * energy);
  transitSpeed *= mix(1.0, 2.0, sJam) * mix(1.0, 0.1, sSpace);
  transitSpeed += onset * 3.0;
  transitSpeed += climaxBoost * 2.0;

  float flowTime = uDynamicTime * 0.1;
  float tunnelRadius = 2.5 + sin(flowTime * 0.2) * 0.3;
  float twist = 0.15 + tension * 0.3 + energy * 0.15;
  twist *= mix(1.0, 0.3, stability);
  float bassBreath = bass;

  // Palette
  float hue1 = uPalettePrimary + chromaH * 0.15 + chordHue;
  float hue2 = uPaletteSecondary + chromaH * 0.1;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;
  vec3 tunnelCol = hsv2rgb(vec3(hue1, sat, 0.8));
  tunnelCol = mix(tunnelCol, vec3(0.2, 0.1, 0.5), 0.3); // cosmic purple
  vec3 ringCol = hsv2rgb(vec3(hue2, sat * 0.9, 0.9));
  vec3 destStarCol = mix(vec3(1.0, 0.95, 0.85), hsv2rgb(vec3(hue2, 0.3, 1.0)), 0.3);
  vec3 palCol1 = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.85));

  // ═══ Camera: inside the wormhole, moving forward ═══
  float camY = uDynamicTime * transitSpeed;
  float camSway = sin(flowTime * 0.4) * 0.3 * (1.0 - stability * 0.5);
  vec3 camOrigin = vec3(camSway, camY, cos(flowTime * 0.3) * 0.2);

  // Look ahead with slight pitch from melody
  vec3 camLookAt = camOrigin + vec3(0.0, 5.0, 0.0);
  camLookAt.x += melPitch * 0.5;

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 0.0, 1.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);

  // Barrel roll
  float rollAngle = sin(flowTime * 0.6) * 0.15 * (1.0 - stability * 0.5);
  vec3 rolledRight = camRt * cos(rollAngle) + camUpDir * sin(rollAngle);
  vec3 rolledUp = -camRt * sin(rollAngle) + camUpDir * cos(rollAngle);

  float fov = 1.2 + bass * 0.2;
  vec3 rayDir = normalize(screenPos.x * rolledRight + screenPos.y * rolledUp + fov * camFwd);

  // ═══ Raymarch ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = st2SceneSDF(marchPos, tunnelRadius, twist, flowTime, bassBreath);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += max(sceneDist * 0.7, 0.01);
  }

  vec3 col = vec3(0.005, 0.003, 0.015); // deep space void

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = st2CalcNormal(hitPos);
    float ambOcc = st2CalcAO(hitPos, normal);

    vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0));
    float diff = max(dot(normal, lightDir), 0.0) * 0.5 + 0.5;
    vec3 halfVec = normalize(lightDir - rayDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 48.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    if (matId < 0.5) {
      // Tunnel walls: emissive spacetime fabric
      float wallAngle = atan(hitPos.z, hitPos.x);
      float wallPattern = sin(wallAngle * 8.0 + hitPos.y * 2.0 + flowTime * 1.0) * 0.5 + 0.5;
      wallPattern *= fbm3(vec3(hitPos * 0.5 + flowTime * 0.1)) * 0.5 + 0.5;
      vec3 wallColor = tunnelCol * wallPattern * (0.3 + energy * 0.7);
      wallColor += tunnelCol * fresnel * 0.4;
      wallColor += spec * vec3(0.5, 0.4, 0.8) * 0.3;
      // Plasma streams on walls
      float plasma = fbm6(vec3(hitPos.xz * 1.5, hitPos.y * 0.3 + flowTime * 0.5));
      wallColor += ringCol * max(0.0, plasma) * flux * 0.3;
      col = wallColor;
    } else if (matId < 1.5) {
      // Tunnel rings: bright energy rings
      vec3 rCol = ringCol * (0.5 + energy * 0.5);
      rCol += vec3(1.0, 0.95, 0.9) * spec * 0.5;
      rCol += ringCol * fresnel * 0.3;
      // Beat pulse on rings
      rCol *= 1.0 + effectiveBeat * 0.4;
      col = rCol;
    } else if (matId < 2.5) {
      // Event horizon: swirling gravitational lens
      vec3 horizonCol = mix(tunnelCol, vec3(0.0, 0.0, 0.0), 0.5);
      float lensing = fbm6(vec3(hitPos * 2.0 + flowTime * 0.3));
      horizonCol += ringCol * max(0.0, lensing) * 0.5;
      horizonCol += fresnel * vec3(0.3, 0.2, 0.6) * 0.5;
      col = horizonCol * (0.3 + energy * 0.4);
    } else {
      // Destination star: bright white-hot
      float starGlow = 1.0 + vocalE * 0.8 + bass * 0.3;
      col = destStarCol * starGlow;
    }

    col *= ambOcc;
    float fogDist = totalDist / MAX_DIST;
    col = mix(col, vec3(0.005, 0.003, 0.015), fogDist * fogDist * 0.5);
  }

  // ═══ Volumetric tunnel glow ═══
  {
    vec3 volGlow = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float marchT = float(i) * 1.0 + 0.3;
      vec3 samplePos = camOrigin + rayDir * marchT;
      float distToAxis = length(samplePos.xz);
      float tunnelGlow = smoothstep(tunnelRadius, 0.0, distToAxis) * 0.015;
      // Color varies along tunnel
      float colorMix = fbm3(vec3(samplePos * 0.2, flowTime * 0.1)) * 0.5 + 0.5;
      vec3 glowColor = mix(tunnelCol, ringCol, colorMix);
      glowColor *= (0.3 + energy * 0.7);
      volGlow += glowColor * tunnelGlow;
    }
    col += volGlow;
  }

  // ═══ Star streaks ═══
  {
    float warpFactor = smoothstep(0.15, 0.8, energy) * mix(1.0, 1.5, sJam) * mix(1.0, 0.1, sSpace);
    warpFactor += onset * 0.5 + climaxBoost * 0.4;
    float radialDist = length(screenPos);
    float streakAngle = atan(screenPos.y, screenPos.x);
    float streakPattern = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float freq = 30.0 + fi * 17.0;
      float phase = uDynamicTime * transitSpeed * 0.5 + fi * 100.0;
      float streak = pow(abs(sin(streakAngle * freq + phase)), 80.0);
      streak *= smoothstep(0.0, 0.2, radialDist) * smoothstep(1.0, 0.3, radialDist);
      streakPattern += streak * (1.0 - fi * 0.25);
    }
    vec3 streakColor = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.9, 0.8), radialDist);
    col += streakColor * streakPattern * warpFactor * 0.15;
  }

  // ═══ Gravitational lensing flash on onset ═══
  if (onset > 0.5) {
    float flashDist = length(screenPos);
    float flash = smoothstep(0.8, 0.0, flashDist) * (onset - 0.5) * 3.0;
    col += vec3(0.6, 0.5, 1.0) * flash * 0.5;
  }

  // Beat + climax
  col *= 1.0 + effectiveBeat * 0.12;
  col *= 1.0 + climaxBoost * 0.4;

  // Vignette: tunnel focus
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.002, 0.01), col, vignette);

  // Icon emergence
  {
    float nf = fbm3(vec3(screenPos * 2.0, uDynamicTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
