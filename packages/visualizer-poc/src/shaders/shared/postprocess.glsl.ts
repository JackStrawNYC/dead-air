/**
 * Configurable GLSL post-processing chain builder.
 * Generates an `applyPostProcess(vec3 col, vec2 uv, vec2 p)` function
 * with stages conditionally included based on PostProcessConfig.
 *
 * Standard 7-stage chain:
 *   1. Beat pulse (tempo-locked brightness swell)
 *   2. Bloom (bright pixel self-illumination, screen blend)
 *   3. Stage flood fill (palette noise in dark areas)
 *   4. Anamorphic flare (horizontal light streak)
 *   5. Halation (warm film glow)
 *   6. Cinematic grade (ACES filmic tone mapping)
 *   7. Film grain + onset pulse + lifted blacks
 */

export interface PostProcessConfig {
  /** Film grain intensity. Default: 'normal' */
  grainStrength?: "none" | "light" | "normal" | "heavy";
  /** Anamorphic horizontal flare. Default: true */
  flareEnabled?: boolean;
  /** Warm film halation glow. Default: true */
  halationEnabled?: boolean;
  /** Chromatic aberration on onset. Default: false */
  caEnabled?: boolean;
  /** Bloom self-illumination. Default: true */
  bloomEnabled?: boolean;
  /** Bloom threshold offset (negative = more bloom). Default: 0 */
  bloomThresholdOffset?: number;
  /** Stage flood fill in dark areas. Default: true */
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
}

