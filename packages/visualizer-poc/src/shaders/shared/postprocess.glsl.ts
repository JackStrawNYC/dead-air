/**
 * Configurable GLSL post-processing chain builder.
 * Generates an `applyPostProcess(vec3 col, vec2 uv, vec2 p)` function.
 *
 * 8-stage chain — essential visual richness without the mud:
 *   1. Beat pulse (tempo-locked brightness swell)
 *   2. Bloom (energy-reactive threshold)
 *   3. Stage flood fill (palette noise in dark areas)
 *   4. Halation (warm film glow)
 *   5. Chromatic aberration (energy-gated)
 *   6. Cinematic grade (ACES filmic tone mapping)
 *   7. Envelope modulations (brightness/saturation/hue)
 *   8. Film grain (era-appropriate, resolution-aware)
 *
 * Also: show warmth/contrast, venue vignette, era grading.
 * Optional: lens distortion, temporal blending (feedback shaders only).
 */

export interface PostProcessConfig {
  /** Film grain intensity. Default: 'normal' */
  grainStrength?: "none" | "light" | "normal" | "heavy";
  /** Anamorphic horizontal flare. Default: false (legacy, kept for opt-in) */
  flareEnabled?: boolean;
  /** Warm film halation glow. Default: false (legacy, kept for opt-in) */
  halationEnabled?: boolean;
  /** Chromatic aberration on onset. Default: false */
  caEnabled?: boolean;
  /** Bloom self-illumination. Default: true */
  bloomEnabled?: boolean;
  /** Bloom threshold offset (negative = more bloom). Default: 0 */
  bloomThresholdOffset?: number;
  /** Stage flood fill in dark areas. Default: false (legacy, kept for opt-in) */
  stageFloodEnabled?: boolean;
  /** Beat pulse brightness swell. Default: true */
  beatPulseEnabled?: boolean;
  /** CRT phosphor scanlines + sub-pixel emulation. Default: false */
  crtEnabled?: boolean;
  /** Anaglyph 3D red/cyan depth separation. Default: false */
  anaglyphEnabled?: boolean;
  /** Palette hue cycling (energy-driven rotation). Default: false */
  paletteCycleEnabled?: boolean;
  /** Thermal shimmer heat-haze UV displacement. Default: false */
  thermalShimmerEnabled?: boolean;
  /** Depth of field radial blur from uCamDof. Default: false */
  dofEnabled?: boolean;
  /** Lens barrel distortion. Default: true */
  lensDistortionEnabled?: boolean;
  /** Beat-locked micro-displacement jolt. Default: false (legacy, kept for opt-in) */
  beatJoltEnabled?: boolean;
  /** Light leak warm amber glow. Default: false (legacy, kept for opt-in) */
  lightLeakEnabled?: boolean;
  /** Era brightness + sepia grading. Default: true */
  eraGradingEnabled?: boolean;
  /** Temporal frame blending for motion coherence (requires feedback/uPrevFrame). Default: false */
  temporalBlendEnabled?: boolean;
}

