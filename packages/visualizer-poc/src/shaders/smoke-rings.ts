/**
 * Smoke Rings — raymarched volumetric toroidal vortices.
 * True 3D smoke ring structures rising through space, each ring a volumetric
 * torus density field with turbulent FBM displacement. Multiple rings at
 * different stages of formation and dissolution. Camera looks up through
 * rising rings.
 *
 * Audio reactivity:
 *   uBass             → ring size / thickness
 *   uEnergy           → ring count / density
 *   uDrumOnset        → new ring launch
 *   uVocalPresence    → warm backlight glow
 *   uHarmonicTension  → turbulence / dissolution rate
 *   uSectionType      → jam=rapid rings, space=single floating, chorus=chain
 *   uClimaxPhase      → rings collide and merge into massive vortex
 *   uSlowEnergy       → drift speed
 *   uStemBass         → ring inner thickness
 *   uChromaHue        → hue modulation
 *   uChordIndex       → chord-shifted ring color
 *   uMelodicPitch     → vertical camera tilt
 *   uBeatStability    → ring coherence
 *   uDynamicRange     → density contrast
 *   uShaderHoldProgress → ring density evolves: sparse → dense → dissolving
 *   uSemanticPsychedelic → smoke takes vivid rainbow tints
 *   uSemanticCosmic   → deep space blue wash in background
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const smokeRingsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  caEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  temporalBlendEnabled: false,
});

export const smokeRingsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define SR_PI 3.14159265
#define SR_TAU 6.28318530
#define SR_MAX_STEPS 64
#define SR_MAX_RINGS 7
#define SR_MAX_DIST 18.0
#define SR_DENSITY_SCALE 0.065

// ─── Torus SDF: distance from point to torus surface ───
// majorR = ring radius, minorR = tube thickness
float srTorusSDF(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

// ─── Single ring density: torus with FBM turbulence ───
// Returns volumetric density at point p for ring centered at ringCenter
float srRingDensity(vec3 pos, vec3 ringCenter, float majorR, float minorR,
                    float turbulence, float dissolve, float phase) {
  // Transform to ring-local space
  vec3 localP = pos - ringCenter;

  // Tilt ring slightly based on its phase (rings wobble as they rise)
  float tiltAngle = sin(phase * SR_TAU + uDynamicTime * 0.3) * 0.15;
  float cs = cos(tiltAngle);
  float sn = sin(tiltAngle);
  localP.xy = mat2(cs, -sn, sn, cs) * localP.xy;

  // Base torus distance
  float dist = srTorusSDF(localP, majorR, minorR);

  // FBM turbulence displaces the surface
  float noiseScale = 2.5 + turbulence * 3.0;
  float noiseTime = uDynamicTime * 0.12 * (1.0 + turbulence * 0.8);
  vec3 noisePos = localP * noiseScale + vec3(0.0, noiseTime, phase * 10.0);
  float displacement = fbm6(noisePos) * minorR * (0.8 + turbulence * 1.5);

  dist += displacement;

  // Convert SDF to density (exponential falloff from surface)
  float density = exp(-max(dist, 0.0) * (6.0 - dissolve * 3.0));

  // Interior density boost (inside the torus tube)
  float interior = smoothstep(minorR * 0.5, -minorR * 0.2, dist);
  density += interior * 0.4;

  // Dissolve: reduce density as ring ages
  density *= (1.0 - dissolve * 0.7);

  return clamp(density, 0.0, 1.0);
}

// ─── Volumetric smoke field: sum of all ring densities ───
// Returns total density and dominant ring index for coloring
float srSmokeDensity(vec3 pos, float bassV, float energyV, float onsetV,
                     float tensionV, float climaxMerge, float sJam,
                     float sSpace, float sChorus, float stabilityV,
                     float dynRange, out float ringAge) {
  float totalDensity = 0.0;
  ringAge = 0.0;
  float maxContrib = 0.0;

  // Ring count: 2 base + energy drives up to MAX_RINGS
  // Section modulation: jam=more, space=1, chorus=3-4
  float countF = mix(2.0, float(SR_MAX_RINGS), energyV);
  countF = mix(countF, countF * 1.4, sJam);
  countF = mix(countF, 1.0, sSpace);
  countF = mix(countF, min(countF, 4.0), sChorus);
  int ringCount = int(clamp(countF, 1.0, float(SR_MAX_RINGS)));

  // Ring parameters
  float baseMajorR = 0.6 + bassV * 0.5;       // bass → ring size
  float baseMinorR = 0.12 + bassV * 0.08;      // bass → tube thickness
  float riseSpeed = (0.08 + uSlowEnergy * 0.06) * mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace);

  for (int idx = 0; idx < SR_MAX_RINGS; idx++) {
    if (idx >= ringCount) break;
    float fi = float(idx);

    // Each ring has a staggered phase in its lifecycle
    float basePhase = fract(uDynamicTime * riseSpeed * 0.01 + fi * 0.143);

    // Drum onset launches rings faster (phase jump)
    float onsetBoost = onsetV * 0.15 * exp(-fi * 0.5);
    float phase = fract(basePhase + onsetBoost);

    // Ring lifecycle: 0=forming at bottom, 0.5=mid-rise, 1=dissolving at top
    float lifeProgress = phase;

    // Ring center: rises vertically, slight horizontal drift
    float yPos = mix(-3.0, 5.0, lifeProgress);  // rise from below to above
    float xDrift = sin(fi * 2.37 + uDynamicTime * 0.08) * 0.4 * (1.0 - sSpace * 0.8);
    float zDrift = cos(fi * 3.14 + uDynamicTime * 0.06) * 0.3;
    vec3 ringCenter = vec3(xDrift, yPos, zDrift);

    // Size evolves: starts small, expands, then disperses
    float sizeEnvelope = smoothstep(0.0, 0.15, lifeProgress) * smoothstep(1.0, 0.7, lifeProgress);
    float majorR = baseMajorR * sizeEnvelope * (0.8 + fi * 0.06);
    float minorR = baseMinorR * sizeEnvelope * (1.0 + stabilityV * 0.2);

    // Turbulence from harmonic tension; dissolution increases with age
    float ringTurbulence = tensionV * (0.5 + lifeProgress * 0.5);
    float dissolve = smoothstep(0.5, 1.0, lifeProgress) * (0.8 + tensionV * 0.4);

    // Chorus: tighter spacing (chain effect)
    if (sChorus > 0.3) {
      ringCenter.y = mix(ringCenter.y, -2.0 + fi * 1.2, sChorus * 0.6);
    }

    // Climax: rings converge toward center and merge
    if (climaxMerge > 0.0) {
      ringCenter = mix(ringCenter, vec3(0.0, 1.0, 0.0), climaxMerge * 0.7);
      majorR *= (1.0 + climaxMerge * 0.8);  // rings swell
      minorR *= (1.0 + climaxMerge * 1.2);  // tubes thicken
      ringTurbulence += climaxMerge * 0.6;   // more turbulent merge
    }

    float density = srRingDensity(pos, ringCenter, majorR, minorR,
                                  ringTurbulence, dissolve, phase);

    // Dynamic range controls density contrast
    density = pow(density, mix(1.0, 0.6, dynRange));

    // Track dominant ring for coloring
    if (density > maxContrib) {
      maxContrib = density;
      ringAge = lifeProgress;
    }

    totalDensity += density;
  }

  // Climax massive vortex: additional swirling density at center
  if (climaxMerge > 0.3) {
    float vortexDist = length(pos - vec3(0.0, 1.0, 0.0));
    float vortexAngle = atan(pos.z, pos.x) + uDynamicTime * 0.5 * climaxMerge;
    float spiralNoise = fbm3(vec3(vortexAngle * 2.0, vortexDist * 3.0, uDynamicTime * 0.2));
    float vortexDensity = exp(-vortexDist * 0.8) * spiralNoise * climaxMerge * 0.6;
    totalDensity += max(0.0, vortexDensity);
  }

  // Ambient haze: subtle atmospheric density everywhere
  float haze = fbm3(pos * 0.3 + vec3(uDynamicTime * 0.02)) * 0.03 * energyV;
  totalDensity += haze;

  return clamp(totalDensity, 0.0, 1.0);
}

// ─── Volumetric scattering color: Henyey-Greenstein phase + palette ───
vec3 srScatterColor(vec3 rayDir, vec3 lightDir, float density, float ringAge,
                    float energyV, float vocalV, float chromaHueMod,
                    float chordHue, float climaxMerge) {
  // Forward scattering (Henyey-Greenstein approximation, g=0.7)
  float cosTheta = dot(rayDir, lightDir);
  float gParam = 0.7;
  float phase = (1.0 - gParam * gParam) /
                (4.0 * SR_PI * pow(1.0 + gParam * gParam - 2.0 * gParam * cosTheta, 1.5));

  // Base smoke color from palette
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chromaHueMod * 0.5;
  vec3 warmColor = hsv2rgb(vec3(hue1, 0.35 * uPaletteSaturation, 0.7));
  vec3 coolColor = hsv2rgb(vec3(hue2, 0.25 * uPaletteSaturation, 0.5));

  // Young rings are brighter/warmer, old rings are cooler/dimmer
  vec3 baseColor = mix(warmColor, coolColor, ringAge);

  // Vocal presence → warm amber backlight
  vec3 backlightColor = vec3(1.0, 0.85, 0.55) * vocalV * 0.4;

  // Forward scatter adds bright highlight
  vec3 scatterTint = mix(vec3(0.9, 0.85, 0.75), vec3(1.0, 0.7, 0.4), energyV);
  vec3 scattered = scatterTint * phase * 0.3;

  // Rim glow at density edges
  float rimStrength = smoothstep(0.4, 0.1, density) * smoothstep(0.01, 0.1, density);
  vec3 rimColor = hsv2rgb(vec3(hue1 + 0.15, 0.6, 0.8)) * rimStrength * 0.5;

  // Climax: rings glow white-hot
  vec3 climaxGlow = vec3(1.0, 0.95, 0.85) * climaxMerge * density * 0.4;

  return baseColor * density + scattered + backlightColor * density + rimColor + climaxGlow;
}

// ─── Depth fog: atmospheric distance-based extinction ───
vec3 srDepthFog(vec3 col, float dist, float energyV) {
  float fogDensity = 0.04 + energyV * 0.02;
  float fogAmount = 1.0 - exp(-dist * fogDensity);
  vec3 fogColor = hsv2rgb(vec3(uPalettePrimary + 0.05, 0.15, 0.04));
  return mix(col, fogColor, fogAmount);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energyV = clamp(uEnergy, 0.0, 1.0);
  float bassV = clamp(uBass, 0.0, 1.0);
  float stemBassV = clamp(uStemBass, 0.0, 1.0);
  float vocalV = clamp(uVocalPresence, 0.0, 1.0);
  float tensionV = clamp(uHarmonicTension, 0.0, 1.0);
  float onsetV = clamp(uDrumOnset, 0.0, 1.0);
  float stabilityV = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.2;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowEnergyV = clamp(uSlowEnergy, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxMerge = isClimax * climaxIntensity;

  // === RAY SETUP (camera looks upward through rising rings) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Nudge camera to look slightly upward; melodic pitch tilts more
  float verticalTilt = 0.3 + melodicPitch * 0.2 + sSpace * 0.2;
  rd = normalize(rd + vec3(0.0, verticalTilt, 0.0));

  // === LIGHT DIRECTION (warm overhead, shifted by vocal presence) ===
  vec3 lightDir = normalize(vec3(0.3 + vocalV * 0.3, 1.0, -0.2));

  // === VOLUMETRIC RAYMARCH ===
  // Adaptive step count: 32 quiet, 64 at peaks
  int stepCount = int(mix(32.0, 64.0, energyV) + sJam * 8.0 - sSpace * 8.0);
  float stepSize = SR_MAX_DIST / float(SR_MAX_STEPS);

  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;
  float accumDist = 0.0;

  for (int marchStep = 0; marchStep < SR_MAX_STEPS; marchStep++) {
    if (marchStep >= stepCount) break;
    if (accumAlpha > 0.95) break;  // early termination

    float fi = float(marchStep);
    float marchDist = 0.5 + fi * stepSize;
    vec3 samplePos = ro + rd * marchDist;

    // Sample density
    float ringAge;
    float density = srSmokeDensity(samplePos, bassV, energyV, onsetV,
                                   tensionV, climaxMerge, sJam, sSpace,
                                   sChorus, stabilityV, dynRange, ringAge);

    if (density > 0.002) {
      // Scale density for integration
      float scaledDensity = density * SR_DENSITY_SCALE * stepSize;

      // Compute color at this sample
      vec3 sampleColor = srScatterColor(rd, lightDir, density, ringAge,
                                        energyV, vocalV, chromaHueMod,
                                        chordHue, climaxMerge);

      // Volumetric lighting: secondary march toward light (3 steps)
      float lightAccum = 0.0;
      for (int ls = 0; ls < 3; ls++) {
        float lt = float(ls + 1) * 0.3;
        vec3 lightSample = samplePos + lightDir * lt;
        float dummy;
        float lightDensity = srSmokeDensity(lightSample, bassV, energyV, onsetV,
                                            tensionV, climaxMerge, sJam, sSpace,
                                            sChorus, stabilityV, dynRange, dummy);
        lightAccum += lightDensity * 0.3;
      }
      float lightTransmit = exp(-lightAccum * 3.0);

      // Apply lighting: Beer-Lambert extinction + forward scatter
      sampleColor *= lightTransmit;
      sampleColor += vec3(1.0, 0.9, 0.75) * lightTransmit * density * 0.08;

      // Depth-based dimming
      float depthFade = exp(-marchDist * 0.06);
      sampleColor *= depthFade;

      // Front-to-back compositing
      float alpha = scaledDensity * (1.0 - accumAlpha);
      accumColor += sampleColor * alpha;
      accumAlpha += alpha;
      accumDist += marchDist * alpha;
    }
  }

  // === BACKGROUND: deep atmospheric gradient ===
  float skyGrad = smoothstep(-0.3, 0.8, rd.y);
  vec3 deepColor = hsv2rgb(vec3(uPalettePrimary + 0.55, 0.3, 0.02));
  vec3 upperColor = hsv2rgb(vec3(uPaletteSecondary + 0.1, 0.2, 0.06));
  vec3 skyColor = mix(deepColor, upperColor, skyGrad);

  // Subtle background nebula noise
  float bgNoise = fbm3(vec3(rd.xz * 2.0, uDynamicTime * 0.02)) * 0.03;
  skyColor += bgNoise * vec3(0.4, 0.3, 0.5) * energyV;

  // Vocal presence → warm backlight glow behind rings
  float backlightGlow = pow(max(0.0, dot(rd, lightDir)), 3.0) * vocalV * 0.15;
  skyColor += vec3(1.0, 0.8, 0.5) * backlightGlow;

  // Composite rings over background
  vec3 col = mix(skyColor, accumColor, accumAlpha);

  // === DEPTH FOG ===
  float avgDist = accumAlpha > 0.01 ? accumDist / accumAlpha : SR_MAX_DIST;
  col = srDepthFog(col, avgDist, energyV);

  // === DRUM ONSET FLASH (new ring birth flash) ===
  col += vec3(0.08, 0.06, 0.03) * onsetV * (1.0 - accumAlpha) * 0.5;

  // === HOLD PROGRESS: ring spacing and density evolves ===
  // Early hold: sparse rings, wide spacing. Mid hold: dense formation. Late hold: dissolving grandeur.
  float holdDensity = smoothstep(0.0, 0.4, holdP) * (1.0 - smoothstep(0.8, 1.0, holdP) * 0.3);
  col *= 0.8 + holdDensity * 0.2; // overall brightness evolves

  // === BEAT PULSE ===
  col *= 1.0 + uBeatSnap * 0.1 * (1.0 + climaxMerge * 0.3);

  // === SEMANTIC ATMOSPHERE ===
  // Psychedelic: smoke takes on vivid rainbow tints
  col = mix(col, col * vec3(1.1, 0.95, 1.15), psyche * 0.35);
  // Cosmic: deep space blue wash in background
  col += vec3(0.005, 0.008, 0.02) * cosmic * (1.0 - accumAlpha) * 0.5;

  // === SOLO: brighter center, more contrast ===
  if (sSolo > 0.0) {
    float centerGlow = exp(-length(p) * 2.5) * sSolo * 0.15;
    col += vec3(centerGlow) * hsv2rgb(vec3(uPalettePrimary, 0.5, 1.0));
  }

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(p * 2.0, uDynamicTime * 0.1));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    col += iconEmergence(p, uTime, energyV, bassV, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(p, uTime, energyV, bassV, c1, c2, nf, uSectionIndex);
  }

  // === VIGNETTE ===
  float vigScale = mix(0.28, 0.20, energyV);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.004, 0.003, 0.006), col, vignette);

  // === POST-PROCESSING ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
