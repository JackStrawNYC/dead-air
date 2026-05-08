/**
 * Frame-window helpers for overlay pre-rendering.
 *
 * Selects representative real-audio windows from a song's analysis frames
 * for low/mid/high-energy overlay variants. Extracted so the math has
 * dedicated tests; the script render-overlay-stills.mts is the only caller.
 */

import type { EnhancedFrameData } from "../data/types";

/** Pick the frame index whose RMS sits at the requested 0..1 quantile.
 *  pct=0.10 → quiet frame, pct=0.50 → median, pct=0.90 → peak. */
export function pickFrameAtQuantile(
  frames: ReadonlyArray<{ rms?: number }>,
  pct: number,
): number {
  if (frames.length === 0) return 0;
  const sorted = frames
    .map((f, i) => ({ i, rms: f.rms ?? 0 }))
    .sort((a, b) => a.rms - b.rms);
  const targetIdx = Math.floor(sorted.length * pct);
  const safe = Math.max(0, Math.min(sorted.length - 1, targetIdx));
  return sorted[safe].i;
}

/** Slice a window of `width` frames centered on `centerIdx`. Pads at the end
 *  by repeating the last available frame when the requested window runs off
 *  the edge of the song. Returns exactly `width` frames (or empty if the
 *  source is empty). */
export function sliceWindow<T>(
  frames: ReadonlyArray<T>,
  centerIdx: number,
  width: number,
): T[] {
  if (frames.length === 0) return [];
  const half = Math.floor(width / 2);
  const start = Math.max(0, centerIdx - half);
  const end = Math.min(frames.length, start + width);
  const sliced = frames.slice(start, end) as T[];
  const last = sliced[sliced.length - 1] ?? frames[0];
  while (sliced.length < width) sliced.push(last);
  return sliced;
}

export type OverlayVariant = { suffix: string; pct: number };

/** The 3 variants emitted per overlay. The mid suffix is empty so the
 *  Rust pipeline's existing `{name}.png` lookup keeps working unchanged. */
export const OVERLAY_VARIANTS: OverlayVariant[] = [
  { suffix: "-low", pct: 0.10 },
  { suffix: "",     pct: 0.50 },
  { suffix: "-high", pct: 0.90 },
];

/** Build the 3 (variant, window) pairs from a song's frame array. */
export function buildVariantWindows(
  frames: ReadonlyArray<EnhancedFrameData>,
  windowFrames: number,
): { variant: OverlayVariant; window: EnhancedFrameData[] }[] {
  return OVERLAY_VARIANTS.map((v) => ({
    variant: v,
    window: sliceWindow(frames, pickFrameAtQuantile(frames, v.pct), windowFrames),
  }));
}
