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
    thermalShimmerEnabled = false,
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
  thermalShimmerEnabled
    ? `  // Thermal shimmer: heat-haze UV displacement — shifts subsequent
  // post-process effects (bloom halos, chromatic aberration, halation)
  // creating wavy distortion on the glow layers.
  uv = thermalShimmer(uv, uTime, energy, uResolution);
  p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
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
    float bloomThreshold = mix(0.58, 0.18, energy) + uBloomThreshold${bloomThresholdStr} + uShowBloomCharacter;
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

  // Atmospheric perspective: distant elements desaturate and shift cool
  // uCamDof encodes depth-of-field strength — higher during deep 3D scenes
  {
    float depthFactor = clamp(uCamDof, 0.0, 1.0);
    if (depthFactor > 0.01) {
      // Use screen-space position as proxy for depth (edges = further)
      float screenDepth = length(p) * 0.7;
      float atmosphereMask = smoothstep(0.2, 0.8, screenDepth) * depthFactor;
      // Desaturate distant areas
      float atmoLuma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(atmoLuma), atmosphereMask * 0.25);
      // Cool shift (blue-gray atmospheric haze)
      col = mix(col, col * vec3(0.92, 0.95, 1.08), atmosphereMask * 0.15);
      // Subtle additive haze
      col += vec3(0.02, 0.025, 0.04) * atmosphereMask * 0.3;
    }
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

      // Atmospheric dust drift: warm-tinted noise-based luminance wash
      float dustNoise = snoise(vec3(uv * 3.0, uDynamicTime * 0.02));
      vec3 dustColor = hsv2rgb(vec3(uPalettePrimary, 0.30, 0.06)); // song-palette tinted
      col += dustColor * (dustNoise * 0.5 + 0.5) * quietness * 0.30;

      // Slight warm tint on quiet passages — candlelight intimacy
      col = mix(col, col * vec3(1.06, 1.02, 0.94), quietness * 0.3);

      // Nebular wisps: slow flowing organic shapes that give quiet void visual weight.
      // Without this, quiet = black screen. With it, quiet = breathing living space.
      float wispNoise = snoise(vec3(uv * 1.5 + uDynamicTime * 0.008, uDynamicTime * 0.015));
      float wispNoise2 = snoise(vec3(uv * 2.8 - uDynamicTime * 0.012, uDynamicTime * 0.01 + 5.0));
      float wispMask = smoothstep(0.25, 0.65, wispNoise) * smoothstep(0.2, 0.6, wispNoise2);
      // Wisp color follows song palette — warm, song-specific glow
      float wispHue = uPalettePrimary; // already 0-1
      vec3 wispColor = hsv2rgb(vec3(wispHue, 0.40, 0.12));
      col += wispColor * wispMask * quietness * 0.25;

      // Deeper vignette in quiet passages — intimate, focused, contemplative
      float quietVig = 1.0 - dot(p * 1.1, p * 1.1);
      quietVig = smoothstep(0.0, 1.0, quietVig);
      col *= mix(1.0, quietVig, quietness * 0.18);

      // Slow chromatic drift: very subtle hue rotation over time
      // gives quiet passages a sense of time passing, not frozen
      float driftAngle = uDynamicTime * 0.003 * quietness;
      vec3 driftHsv = rgb2hsv(col);
      driftHsv.x = fract(driftHsv.x + driftAngle);
      col = mix(col, hsv2rgb(driftHsv), quietness * 0.15);
    }
  }

  // Envelope brightness — 70% floor. Pure col *= uEnvelopeBrightness
  // crushed already-dim shader output to near-black during low-energy
  // moments. Mapped 0.55..1.20 (manifest clamp range) to 0.70..1.15
  // so quiet moments dim to 70% of shader output rather than 35%.
  float envBrightMul = mix(0.70, 1.15, clamp((uEnvelopeBrightness - 0.55) / 0.65, 0.0, 1.0));
  col *= envBrightMul;

  // Low-energy ambient haze — substantial warm-amber lift when uEnergy
  // is low so dark-shader-output frames don't fade to black. Many
  // shaders multiply their output by uEnergy and produce near-zero
  // when audio is quiet (or in dead-air sections, intro lulls,
  // boundary breathing dim). Adds up to +0.18 max RGB lift on the
  // quietest frames; fades out by uEnergy=0.35 so loud passages are
  // unaffected. Color is subtle warm amber consistent with concert
  // venue spillover lighting.
  {
    float quietAmount = 1.0 - smoothstep(0.05, 0.35, uEnergy);
    vec3 quietHaze = vec3(0.090, 0.065, 0.035); // warm amber spill
    col += quietHaze * quietAmount * 2.0;
  }

  // Entrainment oscillation: very slow brightness breathing at 0.07Hz (14s period)
  // Below conscious perception threshold but within brainwave alpha-wave range.
  // During Space passages, slower (20s) and stronger for meditative states.
  {
    float spaceDepth = clamp(uSpaceScore, 0.0, 1.0);
    float entrainPeriod = mix(14.0, 20.0, spaceDepth); // seconds
    float entrainAmp = mix(0.03, 0.05, spaceDepth);    // ±3-5% brightness
    float entrainPhase = uDynamicTime / entrainPeriod * 6.28318;
    float entrainWave = sin(entrainPhase) * entrainAmp;
    col *= 1.0 + entrainWave;
  }

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

  // ─── Semantic CLAP modulation ───
  // 8 ML-derived semantic scores shift every shader's visual character.
  // psychedelic/chaotic → vivid, saturated, bloomy
  // tender/ambient → desaturated, cool, intimate
  // cosmic → cool highlights, spatial depth
  // aggressive/triumphant → warm, punchy, saturated
  // All uniforms ?? 0 when unavailable — zero-impact graceful fallback.
  {
    // Saturation: expressive categories boost, contemplative reduce
    float semSatBoost = uSemanticPsychedelic * 0.08 + uSemanticTriumphant * 0.06
                      + uSemanticAggressive * 0.05 + uSemanticChaotic * 0.04;
    float semSatReduce = uSemanticTender * 0.06 + uSemanticAmbient * 0.04;
    float semSatMod = 1.0 + semSatBoost - semSatReduce;
    float semLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(semLuma), col, clamp(semSatMod, 0.7, 1.4));

    // Color temperature: cosmic/ambient → cool tint, aggressive/triumphant → warm
    float semWarm = uSemanticAggressive * 0.025 + uSemanticTriumphant * 0.02
                  + uSemanticRhythmic * 0.01;
    float semCool = uSemanticCosmic * 0.025 + uSemanticAmbient * 0.02
                  + uSemanticTender * 0.01;
    col *= vec3(1.0 + semWarm - semCool, 1.0, 1.0 - semWarm + semCool);

    // Highlight bloom emphasis: psychedelic/cosmic scenes glow more
    float semGlow = (uSemanticPsychedelic + uSemanticCosmic) * 0.03;
    float semHighMask = smoothstep(0.55, 0.95, dot(col, vec3(0.299, 0.587, 0.114)));
    col += col * semHighMask * semGlow;
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
  // uShowContrastCharacter (0-1) modulates crush: 0 = soft (80%), 1 = punchy (120%)
  {
    float crushLuma = dot(col, vec3(0.299, 0.587, 0.114));
    float crushFactor = smoothstep(0.0, 0.15, crushLuma);
    col *= (crushFactor * 0.3 + 0.7) * (0.8 + uShowContrastCharacter * 0.4);
  }

  // Color persistence: saturated highlights glow with lingering warmth
  // uShowTemperatureCharacter (-1 to +1) shifts warm/cool globally
  {
    float highlightMask = smoothstep(0.5, 0.9, dot(col, vec3(0.299, 0.587, 0.114)));
    col = mix(col, col * vec3(1.05, 1.0, 0.95), highlightMask * 0.3 * energy);
    col *= vec3(1.0 + uShowTemperatureCharacter * 0.02, 1.0, 1.0 - uShowTemperatureCharacter * 0.02);
  }

${
  eraGradingEnabled
    ? `  // Era film-stock character — direct (not via uShowGrain backdoor).
  // The audit flagged 1972 vs 1977 as visually identical; this block
  // applies per-era black-lift (older film can't hit pure black) and a
  // contrast-curve scale (older film softer S-curve, digital harder)
  // so eras read as distinct stocks even before sepia/brightness fire.
  {
    // Lifted blacks: floor scaled by era stock. primal=0.06 (warm super-8
    // darkness), classic=0.02, digital eras=0. Pure floor so it doesn't
    // fight the existing film-stock block downstream (which keys on grain).
    if (uEraBlackLift > 0.001) {
      col = max(col, vec3(uEraBlackLift));
    }
    // S-curve contrast scale around midpoint 0.5. < 1.0 = softer (primal,
    // hiatus); > 1.0 = harder (touch_of_grey 80s). Pulls toward or away
    // from midpoint by (1 - scale).
    if (abs(uEraContrastScale - 1.0) > 0.005) {
      vec3 mid = vec3(0.5);
      col = mid + (col - mid) * uEraContrastScale;
    }
  }
  // Era brightness + sepia tint
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
  // Show warmth: color temperature shift via highlight/shadow split.
  // Warm: shadows go deep amber-purple, highlights go golden.
  // This avoids the crude RGB multiply that muddles darks.
  {
    float w = uShowWarmth;
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    // Warm highlights: push bright areas toward golden
    vec3 warmHighlight = vec3(1.0 + w * 0.20, 1.0 + w * 0.06, 1.0 - w * 0.15);
    // Warm shadows: push dark areas toward deep amber-purple (not mud)
    vec3 warmShadow = vec3(1.0 + w * 0.08, 1.0 - w * 0.02, 1.0 - w * 0.06);
    vec3 warmMult = mix(warmShadow, warmHighlight, smoothstep(0.15, 0.60, luma));
    col *= warmMult;
  }
  // Song palette color grading: rotate hues toward the song's intended palette.
  // uPalettePrimary is a hue (0-1). This gently shifts the scene toward that hue
  // like a color grade in film post-production. 30% blend = noticeable but not forced.
  // Song palette color grading: force the scene into the song's color world.
  // The Dead aesthetic demands song-specific palettes — Sugar Magnolia is GOLDEN,
  // Dark Star is INDIGO, He's Gone is PURPLE. No generic green/cyan.
  {
    vec3 hsv = rgb2hsv(col);
    float targetHue = uPalettePrimary;
    float currentHue = hsv.x;
    float hueDiff = targetHue - currentHue;
    if (hueDiff > 0.5) hueDiff -= 1.0;
    if (hueDiff < -0.5) hueDiff += 1.0;

    // Luminance-aware hue rotation:
    // - Dark pixels: minimal rotation (preserve shadow depth)
    // - Bright/saturated pixels: strong rotation (enforce palette)
    // - Desaturated pixels: minimal rotation (preserve grays/whites)
    // This prevents monochromatic output while keeping the palette identity.
    float dist = abs(hueDiff);
    float baseStrength = mix(0.50, 0.90, smoothstep(0.05, 0.20, dist));
    float satGate = smoothstep(0.08, 0.30, hsv.y); // only rotate colored pixels
    float lumGate = smoothstep(0.03, 0.15, hsv.z) * smoothstep(0.95, 0.80, hsv.z); // not too dark or bright
    float strength = baseStrength * satGate * lumGate;

    hsv.x = fract(currentHue + hueDiff * strength);
    // Gentle saturation blend — preserve the shader's own saturation character
    hsv.y = mix(hsv.y, uPaletteSaturation, 0.15 * satGate);
    col = hsv2rgb(hsv);
  }
  // Show contrast: punch up the dynamic range
  {
    float midpoint = 0.5;
    col = midpoint + (col - midpoint) * uShowContrast;
    col = max(col, vec3(0.0));
  }
