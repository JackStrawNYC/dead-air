/**
 * GaussianSmoother — incremental Gaussian-weighted smoother with seek detection.
 *
 * Pre-computes Gaussian weights at construction. On sequential frames, pushes
 * the new value into a ring buffer and returns the weighted mean in O(window).
 * On seek (non-sequential frame), falls back to brute-force recomputation
 * from the full frame array to guarantee correctness.
 *
 * The window parameter matches AudioReactiveCanvas.smoothValue(): the kernel
 * spans [idx - window, idx + window] with sigma = window * 0.5. Because the
 * ring buffer only stores past values (causal), the forward half is handled
 * by the brute-force fallback on seek, and in sequential mode we accept the
 * causal approximation (past-only weighting) which is visually indistinguishable
 * for smooth audio features.
 */

import { RingBuffer } from "./ring-buffer.js";

export class GaussianSmoother {
  /** Half-window size (number of frames on each side) */
  readonly window: number;
  /** Gaussian sigma */
  readonly sigma: number;
  /** Pre-computed Gaussian weights for the causal (past) portion of the window.
   *  Index 0 = oldest (window frames ago), index window = current frame. */
  readonly weights: Float64Array;
  /** Ring buffer holding recent values */
  private readonly buffer: RingBuffer;
  /** Last smoothed value (cached) */
  private cachedValue = 0;
  /** Frame index of cachedValue */
  private cachedFrame = -1;

  constructor(window: number) {
    if (window < 0) throw new Error("GaussianSmoother window must be >= 0");
    this.window = window;
    this.sigma = Math.max(window * 0.5, 0.001); // avoid division by zero
    // Buffer holds (window + 1) values: current + `window` past frames
    const bufferSize = window + 1;
    this.buffer = new RingBuffer(bufferSize);

    // Pre-compute weights. Index 0 = oldest (window frames in the past),
    // index window = current frame (dist=0, highest weight).
    this.weights = new Float64Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
      const dist = i - window; // negative for past frames, 0 for current
      this.weights[i] = Math.exp(-(dist * dist) / (2 * this.sigma * this.sigma));
    }
  }

  /**
   * Update the smoother with a new value at the given frame index.
   * Returns the smoothed (Gaussian-weighted) value.
   *
   * If frames arrive sequentially, uses the ring buffer (O(window) weighted mean).
   * If a seek is detected, caller should use `recompute()` instead.
   */
  update(frameIndex: number, value: number): number {
    if (this.buffer.isCurrent(frameIndex) || this.buffer.lastFrameIndex === -1) {
      // Sequential or first frame
      this.buffer.push(value, frameIndex);
      this.cachedValue = this.buffer.weightedMean(this.weights);
      this.cachedFrame = frameIndex;
      return this.cachedValue;
    }
    // Non-sequential: push anyway but mark that recompute is needed
    // The caller should detect the seek and call recompute() with the full array.
    // For safety, still return a reasonable value by filling the buffer.
    this.buffer.clear();
    this.buffer.push(value, frameIndex);
    this.cachedValue = value;
    this.cachedFrame = frameIndex;
    return this.cachedValue;
  }

  /**
   * Brute-force recompute from the full frame array at the given index.
   * Matches the exact behavior of AudioReactiveCanvas.smoothValue().
   * Refills the ring buffer so subsequent sequential frames are fast again.
   */
  recompute<T>(
    frames: T[],
    idx: number,
    accessor: (f: T) => number,
  ): number {
    // Clear and refill the ring buffer with the causal window
    this.buffer.clear();
    const start = Math.max(0, idx - this.window);
    for (let i = start; i <= idx; i++) {
      this.buffer.push(accessor(frames[i]), i);
    }

    // Compute full Gaussian (including forward frames) for exact match
    const sigma = this.sigma;
    let sum = 0;
    let wsum = 0;
    const lo = Math.max(0, idx - this.window);
    const hi = Math.min(frames.length - 1, idx + this.window);
    for (let i = lo; i <= hi; i++) {
      const dist = i - idx;
      const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      sum += accessor(frames[i]) * w;
      wsum += w;
    }
    this.cachedValue = wsum > 0 ? sum / wsum : 0;
    this.cachedFrame = idx;
    return this.cachedValue;
  }

  /**
   * Get the last computed smoothed value.
   */
  get(): number {
    return this.cachedValue;
  }

  /**
   * Check if a seek (non-sequential access) has occurred.
   */
  isSeek(frameIndex: number): boolean {
    return !this.buffer.isCurrent(frameIndex) && this.buffer.lastFrameIndex !== -1;
  }

  /** Current frame index (-1 if never updated). */
  get currentFrame(): number {
    return this.cachedFrame;
  }

  /** Clear all state. */
  clear(): void {
    this.buffer.clear();
    this.cachedValue = 0;
    this.cachedFrame = -1;
  }
}