export function buildPostProcessGLSL(config: PostProcessConfig = {}): string {
  const {
    grainStrength = "normal",
    bloomEnabled = true,
    bloomThresholdOffset = 0,
    beatPulseEnabled = true,
    lensDistortionEnabled = true,
    eraGradingEnabled = true,
    temporalBlendEnabled = false,
    halationEnabled = true,
    stageFloodEnabled = false,
    caEnabled = true,
    lightLeakEnabled = true,
  } = config;

  // Grain intensity expression. Wide energy swing — quiet ballads should look
  // visibly cleaner than rockers. Old "normal" was 0.03→0.04 (imperceptible).
  let grainExpr: string;
  switch (grainStrength) {
    case "none":
      grainExpr = "0.0";
      break;
    case "light":
      grainExpr = "mix(0.015, 0.045, energy)";
      break;
    case "heavy":
      grainExpr = "mix(0.05, 0.18, energy)";
      break;
    default: // normal — 4x wider than the old 0.01 swing
      grainExpr = "mix(0.02, 0.07, energy)";
  }

  const bloomThresholdStr =
    bloomThresholdOffset === 0
      ? ""
      : ` + (${bloomThresholdOffset.toFixed(2)})`;

  return /* glsl */ `
vec3 applyPostProcess(vec3 col, vec2 uv, vec2 p) {
  float energy = clamp(uEnergy, 0.0, 1.0);

${
  beatPulseEnabled
    ? `  // Beat pulse: brightness swell on confident beats — CALM MODE
  // Reduced to 0.012 (~50% of previous) — eliminates "weird pulsing light"
  // viewer complaint. Subtle enough to barely notice consciously.
  float bp = beatPulse(uMusicalTime);
  float bpGated = bp * smoothstep(0.4, 0.8, uBeatConfidence);
  col *= 1.0 + bpGated * 0.012;
`
    : ""
}
${
  lensDistortionEnabled
    ? `  // Lens distortion: subtle barrel warp before bloom
  uv = barrelDistort(uv, uLensDistortion);
  p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
`
    : ""
}
${
  bloomEnabled
    ? `  // Bloom: vivid self-illumination — WIDE energy swing so a ballad reads as
  // genuinely darker/cleaner than a rocker. Old swings were 0.18→0.30 (40% diff)
  // which was visually flat. New swings are 2-3x wider.
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float bloomThreshold = mix(0.58, 0.18, energy) + uBloomThreshold${bloomThresholdStr};
    float bloomAmount = max(0.0, lum - bloomThreshold);
    vec3 bloomColor = mix(col, vec3(1.0, 0.95, 0.90), 0.4);
    float bloomCap = 0.20 + energy * 0.55;
    vec3 bloom = bloomColor * min(bloomAmount, bloomCap) * (0.08 + energy * 0.32) * uShowBloom;
    col = col + bloom - col * bloom;
  }
`
    : ""
}
${
  caEnabled
    ? `  // Chromatic aberration: energy-gated lens fringing
  {
    float caGate = smoothstep(0.15, 0.35, energy);
    float caAmount = (uBass * 0.008 + uRms * 0.004 + uOnsetSnap * 0.03) * caGate;
    caAmount = min(caAmount, 0.03);
    col = applyCA(col, uv, caAmount);
  }
`
    : ""
}
${
  halationEnabled
    ? `  // Halation: warm film glow around bright areas
  col = halation(uv, col, energy);
`
    : ""
}
${
  lightLeakEnabled
    ? `  // Light leak: drifting warm amber glow (subtle)
  col += lightLeak(p, uDynamicTime, energy, uOnsetSnap) * 0.7;
