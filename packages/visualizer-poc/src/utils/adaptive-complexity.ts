/**
 * Adaptive Complexity Controller — maintains frame time budget by adjusting
 * shader resolution and raymarch step count.
 *
 * When frames exceed the target time, resolution and step count are gradually
 * reduced. When frames are consistently under budget, quality is restored.
 * Temporal upscaling activates automatically at low resolution to compensate
 * for the softness introduced by downscaling.
 *
 * All changes are gradual (max 0.05 per frame) to prevent visible pops.
 */

export interface ComplexityState {
  /** Current resolution scale (0.5-1.0). Lower = faster but softer. */
  resolutionScale: number;
  /** Raymarch step reduction factor (0.5-1.0). Lower = fewer steps. */
  stepReduction: number;
  /** Whether temporal upscaling should be active */
  temporalUpscaleActive: boolean;
  /** Current target FPS */
  targetFps: number;
  /** Internal: consecutive frames under budget (for recovery hysteresis) */
  _consecutiveUnderBudget: number;
}

/** Maximum change per frame — prevents visible pops */
const MAX_DELTA = 0.05;

/** Minimum values — never degrade below these */
const MIN_SCALE = 0.5;

/** Maximum values — full quality */
const MAX_SCALE = 1.0;

/** Recovery step size — smaller than reduction for stability */
const RECOVERY_DELTA = 0.02;

/** How many consecutive under-budget frames before we start recovering */
const RECOVERY_THRESHOLD = 10;

/** Threshold for activating temporal upscale (compensate for low res) */
const TEMPORAL_UPSCALE_THRESHOLD = 0.9;

/**
 * Create a default complexity state at full quality.
 */
export function createComplexityState(targetFps = 30): ComplexityState {
  return {
    resolutionScale: MAX_SCALE,
    stepReduction: MAX_SCALE,
    temporalUpscaleActive: false,
    targetFps,
    _consecutiveUnderBudget: 0,
  };
}

/**
 * Compute complexity adjustments based on frame timing.
 *
 * If frames are taking too long, reduce resolution/steps.
 * If frames are fast, restore quality.
 *
 * @param lastFrameTimeMs  How long the last frame took to render
 * @param targetFps        Target frames per second (30 or 60)
 * @param currentState     Current complexity state
 * @returns Updated complexity state (new object, does not mutate input)
 */
export function computeComplexity(
  lastFrameTimeMs: number,
  targetFps: number,
  currentState: ComplexityState,
): ComplexityState {
  const targetFrameTime = 1000 / targetFps;

  let { resolutionScale, stepReduction, _consecutiveUnderBudget } = currentState;

  // --- Over budget: reduce quality ---
  if (lastFrameTimeMs > targetFrameTime * 1.2) {
    // Reset recovery counter
    _consecutiveUnderBudget = 0;

    // Moderately over: reduce resolution only
    resolutionScale = Math.max(MIN_SCALE, resolutionScale - MAX_DELTA);

    // Severely over: also reduce step count
    if (lastFrameTimeMs > targetFrameTime * 1.5) {
      stepReduction = Math.max(MIN_SCALE, stepReduction - MAX_DELTA);
    }
  }
  // --- Under budget: gradually recover quality ---
  else if (lastFrameTimeMs < targetFrameTime * 0.8) {
    _consecutiveUnderBudget += 1;

    if (_consecutiveUnderBudget >= RECOVERY_THRESHOLD) {
      // Recover resolution first, then steps
      if (resolutionScale < MAX_SCALE) {
        resolutionScale = Math.min(MAX_SCALE, resolutionScale + RECOVERY_DELTA);
      } else if (stepReduction < MAX_SCALE) {
        stepReduction = Math.min(MAX_SCALE, stepReduction + RECOVERY_DELTA);
      }
    }
  }
  // --- Within budget: hold steady, reset recovery counter ---
  else {
    _consecutiveUnderBudget = 0;
  }

  // Temporal upscale activates when resolution is below threshold
  const temporalUpscaleActive = resolutionScale < TEMPORAL_UPSCALE_THRESHOLD;

  return {
    resolutionScale,
    stepReduction,
    temporalUpscaleActive,
    targetFps,
    _consecutiveUnderBudget,
  };
}
