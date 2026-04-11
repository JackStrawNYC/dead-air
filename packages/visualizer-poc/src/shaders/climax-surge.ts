/**
 * Climax Surge — raymarched 3D energy vortex.
 *
 * A massive energy buildup that explodes outward. Concentric shockwave
 * ring SDFs expanding from center, volumetric particle debris, energy
 * bloom. Designed specifically for peak moments. Raymarched 3D scene
 * with proper SDF geometry for rings, debris particles, and a
 * central energy core.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> overall intensity, ring count, step quality
 *   uBass            -> ring thickness, central core size
 *   uOnsetSnap       -> new shockwave ring spawn, flash
 *   uDrumOnset       -> starburst ray intensity, debris burst
 *   uClimaxPhase     -> gates appearance (only active during climax)
 *   uClimaxIntensity -> amplifies all effects
 *   uMusicalTime     -> beat-locked ring timing
 *   uFastEnergy      -> responsive brightness spikes
 *   uHighs           -> specular sharpness on ring surfaces
 *   uHarmonicTension -> ring distortion, energy arc complexity
 *   uVocalEnergy     -> warm energy bloom at core
 *   uEnergyForecast  -> anticipatory ring pre-expansion
 *   uStemDrums       -> starburst reinforcement
 *   uTimbralBrightness -> emission intensity scaling
 *   uPalettePrimary/Secondary -> ring/core palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const climaxSurgeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const csNormalGLSL = buildRaymarchNormal(
  "csSceneMap($P, timeVal, musTime, bass, onset, tension, forecast, ringCountMod, explSpeed).x",
  { eps: 0.003, name: "csCalcNormal" },
);
const csAOGLSL = buildRaymarchAO(
  "csSceneMap($P, timeVal, musTime, bass, onset, tension, forecast, ringCountMod, explSpeed).x",
  { steps: 5, stepBase: -0.04, stepScale: 0.06, weightDecay: 0.7, finalMult: 3.0, name: "csCalcAO" },
);

export const climaxSurgeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, bloomThresholdOffset: -0.15, halationEnabled: true, caEnabled: true, thermalShimmerEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define CS_MAX_STEPS 80
#define CS_MAX_DIST 40.0
#define CS_SURF_DIST 0.002
#define CS_NUM_RINGS 8
#define CS_NUM_DEBRIS 16
#define CS_VOL_STEPS 24

// ─── SDF: torus (shockwave ring) ───
float csTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

// ─── SDF: sphere ───
float csSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

// ─── SDF: elongated ellipsoid (debris particle) ───
float csEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float csSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Rotate 2D ───
vec2 csRot2D(vec2 coord, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * coord.x - s * coord.y, s * coord.x + c * coord.y);
}

// ─── Scene map: expanding rings + core + debris ───
// Returns vec2(dist, matID): 0=core, 1=ring, 2=debris
vec2 csSceneMap(vec3 pos, float timeVal, float musTime, float bass, float onset,
                float tension, float forecast, float ringCountMod, float explSpeed) {
  float result = CS_MAX_DIST;
  float matID = -1.0;

  // === CENTRAL ENERGY CORE ===
  float coreRadius = 0.3 + bass * 0.2 + onset * 0.15;
  // Pulsating with noise displacement
  float coreNoise = snoise(vec3(pos * 3.0 + timeVal * 0.5)) * 0.1;
  float coreDist = csSphere(pos, coreRadius) + coreNoise;
  if (coreDist < result) {
    result = coreDist;
    matID = 0.0;
  }

  // === SHOCKWAVE RINGS ===
  for (int idx = 0; idx < CS_NUM_RINGS; idx++) {
    float fi = float(idx);

    // Ring timing: staggered based on musical time
    float ringPhase = fract(musTime * 0.25 * ringCountMod - fi * 0.125);
    float ringRadius = ringPhase * 8.0 * explSpeed; // expanding outward

    // Ring thickness: thinner as it expands
    float ringThickness = (0.08 + bass * 0.04) * (1.0 - ringPhase * 0.7);

    // Skip tiny or huge rings
    if (ringRadius < 0.1 || ringRadius > 7.0) continue;

    // Ring with noise distortion from tension
    vec3 ringPos = pos;
    if (tension > 0.3) {
      float distort = snoise(vec3(atan(pos.z, pos.x) * 2.0, pos.y * 3.0, timeVal + fi)) * tension * 0.2;
      ringPos.y += distort;
    }

    // Tilt rings for visual variety
    ringPos.xz = csRot2D(ringPos.xz, fi * 0.3);
    ringPos.xy = csRot2D(ringPos.xy, fi * 0.15 + timeVal * 0.02);

    float ringDist = csTorus(ringPos, ringRadius, ringThickness);

    // Anticipatory pre-expansion from forecast
    if (forecast > 0.3) {
      float preRingPhase = fract(musTime * 0.25 * ringCountMod - fi * 0.125 + 0.05);
      float preRadius = preRingPhase * 8.0 * explSpeed;
      float preDist = csTorus(ringPos, preRadius, ringThickness * 0.5);
      ringDist = csSmoothMin(ringDist, preDist, 0.1);
    }

    if (ringDist < result) {
      result = ringDist;
      matID = 1.0 + fi * 0.1; // encode ring index in matID
    }
  }

  // === DEBRIS PARTICLES ===
  for (int didx = 0; didx < CS_NUM_DEBRIS; didx++) {
    float dfi = float(didx);
    float seedVal = dfi * 13.7;

    // Debris trajectory: radial outward from center
    float debrisAngle = fract(sin(seedVal) * 43758.5453) * 2.0 * PI;
    float debrisPhi = fract(sin(seedVal + 7.0) * 23421.6) * PI - PI * 0.5;
    float debrisSpeed = (fract(sin(seedVal + 3.0) * 12345.6) * 0.5 + 0.3) * explSpeed;

    // Time-based radial expansion
    float debrisPhase = fract(musTime * 0.5 - dfi * 0.05);
    float debrisR = debrisPhase * debrisSpeed * 6.0;

    // 3D position
    vec3 debrisPos = vec3(
      cos(debrisAngle) * cos(debrisPhi),
      sin(debrisPhi),
      sin(debrisAngle) * cos(debrisPhi)
    ) * debrisR;

    // Elongated ellipsoid along velocity direction
    vec3 debrisLocal = pos - debrisPos;

    // Align with radial direction
    vec3 velDir = normalize(debrisPos + vec3(0.001));
    vec3 worldUp2 = abs(velDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 debrisSide = normalize(cross(worldUp2, velDir));
    vec3 debrisUp = cross(velDir, debrisSide);

    vec3 aligned = vec3(
      dot(debrisLocal, debrisSide),
      dot(debrisLocal, velDir),
      dot(debrisLocal, debrisUp)
    );

    float debrisFade = (1.0 - debrisPhase);
    float debrisSize = 0.04 * debrisFade + 0.01;
    float debrisDist = csEllipsoid(aligned, vec3(debrisSize, debrisSize * 3.0, debrisSize));

    if (debrisDist < result) {
      result = debrisDist;
      matID = 2.0 + dfi * 0.01;
    }
  }

  return vec2(result, matID);
}

${csNormalGLSL}
${csAOGLSL}

// ─── Volumetric energy density (for glow between rings) ───
float csEnergyDensity(vec3 pos, float timeVal, float energy, float bass) {
  float dist = length(pos);
  // Radial energy falloff
  float radialD = exp(-dist * 0.3);
  // Swirling noise
  float noiseD = fbm3(vec3(pos * 0.5 + timeVal * 0.1));
  return clamp(radialD * (0.3 + noiseD * 0.5) * energy, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float musTime = uMusicalTime;

  float timeVal = uDynamicTime;

  // Section modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float explSpeed = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.15, sChorus);
  float ringCountMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.1, sChorus);
  float debrisDensityMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.2, sChorus);

  // Climax gating
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxI = uClimaxIntensity;
  float gate = isClimax * climaxI;

  // Even without full climax, energy > 0.6 triggers partial visuals
  float partialGate = max(gate, smoothstep(0.6, 0.9, energy) * 0.5);

  // Palette
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.7, 1.0, energy) * uPaletteSaturation;

  vec3 coreColor = paletteHueColor(hue1, sat, 0.95);
  vec3 ringColor = paletteHueColor(hue2, sat, 0.95);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera pulls back as energy increases, giving scale to the explosion
  float camDist = 6.0 + energy * 2.0 + gate * 3.0;
  ro += vec3(sin(timeVal * 0.03) * 1.0, 0.5, camDist);

  // === PRIMARY RAYMARCH ===
  float marchDist = 0.0;
  vec2 marchResult = vec2(0.0);
  bool marchHitSurface = false;

  for (int idx = 0; idx < CS_MAX_STEPS; idx++) {
    vec3 marchPos = ro + rd * marchDist;
    marchResult = csSceneMap(marchPos, timeVal, musTime, bass, onset, tension, forecast, ringCountMod, explSpeed);
    if (marchResult.x < CS_SURF_DIST) {
      marchHitSurface = true;
      break;
    }
    if (marchDist > CS_MAX_DIST) break;
    marchDist += marchResult.x * 0.8;
  }

  // Background: hot gradient during climax, dark otherwise
  vec3 bgColor = mix(
    vec3(0.01, 0.005, 0.02),
    vec3(0.06, 0.02, 0.05),
    partialGate * energy
  );
  // Radial glow in background
  float bgRadial = exp(-dot(screenP, screenP) * 2.0) * partialGate * 0.3;
  bgColor += coreColor * bgRadial;

  vec3 col = bgColor;

  if (marchHitSurface) {
    vec3 marchPos = ro + rd * marchDist;
    vec3 norm = csCalcNormal(marchPos);
    float matID = marchResult.y;

    float occl = csCalcAO(marchPos, norm);

    // Lighting: point light at center + directional from above
    vec3 toLightDir = normalize(-marchPos); // toward center
    vec3 upLightDir = normalize(vec3(0.3, 1.0, 0.2));
    float centerDist = length(marchPos);

    float diffuse = max(dot(norm, toLightDir), 0.0) * 0.6 + max(dot(norm, upLightDir), 0.0) * 0.3;
    vec3 halfVec = normalize(toLightDir - rd);
    float specPower = 32.0 + highs * 64.0;
    float specular = pow(max(dot(norm, halfVec), 0.0), specPower);
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    if (matID < 0.5) {
      // Central energy core
      float coreEmission = (2.0 + fastE * 1.5 + gate * 2.0) * (0.5 + timbralBright * 0.5);
      vec3 coreGlow = mix(coreColor, vec3(1.0, 0.95, 0.9), 0.4) * coreEmission;
      // Vocal warmth in core
      coreGlow += vec3(0.15, 0.08, 0.02) * vocalE;
      col = coreGlow * occl;
      col += vec3(1.0, 0.98, 0.95) * specular * 0.5;
      col += coreColor * fresnel * 0.4;

    } else if (matID < 2.0) {
      // Shockwave ring
      float ringIdx = (matID - 1.0) * 10.0;
      float ringPhase = fract(musTime * 0.25 * ringCountMod - ringIdx * 0.125);

      // Ring color: prismatic shift per ring (shortest-arc palette blend)
      float csRingHueDiff = fract(hue2 - hue1 + 0.5) - 0.5;
      float ringHue = fract(hue1 + csRingHueDiff * (ringIdx / float(CS_NUM_RINGS)));
      vec3 thisRingColor = paletteHueColor(ringHue, sat, 0.95);

      // Ring emission: bright, fading as it expands
      float ringBright = (1.0 - ringPhase) * (1.5 + gate * 2.0 + timbralBright * 0.5);

      // Edge glow via fresnel
      vec3 ringLit = thisRingColor * ringBright;
      ringLit += thisRingColor * fresnel * 0.5;
      ringLit += vec3(1.0, 0.95, 0.9) * specular * 0.3;

      col = ringLit * occl;

    } else {
      // Debris particles
      float debrisBright = (0.8 + energy * 0.5 + gate * 1.0) * debrisDensityMod;
      vec3 debrisCol = mix(coreColor, ringColor, 0.5);
      col = debrisCol * debrisBright * occl;
      col += debrisCol * fresnel * 0.3;
      col += vec3(1.0, 0.95, 0.9) * specular * 0.2;
    }

    // Distance fog (minimal — this shader should be bright)
    float fogAmount = 1.0 - exp(-marchDist * 0.02);
    col = mix(col, bgColor, fogAmount * 0.5);
  }

  // === VOLUMETRIC ENERGY GLOW ===
  {
    vec3 volAccum = vec3(0.0);
    float volAlpha = 0.0;
    float volMaxDist = marchHitSurface ? marchDist : 20.0;
    float volStep = volMaxDist / float(CS_VOL_STEPS);

    for (int vidx = 0; vidx < CS_VOL_STEPS; vidx++) {
      float volT = float(vidx) * volStep;
      vec3 volPos = ro + rd * volT;

      float density = csEnergyDensity(volPos, timeVal, energy, bass) * 0.05 * partialGate;

      if (density > 0.001) {
        float alpha = density * (1.0 - volAlpha);

        // Scattered light color
        float volDist = length(volPos);
        vec3 volColor = mix(coreColor, ringColor, smoothstep(1.0, 5.0, volDist));
        volColor *= (1.0 + gate * 0.5);

        volAccum += volColor * alpha;
        volAlpha += alpha;
        if (volAlpha > 0.9) break;
      }
    }

    col += volAccum;
  }

  // === STARBURST RAYS (raymarched through 2D angular pattern) ===
  {
    float angle = atan(screenP.y, screenP.x);
    float dist = length(screenP);
    float rayCount = 16.0;
    float rayAngle = mod(angle * rayCount / (2.0 * PI) + timeVal * 0.5, 1.0);
    float rayShape = pow(abs(sin(rayAngle * PI)), 24.0);
    float rayFade = exp(-dist * 2.0);
    float rayIntensity = rayShape * rayFade * (drumOnset * 0.8 + energy * 0.2 + stemDrums * 0.3);
    vec3 rayCol = mix(ringColor, vec3(1.0, 0.95, 0.9), 0.3);
    col += rayCol * rayIntensity * (0.2 + partialGate * 0.6);
  }

  // === ONSET FLASH ===
  col += vec3(1.0, 0.98, 0.95) * onset * 0.25 * partialGate;

  // Beat pulse
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.1 * (1.0 + gate * 0.3);

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(screenP * 2.0, timeVal * 0.1));
    vec3 c1 = paletteHueColor(hue1, sat, 0.95);
    vec3 c2 = paletteHueColor(hue2, sat, 0.95);
    col += stealieEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase);
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
