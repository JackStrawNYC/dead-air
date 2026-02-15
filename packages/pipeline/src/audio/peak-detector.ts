import type { PeakMoment, SongAnalysisData } from '@dead-air/core';
import { createLogger } from '@dead-air/core';

const log = createLogger('audio:peak-detector');

/**
 * Find the top N peak energy moments across all analyzed songs.
 * Uses a sliding window over energy arrays to find sustained peaks.
 *
 * Energy arrays are at 10Hz (100ms per frame).
 * A "peak" is the center of a 30-frame (3-second) window
 * where the average energy is a local maximum.
 */
export function detectPeakMoments(
  analyses: SongAnalysisData[],
  songOffsets: Map<string, number>,
  topN = 5,
): PeakMoment[] {
  const candidates: PeakMoment[] = [];
  const windowSize = 30; // 3 seconds at 10Hz
  const halfWindow = Math.floor(windowSize / 2);

  for (const song of analyses) {
    const energy = song.energy;
    if (!energy || energy.length < windowSize) continue;

    const offset = songOffsets.get(song.songName) ?? 0;

    // Compute sliding window average
    const smoothed: number[] = [];
    for (let i = 0; i < energy.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(energy.length, i + halfWindow);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += energy[j];
      }
      smoothed.push(sum / (end - start));
    }

    // Find local maxima (higher than neighbors by at least 0.05)
    for (let i = halfWindow; i < smoothed.length - halfWindow; i++) {
      const val = smoothed[i];
      if (val < 0.3) continue; // Skip low-energy regions

      const prevVal = smoothed[i - halfWindow];
      const nextVal = smoothed[i + halfWindow];

      if (val > prevVal + 0.05 && val > nextVal + 0.05) {
        const timestamp = offset + i * 0.1;
        const mm = Math.floor(timestamp / 60);
        const ss = Math.round(timestamp % 60);

        candidates.push({
          timestamp,
          intensity: Math.round(val * 100) / 100,
          description: `Peak energy in ${song.songName} at ${mm}:${String(ss).padStart(2, '0')}`,
        });
      }
    }
  }

  // Sort by intensity descending, take top N with minimum 10s gap
  candidates.sort((a, b) => b.intensity - a.intensity);
  const peaks: PeakMoment[] = [];
  for (const c of candidates) {
    if (peaks.length >= topN) break;
    const tooClose = peaks.some(
      (p) => Math.abs(p.timestamp - c.timestamp) < 10,
    );
    if (!tooClose) peaks.push(c);
  }

  log.info(`Found ${candidates.length} candidates, selected top ${peaks.length}`);
  return peaks;
}
