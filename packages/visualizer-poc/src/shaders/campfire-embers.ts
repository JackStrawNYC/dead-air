/**
 * Campfire Embers — raymarched volumetric fire pit with rising ember particles,
 * smoke columns, heat distortion, and desert night sky.
 * Designed for "Me And My Uncle" — cowboy outlaw story, uptempo driving beat.
 *
 * You're sitting around a fire in the desert at night. The fire is the sole
 * light source: warm, primal, intimate.
 *
 * Audio reactivity:
 *   uBass             → flame height/width, deep fire pulse
 *   uEnergy           → flame intensity, ember count
 *   uDrumOnset        → spark burst (ember explosion)
 *   uVocalPresence    → warm glow radius expansion
 *   uHarmonicTension  → flame color shift (warm → aggressive)
 *   uBeatSnap         → crackle flash
 *   uSectionType      → jam=roaring fire, space=dying embers, chorus=full blaze
 *   uClimaxPhase      → fire erupts upward, ember shower
 *   uSlowEnergy       → smoke drift speed
 *   uHighs            → ember sharpness, spark detail
 *   uMelodicPitch     → flame tip height modulation
 *   uDynamicRange     → flame contrast
 *   uSpaceScore       → dampens to embers-only when high
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const campfireEmbersVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.12,
  caEnabled: true,
  beatPulseEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  lightLeakEnabled: true,
  thermalShimmerEnabled: true,
  grainStrength: "normal",
});

const ceNormalGLSL = buildRaymarchNormal("ceMap($P, timeVal)", { eps: 0.001, name: "ceNormal" });

export const campfireEmbersFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_MARCH_STEPS 64
#define MAX_MARCH_DIST 20.0
#define SURF_DIST 0.005
#define EMBER_COUNT 24

// ─── Hash functions for procedural randomness ───
float ceHash(float n) { return fract(sin(n) * 43758.5453123); }
float ceHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 ceHash3(float n) {
  return vec3(
    fract(sin(n * 127.1) * 43758.5453),
    fract(sin(n * 269.5) * 43758.5453),
    fract(sin(n * 419.2) * 43758.5453)
  );
}

// ─── SDF primitives ───
float ceSDBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float ceSDCylinder(vec3 pos, float radius, float halfHeight) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float ceSDSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float ceSDPlane(vec3 pos, float yLevel) {
  return pos.y - yLevel;
}

// Smooth minimum for organic blending
float ceSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Fire density field (volumetric FBM flame) ───
float ceFireDensity(vec3 pos, float bass, float energy, float flameHeight, float flameWidth, float timeVal) {
  // Vertical cone envelope — flame tapers upward
  float coneRadius = flameWidth * (1.0 - smoothstep(0.0, flameHeight, pos.y));
  float horizontalDist = length(pos.xz);
  float coneField = horizontalDist - coneRadius;

  // Only compute noise inside the cone vicinity
  if (coneField > 0.8) return 0.0;

  // Advect upward with curl noise influence
  vec3 advected = pos;
  advected.y -= timeVal * (1.5 + bass * 0.8);
  advected.xz += vec2(
    sin(pos.y * 2.0 + timeVal * 0.7) * 0.15,
    cos(pos.y * 1.8 + timeVal * 0.5) * 0.12
  );

  // Multi-octave fire turbulence
  float turb = fbm6(advected * 1.8);
  turb += fbm3(advected * 3.5 + 10.0) * 0.4;

  // Density: inside cone, modulated by turbulence
  float density = smoothstep(0.3, -0.2, coneField);
  density *= (0.5 + turb * 0.5);
  density *= smoothstep(-0.1, 0.2, pos.y); // fade below ground
  density *= smoothstep(flameHeight + 0.3, flameHeight * 0.5, pos.y); // fade at tip
  density *= 0.6 + energy * 0.6;

  return clamp(density, 0.0, 1.0);
}

// ─── Flame color by height (deep red core → orange → yellow tips) ───
vec3 ceFlameColor(float heightNorm, float tension, float chromaHueMod) {
  // Base fire palette
  vec3 coreColor = vec3(0.9, 0.15, 0.02);  // deep red at base
  vec3 midColor  = vec3(1.0, 0.45, 0.05);  // orange
  vec3 tipColor  = vec3(1.0, 0.85, 0.25);  // yellow tips
  vec3 hotWhite  = vec3(1.0, 0.95, 0.8);   // white-hot center

  vec3 col = mix(coreColor, midColor, smoothstep(0.0, 0.35, heightNorm));
  col = mix(col, tipColor, smoothstep(0.35, 0.7, heightNorm));
  col = mix(col, hotWhite, smoothstep(0.7, 1.0, heightNorm) * 0.4);

  // Tension shifts color: warm → aggressive (more red/magenta)
  col = mix(col, col * vec3(1.1, 0.7, 0.5), tension * 0.3);

  // Chroma hue modulation: subtle palette tint
  float hueShift = chromaHueMod * 0.15;
  vec3 hsv = rgb2hsv(col);
  hsv.x = fract(hsv.x + hueShift);
  col = hsv2rgb(hsv);

  return col;
}

// ─── Log SDFs (teepee structure at fire base) ───
float ceLogStructure(vec3 pos) {
  // Three logs arranged in teepee formation
  float logRadius = 0.06;
  float logLen = 0.7;

  // Log 1: leaning from front-left
  vec3 p1 = pos - vec3(-0.25, 0.0, -0.2);
  float angle1 = 0.85;
  float c1 = cos(angle1); float s1 = sin(angle1);
  p1.yz = mat2(c1, s1, -s1, c1) * p1.yz;
  float log1 = ceSDCylinder(p1, logRadius, logLen);

  // Log 2: leaning from front-right
  vec3 p2 = pos - vec3(0.25, 0.0, -0.2);
  float angle2 = 0.85;
  float c2 = cos(angle2); float s2 = sin(angle2);
  p2.yz = mat2(c2, s2, -s2, c2) * p2.yz;
  // Rotate around Y for spread
  float yr2 = 0.8;
  float cy2 = cos(yr2); float sy2 = sin(yr2);
  p2.xz = mat2(cy2, sy2, -sy2, cy2) * p2.xz;
  float log2 = ceSDCylinder(p2, logRadius, logLen);

  // Log 3: leaning from back
  vec3 p3 = pos - vec3(0.0, 0.0, 0.3);
  float angle3 = 0.85;
  float c3 = cos(angle3); float s3 = sin(angle3);
  p3.yz = mat2(c3, s3, -s3, c3) * p3.yz;
  float yr3 = -0.4;
  float cy3 = cos(yr3); float sy3 = sin(yr3);
  p3.xz = mat2(cy3, sy3, -sy3, cy3) * p3.xz;
  float log3 = ceSDCylinder(p3, logRadius, logLen);

  // Log 4: cross piece
  vec3 p4 = pos - vec3(0.15, 0.05, 0.0);
  float angle4 = 1.1;
  float c4 = cos(angle4); float s4 = sin(angle4);
  p4.yz = mat2(c4, s4, -s4, c4) * p4.yz;
  float yr4 = 1.5;
  float cy4 = cos(yr4); float sy4 = sin(yr4);
  p4.xz = mat2(cy4, sy4, -sy4, cy4) * p4.xz;
  float log4 = ceSDCylinder(p4, logRadius * 0.8, logLen * 0.6);

  return min(min(log1, log2), min(log3, log4));
}

// ─── Ground plane with pebble displacement ───
float ceGround(vec3 pos, float timeVal) {
  float ground = ceSDPlane(pos, 0.0);
  // Pebble noise: small bumps on the ground surface
  float pebbles = snoise(vec3(pos.xz * 8.0, 0.0)) * 0.02;
  pebbles += snoise(vec3(pos.xz * 20.0, 1.0)) * 0.008;
  ground -= pebbles;
  return ground;
}

// ─── Scene SDF (solid geometry only — fire is volumetric, not SDF) ───
float ceMap(vec3 pos, float timeVal) {
  float ground = ceGround(pos, timeVal);
  float logs = ceLogStructure(pos);

  // Small stones around the fire ring
  float stoneRing = 1e5;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float stoneAngle = fi * TAU / 10.0 + ceHash(fi) * 0.3;
    float stoneR = 0.55 + ceHash(fi + 10.0) * 0.12;
    vec3 stonePos = vec3(cos(stoneAngle) * stoneR, 0.02, sin(stoneAngle) * stoneR);
    float stoneSize = 0.04 + ceHash(fi + 20.0) * 0.03;
    float stone = ceSDSphere(pos - stonePos, stoneSize);
    stoneRing = min(stoneRing, stone);
  }

  return min(min(ground, logs), stoneRing);
}

// Normal — generated by shared raymarching utilities
${ceNormalGLSL}

// ─── Star field ───
vec3 ceStarField(vec3 rayDir) {
  vec3 stars = vec3(0.0);
  // Only render stars above horizon
  if (rayDir.y < 0.05) return stars;

  // Layer 1: bright stars
  vec2 starUv = rayDir.xz / (rayDir.y + 0.001);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 cell = floor(starUv * (15.0 + fi * 10.0));
    float starHash = ceHash2(cell + fi * 100.0);
    if (starHash > 0.92) {
      vec2 starCenter = (cell + 0.5 + (ceHash2(cell + 7.0) - 0.5) * 0.8) / (15.0 + fi * 10.0);
      float dist = length(starUv - starCenter);
      float brightness = smoothstep(0.02 / (1.0 + fi), 0.0, dist);
      float twinkle = 0.7 + 0.3 * sin(ceHash(starHash * 100.0) * TAU + uTime * (1.0 + ceHash(starHash * 200.0) * 3.0));
      stars += vec3(0.8, 0.85, 1.0) * brightness * twinkle * 0.4;
    }
  }
  return stars;
}

// ─── Smoke density (above the flame) ───
float ceSmokeDensity(vec3 pos, float timeVal, float slowEnergy, float energy) {
  // Smoke sits above the flame, drifts slowly
  float smokeBase = smoothstep(0.8, 1.5, pos.y) * smoothstep(4.0, 2.0, pos.y);
  if (smokeBase < 0.01) return 0.0;

  float driftSpeed = 0.1 + slowEnergy * 0.15;
  vec3 smokeP = pos;
  smokeP.y -= timeVal * driftSpeed;
  smokeP.xz += vec2(sin(timeVal * 0.2) * 0.3, cos(timeVal * 0.15) * 0.2);

  float smokeTurb = fbm3(smokeP * 0.8) * 0.5 + 0.5;
  smokeTurb *= fbm(smokeP * 1.6 + 20.0) * 0.5 + 0.5;

  float horizontalFade = smoothstep(1.2, 0.0, length(pos.xz));
  float density = smokeBase * smokeTurb * horizontalFade;
  density *= 0.3 + (1.0 - energy) * 0.4; // more visible smoke at lower energy

  return clamp(density, 0.0, 1.0);
}

// ─── Ember particle field ───
vec3 ceEmberParticles(vec3 rayOrigin, vec3 rayDir, float energy, float bass,
                      float drumOnset, float climaxBoost, float timeVal) {
  vec3 embers = vec3(0.0);
  int emberCount = int(mix(12.0, 24.0, energy + climaxBoost * 0.5));

  for (int i = 0; i < EMBER_COUNT; i++) {
    if (i >= emberCount) break;
    float fi = float(i);
    vec3 seed = ceHash3(fi * 7.13 + 3.14);

    // Ember position: rises from fire center, spirals outward
    float emberLife = fract(seed.x * 3.7 + timeVal * (0.08 + seed.y * 0.06));
    float emberHeight = emberLife * (3.0 + energy * 2.0 + climaxBoost * 3.0);
    float spiralAngle = seed.z * TAU + timeVal * (0.5 + seed.x * 0.3) + emberLife * 4.0;
    float spiralRadius = 0.1 + emberLife * (0.4 + seed.y * 0.3);

    // Drum onset → spark burst: jolt outward
    float burstOffset = drumOnset * seed.x * 0.8;
    spiralRadius += burstOffset;

    vec3 emberPos = vec3(
      cos(spiralAngle) * spiralRadius,
      emberHeight,
      sin(spiralAngle) * spiralRadius
    );

    // Ray-sphere intersection for each ember
    vec3 toEmber = emberPos - rayOrigin;
    float tProj = dot(toEmber, rayDir);
    if (tProj < 0.0) continue;
    vec3 closest = rayOrigin + rayDir * tProj;
    float distToEmber = length(closest - emberPos);

    // Ember size: tiny glowing sphere
    float emberSize = 0.015 + seed.y * 0.01 + bass * 0.005;
    float glow = smoothstep(emberSize * 3.0, 0.0, distToEmber);
    float brightness = smoothstep(emberSize, 0.0, distToEmber);

    // Flicker
    float flicker = 0.6 + 0.4 * sin(fi * 17.3 + timeVal * (8.0 + seed.z * 6.0));

    // Fade with life
    float lifeFade = smoothstep(0.0, 0.1, emberLife) * smoothstep(1.0, 0.7, emberLife);

    // Ember color: orange core, dimmer as they rise
    vec3 emberCol = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.3, 0.05), emberLife);
    emberCol *= 1.0 + brightness * 1.5;

    embers += emberCol * (glow * 0.3 + brightness * 0.7) * flicker * lifeFade * (0.5 + energy * 0.5);
  }

  return embers;
}

// ─── Heat distortion UV warp ───
vec2 ceHeatDistortion(vec2 uv, vec2 p, float bass, float onsetSnap, float energy, float timeVal) {
  // Distortion strongest above fire center, fading outward
  float verticalMask = smoothstep(-0.1, 0.3, p.y) * smoothstep(0.8, 0.2, abs(p.x));
  float distortStr = (0.01 + bass * 0.015 + onsetSnap * 0.02) * verticalMask * (0.5 + energy * 0.5);
  vec2 distort = vec2(
    snoise(vec3(p * 12.0, timeVal * 3.0)),
    snoise(vec3(p * 12.0 + 50.0, timeVal * 3.0 + 30.0))
  ) * distortStr;
  return uv + distort;
}

void main() {
  vec2 rawUv = vUv;
  rawUv = applyCameraCut(rawUv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 centeredP = (rawUv - 0.5) * aspect;

  // ─── Audio parameter clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0) * clamp(uMelodicConfidence, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  // ─── Section type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam = roaring fire, space = dying embers, chorus = full blaze
  float fireScale = mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.4, sChorus) * mix(1.0, 1.2, sSolo);
  float fireScale2 = fireScale * (1.0 - spaceScore * 0.5); // space score dampens further

  // ─── Climax reactivity ───
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  float timeVal = uDynamicTime;

  // ─── Heat distortion (UV warp before scene rendering) ───
  vec2 distortedUv = ceHeatDistortion(rawUv, centeredP, bass, onsetSnap, energy, timeVal);
  vec2 distortedP = (distortedUv - 0.5) * aspect;

  // ─── Camera setup: sitting across the fire, looking slightly down ───
  vec3 camPosition = vec3(
    sin(timeVal * 0.03) * 0.15,
    0.8 + bass * 0.08,
    -2.2 + energy * 0.1
  );
  vec3 lookAtPt = vec3(0.0, 0.6 + melPitch * 0.3, 0.0);
  vec3 camForward = normalize(lookAtPt - camPosition);
  vec3 camRightDir = normalize(cross(camForward, vec3(0.0, 1.0, 0.0)));
  vec3 camUpDir = cross(camRightDir, camForward);
  float fov = 1.2;
  vec3 rayDir = normalize(camForward * fov + camRightDir * distortedP.x + camUpDir * distortedP.y);

  // ─── Flame parameters (audio-driven) ───
  float flameHeight = (1.2 + bass * 0.8 + melPitch * 0.4 + climaxBoost * 1.5) * fireScale2;
  float flameWidth = (0.35 + bass * 0.15 + energy * 0.1) * mix(1.0, 1.3, sChorus) * mix(1.0, 0.4, sSpace);

  // ─── Raymarch solid scene ───
  float marchDist = 0.0;
  float sceneT = -1.0;
  vec3 sceneHitPos = vec3(0.0);
  bool sceneHitFlag = false;

  for (int i = 0; i < MAX_MARCH_STEPS; i++) {
    vec3 marchPos = camPosition + rayDir * marchDist;
    float sceneDist = ceMap(marchPos, timeVal);
    if (sceneDist < SURF_DIST) {
      sceneT = marchDist;
      sceneHitPos = marchPos;
      sceneHitFlag = true;
      break;
    }
    marchDist += sceneDist;
    if (marchDist > MAX_MARCH_DIST) break;
  }

  // ─── Background: dark desert night sky with stars ───
  vec3 col = vec3(0.0);
  vec3 skyColor = mix(vec3(0.01, 0.005, 0.02), vec3(0.02, 0.01, 0.04), rayDir.y * 0.5 + 0.5);
  skyColor += ceStarField(rayDir);
  col = skyColor;

  // ─── Shade solid geometry (ground, logs, stones) ───
  if (sceneHitFlag) {
    vec3 nrm = ceNormal(sceneHitPos);

    // Fire as the sole light source
    vec3 fireCenter = vec3(0.0, 0.4, 0.0);
    vec3 lightDir = normalize(fireCenter - sceneHitPos);
    float lightDist = length(fireCenter - sceneHitPos);
    float attenuation = 1.0 / (1.0 + lightDist * lightDist * 0.5);

    float diffuse = max(dot(nrm, lightDir), 0.0);
    float ambient = 0.02;

    // Fire light color: warm orange-red
    vec3 fireLight = vec3(1.0, 0.5, 0.15) * (0.6 + energy * 0.5 + climaxBoost * 0.3);
    // Vocal presence expands warm glow radius
    attenuation *= 1.0 + vocalPresence * 0.4;

    // Ground color: dark earth
    vec3 groundCol = vec3(0.06, 0.04, 0.03);
    // Logs: dark wood
    float isLog = 1.0 - step(0.01, ceGround(sceneHitPos, timeVal));
    vec3 matColor = mix(groundCol, vec3(0.12, 0.06, 0.03), isLog);

    col = matColor * (ambient + diffuse * fireLight * attenuation);

    // Firelight rim on ground (radial falloff from fire center)
    float groundFireDist = length(sceneHitPos.xz);
    float firelightRim = smoothstep(2.0 + vocalPresence, 0.3, groundFireDist);
    col += matColor * fireLight * firelightRim * attenuation * 0.3;
  }

  // ─── Volumetric fire accumulation ───
  {
    vec3 fireAccum = vec3(0.0);
    float fireAlpha = 0.0;
    int fireSteps = int(mix(24.0, 48.0, energy + climaxBoost * 0.3));
    float stepSize = 0.06;

    for (int i = 0; i < 48; i++) {
      if (i >= fireSteps) break;
      float ft = float(i) * stepSize + 0.1;
      if (sceneHitFlag && ft > sceneT) break; // behind solid
      vec3 firePos = camPosition + rayDir * ft;

      // Only sample near the fire region
      if (firePos.y < -0.1 || firePos.y > flameHeight + 1.0) continue;
      if (length(firePos.xz) > flameWidth + 1.0) continue;

      float density = ceFireDensity(firePos, bass, energy, flameHeight, flameWidth, timeVal);
      if (density < 0.01) continue;

      // Color by height in flame
      float heightNorm = clamp(firePos.y / max(flameHeight, 0.1), 0.0, 1.0);
      vec3 fireCol = ceFlameColor(heightNorm, tension, chromaHueMod + chordHue);

      // Emission intensity: bright core, softer edges
      float emission = density * (2.0 + energy * 1.5 + climaxBoost * 2.0);

      // Beat snap crackle flash
      emission *= 1.0 + effectiveBeat * 0.4;

      // Drum onset → bright flash at base
      float baseBurst = drumOnset * smoothstep(0.5, 0.0, heightNorm) * 0.8;
      emission += baseBurst;

      fireAccum += fireCol * emission * stepSize * (1.0 - fireAlpha);
      fireAlpha += density * stepSize * 0.8;
      if (fireAlpha > 0.95) break;
    }

    // Additive blend: fire illuminates scene
    col = col * (1.0 - fireAlpha * 0.3) + fireAccum;
  }

  // ─── Volumetric smoke ───
  {
    float smokeAlpha = 0.0;
    vec3 smokeAccum = vec3(0.0);
    int smokeSteps = int(mix(8.0, 20.0, slowE));

    for (int i = 0; i < 20; i++) {
      if (i >= smokeSteps) break;
      float st = float(i) * 0.15 + 0.5;
      if (sceneHitFlag && st > sceneT) break;
      vec3 smokePos = camPosition + rayDir * st;

      float smokeDens = ceSmokeDensity(smokePos, timeVal, slowE, energy);
      if (smokeDens < 0.01) continue;

      // Smoke is dark, slightly warm-tinted from firelight below
      vec3 smokeCol = vec3(0.08, 0.06, 0.04) * (1.0 + energy * 0.3);
      // Firelight illuminating smoke from below
      float smokeLightDist = length(smokePos - vec3(0.0, 0.5, 0.0));
      float smokeLight = 1.0 / (1.0 + smokeLightDist * smokeLightDist * 0.8);
      smokeCol += vec3(0.6, 0.25, 0.08) * smokeLight * 0.4;

      smokeAccum += smokeCol * smokeDens * 0.15 * (1.0 - smokeAlpha);
      smokeAlpha += smokeDens * 0.05;
      if (smokeAlpha > 0.6) break;
    }

    col = mix(col, smokeAccum, smokeAlpha * 0.5);
  }

  // ─── Ember particles ───
  col += ceEmberParticles(camPosition, rayDir, energy, bass, drumOnset, climaxBoost, timeVal);

  // ─── Broad firelight wash (ensures no pixel is dead black near the fire) ───
  {
    float fireDist = length(centeredP - vec2(0.0, -0.05));
    float firelightWash = smoothstep(1.2 + vocalPresence * 0.4, 0.0, fireDist);
    vec3 warmWash = vec3(0.5, 0.2, 0.06) * firelightWash * (0.08 + energy * 0.12 + bass * 0.06);
    warmWash *= 1.0 + climaxBoost * 0.3;
    col += warmWash;
  }

  // ─── Beat snap: crackle flash (brief bright pulse) ───
  {
    float crackle = effectiveBeat * 0.15;
    float crackleMask = smoothstep(0.6, 0.0, length(centeredP - vec2(0.0, 0.1)));
    col += vec3(1.0, 0.7, 0.3) * crackle * crackleMask;
  }

  // ─── Flame contrast from dynamic range ───
  {
    float flameContrast = mix(0.85, 1.25, dynRange);
    float lumVal = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lumVal), col, flameContrast);
  }

  // ─── SDF hero icon ───
  {
    vec3 iconC1 = paletteHueColor(uPalettePrimary + chromaHueMod + chordHue, uPaletteSaturation, 1.0);
    vec3 iconC2 = paletteHueColor(uPaletteSecondary, uPaletteSaturation, 1.0);
    float noiseField = fbm3(vec3(centeredP * 2.0, timeVal * 0.1));
    col += heroIconEmergence(centeredP, uTime, energy, bass, iconC1, iconC2, noiseField, uSectionIndex);
  }

  // ─── Semantic modulations ───
  // Aggressive → more intense fire
  col *= 1.0 + uSemanticAggressive * 0.15;
  // Tender → warmer, softer glow
  col = mix(col, col * vec3(1.05, 0.95, 0.85), uSemanticTender * 0.2);
  // Ambient → more smoke visibility
  col = mix(col, col + vec3(0.02, 0.015, 0.01), uSemanticAmbient * 0.15);

  // ─── Strong vignette: fire falls off at edges into darkness ───
  {
    float vigScale = mix(0.55, 0.38, energy + vocalPresence * 0.2);
    float vigDot = dot(centeredP * vigScale, centeredP * vigScale);
    float vigVal = 1.0 - vigDot;
    vigVal = smoothstep(0.0, 0.8, vigVal);
    vec3 vigTint = vec3(0.03, 0.015, 0.008); // very dark warm
    col = mix(vigTint, col, vigVal);
  }

  // ─── Post-processing (shared chain) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, centeredP);

  gl_FragColor = vec4(col, 1.0);
}
`;
