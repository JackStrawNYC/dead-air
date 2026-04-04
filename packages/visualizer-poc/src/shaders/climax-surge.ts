/**
 * Climax Surge — fullscreen spectacle burst for show peaks only.
 * Radial energy explosion from center with concentric shockwaves,
 * prismatic light scattering, and every visual system at maximum.
 *
 * DESIGN INTENT: This shader should only be selected during the show's
 * highest energy moments. It's the visual equivalent of the final
 * crescendo — overwhelming, euphoric, then dissolving back.
 *
 * Visual elements:
 *   - Radial shockwave rings expanding from center
 *   - Prismatic color separation at wave edges
 *   - Particle burst / debris field
 *   - Full-screen pulsating glow
 *   - Starburst rays
 *
 * Audio reactivity:
 *   uEnergy        → overall intensity, ring count
 *   uBass          → ring thickness, central glow
 *   uOnsetSnap     → new shockwave spawn
 *   uDrumOnset     → starburst ray intensity
 *   uClimaxPhase   → gates appearance (only active during climax/sustain)
 *   uClimaxIntensity → amplifies all effects
 *   uMusicalTime   → beat-locked pulsation
 *   uFastEnergy    → responsive brightness spikes
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const climaxSurgeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const climaxSurgeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, bloomThresholdOffset: -0.15, halationEnabled: true, caEnabled: true, flareEnabled: true, thermalShimmerEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define NUM_RINGS 8

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float fastE = clamp(uFastEnergy, 0.0, 1.0);

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float explosionSpeedMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.15, sChorus);
  float ringCountMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.1, sChorus);
  float particleDensityMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxI = uClimaxIntensity;
  float gate = isClimax * climaxI;

  // --- Phase 1: New uniform integrations ---
  float forecastRings = uEnergyForecast * 0.15;   // anticipatory ring expansion
  float peakDesat = uPeakApproaching * 0.12;       // pre-burst desaturation
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // Background: hot gradient when climax, dark otherwise
  vec3 bgColor = mix(
    vec3(0.02, 0.01, 0.03),
    vec3(0.08, 0.03, 0.06),
    gate * energy
  );
  vec3 col = bgColor;

  // Palette
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.7, 1.0, energy) * uPaletteSaturation;

  // Radial distance from center
  float dist = length(p);
  float angle = atan(p.y, p.x);

  // ═══ SHOCKWAVE RINGS ═══
  // Multiple expanding rings, each spawned at a different beat
  float slowTime = uDynamicTime * 0.2 * explosionSpeedMod;

  // --- Domain warping + energy-responsive detail ---
  vec2 domainWarpOff = vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  for (int i = 0; i < NUM_RINGS; i++) {
    float fi = float(i);
    // Ring timing: staggered based on musical time
    float ringTime = fract(uMusicalTime * 0.25 * ringCountMod - fi * 0.125);
    float ringRadius = ringTime * 1.2; // expands outward
    float ringWidth = 0.02 + bass * 0.015;

    // Ring intensity: fade as it expands
    float ringFade = (1.0 - ringTime) * (1.0 - ringTime);

    // Ring shape
    float ringDist = abs(dist - ringRadius);
    float ring = smoothstep(ringWidth, 0.0, ringDist) * ringFade;

    // Ring color: shifts hue per ring for prismatic effect
    float ringHue = mix(hue1, hue2, fi / float(NUM_RINGS - 1));
    vec3 ringColor = hsv2rgb(vec3(ringHue + ringTime * 0.1, sat, 1.0));

    col += ringColor * ring * (0.5 + gate * 0.8);
  }

  // ═══ CENTRAL GLOW ═══
  // Intense core that pulses with bass
  float bp = beatPulse(uMusicalTime);
  float coreRadius = 0.08 + bass * 0.06 + bp * 0.04;
  float coreGlow = exp(-dist * dist / (coreRadius * coreRadius));
  vec3 coreColor = mix(
    hsv2rgb(vec3(hue1, sat * 0.5, 1.0)),
    vec3(1.0, 0.95, 0.9),
    0.3
  );
  col += coreColor * coreGlow * (1.0 + gate * 1.5 + fastE * 0.5);

  // ═══ STARBURST RAYS ═══
  // Radial rays from center, driven by drums
  {
    float rayCount = 12.0;
    float rayAngle = mod(angle * rayCount / (2.0 * PI) + slowTime * 2.0, 1.0);
    float ray = pow(abs(sin(rayAngle * PI)), 20.0);
    float rayFade = exp(-dist * 2.5);
    float stemDrums = clamp(uStemDrums, 0.0, 1.0);
    float rayIntensity = ray * rayFade * (drumOnset * 0.8 + energy * 0.3 + stemDrums * 0.4); // drums intensify starburst
    vec3 rayColor = hsv2rgb(vec3(hue2 + 0.1, sat * 0.7, 1.0));
    col += rayColor * rayIntensity * (0.3 + gate * 0.5);
  }

  // ═══ PARTICLE DEBRIS ═══
  // Small bright points scattered outward
  {
    float debris = 0.0;
    for (int i = 0; i < 20; i++) {
      float fi = float(i);
      float seed = fi * 13.7;
      float debrisAngle = fract(sin(seed) * 43758.5453) * 2.0 * PI;
      float debrisSpeed = (fract(sin(seed + 7.0) * 23421.6312) * 0.5 + 0.3) * explosionSpeedMod;
      float debrisTime = fract(uMusicalTime * 0.5 * particleDensityMod - fi * 0.05);
      float debrisRadius = debrisTime * debrisSpeed * 1.5;
      vec2 debrisPos = vec2(cos(debrisAngle), sin(debrisAngle)) * debrisRadius;
      float debrisDist = length(p - debrisPos);
      float debrisFade = (1.0 - debrisTime) * (1.0 - debrisTime);
      debris += smoothstep(0.006, 0.0, debrisDist) * debrisFade;
    }
    vec3 debrisColor = hsv2rgb(vec3(hue1 + 0.05, sat * 0.6, 1.0));
    col += debrisColor * debris * (0.6 + gate * 0.6);
  }

  // ═══ NOISE DISTORTION ═══
  // Warped noise field adds organic turbulence
  float noiseVal = fbm3(vec3(p * 3.0, slowTime));
  col += hsv2rgb(vec3(hue1 + noiseVal * 0.05, sat * 0.3, 1.0)) * max(0.0, noiseVal) * 0.08 * energy;

  // ═══ ONSET FLASH ═══
  // White-hot flash on strong onsets
  col += vec3(1.0, 0.98, 0.95) * onset * 0.3 * gate;

  // ═══ SDF ICON ═══
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += stealieEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase);
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // Vignette (subtle — this shader should be bright)
  float vigScale = mix(0.22, 0.18, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.03), col, vignette);

  // Post-processing
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
