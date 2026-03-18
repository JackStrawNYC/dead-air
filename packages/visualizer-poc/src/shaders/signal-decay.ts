/**
 * Signal Decay — CRT losing signal with scanline drift, horizontal hold failure,
 * vertical roll, snow intrusion, and beat-synchronized recovery moments.
 *
 * Feedback: Yes (decay state in RG channels — signal coherence + vertical hold)
 *
 * Visual aesthetic:
 *   - Quiet (low energy): heavy snow, scanlines drifting, horizontal tearing
 *   - Building: signal fights to recover, vertical roll slows, ghosts appear
 *   - Peak: strong signal recovery on beats, crisp image flashes through static
 *   - Release: signal deteriorates again, snow creeps back in
 *
 * Audio reactivity:
 *   uEnergy              -> signal strength (inverted: low energy = more decay)
 *   uBass                -> horizontal hold (bass stabilizes the line sync)
 *   uHighs               -> snow/static intensity
 *   uOnsetSnap           -> signal recovery snap (sudden clarity)
 *   uBeatStability       -> vertical hold stability
 *   uSectionType         -> decay severity (verse=mild, bridge=extreme)
 *   uImprovisationScore  -> glitch frequency
 *   uPeakApproaching     -> pre-recovery tension (signal tries to lock)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const signalDecayVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const signalDecayFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ bloomEnabled: false, crtEnabled: true, halationEnabled: false, grainStrength: "heavy", anaglyphEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Random hash
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// TV snow / white noise
float tvSnow(vec2 uv, float time) {
  float snowTime = floor(time * 30.0); // frame-rate locked noise
  return hash2(uv * uResolution + snowTime);
}

// Scanline pattern
float scanlines(vec2 uv, float drift) {
  float line = sin((uv.y + drift) * uResolution.y * PI) * 0.5 + 0.5;
  return mix(0.85, 1.0, line);
}

// Horizontal tearing: shift rows by different amounts
float hTear(float y, float time, float intensity) {
  // Large-scale horizontal bands that shift at different speeds
  float band = floor(y * 20.0);
  float bandHash = hash(band + floor(time * 8.0));
  float tear = (bandHash - 0.5) * intensity;
  // Occasional large tear
  float bigTear = step(0.92, hash(band + floor(time * 3.0))) * (hash(band + 100.0) - 0.5) * intensity * 3.0;
  return tear + bigTear;
}

// Vertical roll: the entire image scrolls vertically
float vRoll(float time, float stability) {
  // Instability makes vertical hold drift
  float rollSpeed = (1.0 - stability) * 0.3;
  float rollOffset = fract(time * rollSpeed);
  // When near-stable, the roll "catches" and snaps
  float catchZone = smoothstep(0.05, 0.0, abs(rollOffset - 0.5) - 0.45);
  return mix(rollOffset, 0.0, catchZone * stability);
}

// Color ghosting: displaced color channel
vec3 ghosting(vec2 uv, float amount, sampler2D tex) {
  vec3 col;
  col.r = texture2D(tex, uv + vec2(amount * 0.005, 0.0)).r;
  col.g = texture2D(tex, uv).g;
  col.b = texture2D(tex, uv - vec2(amount * 0.003, 0.0)).b;
  return col;
}

// Test pattern bars (what we're "receiving")
vec3 testPattern(vec2 uv, float time) {
  // Animated content: bars + gradient + moving elements
  float barIndex = floor(uv.x * 8.0);
  vec3 barColor;
  // SMPTE-style color bars
  if (barIndex < 1.0) barColor = vec3(0.75, 0.75, 0.75);
  else if (barIndex < 2.0) barColor = vec3(0.75, 0.75, 0.0);
  else if (barIndex < 3.0) barColor = vec3(0.0, 0.75, 0.75);
  else if (barIndex < 4.0) barColor = vec3(0.0, 0.75, 0.0);
  else if (barIndex < 5.0) barColor = vec3(0.75, 0.0, 0.75);
  else if (barIndex < 6.0) barColor = vec3(0.75, 0.0, 0.0);
  else if (barIndex < 7.0) barColor = vec3(0.0, 0.0, 0.75);
  else barColor = vec3(0.0);

  // Animated circle moving across the pattern
  vec2 circlePos = vec2(fract(time * 0.1), 0.5);
  float circleDist = length(uv - circlePos);
  barColor += vec3(0.3, 0.2, 0.1) * smoothstep(0.08, 0.0, circleDist);

  return barColor;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float sectionType = clamp(uSectionType, 0.0, 7.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.05;

  // Phase 1 uniform integrations
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.3, 0.8, energy) * uPaletteSaturation;

  // --- Signal strength: inverted energy (low energy = more decay) ---
  float signalBase = energy;
  // Section type affects decay severity
  float sectionDecay = smoothstep(3.0, 6.0, sectionType) * 0.3;
  float signal = clamp(signalBase - sectionDecay, 0.0, 1.0);

  // Onset recovery: beats punch through the noise
  float recovery = onset * 0.6;
  signal = clamp(signal + recovery, 0.0, 1.0);

  // Peak approaching: signal tries to stabilize
  signal += peakApproach * 0.15;

  // --- Read previous frame for feedback state ---
  vec4 prevRaw = texture2D(uPrevFrame, uv);
  float prevSignalState = prevRaw.r;
  float prevVHold = prevRaw.g;

  // Smooth state transitions via feedback
  float signalState = mix(prevSignalState, signal, 0.15);
  float decay = 1.0 - signalState; // 0 = clean, 1 = fully decayed

  // --- Vertical roll ---
  float vHoldStability = stability * 0.7 + bass * 0.3;
  float vRollAmount = vRoll(uDynamicTime, vHoldStability);
  float vHoldState = mix(prevVHold, vRollAmount, 0.1);
  vec2 rolledUV = uv;
  rolledUV.y = fract(rolledUV.y + vHoldState * decay * 0.8);

  // --- Horizontal tearing ---
  float hTearIntensity = decay * (1.0 - bass * 0.7);
  float hOffset = hTear(rolledUV.y, uDynamicTime, hTearIntensity * 0.1);

  // Glitch: improvisation drives extra tear events
  if (improv > 0.3) {
    float glitchNoise = snoise(vec3(floor(rolledUV.y * 30.0), uDynamicTime * 5.0, 0.0));
    float glitchGate = step(1.0 - improv * 0.3, abs(glitchNoise));
    hOffset += glitchGate * (glitchNoise * 0.05) * decay;
  }

  vec2 tornUV = rolledUV;
  tornUV.x = fract(tornUV.x + hOffset);

  // --- Generate the "received" image content ---
  // The signal being transmitted: colored noise patterns modulated by audio
  vec3 transmitted = vec3(0.0);

  // Base content: flowing palette-colored noise (what we're "watching")
  float content1 = fbm(vec3(tornUV * 3.0, slowTime * 0.4));
  float content2 = snoise(vec3(tornUV * 6.0 + 20.0, slowTime * 0.8));
  vec3 contentColor = hsv2rgb(vec3(hue1, sat, 0.5 + content1 * 0.3));
  vec3 contentColor2 = hsv2rgb(vec3(hue2, sat * 0.8, 0.4 + content2 * 0.2));
  transmitted = mix(contentColor, contentColor2, content2 * 0.5 + 0.5);

  // Test pattern bleeds through during low signal
  vec3 testBars = testPattern(tornUV, uDynamicTime);
  transmitted = mix(transmitted, testBars, decay * 0.3);

  // --- Snow / static ---
  float snow = tvSnow(tornUV, uDynamicTime);
  float snowIntensity = decay * (0.5 + highs * 0.5);
  // Snow is strongest where signal is weakest
  vec3 snowColor = vec3(snow) * snowIntensity;

  // --- Scanline drift ---
  float scanlineDrift = uDynamicTime * (0.02 + decay * 0.1);
  float scan = scanlines(tornUV, scanlineDrift);

  // --- Mix signal and noise based on signal state ---
  vec3 col = mix(snowColor, transmitted * scan, signalState);

  // --- Signal edge artifacts ---
  // Horizontal sync pulse visible at edges of tearing
  float syncPulse = smoothstep(0.02, 0.0, abs(fract(tornUV.x) - 0.98)) * decay;
  col += vec3(1.0, 1.0, 0.9) * syncPulse * 0.3;

  // Vertical blanking interval visible during roll
  float vbi = smoothstep(0.03, 0.0, abs(fract(rolledUV.y + vHoldState * decay) - 0.98)) * decay;
  col = mix(col, vec3(0.0), vbi * 0.8);
  // VBI contains dark bars with bright sync pulses
  col += vec3(0.8, 0.7, 0.5) * vbi * step(0.7, fract(tornUV.x * 20.0)) * 0.2;

  // --- Color fringing from poor signal ---
  if (decay > 0.2) {
    float fringeAmount = decay * 0.008;
    vec2 fringeUV = tornUV;
    col.r = mix(col.r, texture2D(uPrevFrame, fringeUV + vec2(fringeAmount, 0.0)).r * 0.7 + col.r * 0.3, decay * 0.4);
    col.b = mix(col.b, texture2D(uPrevFrame, fringeUV - vec2(fringeAmount, 0.0)).b * 0.7 + col.b * 0.3, decay * 0.4);
  }

  // --- Onset: sharp signal recovery moment ---
  if (onset > 0.3) {
    // Flash of clarity: reduce all decay effects
    float recoveryFlash = onset * 0.5;
    col = mix(col, transmitted, recoveryFlash);
    // Bright horizontal line sweep (CRT re-sync)
    float resyncLine = smoothstep(0.01, 0.0, abs(uv.y - fract(uDynamicTime * 2.0)));
    col += vec3(0.8, 0.9, 1.0) * resyncLine * onset;
  }

  // --- Phosphor persistence: previous frame bleeds through ---
  vec3 prevVisual = texture2D(uPrevFrame, uv).rgb;
  // Remove state data from visual (state encoded in RG, visual is full RGB)
  col = mix(prevVisual * 0.3, col, 0.7 + signalState * 0.3);

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.1;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.015, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Store state in RG channels, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  // R = signal coherence state, G = vertical hold state
  gl_FragColor.r = mix(col.r, signalState, 0.5);
  gl_FragColor.g = mix(col.g, vHoldState, 0.5);
}
`;