`
    : ""
}

  // Film grain: animated 2-frame hold
  // uShowGrainCharacter (0-1) modulates: 0 = clean show (70%), 1 = gritty show (130%)
  {
    float grainTime = floor(uTime * 15.0) / 15.0;
    float grainIntensity = ${grainExpr} * (0.7 + uShowGrainCharacter * 0.6);
${
  grainStrength !== "none"
    ? `    col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity * uShowGrain;`
    : ""
}
  }

  // ─── ERA FILM STOCK CHARACTER ───
  // The audit flagged era authenticity as "just hue-shift, not film stock".
  // This block adds real film characteristics scaled by uShowGrain (per-era
  // value: primal/classic ≈ 1.3-1.8, touch_of_grey ≈ 1.0, revival ≈ 0.7-0.9).
  // High grain = older film stock = lifted blacks + soft vignette + slight
  // contrast reduction. Low grain = digital = no treatment.
  {
    // filmness: 0 (digital) → 1 (heavy super-8 / 1972 primal)
    float filmness = clamp((uShowGrain - 0.8) / 0.8, 0.0, 1.0);
    if (filmness > 0.01) {
      // Lifted blacks: super-8 / 16mm don't crush to pure black.
      // Lift the floor by 4% × filmness for that "warm darkness" feel.
      col = max(col, vec3(0.04 * filmness));
      // Soft contrast roll-off — film has lower dynamic range than digital.
      // Pull values away from the extremes by a small amount.
      vec3 midpoint = vec3(0.5);
      col = mix(col, midpoint + (col - midpoint) * 0.92, filmness * 0.5);
      // Period vignette: heavy on super-8, none on digital.
      vec2 vCenter = uv - 0.5;
      float vDist = length(vCenter);
      float vign = 1.0 - smoothstep(0.45, 0.75, vDist) * 0.35 * filmness;
      col *= vign;
      // Slight warm cast in the shadows (silver halide tarnish — physical
      // film aging gives warm lows). Highlights stay neutral.
      float shadowMask = 1.0 - smoothstep(0.0, 0.4, dot(col, vec3(0.299, 0.587, 0.114)));
      col.r += shadowMask * 0.025 * filmness;
      col.g += shadowMask * 0.012 * filmness;
    }
  }

  // ─── PEAK OF SHOW: the once-per-show transcendent moment ───
  // detectPeakOfShow fires uPeakOfShow > 0.5 for ~7s at THE moment of the
  // show (deep set 2 jam climax, etc.). This applies a universal "golden
  // hour" treatment over whatever shader is rendering: saturation lift,
  // warm color convergence toward 35° amber, brightness boost, and a slow
  // radial pulse from center that breathes once per second. Peak intensity
  // ramps in/out via the uniform's value (0-1).
  if (uPeakOfShow > 0.01) {
    float peak = clamp(uPeakOfShow, 0.0, 1.0);
    // Slow radial pulse — 1Hz breath from center, max amplitude 0.15
    vec2 pCenter = uv - 0.5;
    float pDist = length(pCenter);
    float pPulse = 0.5 + 0.5 * sin(uTime * 6.2832 - pDist * 4.0);
    float radial = (1.0 - smoothstep(0.0, 0.85, pDist)) * pPulse;
    // Brightness lift: +35% center → +5% edges, all scaled by peak intensity
    col *= 1.0 + (0.05 + radial * 0.30) * peak;
    // Saturation lift via HSV
    vec3 peakHsv = rgb2hsv(col);
    peakHsv.y = mix(peakHsv.y, min(1.0, peakHsv.y * 1.45), peak);
    // Warm convergence: pull hue 25% toward 35° amber (golden hour)
    float warmHue = 35.0 / 360.0;
    float hueDelta = warmHue - peakHsv.x;
    if (hueDelta > 0.5) hueDelta -= 1.0; else if (hueDelta < -0.5) hueDelta += 1.0;
    peakHsv.x = fract(peakHsv.x + hueDelta * 0.25 * peak);
    col = hsv2rgb(peakHsv);
    // Vignette inversion: bright center, slightly darkened edges for halo feel
    float peakVign = 1.0 - pDist * 0.4 * peak;
    col *= peakVign;
  }

  // Final HDR safety clamp: prevent runaway accumulation from cascading into broken
  // patterns. [0, 2] preserves headroom for bloom/specular while bounding the worst
  // case so feedback loops + bright shaders can't produce stuck channel artifacts.
  col = clamp(col, vec3(0.0), vec3(2.0));

  return col;
}
`;
}
