/**
 * Warm Nebula — soft golden nebula clouds via layered FBM.
 * Amber/copper/rose palette with particle dust. Contemplative, slow movement.
 * Low energy affinity — designed for quiet/contemplative passages.
 *
 * Visual aesthetic:
 *   - Quiet: faint golden haze, barely visible particle dust, warm center glow
 *   - Building: cloud layers deepen, dust brightens, amber tones saturate
 *   - Peak: luminous copper-rose nebula fills the screen, dense sparkle field
 *   - Release: clouds thin to translucent veils, dust settles
 *
 * Audio reactivity:
 *   uEnergy          → cloud density and brightness (stays contemplative)
 *   uBass            → gentle cloud pulse (breathing)
 *   uHighs           → particle dust sparkle intensity
 *   uOnsetSnap       → subtle warm flash
 *   uSlowEnergy      → overall cloud opacity (builds slowly), center glow breathing
 *   uMelodicPitch    → vertical cloud layer offset
 *   uMelodicConfidence → gates melodic influence
 *   uChromaHue       → hue shift across palette
 *   uChordIndex      → micro-rotate hue per chord
 *   uCoherence       → high=stable cloud forms, low=turbulent
 *   uClimaxPhase     → full intensity boost
 *   uPalettePrimary/Secondary → base and accent colors blended with amber/copper/rose
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const warmNebulaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const warmNebulaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, lightLeakEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Standard uniform clamping ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // Very slow base time — contemplative movement
  float slowTime = uDynamicTime * 0.02;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.10 * chordConf;
  float vocalGlow = uVocalEnergy * 0.08;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: slightly faster drift. Space: near-frozen ethereal. Chorus: brighter.
  float sectionDriftMult = mix(1.0, 1.35, sJam) * mix(1.0, 0.12, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionBrightMult = mix(1.0, 1.0, sJam) * mix(1.0, 0.75, sSpace) * mix(1.0, 1.25, sChorus) * mix(1.0, 1.15, sSolo);

  float driftTime = slowTime * sectionDriftMult;

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: stable, well-defined cloud forms (reduce noise warp)
  // Low coherence: turbulent, dissolving wisps (amplify warp)
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.3, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Melodic vertical shift ---
  float vertShift = (melodicPitch - 0.5) * 0.06;

  // --- Climax detection ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // --- Palette: amber/copper/rose base mixed with song palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.35, 0.75, energy) * uPaletteSaturation;

  // Warm base hues: amber (~0.097), copper (~0.069), rose (~0.958)
  float amberHue = 0.097;
  float copperHue = 0.069;
  float roseHue = 0.958;

  // Blend song palette with warm nebula palette (60% warm, 40% song)
  vec3 warmAmber = hsv2rgb(vec3(mix(amberHue, hue1, 0.4), sat * 0.9, 1.0));
  vec3 warmCopper = hsv2rgb(vec3(mix(copperHue, hue2, 0.35), sat * 0.85, 0.9));
  vec3 warmRose = hsv2rgb(vec3(mix(roseHue, hue1 + 0.15, 0.3), sat * 0.7, 0.85));

  // --- Deep warm background ---
  vec3 col = mix(
    vec3(0.015, 0.008, 0.005),
    vec3(0.03, 0.015, 0.01),
    uv.y * 0.8 + slowE * 0.2
  );

  // === 4-LAYER FBM NEBULA CLOUDS ===

  // Bass breathing: gentle cloud scale pulse
  float breathe = 1.0 + bass * 0.06;

  // Layer 1: Large slow clouds (primary structure)
  vec3 cloudPos1 = vec3(p * 1.2 * breathe, driftTime * 0.3);
  cloudPos1.y += vertShift;
  // Coherence-modulated warp
  cloudPos1.xy += vec2(
    snoise(vec3(p * 0.8, driftTime * 0.15)),
    snoise(vec3(p * 0.8 + 50.0, driftTime * 0.15))
  ) * 0.15 * coherenceWarpMult;
  float cloud1 = fbm6(cloudPos1) * 0.5 + 0.5;
  cloud1 = smoothstep(0.25, 0.75, cloud1);

  // Layer 2: Medium clouds (secondary detail)
  vec3 cloudPos2 = vec3(p * 2.5 * breathe + 20.0, driftTime * 0.5 + 10.0);
  cloudPos2.y += vertShift * 0.7;
  cloudPos2.xy += vec2(
    snoise(vec3(p * 1.5 + 30.0, driftTime * 0.25)),
    snoise(vec3(p * 1.5 + 80.0, driftTime * 0.25))
  ) * 0.10 * coherenceWarpMult;
  float cloud2 = fbm(cloudPos2) * 0.5 + 0.5;
  cloud2 = smoothstep(0.3, 0.7, cloud2);

  // Layer 3: Small fast wisps (fine detail)
  vec3 cloudPos3 = vec3(p * 5.0 * breathe + 40.0, driftTime * 0.8 + 25.0);
  cloudPos3.y += vertShift * 0.4;
  float cloud3 = fbm3(cloudPos3) * 0.5 + 0.5;
  cloud3 = smoothstep(0.35, 0.65, cloud3);

  // Layer 4: Very large background glow (ultra-slow drift)
  vec3 cloudPos4 = vec3(p * 0.6, driftTime * 0.1 + 50.0);
  float cloud4 = fbm3(cloudPos4) * 0.5 + 0.5;
  cloud4 = smoothstep(0.2, 0.8, cloud4);

  // Cloud density driven by energy (stays contemplative)
  float densityMod = mix(0.4, 0.85, energy) + slowE * 0.15;
  densityMod = clamp(densityMod, 0.0, 1.0);
  densityMod += climaxBoost * 0.2;

  // Composite clouds with color variation per layer
  // Layer 4 (background): deep amber glow
  col += warmAmber * cloud4 * 0.12 * densityMod;

  // Layer 1 (large structure): amber-copper
  vec3 layer1Color = mix(warmAmber, warmCopper, cloud1 * 0.6 + 0.2);
  col += layer1Color * cloud1 * 0.25 * densityMod * sectionBrightMult;

  // Layer 2 (medium detail): copper-rose
  vec3 layer2Color = mix(warmCopper, warmRose, cloud2 * 0.5 + 0.3);
  col += layer2Color * cloud2 * 0.18 * densityMod * sectionBrightMult;

  // Layer 3 (fine wisps): bright amber highlights
  col += warmAmber * 1.3 * cloud3 * 0.10 * densityMod * (0.7 + highs * 0.3);

  // === WARM GOLDEN CENTER GLOW (breathes with slowEnergy) ===
  float centerDist = length(p);
  float centerGlow = exp(-centerDist * centerDist * 3.0);
  float glowBreath = 0.6 + slowE * 0.4 + bass * 0.15;
  vec3 goldenGlow = warmAmber * 1.2 * centerGlow * glowBreath * 0.15;
  goldenGlow += warmCopper * 0.5 * centerGlow * glowBreath * 0.08;
  col += goldenGlow * densityMod;

  // === PARTICLE DUST (scattered bright points via high-frequency noise threshold) ===
  {
    // Dust field: high-frequency noise thresholded to produce sparse sparkle points
    vec3 dustPos1 = vec3(p * 18.0, driftTime * 0.6 + 100.0);
    float dust1 = snoise(dustPos1);
    float dustThreshold = mix(0.82, 0.72, highs); // more sparkle with highs
    float sparkle1 = smoothstep(dustThreshold, dustThreshold + 0.08, dust1);

    // Second dust layer at different frequency for depth
    vec3 dustPos2 = vec3(p * 28.0 + 200.0, driftTime * 0.9 + 150.0);
    float dust2 = snoise(dustPos2);
    float sparkle2 = smoothstep(dustThreshold + 0.02, dustThreshold + 0.10, dust2);

    // Third layer: very fine, almost stationary
    vec3 dustPos3 = vec3(p * 40.0 + 300.0, driftTime * 0.2 + 200.0);
    float dust3 = snoise(dustPos3);
    float sparkle3 = smoothstep(dustThreshold + 0.04, dustThreshold + 0.12, dust3);

    // Highs drive sparkle brightness; energy adds subtle glow
    float dustBright = (0.3 + highs * 0.7) * (0.5 + energy * 0.5);
    dustBright *= sectionBrightMult;
    dustBright += climaxBoost * 0.3;

    // Color: bright warm white with amber tint
    vec3 dustColor1 = mix(vec3(1.0, 0.92, 0.75), warmAmber * 1.5, 0.3);
    vec3 dustColor2 = mix(vec3(1.0, 0.88, 0.70), warmCopper * 1.3, 0.4);
    vec3 dustColor3 = mix(vec3(1.0, 0.95, 0.85), warmRose * 1.2, 0.2);

    col += dustColor1 * sparkle1 * dustBright * 0.25;
    col += dustColor2 * sparkle2 * dustBright * 0.18;
    col += dustColor3 * sparkle3 * dustBright * 0.12;
  }

  // === ONSET WARM FLASH ===
  {
    float flashIntensity = onset * 0.35;
    vec3 flashColor = mix(warmAmber, vec3(1.0, 0.95, 0.85), 0.5);
    col += flashColor * flashIntensity * (0.5 + centerGlow * 0.5);
  }

  // === VOCAL GLOW: warm presence near center ===
  col += warmAmber * vocalGlow * centerGlow * 0.5;

  // === CLIMAX BOOST ===
  col *= 1.0 + climaxBoost * 0.4;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // === VIGNETTE ===
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = vec3(0.012, 0.006, 0.004);
  col = mix(vigTint, col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  // === FEEDBACK TRAILS: section-type-aware decay ===
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  // Higher base decay for warm trails (nebula lingers)
  float baseDecay_fb = mix(0.93, 0.93 - 0.06, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.03 + sSpace_fb * 0.05 - sChorus_fb * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  // Jam phase feedback sub-states
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.02 + jpBuild * 0.01 + jpPeak * 0.04 - jpResolve * 0.03;
    feedbackDecay = clamp(feedbackDecay, 0.82, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
