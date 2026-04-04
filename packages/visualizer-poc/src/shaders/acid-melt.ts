/**
 * Acid Melt — Multi-layer FBM domain warping for classic psychedelic visuals.
 * Surfaces melting, breathing, morphing. Everything looks alive and gently warping.
 * Walls breathe, colors bleed into each other, reality distorts.
 *
 * Visual aesthetic:
 *   - Quiet: gentle breathing, slow undulation, warm color drift
 *   - Building: warp intensity increases, colors shift faster
 *   - Peak: aggressive melting, rapid color bleeding, strong distortion
 *   - Release: distortion softens, colors settle
 *
 * Audio reactivity:
 *   uEnergy          → warp intensity (gentle breathing → aggressive melting)
 *   uBass            → warp scale (bigger bass = bigger distortions)
 *   uBeatSnap        → pulse in warp amplitude (momentary intensification)
 *   uOnsetSnap       → ripple waves outward from center
 *   uSlowEnergy      → base undulation speed
 *   uHighs           → color sharpness, detail in warp layers
 *   uChromaHue       → hue shift across palette
 *   uChordIndex      → micro-rotate hue per chord
 *   uHarmonicTension → additional warp layer complexity
 *   uBeatStability   → smooth warping vs chaotic warping
 *   uMelodicPitch    → vertical drift in warp field
 *   uPalettePrimary/Secondary → warm color palette mixing
 *   uClimaxPhase     → full intensity boost, maximum melt
 *   uVocalEnergy     → inner glow warmth
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const acidMeltVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const acidMeltFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Clamp audio uniforms ---
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

  float slowTime = uDynamicTime * 0.03;

  // --- Domain warping + energy detail ---
  vec2 domainWarpOff = vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.15;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: faster warp, denser layers. Space: barely moving, gentle breath. Chorus: vibrant colors. Solo: dramatic warp.
  float sectionWarpMult = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.4, sSolo) * mix(1.0, 1.2, sChorus);
  float sectionSpeedMult = mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.3, sSolo);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: smoother, more organized warp patterns
  // Low coherence: chaotic, unpredictable distortion
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.5, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Slow field rotation ---
  float rotAngle = slowTime * 0.4 * sectionSpeedMult;
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.7, uBeatConfidence);
  rotAngle += bp * 0.03;
  float ca = cos(rotAngle);
  float sa = sin(rotAngle);
  p = mat2(ca, -sa, sa, ca) * p;

  // --- Melodic vertical drift ---
  float vertDrift = (melodicPitch - 0.5) * 0.12;
  p.y -= vertDrift;

  // --- Climax state ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // --- Warp parameters ---
  // Energy drives intensity: low = gentle breathing, high = aggressive melting
  float warpIntensity = mix(0.04, 0.28, energy) * sectionWarpMult * coherenceWarpMult;
  warpIntensity += climaxBoost * 0.15;
  // Bass drives scale: bigger bass = bigger, slower distortions
  float warpScale = mix(1.2, 0.6, bass);
  // Beat creates momentary pulse in amplitude
  warpIntensity *= 1.0 + effectiveBeat * 0.4;
  // Tension adds complexity
  warpIntensity *= 1.0 + tension * 0.2;
  // Stability: smooth vs chaotic
  float chaosAmount = (1.0 - stability) * 0.3;

  // =========================================================
  // DOMAIN WARPING: 3 layers at different scales warping each other
  // This is the core visual — coordinates distort so the color field melts/breathes
  // =========================================================

  // Layer 1: Large-scale slow undulation (the "breathing")
  vec2 warp1 = vec2(
    fbm3(vec3(p * warpScale, slowTime * 0.7)),
    fbm3(vec3(p * warpScale + 50.0, slowTime * 0.7 + 30.0))
  );

  // Layer 2: Medium-scale morphing (the "melting"), warped by layer 1
  vec2 warp2Coords = p + warp1 * warpIntensity * 0.6;
  vec2 warp2 = vec2(
    fbm3(vec3(warp2Coords * warpScale * 2.0 + 100.0, slowTime * 1.1)),
    fbm3(vec3(warp2Coords * warpScale * 2.0 + 200.0, slowTime * 1.1 + 70.0))
  );

  // Layer 3: Fine detail (the "texture"), warped by layers 1+2
  vec2 warp3Coords = p + (warp1 + warp2) * warpIntensity * 0.4;
  vec2 warp3 = vec2(
    snoise(vec3(warp3Coords * warpScale * 4.5 + 300.0, slowTime * 1.8)),
    snoise(vec3(warp3Coords * warpScale * 4.5 + 400.0, slowTime * 1.8 + 50.0))
  );

  // Chaos injection from instability
  vec2 chaosWarp = vec2(
    snoise(vec3(p * 6.0, slowTime * 3.0 + 500.0)),
    snoise(vec3(p * 6.0 + 600.0, slowTime * 3.0))
  ) * chaosAmount;

  // Combined warp: all layers contribute
  vec2 totalWarp = warp1 * warpIntensity
                 + warp2 * warpIntensity * 0.7
                 + warp3 * warpIntensity * 0.35 * (1.0 + highs * 0.5)
                 + chaosWarp * warpIntensity;

  // --- Onset ripple: radial wave outward from center ---
  float dist = length(p);
  float ripplePhase = dist * 12.0 - uTime * 4.0;
  float ripple = sin(ripplePhase) * exp(-dist * 2.5) * onset * 0.08;
  totalWarp += vec2(ripple) * normalize(p + 0.001);

  // Final warped coordinates
  vec2 wp = p + totalWarp;

  // =========================================================
  // COLOR: Sample from smooth gradient using warped coordinates
  // Warm palette mixing with noise-driven transitions
  // =========================================================

  // Palette hues
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.45, 0.95, energy) * uPaletteSaturation;
  float satBoost = mix(1.0, 1.15, sChorus); // chorus = more vibrant

  // Noise-driven color sampling: the warp itself creates the color variation
  float colorNoise = fbm3(vec3(wp * 1.8, slowTime * 0.5));
  float colorNoise2 = snoise(vec3(wp * 2.5 + 150.0, slowTime * 0.8));

  // Mix between primary and secondary hues using the warped noise field
  float hueMix = colorNoise * 0.5 + 0.5; // 0..1 range
  hueMix += colorNoise2 * 0.2;
  hueMix = clamp(hueMix, 0.0, 1.0);

  float finalHue = mix(hue1, hue2, hueMix);
  // Add a third interpolated hue for richness
  float hue3 = fract((hue1 + hue2) * 0.5 + 0.1);
  float triMix = smoothstep(0.3, 0.7, colorNoise2 * 0.5 + 0.5);
  finalHue = mix(finalHue, hue3, triMix * 0.3);

  // Value (brightness) modulated by warp depth
  float warpDepth = length(totalWarp);
  float val = mix(0.5, 1.0, energy) + warpDepth * 2.0;
  val = clamp(val, 0.3, 1.0);
  val += vocalGlow; // vocal warmth

  vec3 col = hsv2rgb(vec3(fract(finalHue), sat * satBoost, val));

  // --- Add warm glow at center ---
  float centerGlow = exp(-dist * dist * 3.0) * mix(0.15, 0.35, slowE);
  vec3 warmCenter = hsv2rgb(vec3(fract(hue1 + 0.05), sat * 0.6, 1.0));
  col += warmCenter * centerGlow;

  // --- Color bleeding: secondary layer with offset warp ---
  vec2 bleedWarp = wp + vec2(
    snoise(vec3(wp * 1.5 + 700.0, slowTime * 0.6)),
    snoise(vec3(wp * 1.5 + 800.0, slowTime * 0.6))
  ) * 0.06;
  float bleedNoise = fbm3(vec3(bleedWarp * 2.0, slowTime * 0.9));
  float bleedHue = mix(hue2, hue1, bleedNoise * 0.5 + 0.5);
  vec3 bleedColor = hsv2rgb(vec3(fract(bleedHue), sat * 0.7, 0.8));
  col = mix(col, bleedColor, 0.15 + energy * 0.1);

  // --- Onset flash ---
  col += vec3(1.0, 0.97, 0.92) * onset * 0.25 * exp(-dist * 1.5);

  // --- Beat brightness pulse ---
  col *= 1.0 + effectiveBeat * 0.12;

  // --- Climax boost ---
  col *= 1.0 + climaxBoost * 0.4;

  // --- Vignette ---
  float vigScale = mix(0.32, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigColor = vec3(0.01, 0.008, 0.015);
  col = mix(vigColor, col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.92, 0.92 - 0.08, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
