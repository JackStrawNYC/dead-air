/**
 * Parametric Overlay Library — shared audio helpers.
 *
 * DRYs the 8-line rolling-energy loop duplicated in every existing component.
 */

import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { computeAudioSnapshot, type AudioSnapshot } from "../../utils/audio-reactive";

/** Current frame clamped to valid frames index range */
export function useFrameIndex(frames: EnhancedFrameData[]): number {
  const frame = useCurrentFrame();
  return Math.min(Math.max(0, frame), frames.length - 1);
}

/**
 * Rolling-window smoothed RMS energy.
 * Replaces the duplicated +/-75 frame loop in every component.
 * @param frames — per-frame audio data
 * @param window — half-window size in frames (default 75 = +/-2.5s at 30fps)
 */
export function useSmoothedEnergy(
  frames: EnhancedFrameData[],
  window = 75,
): number {
  const idx = useFrameIndex(frames);
  let sum = 0;
  let count = 0;
  const start = Math.max(0, idx - window);
  const end = Math.min(frames.length - 1, idx + window);
  for (let i = start; i <= end; i++) {
    sum += frames[i].rms;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Smoothed value for a specific audio field.
 * @param frames — per-frame audio data
 * @param field — which numeric field to average
 * @param window — half-window size in frames (default 75)
 */
export function useSmoothedField(
  frames: EnhancedFrameData[],
  field: "rms" | "centroid" | "onset" | "sub" | "low" | "mid" | "high" | "flatness",
  window = 75,
): number {
  const idx = useFrameIndex(frames);
  let sum = 0;
  let count = 0;
  const start = Math.max(0, idx - window);
  const end = Math.min(frames.length - 1, idx + window);
  for (let i = start; i <= end; i++) {
    sum += frames[i][field] as number;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Full audio snapshot: all smoothed fields in one call.
 * Replaces inline smoothing loops in upgraded overlay components.
 */
export function useAudioSnapshot(frames: EnhancedFrameData[]): AudioSnapshot {
  const idx = useFrameIndex(frames);
  return computeAudioSnapshot(frames, idx);
}
