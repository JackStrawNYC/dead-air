/**
 * End Screen Safe Zones — dim overlays in YouTube end screen regions.
 *
 * YouTube end screens occupy the last 20 seconds (600 frames at 30fps).
 * They appear in bottom-right and center regions. During this window,
 * overlays and text should avoid or dim in these zones.
 */

/** Get end screen dimming factor (0 = no dimming, 1 = full dim).
 *  Ramps from 0 to 1 over the first 90 frames of the end screen window. */
function endScreenDimFactor(frame: number, totalFrames: number): number {
  const windowStart = totalFrames - 600;
  if (frame < windowStart) return 0;
  const progress = (frame - windowStart) / 90;
  return Math.min(1, Math.max(0, progress));
}

/** Suppress overlay density during end screen window.
 *  Returns a multiplier (0-1) for overlay density/opacity. */
export function endScreenOverlayMult(frame: number, totalFrames: number): number {
  const dim = endScreenDimFactor(frame, totalFrames);
  return 1 - dim * 0.6; // reduce to 40% opacity at full dim
}
