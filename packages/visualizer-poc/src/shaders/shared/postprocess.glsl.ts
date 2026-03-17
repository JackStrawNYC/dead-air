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
}

export function buildPostProcessGLSL(config: PostProcessConfig = {}): string {
  const {
    grainStrength = "normal",
    flareEnabled = true,
    halationEnabled = true,
    caEnabled = false,
    bloomEnabled = true,
    bloomThresholdOffset = 0,
    stageFloodEnabled = true,
    beatPulseEnabled = true,
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

  // Climax reactivity
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

${
  beatPulseEnabled
    ? `  // Beat pulse: tempo-locked brightness swell
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.28 + climaxBoost * bp * 0.12;
`
    : ""
}
${
  bloomEnabled
    ? `  // Bloom: bright pixel self-illumination (climax-amplified)
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float bloomThreshold = mix(0.50, 0.42, energy) - climaxBoost * 0.10${bloomThresholdStr};
    float bloomAmount = max(0.0, lum - bloomThreshold) * (2.5 + climaxBoost * 1.5);
    vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
    vec3 bloom = bloomColor * bloomAmount * (0.35 + climaxBoost * 0.20);
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
  caEnabled
    ? `  // Chromatic aberration: onset-triggered
  {
    float caAmount = uBass * 0.006 + uRms * 0.003 + uOnsetSnap * 0.06;
    col = applyCA(col, uv, caAmount);
  }
`
    : ""
}
  // Cinematic grade (ACES filmic tone mapping)
  col = cinematicGrade(col, energy);

  // Film grain: animated 2-frame hold
  {
    float grainTime = floor(uTime * 15.0) / 15.0;
    float grainIntensity = ${grainExpr};
${
  grainStrength !== "none"
    ? `    col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;`
    : ""
}
  }

  // Onset saturation pulse: push colors from gray
  {
    float onsetPulse = step(0.5, max(uOnsetSnap, uDrumOnset)) * max(uOnsetSnap, uDrumOnset);
    float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
    col *= 1.0 + onsetPulse * 0.12;
  }

  // Lifted blacks (build-phase aware)
  {
    float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
    float liftMult = mix(1.0, 0.40, isBuild * uClimaxIntensity);
    col = max(col, vec3(0.09, 0.07, 0.11) * liftMult);
  }

  return col;
}
`;
}
