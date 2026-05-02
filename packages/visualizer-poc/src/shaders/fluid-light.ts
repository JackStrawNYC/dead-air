/**
 * Fluid Light — raymarched 3D bioluminescent fluid simulation.
 * Camera submerged in glowing fluid — volumetric density field that flows
 * with curl noise, multiple fluid layers mixing with different colors,
 * meniscus surface visible above.
 *
 * Visual aesthetic:
 *   - Quiet: dim phosphorescent glow, slow flowing density
 *   - Building: colors intensify, flow speed increases, new layers emerge
 *   - Peak: blazing bioluminescence, dense swirling vortices, surface churns
 *   - Release: glow fades, density settles, surface calms
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           -> bioluminescence brightness + flow speed
 *   uBass             -> viscosity (thick slow flow vs thin fast flow)
 *   uMids             -> mid-layer density
 *   uHighs            -> surface caustic sharpness + specular on meniscus
 *   uOnsetSnap        -> new luminous blob injection
 *   uBeatSnap         -> pulse throb through all fluid layers
 *   uVocalPresence    -> warm color shift in primary fluid
 *   uSlowEnergy       -> base flow drift speed
 *   uClimaxPhase      -> fluid erupts upward through meniscus (2+)
 *   uClimaxIntensity  -> eruption magnitude
 *   uHarmonicTension  -> color mixing turbulence
 *   uMelodicPitch     -> light source depth (high=near surface, low=deep)
 *   uSectionType      -> jam=turbulent, space=glacial, chorus=vibrant
 *   uBeatStability    -> flow laminar/turbulent character
 *   uDynamicRange     -> density contrast between layers
 *   uChromaHue        -> primary fluid hue
 *   uMusicalTime      -> convection rotation direction
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";

const fl2NormalGLSL = buildRaymarchNormal(
  "fl2Map($P, time, fl2BeatPulse, churn, blobCount, climaxErupt)",
  { eps: 0.004, name: "fl2Normal" },
);
const fl2AOGLSL = buildRaymarchAO(
  "fl2Map($P, time, fl2BeatPulse, churn, blobCount, climaxErupt)",
  { steps: 5, stepBase: 0.0, stepScale: 0.1, weightDecay: 0.6, finalMult: 2.0, name: "fl2AmbientOcclusion" },
);
const fl2DepthAlpha = buildDepthAlphaOutput("marchT", "FL2_MAX_DIST");

export const fluidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fluidLightFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.12,
  caEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define FL2_MAX_STEPS 80
#define FL2_MAX_DIST 20.0
#define FL2_SURF_DIST 0.003

// ============================================================
// Utility
// ============================================================
mat2 fl2Rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float fl2Hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// ============================================================
// Fluid density field: multi-layer curl noise advection
// ============================================================
float fl2FluidDensity(vec3 p, float time, float viscosity, float turbulence) {
  // Layer 1: primary large-scale flow (6-octave for rich detail)
  float speed = 0.15 / (0.5 + viscosity);
  vec3 flowP = p;
  flowP.xz *= fl2Rot2(sin(uMusicalTime * 0.3) * 0.3);
  float d1 = fbm6(flowP * 0.5 + vec3(time * speed * 0.7, time * speed * 0.3, 0.0));

  // Layer 2: medium turbulence eddies
  vec3 curl = curlNoise(p * 0.3 + time * speed * 0.2);
  float d2 = fbm3(vec3(p * 0.8 + curl * 0.5 + 100.0 + time * speed));

  // Layer 3: fine detail wisps
  float d3 = snoise(p * 2.0 + curl * 0.8 + time * speed * 1.5) * 0.5 + 0.5;

  // Combine layers
  float density = d1 * 0.5 + d2 * 0.3 + d3 * 0.2;

  // Turbulence mixes layers more aggressively
  density = mix(density, density * (1.0 + d2 * 0.5), turbulence * 0.5);

  return clamp(density, 0.0, 1.0);
}

// ============================================================
// Bioluminescence color based on position and density
// ============================================================
vec3 fl2BioColor(vec3 p, float density, float time,
                  vec3 palColor1, vec3 palColor2, float tension) {
  // Base color from palette, modulated by position
  float colorVar = snoise(p * 0.3 + time * 0.05);
  vec3 bioCol = mix(palColor1, palColor2, colorVar * 0.5 + 0.5);

  // Depth-based color shift: deeper = cooler
  float depthFade = smoothstep(-6.0, 2.0, p.y);
  bioCol = mix(bioCol * vec3(0.3, 0.5, 1.0), bioCol, depthFade);

  // Tension: more turbulent mixing shifts hue
  float tensionShift = tension * 0.2 * sin(p.x * 2.0 + p.z * 3.0 + time);
  bioCol = mix(bioCol, bioCol.gbr, abs(tensionShift));

  // Intensity: brighter at high density
  bioCol *= 0.3 + density * 1.5;

  return bioCol;
}

// ============================================================
// SDF: meniscus surface (fluid surface above camera)
// ============================================================
float fl2Meniscus(vec3 p, float time, float churn) {
  float surfaceY = 3.0;
  // Wave displacement
  float wave = snoise(vec3(p.xz * 0.3, time * 0.2)) * 0.5;
  wave += snoise(vec3(p.xz * 0.8, time * 0.4)) * 0.2 * churn;
  wave += snoise(vec3(p.xz * 2.0, time * 0.8)) * 0.08 * churn;
  return p.y - surfaceY - wave;
}

// ============================================================
// SDF: luminous blobs (metaball-like emissive organisms)
// ============================================================
float fl2Blobs(vec3 p, float time, float beatPulse, int blobCount) {
  float minDist = FL2_MAX_DIST;

  for (int i = 0; i < 8; i++) {
    if (i >= blobCount) break;
    float fi = float(i);
    float seed = fi * 7.31 + 3.17;

    // Blob positions: slow 3D drift
    vec3 blobPos = vec3(
      sin(seed * 1.7 + time * 0.12) * 4.0,
      cos(seed * 2.3 + time * 0.1) * 2.5 - 1.0,
      sin(seed * 0.9 + time * 0.08) * 4.0
    );

    // Radius: beat-pulsed
    float radius = 0.5 + fi * 0.1 + beatPulse * 0.2;

    float blob = length(p - blobPos) - radius;
    // Soft union for organic merging
    float k = 1.0;
    float h = clamp(0.5 + 0.5 * (minDist - blob) / k, 0.0, 1.0);
    minDist = mix(minDist, blob, h) - k * h * (1.0 - h);
  }

  return minDist;
}

// ============================================================
// Combined scene SDF
// ============================================================
float fl2Map(vec3 p, float time, float beatPulse, float churn,
              int blobCount, float climaxErupt) {
  // Meniscus surface
  float meniscus = fl2Meniscus(p, time, churn);

  // Luminous blobs
  float blobs = fl2Blobs(p, time, beatPulse, blobCount);

  // Climax eruption: column of fluid rising through surface
  if (climaxErupt > 0.01) {
    float eruptR = 0.5 + climaxErupt * 1.5;
    float eruptH = climaxErupt * 5.0;
    float erupt = length(p.xz) - eruptR;
    erupt = max(erupt, p.y - eruptH);
    erupt = max(erupt, -p.y - 2.0);
    // Add noise distortion to eruption column
    erupt += snoise(p * 2.0 + time * 3.0) * 0.3 * climaxErupt;
    blobs = min(blobs, erupt);
  }

  return min(meniscus, blobs);
}

// ============================================================
// Material ID: 0=blob, 1=meniscus
// ============================================================
float fl2MaterialID(vec3 p, float time, float beatPulse, float churn,
                     int blobCount, float climaxErupt) {
  float meniscus = fl2Meniscus(p, time, churn);
  float blobs = fl2Blobs(p, time, beatPulse, blobCount);
  if (climaxErupt > 0.01) {
    float eruptR = 0.5 + climaxErupt * 1.5;
    float eruptH = climaxErupt * 5.0;
    float erupt = length(p.xz) - eruptR;
    erupt = max(erupt, p.y - eruptH);
    erupt = max(erupt, -p.y - 2.0);
    erupt += snoise(p * 2.0 + time * 3.0) * 0.3 * climaxErupt;
    blobs = min(blobs, erupt);
  }
  return (meniscus < blobs) ? 1.0 : 0.0;
}

${fl2NormalGLSL}
${fl2AOGLSL}

// ============================================================
// Volumetric bioluminescent fluid
// ============================================================
vec3 fl2VolumeFog(vec3 ro, vec3 rd, float maxT, float time, float viscosity,
                   float turbulence, float energy, float onsetFlash,
                   vec3 palColor1, vec3 palColor2, float tension,
                   float dynamicRange) {
  vec3 fogAccum = vec3(0.0);
  float fogAlpha = 0.0;
  int fogSteps = 40;
  float stepSize = min(maxT, 15.0) / float(fogSteps);

  for (int i = 0; i < 40; i++) {
    if (fogAlpha > 0.95) break;
    float fi = float(i);
    float marchT = fi * stepSize + 0.1;
    vec3 pos = ro + rd * marchT;

    // Fluid density at this point
    float density = fl2FluidDensity(pos, time, viscosity, turbulence);

    // Dynamic range: sharpen density contrast
    density = smoothstep(0.3 - dynamicRange * 0.2, 0.7 + dynamicRange * 0.2, density);

    // Onset flash: inject brightness at blob locations
    float onsetBoost = onsetFlash * exp(-fi * 0.15) * 2.0;
    density += onsetBoost * 0.2;

    // Density multiplier: doubled from 0.04 → 0.08 base. Original made fluid-light
    // near-invisible at low energy (multiplier was 0.02-0.06). New range
    // 0.04-0.12 keeps low-energy visible without overdriving high-energy.
    density *= 0.08 * (0.5 + energy * 1.0);

    if (density > 0.001) {
      // Bioluminescent color
      vec3 bioCol = fl2BioColor(pos, density, time, palColor1, palColor2, tension);

      // Depth attenuation
      float depthAtten = exp(-marchT * 0.06);
      bioCol *= depthAtten;

      float alpha = density * (1.0 - fogAlpha);
      fogAccum += bioCol * alpha;
      fogAlpha += alpha;
    }
  }

  return fogAccum;
}

// ============================================================
// Caustic pattern on meniscus
// ============================================================
float fl2Caustics(vec3 p, float time) {
  vec2 cp = p.xz * 3.0;
  float c1 = sin(cp.x * 2.0 + time * 0.5) * cos(cp.y * 2.5 + time * 0.3);
  float c2 = sin(cp.x * 3.5 - time * 0.4) * cos(cp.y * 1.8 + time * 0.6);
  float c3 = snoise(vec3(cp * 1.5, time * 0.3));
  return (c1 + c2 + c3) * 0.33;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float sectionT = uSectionType;

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float time = uDynamicTime * (0.2 + slowEnergy * 0.1) * mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace);

  // Fluid parameters
  float viscosity = 0.3 + bass * 0.7; // bass = thick
  float turbulence = (1.0 - beatStability) * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
  float churn = energy * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) + tension * 0.3;
  int blobCount = 3 + int(energy * 3.0 + mids * 2.0) + int(sJam * 2.0) - int(sSpace * 2.0);
  float fl2BeatPulse = beatSnap * 0.5 + beatPulse(uMusicalTime) * 0.3;

  float climaxErupt = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * uClimaxIntensity;

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 palColor1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palColor2 = paletteHueColor(hue2, 0.85, 0.95);

  // Vocal warmth shifts primary color
  palColor1 = mix(palColor1, palColor1 * vec3(1.1, 0.95, 0.85), vocalPresence * 0.3);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === RAYMARCH (for surface geometry) ===
  float marchT = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < FL2_MAX_STEPS; i++) {
    marchPos = ro + rd * marchT;
    float d = fl2Map(marchPos, time, fl2BeatPulse, churn, blobCount, climaxErupt);
    if (d < FL2_SURF_DIST) {
      marchHit = true;
      break;
    }
    if (marchT > FL2_MAX_DIST) break;
    marchT += d * 0.8;
  }

  // === SURFACE SHADING ===
  vec3 col = vec3(0.0);

  // Deep background: murky bioluminescent
  vec3 bgCol = vec3(0.005, 0.01, 0.02);
  bgCol += palColor2 * 0.01;

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = fl2Normal(pos);
    float matID = fl2MaterialID(pos, time, fl2BeatPulse, churn, blobCount, climaxErupt);

    // Light: from above (melodicPitch controls depth)
    float lightDepth = mix(-4.0, 1.0, melodicPitch);
    vec3 lightPos = vec3(0.0, 5.0, 0.0);
    vec3 lightDir = normalize(lightPos - pos);
    vec3 viewDir = normalize(ro - pos);
    vec3 halfVec = normalize(lightDir + viewDir);

    // === DIFFUSE ===
    float diff = max(dot(norm, lightDir), 0.0);

    // === SPECULAR ===
    float specPow = 32.0 + highs * 128.0;
    float spec = pow(max(dot(norm, halfVec), 0.0), specPow);

    // === FRESNEL (strong on fluid surface) ===
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);

    // === AO ===
    float occl = fl2AmbientOcclusion(pos, norm);

    if (matID > 0.5) {
      // Meniscus surface: refractive, caustic patterns
      vec3 surfCol = vec3(0.02, 0.04, 0.06);
      float caustic = fl2Caustics(pos, time);
      caustic = caustic * 0.5 + 0.5;
      caustic = pow(caustic, 2.0) * highs;
      surfCol += palColor1 * caustic * 0.3;

      // Total internal reflection glow from below
      float subGlow = fl2FluidDensity(pos - vec3(0.0, 0.5, 0.0), time, viscosity, turbulence);
      vec3 subColor = fl2BioColor(pos - vec3(0.0, 0.5, 0.0), subGlow, time, palColor1, palColor2, tension);
      surfCol += subColor * 0.2;

      // Specular highlight on meniscus
      col = surfCol * (0.3 + diff * 0.3) + vec3(spec * 0.8) + palColor2 * fresnel * 0.3;
    } else {
      // Blob surface: emissive bioluminescent
      float density = fl2FluidDensity(pos, time, viscosity, turbulence);
      vec3 bioCol = fl2BioColor(pos, density, time, palColor1, palColor2, tension);
      // Self-illuminated
      col = bioCol * (0.5 + energy * 1.0);
      // Specular sheen
      col += vec3(spec * 0.3);
      col += palColor1 * fresnel * 0.15;
    }

    col *= occl;

    // Depth fog (underwater distance scattering)
    float depthFade = 1.0 - exp(-marchT * 0.1);
    vec3 scatterCol = mix(palColor2 * 0.05, palColor1 * 0.02, 0.5);
    col = mix(col, scatterCol, depthFade);
  } else {
    col = bgCol;
  }

  // === VOLUMETRIC BIOLUMINESCENT FOG ===
  vec3 volFog = fl2VolumeFog(ro, rd, min(marchT, FL2_MAX_DIST), time, viscosity,
                              turbulence, energy, onset, palColor1, palColor2,
                              tension, dynamicRange);
  col += volFog;

  // === CLIMAX GLOW ===
  if (climaxErupt > 0.01) {
    col *= 1.0 + climaxErupt * 0.5;
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(screenP * 2.0, time * 0.1));
    col += iconEmergence(screenP, uTime, energy, bass, palColor1, palColor2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, palColor1, palColor2, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);
  gl_FragColor = vec4(col, 1.0);
  ${fl2DepthAlpha}
}
`;
