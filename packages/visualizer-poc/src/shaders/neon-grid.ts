/**
 * Neon Grid — Perspective laser grid with intersection node strobes on beat.
 * Synthwave-inspired vanishing-point grid with horizon gradient.
 *
 * Visual aesthetic:
 *   - Quiet: dim grid lines, slow scan line drift, soft neon glow
 *   - Building: lines thicken, scan line speeds up, intersection nodes appear
 *   - Peak: full neon bloom, dense grid, strobing intersection nodes, ripple flashes
 *   - Release: grid fades back, scan line slows, glow softens
 *
 * Audio reactivity:
 *   uBass            → line thickness (thicker on bass hits)
 *   uHighs           → horizontal scan line sweep speed + brightness
 *   uEnergy          → grid density + overall glow intensity
 *   uOnsetSnap       → grid flash ripple outward from center
 *   uBeatSnap        → intersection node strobe (gated by uBeatConfidence)
 *   uBeatStability   → low stability = FBM warp on grid for organic feel
 *   uHarmonicTension → grid color saturation + secondary line layers
 *   uMelodicPitch    → vanishing point vertical shift
 *   uChromaHue       → hue shift across palette
 *   uChordIndex      → micro-rotate hue per chord
 *   uFFTTexture      → per-column line brightness modulation
 *   uClimaxPhase     → full intensity boost, double grid density
 *   uPalettePrimary/Secondary → base and accent neon colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const neonGridVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const neonGridFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, flareEnabled: true, anaglyphEnabled: true })}

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
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float melodicPitch = clamp(melInfluence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // 7-band spectral
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float slowTime = uDynamicTime * 0.06;
  float energyDetail = 1.0 + energy * 0.5;

  // === DOMAIN WARPING: organic distortion to break the rigid grid feel ===
  p += vec2(fbm3(vec3(p * 0.5 * energyDetail, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 * energyDetail + 100.0, uDynamicTime * 0.05))) * 0.3;

  // --- Uniform integrations ---
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * chordConf;
  float vocalGlow = uVocalEnergy * 0.08;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: faster scan, denser grid. Space: near-frozen, minimal. Chorus: vivid colors. Solo: dramatic glow.
  float sectionScanSpeed = mix(1.0, 1.6, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.25, sChorus);
  float sectionDensityMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.2, sChorus);

  // --- Coherence morphology ---
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: clean straight grid lines. Low coherence: wobbly warped grid.
  float coherenceWarpMult = coherence > 0.7 ? mix(1.0, 0.15, (coherence - 0.7) / 0.3)
                          : coherence < 0.3 ? mix(1.0, 2.8, (0.3 - coherence) / 0.3)
                          : 1.0;

  // --- Climax state ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // --- Background: dark with horizon gradient + fbm6 nebula texture ---
  // Synthwave sunset: dark purple base, warm horizon glow
  vec3 bgDark = vec3(0.01, 0.005, 0.03);
  vec3 bgHorizon = vec3(0.06, 0.01, 0.08) + vec3(0.04, 0.01, 0.02) * energy;
  float horizonLine = 0.5 + (melodicPitch - 0.5) * 0.06; // melody shifts vanishing point
  float horizonGrad = exp(-pow((uv.y - horizonLine) * 3.0, 2.0));
  vec3 col = mix(bgDark, bgHorizon, horizonGrad * 0.6);

  // FBM6 sky nebula texture with dual palette
  float skyNebula = fbm6(vec3(p * 2.0 * energyDetail, slowTime * 0.15));
  float skyHue1 = hsvToCosineHue(uPalettePrimary);
  float skyHue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 skyCol1 = 0.5 + 0.5 * cos(6.28318 * vec3(skyHue1, skyHue1 + 0.33, skyHue1 + 0.67));
  vec3 skyCol2 = 0.5 + 0.5 * cos(6.28318 * vec3(skyHue2, skyHue2 + 0.33, skyHue2 + 0.67));
  vec3 nebulaTint = mix(skyCol1, skyCol2, skyNebula * 0.5 + 0.5);

  // Subtle sky gradient above horizon with nebula
  float skyGlow = smoothstep(horizonLine, horizonLine + 0.3, uv.y);
  col += vec3(0.015, 0.005, 0.025) * skyGlow * (0.3 + slowE * 0.4);
  col += nebulaTint * 0.03 * skyGlow * (0.5 + skyNebula * 0.5) * energy;

  // --- Palette colors ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;
  // Chorus: boost saturation
  sat *= mix(1.0, 1.2, sChorus);

  // Neon base colors: cyan/magenta/purple mixed with song palette
  vec3 neonCyan = hsv2rgb(vec3(fract(0.52 + hue1 * 0.3), sat, 1.0));
  vec3 neonMagenta = hsv2rgb(vec3(fract(0.83 + hue2 * 0.3), sat, 1.0));
  vec3 neonPurple = hsv2rgb(vec3(fract(0.75 + (hue1 + hue2) * 0.15), sat * 0.9, 0.9));

  // --- Perspective grid projection ---
  // Transform UV to perspective: vanishing point at center-top
  float vpY = horizonLine; // vanishing point Y (shifted by melody)
  float perspY = uv.y - vpY;

  // Only draw grid below the horizon (perspective floor)
  float gridMask = smoothstep(0.0, -0.02, perspY);

  // Perspective depth: closer to horizon = further away
  float depth = -0.15 / min(perspY, -0.001); // perspective division
  depth = clamp(depth, 0.0, 40.0);

  // Perspective X: spread increases with distance from horizon
  float perspX = (uv.x - 0.5) * depth * 0.5;

  // Grid scroll: move toward viewer
  float scrollSpeed = (0.8 + energy * 0.6) * sectionScanSpeed;
  float gridScroll = slowTime * scrollSpeed * 3.0;

  // --- Grid density (energy + climax driven) ---
  float baseDensity = (6.0 + energy * 8.0) * sectionDensityMod + climaxBoost * 6.0;
  float gridDensityX = baseDensity * (1.0 + uJamDensity * 0.3);
  float gridDensityY = baseDensity * 0.8;

  // --- FBM warp for organic feel at low stability ---
  float warpAmount = (1.0 - stability) * 0.04 * coherenceWarpMult;
  vec2 gridUV = vec2(perspX, depth + gridScroll);
  if (warpAmount > 0.001) {
    vec2 warp = vec2(
      snoise(vec3(gridUV * 0.5, slowTime * 0.3)),
      snoise(vec3(gridUV * 0.5 + 100.0, slowTime * 0.3))
    ) * warpAmount;
    gridUV += warp;
  }

  // --- Grid lines ---
  // Line thickness driven by bass
  float lineThickness = (0.03 + bass * 0.06 + fftBass * 0.03) * mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace);

  // Vertical grid lines (receding into distance)
  float gridX = fract(gridUV.x * gridDensityX);
  float vertLine = smoothstep(lineThickness, 0.0, abs(gridX - 0.5) - 0.5 + lineThickness);
  // Distance fade: lines get thinner farther away
  float depthFade = exp(-depth * 0.08);
  vertLine *= depthFade;

  // Horizontal grid lines (cross-hatching in depth)
  float gridY = fract(gridUV.y * gridDensityY);
  float horizLine = smoothstep(lineThickness * 0.8, 0.0, abs(gridY - 0.5) - 0.5 + lineThickness * 0.8);
  horizLine *= depthFade;

  // --- FFT-driven per-column brightness ---
  float fftColumn = texture2D(uFFTTexture, vec2(fract(perspX * 0.1 + 0.5), 0.5)).r;
  vertLine *= (0.7 + fftColumn * 0.5);

  // --- Combine grid lines with neon colors ---
  float gridIntensity = 0.4 + energy * 0.8 + climaxBoost * 0.5;
  vec3 vertColor = mix(neonCyan, neonPurple, smoothstep(0.0, 15.0, depth));
  vec3 horizColor = mix(neonMagenta, neonCyan, smoothstep(0.0, 15.0, depth));

  col += vertColor * vertLine * gridIntensity * gridMask;
  col += horizColor * horizLine * gridIntensity * gridMask * 0.8;

  // --- Grid line glow (wider, softer bloom around lines) ---
  float glowWidth = lineThickness * 4.0;
  float vertGlow = smoothstep(glowWidth, 0.0, abs(gridX - 0.5) - 0.5 + glowWidth) * depthFade;
  float horizGlow = smoothstep(glowWidth, 0.0, abs(gridY - 0.5) - 0.5 + glowWidth) * depthFade;
  col += vertColor * vertGlow * gridMask * 0.12 * energy;
  col += horizColor * horizGlow * gridMask * 0.08 * energy;

  // --- Intersection node strobes on beat ---
  float nodeX = smoothstep(lineThickness * 1.5, 0.0, abs(gridX - 0.5) - 0.5 + lineThickness * 1.5);
  float nodeY = smoothstep(lineThickness * 1.5, 0.0, abs(gridY - 0.5) - 0.5 + lineThickness * 1.5);
  float nodeMask = nodeX * nodeY * depthFade * gridMask;

  // Beat strobe: pulse at intersections
  float beatPulseVal = effectiveBeat;
  float nodeStrobe = nodeMask * beatPulseVal * 2.5;
  vec3 nodeColor = mix(neonCyan, neonMagenta, sin(depth * 0.5 + slowTime) * 0.5 + 0.5);
  col += nodeColor * nodeStrobe * (0.6 + energy * 0.6);

  // Node glow halo
  float nodeGlowRadius = lineThickness * 6.0;
  float nodeGlowX = smoothstep(nodeGlowRadius, 0.0, abs(gridX - 0.5) - 0.5 + nodeGlowRadius);
  float nodeGlowY = smoothstep(nodeGlowRadius, 0.0, abs(gridY - 0.5) - 0.5 + nodeGlowRadius);
  float nodeGlow = nodeGlowX * nodeGlowY * depthFade * gridMask * beatPulseVal;
  col += nodeColor * nodeGlow * 0.15;

  // --- Horizontal scan line (highs-driven) ---
  float scanSpeed = (1.0 + highs * 3.0 + fftHigh * 2.0) * sectionScanSpeed;
  float scanPos = fract(slowTime * scanSpeed * 0.4);
  float scanY = mix(1.0, vpY, scanPos); // sweep from bottom to horizon
  float scanDist = abs(uv.y - scanY);
  float scanLine = exp(-scanDist * scanDist * 800.0) * (0.3 + highs * 0.9);
  vec3 scanColor = mix(neonCyan, vec3(1.0, 1.0, 1.0), 0.3);
  col += scanColor * scanLine * gridMask;

  // Secondary scan line at different phase
  float scanPos2 = fract(slowTime * scanSpeed * 0.25 + 0.5);
  float scanY2 = mix(1.0, vpY, scanPos2);
  float scanDist2 = abs(uv.y - scanY2);
  float scanLine2 = exp(-scanDist2 * scanDist2 * 600.0) * highs * 0.4;
  col += neonMagenta * scanLine2 * gridMask;

  // --- Onset flash ripple from center ---
  if (onset > 0.05) {
    float rippleTime = onset;
    float distFromCenter = length(vec2(uv.x - 0.5, (uv.y - vpY) * 2.0));
    float rippleRadius = rippleTime * 0.8;
    float ripple = exp(-pow((distFromCenter - rippleRadius) * 12.0, 2.0));
    col += vec3(1.0, 0.95, 0.9) * ripple * onset * 1.5;
    // Also brighten grid lines on onset
    col += vertColor * vertLine * onset * 0.5 * gridMask;
    col += horizColor * horizLine * onset * 0.4 * gridMask;
  }

  // --- Horizon glow line ---
  float horizEdge = exp(-pow((uv.y - vpY) * 15.0, 2.0));
  vec3 horizGlowColor = mix(neonMagenta, neonPurple, 0.5);
  col += horizGlowColor * horizEdge * (0.15 + energy * 0.25 + vocalGlow);

  // --- Above-horizon subtle reflection (mirror grid, very dim) ---
  float aboveHorizon = smoothstep(0.0, 0.02, uv.y - vpY);
  if (aboveHorizon > 0.01) {
    float reflDepth = 0.15 / max(uv.y - vpY, 0.001);
    reflDepth = clamp(reflDepth, 0.0, 20.0);
    float reflX = (uv.x - 0.5) * reflDepth * 0.5;
    vec2 reflUV = vec2(reflX, reflDepth + gridScroll);
    float reflGridX = fract(reflUV.x * gridDensityX);
    float reflVert = smoothstep(lineThickness * 0.5, 0.0, abs(reflGridX - 0.5) - 0.5 + lineThickness * 0.5);
    float reflFade = exp(-reflDepth * 0.12) * 0.08;
    col += neonPurple * reflVert * reflFade * aboveHorizon * energy;
  }

  // === SECONDARY LAYER: volumetric fog between grid and horizon ===
  float fogNoise = fbm6(vec3(p * 1.5 * energyDetail + 150.0, slowTime * 0.2));
  vec3 fogColor = mix(neonCyan, neonPurple, fogNoise * 0.5 + 0.5);
  float fogMask = smoothstep(horizonLine, horizonLine - 0.25, uv.y) * gridMask;
  col = mix(col, col + fogColor * 0.06 * (0.5 + fogNoise * 0.5), 0.3 * fogMask);

  // --- Peak approaching anticipation ---
  col *= 1.0 + peakApproach * 0.12;

  // --- Climax boost ---
  col *= 1.0 + climaxBoost * 0.5;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.005, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // --- Feedback trails: section-type-aware decay ---
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.90, 0.90 - 0.07, energy);
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
