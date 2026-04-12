/**
 * Particle Swarm — raymarched 3D murmuration.
 *
 * Thousands of bird-like particles flocking in 3D space, forming dynamic
 * shapes. Uses a volumetric density field approach for performance: rather
 * than individual particle SDFs, samples a 3D noise-based density field
 * that simulates swarm behavior. The swarm contracts and expands with
 * the music, forms vortices, splits and merges.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy          -> flock density, trail brightness, step count
 *   uBass            -> gravitational pull, core density
 *   uOnsetSnap       -> separation burst (swarm explodes)
 *   uVocalPresence   -> cohesion pull toward center
 *   uVocalEnergy     -> warm inner glow
 *   uHighs           -> particle shimmer, edge detail
 *   uDrumOnset       -> directional impulse (kick the swarm)
 *   uSlowEnergy      -> overall drift speed
 *   uHarmonicTension -> vortex formation intensity
 *   uMelodicDirection -> swarm flow bias direction
 *   uBeatStability   -> flock tightness (high=tight, low=scattered)
 *   uBeatSnap        -> density pulse
 *   uTimbralFlux     -> turbulence in swarm motion
 *   uChordIndex      -> palette hue shift
 *   uPalettePrimary/Secondary -> particle/glow colors
 *   uClimaxPhase     -> massive murmuration convergence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const particleSwarmVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const particleSwarmFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, stageFloodEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define PS2_VOL_STEPS 48
#define PS2_MAX_DIST 25.0
#define PS2_LIGHT_STEPS 6

// ─── Swarm density field: evaluates particle density at a 3D point ───
// Uses layered noise with curl-like advection to create convincing flock motion.
float ps2SwarmDensity(vec3 pos, float timeVal, float energy, float bass, float onset,
                      float vocalP, float tension, float drumOnset, float flowDir,
                      float beatStab, float timbralFlux, float beatSnap2) {
  // Base flow: large-scale swarm drift using curl noise approximation
  float flowSpeed = 0.08 + energy * 0.06;
  vec3 flowPos = pos;

  // Melodic direction biases the flow
  flowPos.x += flowDir * 0.3;

  // Drum kicks push the swarm
  flowPos += vec3(
    sin(floor(timeVal * 2.0) * 7.3) * drumOnset * 0.8,
    cos(floor(timeVal * 2.0) * 5.1) * drumOnset * 0.4,
    sin(floor(timeVal * 2.0) * 3.7) * drumOnset * 0.6
  );

  // Vocal cohesion: pull toward center
  float cohesionStr = vocalP * 0.3 + beatStab * 0.2;
  float distFromCenter = length(flowPos);
  flowPos *= 1.0 - cohesionStr * 0.15 * smoothstep(0.0, 4.0, distFromCenter);

  // Onset separation: expand outward
  flowPos *= 1.0 + onset * 0.4;

  // Vortex formation from tension
  if (tension > 0.3) {
    float vortexAngle = atan(flowPos.z, flowPos.x) + timeVal * 0.3 * tension;
    float vortexR = length(flowPos.xz);
    flowPos.x = cos(vortexAngle) * vortexR;
    flowPos.z = sin(vortexAngle) * vortexR;
  }

  // Multi-scale density evaluation
  float t1 = timeVal * flowSpeed;
  float t2 = timeVal * flowSpeed * 0.7;

  // Primary swarm: elongated noise structures (bird-like streams)
  vec3 stretchedPos = flowPos * vec3(1.0, 0.7, 1.0); // elongate horizontally
  float primary = fbm3(vec3(stretchedPos * 0.8 + t1));

  // Secondary: finer detail particles
  float secondary = fbm3(vec3(flowPos * 2.0 + t2 + 50.0)) * 0.4;

  // Tertiary: turbulent micro-detail (timbral flux drives this)
  float tertiary = snoise(vec3(flowPos * 4.0 + t1 * 1.5 + 100.0)) * 0.15 * (0.5 + timbralFlux);

  float density = primary + secondary + tertiary;

  // Shape the density: threshold to create discrete flock formations
  float threshold = 0.1 - energy * 0.15 - bass * 0.1;
  density = smoothstep(threshold, threshold + 0.3, density);

  // Bass core: concentrated density at center
  float coreDensity = exp(-distFromCenter * distFromCenter * 0.15) * bass * 0.5;
  density += coreDensity;

  // Beat pulse: rhythmic density wave
  float pulseDist = abs(fract(distFromCenter * 0.5 - timeVal * 0.3) - 0.5) * 2.0;
  density += smoothstep(0.3, 0.0, pulseDist) * beatSnap2 * 0.3;

  // Altitude mask: swarm prefers mid-height band
  float altMask = exp(-pow(pos.y - 0.5, 2.0) * 0.2);
  density *= altMask;

  return clamp(density, 0.0, 1.0);
}

// ─── Swarm color: varies by position and velocity-analog ───
vec3 ps2SwarmColor(vec3 pos, float density, float timeVal, float hue1, float hue2, float sat, float energy, float highs) {
  // Position-based hue variation (shortest-arc blend between palette hues)
  float hueDiff = fract(hue2 - hue1 + 0.5) - 0.5;
  float t = fract(pos.x * 0.2 + pos.z * 0.15 + timeVal * 0.02);
  float posHue = fract(hue1 + hueDiff * t);

  // Density-based brightness
  float bright = 0.5 + density * 0.8 + energy * 0.3;

  // High-frequency shimmer at particle edges
  float shimmer = 1.0 + highs * sin(dot(pos, vec3(17.3, 31.1, 23.7)) * 20.0 + timeVal * 5.0) * 0.15;

  vec3 baseCol = hsv2rgb(vec3(posHue, sat, bright * shimmer));

  return baseCol;
}

// ─── In-scatter: light contribution along volumetric ray ───
float ps2LightMarch(vec3 pos, vec3 lightDir, float timeVal, float energy, float bass,
                    float onset, float vocalP, float tension, float drumOnset,
                    float flowDir, float beatStab, float timbralFlux, float beatSnap2) {
  float totalDensity = 0.0;
  float stepLen = 0.5;

  for (int idx = 0; idx < PS2_LIGHT_STEPS; idx++) {
    pos += lightDir * stepLen;
    float d = ps2SwarmDensity(pos, timeVal, energy, bass, onset, vocalP, tension,
                              drumOnset, flowDir, beatStab, timbralFlux, beatSnap2);
    totalDensity += d * stepLen;
  }

  return exp(-totalDensity * 2.0);
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
  float highs = clamp(uHighs, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float flowDir = clamp(uMelodicDirection, -1.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float beatSnap2 = clamp(uBeatSnap, 0.0, 1.0);
  float timbralFlux = clamp(uTimbralFlux, 0.0, 1.0);

  float timeVal = uDynamicTime;
  float slowTime = timeVal * (0.1 + slowE * 0.05);

  // Section modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float densityMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.1, sChorus);
  float brightMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Palette
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera: orbit around swarm center
  float orbitAngle = slowTime * 0.2;
  float orbitR = 6.0 - energy * 1.0;
  ro += vec3(cos(orbitAngle) * orbitR, 1.5 + sin(slowTime * 0.15) * 0.8, sin(orbitAngle) * orbitR);

  // Light direction (from above-behind the camera)
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));

  // === VOLUMETRIC SWARM RAYMARCH ===
  vec3 volAccum = vec3(0.0);
  float volAlpha = 0.0;
  float stepSize = PS2_MAX_DIST / float(PS2_VOL_STEPS);

  // Energy-adaptive step count
  int activeSteps = int(mix(28.0, 48.0, energy));

  for (int idx = 0; idx < PS2_VOL_STEPS; idx++) {
    if (idx >= activeSteps) break;
    if (volAlpha > 0.95) break;

    float marchT = float(idx) * stepSize;
    vec3 samplePos = ro + rd * marchT;

    float density = ps2SwarmDensity(samplePos, timeVal, energy, bass, onset,
                                     vocalP, tension, drumOnset, flowDir,
                                     beatStab, timbralFlux, beatSnap2);
    density *= densityMod * 0.08;

    if (density > 0.001) {
      // Light scattering
      float lightAccess = ps2LightMarch(samplePos, lightDir, timeVal, energy, bass,
                                         onset, vocalP, tension, drumOnset, flowDir,
                                         beatStab, timbralFlux, beatSnap2);

      // Particle color at this position
      vec3 particleCol = ps2SwarmColor(samplePos, density, timeVal, hue1, hue2, sat, energy, highs);

      // Anisotropic scattering (Henyey-Greenstein, g=0.6)
      float cosTheta = dot(rd, lightDir);
      float g = 0.6;
      float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5));

      // Key light contribution
      vec3 lit = particleCol * (lightAccess * phase * 2.0 + 0.15);

      // Self-emission: particles glow based on density and energy
      float emission = density * 10.0 * (0.3 + energy * 0.5) * brightMod;
      lit += particleCol * emission;

      // Vocal warmth: warm inner glow when vocals present
      lit += vec3(0.08, 0.04, 0.01) * vocalE * density * 5.0;

      // Climax intensification
      lit *= 1.0 + climaxBoost * 0.6;

      float alpha = density * (1.0 - volAlpha);
      volAccum += lit * alpha;
      volAlpha += alpha;
    }
  }

  // === BACKGROUND ===
  vec3 bgColor = mix(
    vec3(0.01, 0.008, 0.025),
    vec3(0.025, 0.02, 0.05),
    rd.y * 0.5 + 0.5
  );

  // Ambient nebula field behind swarm
  float nebulaVal = fbm3(vec3(rd * 3.0 + timeVal * 0.01));
  vec3 nebulaCol = mix(
    paletteHueColor(hue1, sat, 0.92),
    paletteHueColor(hue2, sat, 0.92),
    nebulaVal * 0.5 + 0.5
  );
  bgColor += nebulaCol * max(0.0, nebulaVal) * 0.03 * energy;

  // Star field: scattered bright points in background
  {
    float starField = 0.0;
    for (int sidx = 0; sidx < 8; sidx++) {
      float sfi = float(sidx);
      vec3 starDir = normalize(vec3(
        sin(sfi * 7.13 + 1.0) * 3.0,
        cos(sfi * 5.71 + 2.0) * 2.0 + 1.0,
        sin(sfi * 3.37 + 3.0) * 3.0
      ));
      float starDot = max(0.0, dot(rd, starDir));
      float starBright = pow(starDot, 200.0) * (0.3 + energy * 0.4);
      float starFlicker = 0.7 + 0.3 * sin(timeVal * (2.0 + sfi * 0.5) + sfi * 10.0);
      starField += starBright * starFlicker;
    }
    bgColor += vec3(0.8, 0.85, 1.0) * starField;
  }

  // Compose volumetric over background
  vec3 col = bgColor * (1.0 - volAlpha) + volAccum;

  // === GROUND REFLECTION PLANE ===
  // Reflective dark plane below the swarm
  {
    float groundY = -3.0;
    if (rd.y < -0.01) {
      float groundT = (groundY - ro.y) / rd.y;
      if (groundT > 0.0 && groundT < PS2_MAX_DIST) {
        vec3 groundPos = ro + rd * groundT;
        vec2 groundUV = groundPos.xz;

        // Reflected swarm: sample density above the ground plane (mirrored)
        vec3 reflSamplePos = vec3(groundPos.x, 2.0 * groundY - groundPos.y + 0.5, groundPos.z);
        float reflDensity = ps2SwarmDensity(reflSamplePos, timeVal, energy, bass, onset,
                                             vocalP, tension, drumOnset, flowDir,
                                             beatStab, timbralFlux, beatSnap2);

        // Ground surface: dark with grid lines
        float gridX = smoothstep(0.03, 0.0, abs(fract(groundUV.x * 0.3) - 0.5));
        float gridZ = smoothstep(0.03, 0.0, abs(fract(groundUV.y * 0.3) - 0.5));
        vec3 groundCol = vec3(0.015, 0.012, 0.025);
        groundCol += vec3(0.02, 0.015, 0.04) * (gridX + gridZ) * energy * 0.5;

        // Swarm reflection on ground
        vec3 reflCol = ps2SwarmColor(reflSamplePos, reflDensity, timeVal, hue1, hue2, sat, energy, highs);
        float reflBright = reflDensity * 0.3 * energy;
        float reflFade = exp(-(groundT - 5.0) * 0.05);
        groundCol += reflCol * reflBright * max(0.0, reflFade);

        // Fresnel-like blend: more reflection at grazing angles
        float groundFresnel = pow(1.0 - abs(rd.y), 4.0);
        float groundMask = smoothstep(PS2_MAX_DIST, PS2_MAX_DIST * 0.5, groundT);

        col = mix(col, groundCol, groundFresnel * groundMask * 0.6);
      }
    }
  }

  // === SECONDARY SWARM LAYER: distant background flock ===
  {
    vec3 bgSwarmAccum = vec3(0.0);
    float bgSwarmAlpha = 0.0;
    int bgSteps = int(mix(8.0, 16.0, energy));

    for (int bsidx = 0; bsidx < 16; bsidx++) {
      if (bsidx >= bgSteps) break;
      float bsT = float(bsidx) * 2.0 + PS2_MAX_DIST * 0.5;
      vec3 bsPos = ro + rd * bsT;

      // Offset swarm field for variety
      vec3 bgFieldPos = bsPos * 0.3 + vec3(50.0, 0.0, 50.0);
      bgFieldPos.x += timeVal * 0.04;
      float bgDensity = fbm3(vec3(bgFieldPos)) * 0.3;
      bgDensity = smoothstep(0.05, 0.25, bgDensity) * 0.02 * densityMod;

      if (bgDensity > 0.001) {
        float bgAlpha = bgDensity * (1.0 - bgSwarmAlpha);
        vec3 bgSwarmCol = mix(
          paletteHueColor(hue2, sat, 0.9),
          vec3(0.6, 0.65, 0.8),
          0.4
        ) * 0.3;
        bgSwarmAccum += bgSwarmCol * bgAlpha;
        bgSwarmAlpha += bgAlpha;
      }
    }
    col += bgSwarmAccum;
  }

  // === SWARM TRAILS: additive glow streaks ===
  {
    float trailAccum = 0.0;
    for (int tidx = 0; tidx < 12; tidx++) {
      float fi = float(tidx);
      float trailT = fi * PS2_MAX_DIST / 12.0;
      vec3 trailPos = ro + rd * trailT;

      // Elongated density: sample with velocity-stretched coordinates
      vec3 stretchPos = trailPos;
      stretchPos.x += timeVal * 0.5;
      float trailDensity = fbm3(vec3(stretchPos * 0.5 + 30.0));
      trailDensity = smoothstep(0.2, 0.6, trailDensity);

      float fade = exp(-trailT * 0.1);
      trailAccum += trailDensity * fade * 0.02;
    }

    vec3 trailCol = mix(
      paletteHueColor(hue1, sat, 0.95),
      vec3(1.0, 0.95, 0.9),
      0.3
    );
    col += trailCol * trailAccum * energy * highs;
  }

  // === BRIGHT PARTICLE FLASHES: individual prominent particles ===
  {
    for (int pidx = 0; pidx < 10; pidx++) {
      float pfi = float(pidx);
      float pSeed = pfi * 11.13 + 7.0;

      // Particle position: animated through swarm space
      vec3 particlePos = vec3(
        sin(timeVal * (0.3 + pfi * 0.07) + pSeed) * (2.0 + pfi * 0.3),
        cos(timeVal * (0.25 + pfi * 0.05) + pSeed * 1.3) * 1.5 + 0.5,
        sin(timeVal * (0.2 + pfi * 0.06) + pSeed * 2.1) * (2.0 + pfi * 0.3)
      );

      // Project to screen space
      vec3 toParticle = particlePos - ro;
      float particleDot = dot(toParticle, rd);
      if (particleDot < 0.0) continue;

      vec3 closestPoint = ro + rd * particleDot;
      float particleDist2D = length(closestPoint - particlePos);
      float particleRadius = 0.05 + bass * 0.02;

      float particleBright = smoothstep(particleRadius, particleRadius * 0.1, particleDist2D);
      particleBright *= exp(-particleDot * 0.1); // distance fade

      // Particle color with shimmer (shortest-arc blend between palette hues)
      float psHueDiff = fract(hue2 - hue1 + 0.5) - 0.5;
      float pHue = fract(hue1 + psHueDiff * fract(pSeed * 0.37));
      vec3 pCol = paletteHueColor(pHue, sat, 0.95);
      float pShimmer = 0.8 + 0.2 * sin(timeVal * 8.0 + pfi * 5.0);

      col += pCol * particleBright * pShimmer * (0.3 + energy * 0.5) * brightMod;
    }
  }

  // === VORTEX CORE GLOW: bright center when tension drives vortex ===
  if (tension > 0.3) {
    float vortexGlow = exp(-dot(screenP, screenP) * 3.0) * (tension - 0.3) * 2.0;
    vec3 vortexCol = mix(
      paletteHueColor(hue1, sat, 0.95),
      vec3(1.0, 0.95, 0.9),
      0.3
    );
    col += vortexCol * vortexGlow * energy * 0.3;
  }

  // Beat pulse
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.08 + beatSnap2 * 0.06;

  // Drum onset flash: directional burst
  {
    float drumFlashAngle = fract(sin(floor(timeVal * 2.0) * 7.3) * 43758.5) * 2.0 * PI;
    float drumFlashDir = dot(screenP, vec2(cos(drumFlashAngle), sin(drumFlashAngle)));
    float drumFlash = smoothstep(0.0, 0.5, drumFlashDir) * drumOnset * 0.15;
    col += vec3(0.8, 0.85, 1.0) * drumFlash;
  }

  // === DEAD ICONOGRAPHY ===
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 col1 = paletteHueColor(hue1, sat, 0.95);
    vec3 col2 = paletteHueColor(hue2, sat, 0.95);
    col += iconEmergence(screenP, uTime, energy, bass, col1, col2, nf, uClimaxPhase, uSectionIndex) * 0.6;
    col += heroIconEmergence(screenP, uTime, energy, bass, col1, col2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
