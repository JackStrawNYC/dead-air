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

  // Grain intensity expression
  let grainExpr: string;
  switch (grainStrength) {
    case "none":
      grainExpr = "0.0";
      break;
    case "light":
      grainExpr = "mix(0.02, 0.03, energy)";
      break;
    case "heavy":
      grainExpr = "mix(0.08, 0.14, energy)";
      break;
    default: // normal
      grainExpr = "mix(0.03, 0.04, energy)";
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
    ? `  // Beat pulse: brightness swell on confident beats
  float bp = beatPulse(uMusicalTime);
  float bpGated = bp * smoothstep(0.3, 0.7, uBeatConfidence);
  col *= 1.0 + bpGated * 0.06;
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
    ? `  // Bloom: vivid self-illumination
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float bloomThreshold = mix(0.45, 0.30, energy) + uBloomThreshold${bloomThresholdStr};
    float bloomAmount = max(0.0, lum - bloomThreshold);
    vec3 bloomColor = mix(col, vec3(1.0, 0.95, 0.90), 0.4);
    float bloomCap = 0.40 + energy * 0.20;
    vec3 bloom = bloomColor * min(bloomAmount, bloomCap) * (0.18 + energy * 0.12) * uShowBloom;
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

  // Envelope brightness (the ONE knob)
  col *= uEnvelopeBrightness;

  // Envelope saturation
  {
    float envLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(envLuma), col, uEnvelopeSaturation);
  }

  // Envelope hue rotation
  if (abs(uEnvelopeHue) > 0.001) {
    float ehCos = cos(uEnvelopeHue);
    float ehSin = sin(uEnvelopeHue);
    mat3 ehRot = mat3(ehCos, -ehSin, 0.0, ehSin, ehCos, 0.0, 0.0, 0.0, 1.0);
    col = max(vec3(0.0), ehRot * col);
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

  return col;
}
`;
}