`
    : ""
}

  // Simulated feedback: gentle color persistence without requiring uPrevFrame
  {
    float feedbackStr = 0.15 * energy; // more feedback at higher energy
    vec3 shifted = col * vec3(1.01, 0.99, 1.02); // very slight color shift
    col = mix(col, shifted, feedbackStr);
  }

  // Cinematic grade (ACES tone mapping)
  col = cinematicGrade(col, energy);

  // Quiet-passage micro-detail: when energy drops, add subtle visual texture
  // instead of just dimming to darkness. Sparkles, dust motes, enhanced grain.
  // Follows the Cosmic Voyage model — quiet should look DIFFERENT, not EMPTY.
  {
    float quietness = smoothstep(0.20, 0.04, energy);
    if (quietness > 0.01) {
      // Micro-sparkle dust motes: hash-based point lights in screen space
      vec2 sparkleUV = uv * vec2(80.0, 45.0);
      vec2 sparkleCell = floor(sparkleUV);
      vec2 sparkleFrac = fract(sparkleUV) - 0.5;
      float sparkleHash = fract(sin(dot(sparkleCell, vec2(127.1, 311.7)) + floor(uTime * 2.0)) * 43758.5453);
      float sparkleDist = length(sparkleFrac);
      float sparkle = smoothstep(0.15, 0.02, sparkleDist) * step(0.92, sparkleHash);
      // Gentle warm sparkle color
      vec3 sparkleCol = mix(vec3(0.8, 0.75, 0.65), vec3(0.6, 0.7, 0.9), sparkleHash * 0.5);
      col += sparkleCol * sparkle * quietness * 0.08;

      // Atmospheric dust drift: very slow noise-based luminance variation
      float dustNoise = snoise(vec3(uv * 3.0, uDynamicTime * 0.02));
      col += vec3(0.03, 0.025, 0.02) * (dustNoise * 0.5 + 0.5) * quietness * 0.15;

      // Slight warm tint on quiet passages — candlelight intimacy
      col = mix(col, col * vec3(1.06, 1.02, 0.94), quietness * 0.3);
    }
  }

  // Envelope brightness (the ONE knob)
  col *= uEnvelopeBrightness;

  // Envelope saturation: wide energy knee so quiet = visibly muted, loud = vivid.
  // Widened from 0.72-1.22 to 0.55-1.35 for dramatically more color contrast.
  // Ballad at RMS ~0.10 → ~0.60x sat (moody/desaturated).
  // Rocker at RMS ~0.65 → ~1.28x sat (vivid/punchy).
  {
    float envLuma = dot(col, vec3(0.299, 0.587, 0.114));
    float satKnee = mix(0.55, 1.35, energy);
    col = mix(vec3(envLuma), col, uEnvelopeSaturation * satKnee);
  }

  // Envelope hue rotation (proper HSV rotation, not 2D R-G matrix)
  // uEnvelopeHue is in radians; convert to [0,1] hue offset.
  if (abs(uEnvelopeHue) > 0.001) {
    vec3 ehHsv = rgb2hsv(col);
    ehHsv.x = fract(ehHsv.x + uEnvelopeHue / 6.28318530718);
    col = hsv2rgb(ehHsv);
  }

${
  temporalBlendEnabled
    ? `  // Temporal frame blending (feedback shaders only)
  {
    vec3 prevCol = texture2D(uPrevFrame, uv).rgb;
    col = mix(col, prevCol, 0.12 + energy * 0.06);
  }
`
    : ""
}

  // Dramatic vignette
  {
    float vig = 1.0 - dot(p * 0.9, p * 0.9);
    vig = smoothstep(0.0, 1.0, vig);
    col *= mix(1.0, vig, 0.35);
  }

  // Blacks crush: push near-black toward true black for contrast
  {
    float crushLuma = dot(col, vec3(0.299, 0.587, 0.114));
    float crushFactor = smoothstep(0.0, 0.15, crushLuma);
    col *= crushFactor * 0.3 + 0.7;
  }

  // Color persistence: saturated highlights glow with lingering warmth
  {
    float highlightMask = smoothstep(0.5, 0.9, dot(col, vec3(0.299, 0.587, 0.114)));
    col = mix(col, col * vec3(1.05, 1.0, 0.95), highlightMask * 0.3 * energy);
  }

${
  eraGradingEnabled
    ? `  // Era brightness + sepia tint
  col *= uEraBrightness;
  {
    float sepiaLuma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 sepiaColor = vec3(
      sepiaLuma * 1.2,
      sepiaLuma * 1.0,
      sepiaLuma * 0.8
    );
    col = mix(col, sepiaColor, uEraSepia);
  }
`
    : ""
}

  // Film grain: animated 2-frame hold
  {
    float grainTime = floor(uTime * 15.0) / 15.0;
    float grainIntensity = ${grainExpr};
${
  grainStrength !== "none"
    ? `    col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity * uShowGrain;`
    : ""
}
  }

  // Final HDR safety clamp: prevent runaway accumulation from cascading into broken
  // patterns. [0, 2] preserves headroom for bloom/specular while bounding the worst
  // case so feedback loops + bright shaders can't produce stuck channel artifacts.
  col = clamp(col, vec3(0.0), vec3(2.0));

  return col;
}
`;
}
