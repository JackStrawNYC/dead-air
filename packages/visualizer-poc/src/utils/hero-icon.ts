/**
 * Hero Icon State — fullscreen SDF icon events during show peaks.
 *
 * The hero icon is a full-viewport-scale version of the rotating SDF icons
 * (stealie, bear, rose, skull) that appears during the most intense climax
 * moments. Unlike the regular iconEmergence (0.4x viewport), the hero icon
 * fills 1.2x viewport with chromatic fringe and palette glow.
 *
 * Trigger: climax phase (2-3) with intensity > 0.7
 * Lifecycle: crystallize → presence → dissolve (driven by intensity)
 * Cooldown: natural — climax windows are spaced by section structure
 *
 * The actual rendering is done in GLSL (heroIconEmergence in noise.ts).
 * This module computes the trigger and progress uniforms from audio state.
 */

/** Hero icon state passed as uniforms to GLSL */
export interface HeroIconState {
  /** 1.0 when hero icon should be active, 0.0 otherwise */
  trigger: number;
  /** 0-1 intensity/progress for lifecycle effects */
  progress: number;
}

/**
 * Compute hero icon state from climax phase + intensity.
 * Called per-frame in AudioReactiveCanvas.
 *
 * @param climaxPhaseNum  0=idle, 1=build, 2=climax, 3=sustain, 4=release
 * @param climaxIntensity  0-1 within current phase
 */
export function computeHeroIconState(
  climaxPhaseNum: number,
  climaxIntensity: number,
): HeroIconState {
  // Active during climax (2) or sustain (3) with moderate intensity,
  // or during build (1) at extreme intensity — hero icons are the MOMENT
  const isClimaxActive = climaxPhaseNum >= 2 && climaxPhaseNum <= 3 && climaxIntensity > 0.5;
  const isBuildExtreme = climaxPhaseNum === 1 && climaxIntensity > 0.85;
  const isActive = isClimaxActive || isBuildExtreme;

  if (!isActive) {
    return { trigger: 0, progress: 0 };
  }

  // Remap intensity to 0-1 for smooth lifecycle
  const threshold = isBuildExtreme ? 0.85 : 0.5;
  const range = 1.0 - threshold;
  const progress = Math.min(1, (climaxIntensity - threshold) / range);

  return { trigger: 1, progress };
}
