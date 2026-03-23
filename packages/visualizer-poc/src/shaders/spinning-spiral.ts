/**
 * Spinning Spiral — hypnotic rotating vortex in classic 60s psychedelia.
 * The kind of spiral you see on Dead poster art, spinning wheels at the
 * Acid Tests, hypnotic concentric vortex pulling you into the center.
 *
 * Visual aesthetic:
 *   - Quiet: slow 3-arm spiral, muted rainbow bands, gentle noise warp
 *   - Building: arms multiply (4-5), twist tightens, color saturation climbs
 *   - Peak: 6-8 arms, tight bass-driven twist, full rainbow cycling, center blaze
 *   - Release: arms loosen, rotation decelerates, colors fade to warm tones
 *
 * Audio reactivity:
 *   uEnergy         -> arm count (3 at low, 6-8 at peak)
 *   uBass           -> twist factor (tighter spirals on bass hits)
 *   uTempo/uLocalTempo -> base rotation speed (synced to beat feel)
 *   uBeatSnap       -> momentary rotation acceleration
 *   uOnsetSnap      -> flash at spiral center radiating outward
 *   uChromaHue      -> hue modulation overlay on spiral arm colors
 *   uPalettePrimary/Secondary -> base hue for arm color bands
 *   uHarmonicTension -> noise warp intensity (more tension = more organic)
 *   uMelodicDirection -> rotation direction (ascending=CW, descending=CCW)
 *   uTempoDerivative -> rotation rate modulation
 *   uSectionType     -> jam=faster, space=near-frozen, chorus=vivid
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const spinningSpiralVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const spinningSpiralFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, paletteCycleEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Clamp audio inputs ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);

  // 7-band spectral: sub, low, low-mid, mid, upper-mid, presence, brilliance
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.1;

  // --- Phase 1 uniform integrations ---
  float vocalWarmth = uVocalEnergy * 0.1;
  float otherShimmer = uOtherEnergy * 0.12;
  float accelBoost = 1.0 + uEnergyAccel * 0.12;
  float chromaHueMod = uChromaHue * 0.2;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1 * chordConf;
  float forecastGlow = clamp(uEnergyForecast, 0.0, 1.0) * 0.08;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // --- Section type modulation ---
  // Mapping: 0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space
  float sectionT = uSectionType;
  float jamFactor = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float spaceFactor = smoothstep(6.5, 7.5, sectionT);
  float chorusFactor = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float soloFactor = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);

  // --- Background: deep psychedelic void ---
  vec3 col = mix(
    vec3(0.01, 0.005, 0.02),
    vec3(0.02, 0.01, 0.03),
    uv.y
  );

  // --- Polar coordinates ---
  float r = length(p);
  float theta = atan(p.y, p.x);

  // --- Arm count driven by energy ---
  // Low energy: 3 arms. Peak energy: 6-8 arms.
  float armCount = mix(3.0, 7.0, energy) + fftMid * 1.0;
  armCount += jamFactor * 1.5;       // jam: more arms
  armCount -= spaceFactor * 1.5;     // space: fewer arms
  armCount += chorusFactor * 0.5;    // chorus: slight boost

  // High coherence: lock to nearest integer (clean symmetry)
  if (coherence > 0.7) {
    armCount = floor(armCount + 0.5);
  }
  // Low coherence: fractional arm count wobble
  if (coherence < 0.3) {
    float jitterAmt = (0.3 - coherence) / 0.3;
    armCount += sin(slowTime * 5.0) * 0.6 * jitterAmt;
  }
  armCount = max(armCount, 2.0);

  // --- Twist factor driven by bass ---
  // Bass hits tighten the spiral (more windings per radius)
  float twist = 4.0 + bass * 8.0 + fftBass * 3.0;
  twist *= mix(1.0, 1.3, jamFactor);   // jam: tighter twist
  twist *= mix(1.0, 0.4, spaceFactor); // space: loose, open spiral
  twist += tension * 3.0;              // harmonic tension adds complexity

  // --- Rotation speed driven by tempo ---
  float tempoFactor = clamp(uLocalTempo / 120.0, 0.5, 2.0); // normalize around 120 BPM
  float tempoAccel = 1.0 + uTempoDerivative * 0.3;
  float rotSpeed = 0.3 * tempoFactor * tempoAccel * accelBoost;

  // Section-driven speed modulation
  rotSpeed *= mix(1.0, 1.6, jamFactor);   // jam: much faster rotation
  rotSpeed *= mix(1.0, 0.15, spaceFactor); // space: near-frozen
  rotSpeed *= mix(1.0, 1.2, chorusFactor); // chorus: energetic
  rotSpeed *= mix(1.0, 1.3, soloFactor);   // solo: dramatic spin

  // Melodic direction drives rotation direction
  float rotDir = sign(melodicDir + 0.001);
  float rotation = uDynamicTime * rotSpeed * rotDir;

  // Beat creates rotation speed bump (momentary acceleration)
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  rotation += effectiveBeat * 0.4 * rotDir;

  // Downbeat emphasis: extra rotation kick
  rotation += uDownbeat * smoothstep(0.3, 0.7, uBeatConfidence) * 0.25;

  // --- FBM noise warps the spiral edges for organic feel ---
  float warpAmp = 0.15 + tension * 0.3 + bass * 0.2;
  vec3 warpInput = vec3(p * 2.5, slowTime * 0.5);
  float warp1 = fbm(warpInput) * warpAmp;
  float warp2 = fbm(warpInput + vec3(3.7, 1.2, 0.0)) * warpAmp * 0.7;

  // Warp the polar coordinates
  float warpedTheta = theta + warp1 * 1.5;
  float warpedR = r + warp2 * 0.3;

  // --- Spiral arm pattern ---
  // Core spiral: sin(theta * armCount + r * twist - time * rotationSpeed)
  float spiral1 = sin(warpedTheta * armCount + warpedR * twist - rotation);
  // Second nested spiral at different scale and speed (counter-rotating)
  float spiral2 = sin(warpedTheta * (armCount * 0.5 + 1.0) + warpedR * twist * 0.6 + rotation * 0.7);
  // Third fine-detail spiral
  float spiral3 = sin(warpedTheta * (armCount * 2.0 - 1.0) + warpedR * twist * 1.4 - rotation * 1.3);

  // Combine spirals: primary dominant, secondaries add texture
  float spiralPattern = spiral1 * 0.6 + spiral2 * 0.25 + spiral3 * 0.15;
  // Normalize to 0-1 range
  spiralPattern = spiralPattern * 0.5 + 0.5;

  // Onset noise burst: disrupt spiral edges momentarily
  if (onset > 0.1) {
    float onsetNoise = snoise(vec3(p * 6.0, uDynamicTime * 4.0));
    spiralPattern += onsetNoise * onset * 0.2;
    spiralPattern = clamp(spiralPattern, 0.0, 1.0);
  }

  // --- Color bands along spiral arms ---
  // Each arm gets a different hue, cycling over time
  float hueBase = uPalettePrimary + chromaHueMod + chordHue;
  float hueSpan = mod(uPaletteSecondary - uPalettePrimary + 0.5, 1.0) - 0.5;

  // Arm index from angular position gives each arm a distinct hue
  float armPhase = fract(warpedTheta * armCount / TAU + rotation / TAU);
  float armHue = hueBase + armPhase * hueSpan + spiralPattern * 0.15;

  // Rainbow cycling over time
  armHue += uDynamicTime * 0.02 + vocalWarmth;

  // Chroma hue modulation overlay
  armHue += uChromaHue * 0.12 * sin(spiralPattern * TAU + slowTime);

  // Chorus: more vivid rainbow spread
  armHue += chorusFactor * spiralPattern * 0.2;

  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;
  sat += chorusFactor * 0.15; // chorus: vivid colors
  sat -= spaceFactor * 0.2;   // space: muted
  sat = clamp(sat, 0.3, 1.0);

  float brightness = mix(0.2, 0.7, spiralPattern) + energy * 0.3 + forecastGlow;
  brightness *= accelBoost;

  vec3 spiralColor = hsv2rgb(vec3(fract(armHue), sat, brightness));

  // Radial falloff: bright center, darker edges
  float radialFade = exp(-r * r * 2.0);
  col += spiralColor * radialFade;

  // --- Center glowing vortex that pulses with energy ---
  float centerGlow = exp(-r * r * 25.0);
  // Onset triggers flash at center radiating outward
  float onsetWave = onset * exp(-pow(r - onset * 0.5, 2.0) * 15.0);
  centerGlow += onsetWave * 2.0;

  vec3 coreHue = hsv2rgb(vec3(
    fract(hueBase + uDynamicTime * 0.05 + vocalWarmth),
    mix(0.3, 0.8, energy),
    1.0
  ));
  col += coreHue * centerGlow * (0.4 + bass * 0.6 + energy * 0.3);

  // --- Onset radiating rings from center ---
  if (onset > 0.2) {
    float ringWave = sin(r * 20.0 - uDynamicTime * 8.0) * 0.5 + 0.5;
    float ringFade = exp(-r * 3.0) * onset;
    col += vec3(1.0, 0.95, 0.85) * ringWave * ringFade * 0.5;
  }

  // --- Spiral edge highlights from highs ---
  float edgeBright = pow(abs(spiral1), 8.0) * highs * 0.5;
  vec3 edgeColor = hsv2rgb(vec3(fract(hueBase + 0.33 + chromaHueMod), sat * 0.7, 1.0));
  col += edgeColor * edgeBright * radialFade;

  // --- Ridged noise detail on spiral surface ---
  float ridged = ridged4(vec3(p * 3.0 + vec2(warp1, warp2), slowTime * 0.3));
  col += spiralColor * ridged * 0.08 * fftHigh;

  // --- Peak approaching: anticipatory glow ---
  col *= 1.0 + peakApproach * 0.15;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.4;

  // Climax: extra spiral layers and brightness
  if (climaxBoost > 0.01) {
    float climaxSpiral = sin(warpedTheta * armCount * 2.0 + warpedR * twist * 1.5 - rotation * 2.0);
    climaxSpiral = climaxSpiral * 0.5 + 0.5;
    vec3 climaxColor = hsv2rgb(vec3(fract(hueBase + 0.5), 1.0, 1.0));
    col += climaxColor * climaxSpiral * climaxBoost * 0.25 * radialFade;
  }

  // --- Vignette: outer edges dissolve into darkness ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.005, 0.02), col, vignette);

  // --- Semantic modulation ---
  // Psychedelic: boost spiral saturation + chromatic shift
  float psychBoost = uSemanticPsychedelic * 0.35;
  col = mix(col, col * vec3(1.0 + psychBoost * 0.2, 1.0, 1.0 + psychBoost * 0.15), psychBoost);

  // Cosmic: cooler tones, deeper vortex
  col *= 1.0 + uSemanticCosmic * 0.08;

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // --- Feedback trails: motion blur on rotation ---
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.93, 0.93 - 0.07, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
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
