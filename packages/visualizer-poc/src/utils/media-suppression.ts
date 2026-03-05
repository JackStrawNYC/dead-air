/**
 * Media Suppression — pure computation extracted from SongVisualizer.
 *
 * Computes how much to suppress overlays and art when media windows
 * or lyric triggers are active, so they don't compete for visual attention.
 */

interface MediaWindow {
  frameStart: number;
  frameEnd: number;
  media: { priority: number };
}

interface TriggerWindow {
  frameStart: number;
  frameEnd: number;
}

/**
 * Compute overlay suppression factor when media windows or lyric triggers are active.
 * Returns 0.15–1.0 where lower values mean more suppression.
 */
export function computeMediaSuppression(
  frame: number,
  activeMediaWindow: MediaWindow | undefined,
  activeLyricTrigger: TriggerWindow | undefined,
): number {
  if (activeLyricTrigger) return 0.15;
  if (activeMediaWindow) {
    return (activeMediaWindow.media.priority ?? 99) <= 1 ? 0.25 : 0.40;
  }
  return 1.0;
}

/**
 * Compute art poster suppression factor with smooth fade envelopes.
 * Returns 0.25–1.0 where lower values fade out the poster art.
 */
export function computeArtSuppressionFactor(
  frame: number,
  activeMediaWindow: MediaWindow | undefined,
  activeLyricTrigger: TriggerWindow | undefined,
  fadeFrames = 90,
): number {
  if (activeLyricTrigger) {
    const fadeIn = Math.min(1, Math.max(0, (frame - (activeLyricTrigger.frameStart - 150)) / 150));
    const fadeOut = Math.min(1, Math.max(0, (activeLyricTrigger.frameEnd + 120 - frame) / 120));
    return 1 - Math.min(fadeIn, fadeOut) * 0.75;
  }
  if (activeMediaWindow) {
    const isCurated = activeMediaWindow.media.priority <= 1;
    const fadeIn = Math.min(1, Math.max(0, (frame - (activeMediaWindow.frameStart - fadeFrames)) / fadeFrames));
    const fadeOut = Math.min(1, Math.max(0, (activeMediaWindow.frameEnd + fadeFrames - frame) / fadeFrames));
    const envelope = Math.min(fadeIn, fadeOut);
    const smooth = envelope * envelope * (3 - 2 * envelope);
    return 1 - smooth * (1 - (isCurated ? 0.60 : 0.80));
  }
  return 1;
}
