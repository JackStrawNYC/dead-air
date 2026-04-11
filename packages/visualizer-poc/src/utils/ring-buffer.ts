/**
 * RingBuffer — fixed-capacity circular buffer with O(1) mean and weighted mean.
 *
 * Designed for per-frame audio feature smoothing in Remotion, where frames
 * may be rendered out of order. Tracks the last written frame index so callers
 * can detect seeks and invalidate/recompute as needed.
 */

export class RingBuffer {
  /** Internal storage */
  private readonly data: Float64Array;
  /** Maximum number of elements */
  readonly capacity: number;
  /** Write cursor (next position to write) */
  private head = 0;
  /** How many slots are actually filled (0..capacity) */
  private count = 0;
  /** Running sum for O(1) mean */
  private runningSum = 0;
  /** Frame index of the most recently pushed value (-1 = empty) */
  private lastFrame = -1;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error("RingBuffer capacity must be >= 1");
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
  }

  /** Number of values currently stored. */
  get size(): number {
    return this.count;
  }

  /** The frame index of the last push, or -1 if empty. */
  get lastFrameIndex(): number {
    return this.lastFrame;
  }

  /**
   * Push a value into the buffer, associating it with `frameIndex`.
   * Evicts the oldest value when full.
   */
  push(value: number, frameIndex: number): void {
    // Subtract the value being overwritten from running sum
    if (this.count === this.capacity) {
      this.runningSum -= this.data[this.head];
    }
    this.data[this.head] = value;
    this.runningSum += value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.lastFrame = frameIndex;
  }

  /**
   * Arithmetic mean of all stored values. O(1) via running sum.
   * Returns 0 for empty buffer.
   */
  mean(): number {
    return this.count > 0 ? this.runningSum / this.count : 0;
  }

  /**
   * Weighted mean using the provided weights array.
   * Weights are applied to values in chronological order: weights[0] is the
   * oldest value, weights[count-1] is the newest.
   *
   * O(count) — but count is bounded by the fixed capacity (typically 6-90),
   * and the weights are pre-computed once, so this is effectively O(1) amortized
   * relative to the brute-force alternative that also scans the source array.
   */
  weightedMean(weights: Float64Array | number[]): number {
    if (this.count === 0) return 0;
    let sum = 0;
    let wsum = 0;
    for (let i = 0; i < this.count; i++) {
      // Map chronological index i → physical buffer index
      // oldest = (head - count + capacity) % capacity, then offset by i
      const physIdx = (this.head - this.count + i + this.capacity) % this.capacity;
      const w = i < weights.length ? weights[i] : 0;
      sum += this.data[physIdx] * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : 0;
  }

  /**
   * Check whether this buffer is current (valid) for the given frame index.
   * A buffer is current if the last push was for `frameIndex - 1` (sequential)
   * or `frameIndex` itself (already updated).
   */
  isCurrent(frameIndex: number): boolean {
    if (this.lastFrame === -1) return false;
    const delta = frameIndex - this.lastFrame;
    return delta === 0 || delta === 1;
  }

  /** Clear the buffer, resetting all state. */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.runningSum = 0;
    this.lastFrame = -1;
    this.data.fill(0);
  }

  /**
   * Read value at chronological index (0 = oldest, count-1 = newest).
   * Returns undefined if index is out of range.
   */
  at(chronologicalIndex: number): number | undefined {
    if (chronologicalIndex < 0 || chronologicalIndex >= this.count) return undefined;
    const physIdx = (this.head - this.count + chronologicalIndex + this.capacity) % this.capacity;
    return this.data[physIdx];
  }
}
