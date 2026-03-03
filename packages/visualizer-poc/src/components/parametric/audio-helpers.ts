/**
 * Parametric Overlay Library — shared audio helpers.
 *
 * DRYs the 8-line rolling-energy loop duplicated in every existing component.
 * useAudioSnapshot now reads from the shared AudioSnapshotContext when available,
 * eliminating redundant Gaussian smoothing loops across 19+ overlay components.
 */

import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { computeAudioSnapshot, type AudioSnapshot } from "../../utils/audio-reactive";
import { useAudioSnapshotContext } from "../../data/AudioSnapshotContext";

/* ------------------------------------------------------------------ */
/*  March Window Precomputation — music-driven parade timing           */
/* ------------------------------------------------------------------ */

export interface MarchWindow {
  startFrame: number;
  endFrame: number;
  direction: 1 | -1; // alternates left/right
}

export interface MarchConfig {
  /** Smoothed energy above which a march may begin */
  enterThreshold: number;
  /** Energy below which a march ends early (hysteresis — lower than enter) */
  exitThreshold: number;
  /** Energy must stay above enterThreshold for this many frames before triggering */
  sustainFrames: number;
  /** Minimum gap between the end of one march and the start of the next */
  cooldownFrames: number;
  /** Duration of one full screen crossing in frames */
  marchDuration: number;
}

/**
 * Scans the entire frames array once and returns deterministic march windows
 * aligned to beat frames. Runs in useMemo — pure, no hooks.
 *
 * Algorithm:
 * 1. Compute smoothed energy per frame (±75 window, simple rolling average)
 * 2. When energy stays above enterThreshold for sustainFrames, find next beat
 * 3. Start march at that beat frame, duration = marchDuration
 * 4. End march when marchDuration reached OR energy below exitThreshold for 60+ frames
 * 5. Enforce cooldownFrames between marches
 * 6. Alternate direction per march
 */
export function precomputeMarchWindows(
  frames: EnhancedFrameData[],
  config: MarchConfig,
): MarchWindow[] {
  const windows: MarchWindow[] = [];
  const len = frames.length;
  if (len === 0) return windows;

  // Pre-compute smoothed energy for all frames (rolling average ±75)
  const smoothed = new Float32Array(len);
  const HALF_WIN = 75;
  let runSum = 0;
  let runCount = 0;
  // Initialize window for frame 0
  for (let i = 0; i <= Math.min(HALF_WIN, len - 1); i++) {
    runSum += frames[i].rms;
    runCount++;
  }
  smoothed[0] = runSum / runCount;
  // Slide window
  for (let f = 1; f < len; f++) {
    const addIdx = f + HALF_WIN;
    const removeIdx = f - HALF_WIN - 1;
    if (addIdx < len) { runSum += frames[addIdx].rms; runCount++; }
    if (removeIdx >= 0) { runSum -= frames[removeIdx].rms; runCount--; }
    smoothed[f] = runCount > 0 ? runSum / runCount : 0;
  }

  let sustainCount = 0;
  let lastMarchEnd = -config.cooldownFrames; // allow immediate first march
  let directionNext: 1 | -1 = 1;

  for (let f = 0; f < len; f++) {
    // Skip if we're still in cooldown
    if (f < lastMarchEnd + config.cooldownFrames) {
      sustainCount = 0;
      continue;
    }

    if (smoothed[f] >= config.enterThreshold) {
      sustainCount++;
    } else {
      sustainCount = 0;
      continue;
    }

    if (sustainCount < config.sustainFrames) continue;

    // Energy sustained long enough — find next beat frame to start on
    let beatFrame = f;
    for (let b = f; b < Math.min(f + 30, len); b++) {
      if (frames[b].beat) { beatFrame = b; break; }
    }

    // Determine end frame: march duration, but cut short if energy drops
    let endFrame = Math.min(beatFrame + config.marchDuration, len);
    let lowCount = 0;
    for (let e = beatFrame; e < endFrame; e++) {
      if (smoothed[e] < config.exitThreshold) {
        lowCount++;
        if (lowCount >= 60) { endFrame = e; break; }
      } else {
        lowCount = 0;
      }
    }

    windows.push({
      startFrame: beatFrame,
      endFrame,
      direction: directionNext,
    });

    directionNext = directionNext === 1 ? -1 : 1;
    lastMarchEnd = endFrame;
    sustainCount = 0;
    f = endFrame; // skip ahead past this march
  }

  return windows;
}

/**
 * Binary-search for the active march window at a given frame.
 * Returns null if no march is active.
 */
export function findActiveMarch(
  windows: MarchWindow[],
  frame: number,
): MarchWindow | null {
  // Linear scan is fine for typical counts (< 50 windows per song)
  for (const w of windows) {
    if (frame >= w.startFrame && frame < w.endFrame) return w;
    if (w.startFrame > frame) break; // windows are sorted, no need to continue
  }
  return null;
}

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
  // If context snapshot is available and window is close to default, use it
  const ctxSnapshot = useAudioSnapshotContext();
  if (ctxSnapshot && window === 75) {
    return ctxSnapshot.energy;
  }
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
 * Prefers the shared AudioSnapshotContext (computed once in SongVisualizer).
 * Falls back to local computation when no context is available.
 */
export function useAudioSnapshot(frames: EnhancedFrameData[]): AudioSnapshot {
  const ctxSnapshot = useAudioSnapshotContext();
  if (ctxSnapshot) return ctxSnapshot;
  // Fallback: compute locally (for standalone/test usage without SongVisualizer)
  const idx = useFrameIndex(frames);
  return computeAudioSnapshot(frames, idx);
}
