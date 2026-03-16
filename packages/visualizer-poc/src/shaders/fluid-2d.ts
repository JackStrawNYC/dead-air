/**
 * Fluid 2D — Navier-Stokes-inspired 2D fluid simulation shader.
 *
 * Uses ping-pong feedback buffers (MultiPassQuad) to carry fluid state
 * between frames. The previous frame's output is available as uPrevFrame.
 *
 * Single-pass approximation of fluid dynamics:
 *   - Advection: read previous frame at velocity-offset position
 *   - Velocity field: curl noise + audio-driven forces
 *   - Diffusion: 5-tap blur of advected color
 *   - Color injection: palette-colored dye on beats/onsets
 *   - Decay: gradual fade to prevent infinite accumulation
 *
 * Audio mapping:
 *   bass     -> radial velocity burst from center (pushes color outward)
 *   vocals   -> upward laminar flow (gentle vertical push)
 *   onsets   -> inject color splashes at center
 *   energy   -> diffusion rate (higher = faster spread)
 *   drumOnset -> secondary color injection trigger
 *   chromaHue -> injection color variation
 *   beatSnap -> radial pulse ripple
 *   jamDensity -> curl noise complexity (more octaves at high density)
 *
 * Note: The fluid effect only works properly during sequential rendering
 * (video export). During Remotion preview/seeking, MultiPassQuad's gap
 * detection resets the feedback buffer, so the fluid starts fresh.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fluid2DVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fluid2DFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

${sharedUniformsGLSL}

// Feedback texture from MultiPassQuad (previous frame's output)
uniform sampler2D uPrevFrame;

${buildPostProcessGLSL({ grainStrength: 'light', flareEnabled: false })}

varying vec2 vUv;

#define PI 3.14159265

// ─── Curl-noise velocity field ───
// Simplified 2D curl from 3D noise derivatives.
// Uses fbm3 for performance (3 octaves); full curlNoise is 12 evals per call.
vec2 curlVelocity(vec2 p, float t) {
  float eps = 0.01;
  float n1 = fbm3(vec3(p.x + eps, p.y, t));
  float n2 = fbm3(vec3(p.x - eps, p.y, t));
  float n3 = fbm3(vec3(p.x, p.y + eps, t));
  float n4 = fbm3(vec3(p.x, p.y - eps, t));
  // Curl in 2D: (dN/dy, -dN/dx) for divergence-free flow
  float dNdy = (n3 - n4) / (2.0 * eps);
  float dNdx = (n1 - n2) / (2.0 * eps);
  return vec2(dNdy, -dNdx);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float energy = clamp(uEnergy, 0.0, 1.0);
  float t = uDynamicTime;

  // ─── Velocity field from curl noise + audio forces ───
  // Curl noise scale increases with jam density (more complex at high density)
  float curlScale = mix(2.0, 4.5, uJamDensity);
  float curlSpeed = 0.15 + uSlowEnergy * 0.1;
  vec2 vel = curlVelocity(p * curlScale, t * curlSpeed) * 0.3;

  // Section variation: rotate velocity field per section
  float sectionAngle = uSectionIndex * 0.7;
  float ca = cos(sectionAngle);
  float sa = sin(sectionAngle);
  vel = vec2(ca * vel.x - sa * vel.y, sa * vel.x + ca * vel.y);

  // Bass: radial burst from center (pushes color outward)
  vec2 radialDir = normalize(p + vec2(0.001));
  vel += radialDir * uBass * 0.05;

  // Stem bass: additional radial push from separated bass track
  vel += radialDir * uStemBass * 0.03;

  // Vocals: upward laminar flow (gentle vertical push when vocals present)
  vel.y += uVocalEnergy * 0.025;

  // Vocal presence: slight lateral drift when singing detected
  vel.x += uVocalPresence * 0.01 * sin(t * 0.5);

  // Other (guitar/keys): swirling motion based on centroid brightness
  float otherSwirl = uOtherEnergy * uOtherCentroid * 0.02;
  vel += vec2(cos(t * 0.7), sin(t * 0.7)) * otherSwirl;

  // Beat snap: radial pulse ripple
  vel += radialDir * uBeatSnap * 0.04;

  // Musical time: subtle rotational current
  float musAngle = uMusicalTime * PI * 0.5;
  vel += vec2(cos(musAngle), sin(musAngle)) * 0.005;

  // ─── Advection: read previous frame at velocity-offset position ───
  float dt = 0.016; // ~1 frame timestep at 60fps
  vec2 advectedUV = uv - vel * dt;

  // Clamp to screen bounds to prevent edge artifacts
  advectedUV = clamp(advectedUV, vec2(0.001), vec2(0.999));

  vec3 prevColor = texture2D(uPrevFrame, advectedUV).rgb;

  // ─── Diffusion: 5-tap blur of advected color ───
  // Higher energy = faster diffusion (wider blur kernel)
  float diff = 0.002 + energy * 0.003;
  vec3 diffused = prevColor;
  diffused += texture2D(uPrevFrame, clamp(advectedUV + vec2(diff, 0.0), 0.001, 0.999)).rgb;
  diffused += texture2D(uPrevFrame, clamp(advectedUV - vec2(diff, 0.0), 0.001, 0.999)).rgb;
  diffused += texture2D(uPrevFrame, clamp(advectedUV + vec2(0.0, diff), 0.001, 0.999)).rgb;
  diffused += texture2D(uPrevFrame, clamp(advectedUV - vec2(0.0, diff), 0.001, 0.999)).rgb;
  diffused /= 5.0;

  // Diagonal taps for smoother diffusion at high energy
  float diag = diff * 0.707;
  vec3 diagSamples = vec3(0.0);
  diagSamples += texture2D(uPrevFrame, clamp(advectedUV + vec2(diag, diag), 0.001, 0.999)).rgb;
  diagSamples += texture2D(uPrevFrame, clamp(advectedUV + vec2(-diag, diag), 0.001, 0.999)).rgb;
  diagSamples += texture2D(uPrevFrame, clamp(advectedUV + vec2(diag, -diag), 0.001, 0.999)).rgb;
  diagSamples += texture2D(uPrevFrame, clamp(advectedUV + vec2(-diag, -diag), 0.001, 0.999)).rgb;
  diagSamples /= 4.0;

  // Blend cardinal and diagonal samples
  diffused = mix(diffused, diagSamples, 0.3);

  // ─── Decay: slowly fade to prevent infinite accumulation ───
  // Faster decay at low energy (fluid dissipates when quiet)
  float decayRate = mix(0.988, 0.997, energy);
  diffused *= decayRate;

  // ─── Color injection: palette-colored dye on beats/onsets ───
  // Injection mask: radial falloff from center
  float injectRadius = 0.12 + uBass * 0.1 + uFastBass * 0.05;
  float injectMask = smoothstep(injectRadius, 0.0, length(p));

  // Onset trigger: combine onset snap and drum onset
  float onsetTrigger = max(uOnsetSnap, uDrumOnset);

  // Injection strength
  float inject = onsetTrigger * injectMask;

  // Injection color from palette
  float injectHue = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.1;
  vec3 injectColor = 0.5 + 0.5 * cos(6.28318 * (injectHue + vec3(0.0, 0.33, 0.67)));

  // Secondary injection: offset position for spatial variety
  vec2 secondaryPos = vec2(
    sin(t * 0.3 + uSectionIndex * 2.1) * 0.3,
    cos(t * 0.25 + uSectionIndex * 1.7) * 0.2
  );
  float secondaryMask = smoothstep(injectRadius * 0.8, 0.0, length(p - secondaryPos));
  float secondaryInject = onsetTrigger * secondaryMask * 0.7;

  float secondaryHue = hsvToCosineHue(uPaletteSecondary) + uChromaShift * 0.15;
  vec3 secondaryColor = 0.5 + 0.5 * cos(6.28318 * (secondaryHue + vec3(0.0, 0.33, 0.67)));

  // Beat-driven tertiary injection at edge positions
  float beatInject = uBeatSnap * 0.4;
  vec2 edgePos = vec2(cos(uMusicalTime * PI), sin(uMusicalTime * PI * 0.7)) * 0.4;
  float edgeMask = smoothstep(0.15, 0.0, length(p - edgePos));
  float tertiaryHue = hsvToCosineHue(uPalettePrimary + 0.5);
  vec3 tertiaryColor = 0.5 + 0.5 * cos(6.28318 * (tertiaryHue + vec3(0.0, 0.33, 0.67)));

  // ─── Compose: blend diffused fluid with injections ───
  vec3 col = diffused;

  // Primary injection (center, onset-driven)
  col = mix(col, injectColor, inject * 0.5);

  // Secondary injection (offset, onset-driven)
  col = mix(col, secondaryColor, secondaryInject * 0.4);

  // Tertiary injection (edge, beat-driven)
  col += tertiaryColor * beatInject * edgeMask * 0.3;

  // Vocal warmth: gentle warm tint when vocals are present
  float vocalWarmth = uVocalEnergy * uVocalPresence * 0.05;
  col += vec3(0.08, 0.04, 0.0) * vocalWarmth;

  // Energy-driven brightness boost (prevents dead-looking fluid at peaks)
  col *= 0.85 + energy * 0.3;

  // Subtle noise overlay for texture (prevents banding in smooth gradients)
  float noiseTex = snoise(vec3(p * 8.0, t * 0.5)) * 0.015;
  col += noiseTex;

  // Vignette (lighter than most modes — fluid should fill the screen)
  float vigDist = length(p * 0.35);
  float vignette = 1.0 - vigDist * vigDist;
  vignette = smoothstep(0.0, 1.0, vignette);
  col *= mix(0.7, 1.0, vignette);

  // ─── Stealie emergence during climax ───
  float noiseField = fbm3(vec3(p * 2.0, t * 0.15));
  vec3 palCol1 = 0.5 + 0.5 * cos(6.28318 * (hsvToCosineHue(uPalettePrimary) + vec3(0.0, 0.33, 0.67)));
  vec3 palCol2 = 0.5 + 0.5 * cos(6.28318 * (hsvToCosineHue(uPaletteSecondary) + vec3(0.0, 0.33, 0.67)));
  col += stealieEmergence(p, uTime, energy, uBass, palCol1, palCol2, noiseField, uClimaxPhase);

  // ─── Post-processing (shared chain) ───
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
