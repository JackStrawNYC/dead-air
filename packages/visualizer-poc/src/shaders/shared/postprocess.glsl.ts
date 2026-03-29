/**
 * Configurable GLSL post-processing chain builder.
 * Generates an `applyPostProcess(vec3 col, vec2 uv, vec2 p)` function.
 *
 * Stripped to 5 core stages for clean, contrasty output:
 *   1. Beat pulse (tempo-locked brightness swell)
 *   2. Bloom (single instance, higher threshold)
 *   3. Cinematic grade (ACES filmic tone mapping)
 *   4. Envelope modulations (brightness/saturation/hue from EnergyEnvelope)
 *   5. Film grain (era-appropriate, resolution-aware)
 *
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

  // Phil Bomb shockwave: radial UV warp from bass transients
  if (uPhilBombWave > 0.01) {
    vec2 bombCenter = vec2(0.5);
    vec2 bombDir = uv - bombCenter;
    float bombDist = length(bombDir);
    float bombWave = uPhilBombWave;
    float bombRipple = sin(bombDist * 15.0 - bombWave * 10.0) * 0.5 + 0.5;
    float bombDisplacement = bombWave * bombRipple * 0.035 * smoothstep(0.0, 0.4, bombDist);
    uv += normalize(bombDir + vec2(0.001)) * bombDisplacement;
    p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  }

${
  lensDistortionEnabled
    ? `  // Lens distortion: barrel curvature driven by uLensDistortion uniform
  uv = barrelDistort(uv, uLensDistortion);
  p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
`
    : ""
}

  // Climax reactivity
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

${
  beatPulseEnabled
    ? `  // Beat pulse: tempo-locked brightness + saturation swell
  float bp = beatPulse(uMusicalTime);
  float bpGated = bp * smoothstep(0.3, 0.7, uBeatConfidence);
  col *= 1.0 + bpGated * 0.12;
  // Beat saturation punch
  float bpLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(bpLuma), col, 1.0 + bpGated * 0.20);
`
    : ""
}
${
  bloomEnabled
    ? `  // Bloom: single instance, higher threshold for cleaner output
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float bloomThreshold = max(0.35, mix(0.70, 0.55, energy) + uBloomThreshold${bloomThresholdStr});
    float bloomAmount = max(0.0, lum - bloomThreshold) * (1.0 + climaxBoost * 0.3);
    vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
    float bloomCap = 0.35 + energy * 0.10 + climaxBoost * 0.15;
    vec3 bloom = bloomColor * min(bloomAmount, bloomCap) * (0.12 + energy * 0.06) * uShowBloom;
    col = col + bloom - col * bloom; // screen blend
  }
`
    : ""
}

  // Cinematic grade (ACES filmic tone mapping)
  col = cinematicGrade(col, energy);

  // ─── Envelope modulations (brightness/saturation/hue from EnergyEnvelope) ───
  col *= uEnvelopeBrightness;

  // Envelope saturation: luma-preserving mix
  {
    float envLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(envLuma), col, uEnvelopeSaturation);
  }

  // Envelope hue rotation
  if (abs(uEnvelopeHue) > 0.001) {
    float ehCos = cos(uEnvelopeHue);
    float ehSin = sin(uEnvelopeHue);
    mat3 ehRot = mat3(
      ehCos, -ehSin, 0.0,
      ehSin, ehCos, 0.0,
      0.0, 0.0, 1.0
    );
    col = max(vec3(0.0), ehRot * col);
  }

${
  temporalBlendEnabled
    ? `  // Temporal frame blending: gentle accumulation for feedback shaders
  {
    vec3 prevCol = texture2D(uPrevFrame, uv).rgb;
    float motionBlend = 0.12 + energy * 0.06;
    if (uJamPhase >= 0.0) {
      float trailHueDeg = mix(5.0, 10.0, smoothstep(0.0, 2.0, uJamPhase));
      float trailRad = trailHueDeg * 0.01745329;
      float trCos = cos(trailRad);
      float trSin = sin(trailRad);
      mat3 trailRot = mat3(
        trCos, -trSin, 0.0,
        trSin, trCos, 0.0,
        0.0, 0.0, 1.0
      );
      prevCol = max(vec3(0.0), trailRot * prevCol);
      motionBlend += 0.04 * smoothstep(0.0, 2.0, uJamPhase);
    }
    col = mix(col, prevCol, motionBlend);
  }
`
    : ""
}

  // Venue vignette: edge darkening scaled by venue type
  {
    float vig = 1.0 - dot(p * 0.9, p * 0.9);
    vig = smoothstep(0.0, 1.0, vig);
    col *= mix(1.0, vig, uVenueVignette);
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
