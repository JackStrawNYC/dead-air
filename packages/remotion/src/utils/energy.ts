/**
 * Shared energy sampling utilities for KenBurns and WaveformBar.
 * Energy data is sampled at ~10Hz (librosa hop=2205 at 22050Hz),
 * so we map frames (30fps) to energy indices.
 */

export function sampleEnergy(energyData: number[], frame: number, durationInFrames: number): number {
  if (energyData.length === 0) return 0;
  const t = Math.max(0, Math.min(1, frame / durationInFrames));
  const idx = Math.min(Math.floor(t * energyData.length), energyData.length - 1);
  // Smooth over 5 samples to avoid jitter
  const lo = Math.max(0, idx - 2);
  const hi = Math.min(energyData.length - 1, idx + 2);
  let sum = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    sum += energyData[i];
    count++;
  }
  return sum / count;
}

export function normalizeEnergy(energyData: number[]): { min: number; max: number; range: number } {
  if (energyData.length === 0) return { min: 0, max: 1, range: 1 };
  const min = Math.min(...energyData);
  const max = Math.max(...energyData);
  const range = max - min || 1;
  return { min, max, range };
}
