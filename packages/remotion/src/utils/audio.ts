import { interpolate } from 'remotion';

/**
 * Smoothstep volume envelope — more natural than linear fades.
 * Fast attack (J-cut style), smooth decay.
 *
 * Smoothstep curve: 3t² - 2t³ — starts gentle, accelerates through
 * the middle, then eases into the target. Sounds more natural than
 * linear ramps, which sound mechanical on audio.
 */
export function smoothstepVolume(
  frame: number,
  durationInFrames: number,
  fadeInFrames: number = 5,
  fadeOutFrames: number = 15,
  maxVolume: number = 1,
): number {
  const fadeIn = interpolate(frame, [0, fadeInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fadeOutFrames, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const linear = Math.min(fadeIn, fadeOut);
  return linear * linear * (3 - 2 * linear) * maxVolume;
}

/**
 * J-cut volume: very fast attack (3 frames), normal decay (15 frames).
 * Creates the perception that audio starts before the visual cut —
 * during the 15-frame crossfade, incoming audio is already near full
 * volume while the visual is still transitioning.
 */
export function jCutVolume(
  frame: number,
  durationInFrames: number,
  maxVolume: number = 1,
): number {
  return smoothstepVolume(frame, durationInFrames, 3, 15, maxVolume);
}

/**
 * Concert fade volume: fast attack (5 frames), long tail (60 frames / 2s).
 * Concert audio should linger — abrupt cuts kill the vibe.
 */
export function concertFadeVolume(
  frame: number,
  durationInFrames: number,
  maxVolume: number = 1,
): number {
  return smoothstepVolume(frame, durationInFrames, 5, 60, maxVolume);
}