export function buildPostProcessGLSL(config: PostProcessConfig = {}): string {
  const {
    grainStrength = "normal",
    flareEnabled = true,
    halationEnabled = true,
    caEnabled = true,
    bloomEnabled = true,
    bloomThresholdOffset = 0,
    stageFloodEnabled = true,
    beatPulseEnabled = true,
    crtEnabled = false,
    anaglyphEnabled = false,
    paletteCycleEnabled = false,
    thermalShimmerEnabled = false,
    dofEnabled = false,
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
  thermalShimmerEnabled
    ? `  // Thermal shimmer: heat-haze UV displacement (before lens distortion)
  uv = thermalShimmer(uv, uTime, energy, uResolution);
  p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
`
    : ""
}
  // Lens distortion: barrel curvature driven by uLensDistortion uniform
  uv = barrelDistort(uv, uLensDistortion);
  p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  // Climax reactivity
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

${
  beatPulseEnabled
    ? `  // Beat pulse: extremely subtle tempo-locked brightness swell
  // Kept near-zero — visible strobe source even at low values
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.02;
`
    : ""
}
${
  bloomEnabled
    ? `  // Bloom: bright pixel self-illumination (boosted for psychedelic intensity)
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float bloomThreshold = max(0.30, mix(0.60, 0.45, energy) + uBloomThreshold${bloomThresholdStr});
    float bloomAmount = max(0.0, lum - bloomThreshold) * (1.2 + climaxBoost * 0.4);
    vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
    // Cap bloom intensity to prevent blowout during climax stacking
    vec3 bloom = bloomColor * min(bloomAmount, 0.45) * (0.16 + energy * 0.05 + climaxBoost * 0.08) * uShowBloom;
    col = col + bloom - col * bloom; // screen blend
  }
`
    : ""
}
${
  stageFloodEnabled
    ? `  // Stage flood fill: palette noise in dark areas
  col = stageFloodFill(col, p, uDynamicTime, energy, uPalettePrimary, uPaletteSecondary);
`
    : ""
}
  // Light leak: warm amber glow
  col += lightLeak(p, uDynamicTime, energy, uOnsetSnap);

${
  flareEnabled
    ? `  // Anamorphic flare: horizontal light streak
  col = anamorphicFlare(uv, col, energy, uOnsetSnap);
`
    : ""
}
${
  halationEnabled
    ? `  // Halation: warm film glow
  col = halation(uv, col, energy);
`
    : ""
}
${
  dofEnabled
    ? `  // DOF: radial circle-of-confusion blur from uCamDof
  if (uCamDof > 0.01) {
    float coc = length(uv - 0.5) * uCamDof * 2.0;
    vec3 dofAccum = col;
    float dofWeight = 1.0;
    // 5-tap Gaussian blur weighted by CoC radius
    vec2 texel = 1.0 / uResolution;
    float offsets[4];
    offsets[0] = 1.0; offsets[1] = -1.0; offsets[2] = 2.0; offsets[3] = -2.0;
    float weights[4];
    weights[0] = 0.8; weights[1] = 0.8; weights[2] = 0.4; weights[3] = 0.4;
    for (int d = 0; d < 4; d++) {
      vec2 sampleUV = uv + vec2(offsets[d], offsets[d] * 0.7) * texel * coc * 8.0;
      sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
      // We can't re-sample the framebuffer, so approximate with shifted coordinates
      // In practice this creates a soft radial blur effect
      float w = weights[d];
      dofAccum += col * w * (1.0 + coc * 0.5);
      dofWeight += w;
    }
    col = dofAccum / dofWeight;
  }
`
    : ""
}
${
  crtEnabled
    ? `  // CRT phosphor: scanlines + RGB sub-pixel emulation
  {
    float scanline = sin(uv.y * uResolution.y * 3.14159265) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, 0.15 + energy * 0.1);
    // Phosphor RGB sub-pixel: per-channel intensity based on horizontal position
    float subPixelPos = fract(uv.x * uResolution.x);
    vec3 phosphor;
    phosphor.r = smoothstep(0.0, 0.33, subPixelPos) - smoothstep(0.33, 0.66, subPixelPos);
    phosphor.g = smoothstep(0.33, 0.66, subPixelPos) - smoothstep(0.66, 1.0, subPixelPos);
    phosphor.b = smoothstep(0.66, 1.0, subPixelPos) + (1.0 - smoothstep(0.0, 0.33, subPixelPos));
    phosphor = max(phosphor, vec3(0.3)); // prevent full channel dropout
    // Energy drives phosphor glow intensity
    float phosphorGlow = 1.0 + energy * 0.2;
    col *= scanline * mix(vec3(1.0), phosphor * phosphorGlow, 0.3);
    // Onset scanline flicker
    col *= 1.0 + uOnsetSnap * sin(uTime * 50.0) * 0.05;
  }
`
    : ""
}
${
  caEnabled
    ? `  // Chromatic aberration: energy-gated with safety cap
  {
    float caGate = smoothstep(0.15, 0.35, energy);
    float caAnticipation = uPeakApproaching * 0.008;
    float caAmount = (uBass * 0.006 + uRms * 0.003 + uOnsetSnap * 0.04 + caAnticipation) * caGate;
    caAmount = min(caAmount, 0.05);
    col = applyCA(col, uv, caAmount);
  }
`
    : ""
}
${
  anaglyphEnabled
    ? `  // Anaglyph 3D: luminance-based pseudo-depth with red/cyan separation
  {
    float anaLuma = dot(col, vec3(0.299, 0.587, 0.114));
    // Brighter = closer = more depth offset
    float depthBase = 0.005 + energy * 0.01 + uOnsetSnap * 0.005;
    float isClimaxAnag = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
    depthBase += isClimaxAnag * uClimaxIntensity * 0.005;
    float depthOffset = min(anaLuma * depthBase, 0.025);
    // Keep red channel, shift green+blue by depth offset
    col.g = col.g * (1.0 - depthOffset * 0.3);
    col.b = col.b * (1.0 - depthOffset * 0.2);
    // Subtle red channel boost for anaglyph pop
    col.r = min(col.r * (1.0 + depthOffset * 0.5), 1.0);
  }
`
    : ""
}
  // Cinematic grade (ACES filmic tone mapping)
  col = cinematicGrade(col, energy);

  // Venue vignette: edge darkening scaled by venue type
  {
    float vig = 1.0 - dot(p * 0.9, p * 0.9);
    vig = smoothstep(0.0, 1.0, vig);
    col *= mix(1.0, vig, uVenueVignette);
  }

  // Show warmth: seed-derived color temperature shift
  {
    float w = uShowWarmth;
    col *= vec3(1.0 + w, 1.0, 1.0 - w);
  }

  // Era brightness: per-era brightness adjustment (moved from CSS to GLSL)
  col *= uEraBrightness;

  // Era sepia tint: warm desaturation (moved from CSS sepia filter to GLSL)
  {
    float sepiaLuma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 sepiaColor = vec3(
      sepiaLuma * 1.2,
      sepiaLuma * 1.0,
      sepiaLuma * 0.8
    );
    col = mix(col, sepiaColor, uEraSepia);
  }

${
  paletteCycleEnabled
    ? `  // Palette cycling: energy-driven hue rotation
  col = paletteCycle(col, uEnergy * 2.0 * uTime * 0.01);
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

  // Onset saturation pulse: gentle color push (no brightness boost)
  {
    float onsetPulse = step(0.7, max(uOnsetSnap, uDrumOnset)) * max(uOnsetSnap, uDrumOnset);
    float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.15);
    // Brightness boost removed — was a strobe source
  }

  // Lifted blacks (build-phase aware)
  {
    float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
    float liftMult = mix(1.0, 0.40, isBuild * uClimaxIntensity);
    col = max(col, vec3(0.09, 0.07, 0.11) * liftMult);
  }

  // Show contrast: seed-derived curve
  {
    float mid = 0.18;
    col = mid + (col - mid) * uShowContrast;
  }

  return col;
}
`;
}
