/**
 * BeatDetector — adaptive threshold beat detection from onset signal.
 * Rolling 2s onset history, beat = onset > mean * 1.5 + constant.
 */

export interface BeatState {
  isBeat: boolean;
  estimatedTempo: number;
}

export class BeatDetector {
  // Rolling onset buffer: 2 seconds at 60fps = 120 samples
  private onsetHistory: Float32Array;
  private historyIndex = 0;
  private historyFilled = false;
  private readonly bufferSize: number;

  // Beat timing for tempo estimation
  private beatTimes: number[] = [];
  private lastBeatTime = 0;
  private minBeatInterval: number; // minimum ms between beats (~200bpm)
  private estimatedTempo = 120;

  // Adaptive threshold
  private readonly thresholdMultiplier = 1.5;
  private readonly thresholdConstant = 0.05;

  constructor(fps: number = 60) {
    this.bufferSize = Math.round(fps * 2); // 2 seconds
    this.onsetHistory = new Float32Array(this.bufferSize);
    this.minBeatInterval = 60000 / 200; // max 200 BPM
  }

  detect(onset: number, timeMs: number): BeatState {
    // Add to rolling buffer
    this.onsetHistory[this.historyIndex] = onset;
    this.historyIndex = (this.historyIndex + 1) % this.bufferSize;
    if (this.historyIndex === 0) this.historyFilled = true;

    // Compute rolling mean
    const count = this.historyFilled ? this.bufferSize : this.historyIndex;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this.onsetHistory[i];
    const mean = count > 0 ? sum / count : 0;

    // Adaptive threshold
    const threshold = mean * this.thresholdMultiplier + this.thresholdConstant;

    // Beat detection with minimum interval
    const elapsed = timeMs - this.lastBeatTime;
    const isBeat = onset > threshold && elapsed > this.minBeatInterval;

    if (isBeat) {
      this.lastBeatTime = timeMs;
      this.beatTimes.push(timeMs);

      // Keep last 16 beats for tempo estimation
      if (this.beatTimes.length > 16) this.beatTimes.shift();

      // Estimate tempo from median inter-beat interval
      if (this.beatTimes.length >= 4) {
        const intervals: number[] = [];
        for (let i = 1; i < this.beatTimes.length; i++) {
          intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
        }
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        if (medianInterval > 0) {
          const rawTempo = 60000 / medianInterval;
          // Clamp to reasonable range
          this.estimatedTempo = Math.max(60, Math.min(200, rawTempo));
        }
      }
    }

    return {
      isBeat,
      estimatedTempo: this.estimatedTempo,
    };
  }

  reset(): void {
    this.onsetHistory.fill(0);
    this.historyIndex = 0;
    this.historyFilled = false;
    this.beatTimes = [];
    this.lastBeatTime = 0;
    this.estimatedTempo = 120;
  }
}
