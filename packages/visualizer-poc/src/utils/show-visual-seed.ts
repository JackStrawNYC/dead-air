/**
 * Show Visual Seed — derives a show-level visual fingerprint from audio analysis.
 *
 * Called during the precompute phase (show-narrative-precompute.ts) and stored
 * in PrecomputedNarrative. Downstream consumers use it to:
 *   - Curate a per-show shader pool (shader-variety.ts)
 *   - Modulate post-processing character (uniforms.glsl.ts / postprocess.glsl.ts)
 */

export interface ShowVisualSeed {
  /** Dominant spectral family for this show: "warm"|"cosmic"|"tonal"|"bright"|"textural" */
  dominantSpectralFamily: string;
  /** Secondary contrasting family */
  secondarySpectralFamily: string;
  /** Warm/cool palette tendency (-1 cool, +1 warm) derived from avg centroid */
  paletteTemperature: number;
  /** Show-level grain preference (0 clean, 1 heavy) from energy variance */
  grainPreference: number;
  /** Show-level bloom bias (-0.1 to +0.1) from dynamic range */
  bloomBias: number;
  /** Show-level contrast character (0 soft, 1 punchy) from energy distribution */
  contrastCharacter: number;
  /** Deterministic hash for same-recording variety */
  showHash: number;
}

const SPECTRAL_FAMILIES = ["warm", "cosmic", "tonal", "bright", "textural"] as const;

export function computeShowVisualSeed(
  songFrames: Array<{ rms: number; centroid?: number; flatness?: number }[]>,
  showDateHash: number,
): ShowVisualSeed {
  // Aggregate spectral centroid, energy stats across all songs
  let totalCentroid = 0, centroidCount = 0;
  let totalEnergy = 0, energySum2 = 0, energyCount = 0;

  for (const frames of songFrames) {
    for (const f of frames) {
      if (f.centroid != null) { totalCentroid += f.centroid; centroidCount++; }
      totalEnergy += f.rms; energySum2 += f.rms * f.rms; energyCount++;
    }
  }

  const avgCentroid = centroidCount > 0 ? totalCentroid / centroidCount : 0.5;
  const avgEnergy = energyCount > 0 ? totalEnergy / energyCount : 0.3;
  const energyVariance = energyCount > 0
    ? (energySum2 / energyCount) - avgEnergy * avgEnergy
    : 0.01;

  // Map centroid to palette temperature: low centroid = warm (bass-heavy), high = cool (bright)
  const paletteTemperature = Math.max(-1, Math.min(1, (avgCentroid - 0.5) * -2));

  // Map energy variance to grain: high variance (dynamic show) -> heavier grain
  const grainPreference = Math.max(0, Math.min(1, energyVariance * 10));

  // Map average energy to bloom: high avg energy -> more bloom
  const bloomBias = Math.max(-0.1, Math.min(0.1, (avgEnergy - 0.3) * 0.5));

  // Contrast character from energy distribution spread
  const energyStd = Math.sqrt(Math.max(0, energyVariance));
  const contrastCharacter = Math.max(0, Math.min(1, energyStd * 5));

  // Spectral family from centroid quintile + date hash for deterministic variety
  const centroidQuintile = Math.floor(Math.min(0.999, avgCentroid) * 5);
  const primaryIdx = (centroidQuintile + showDateHash) % 5;
  const secondaryIdx = (primaryIdx + 2 + (showDateHash % 3)) % 5; // offset by 2-4

  return {
    dominantSpectralFamily: SPECTRAL_FAMILIES[primaryIdx],
    secondarySpectralFamily: SPECTRAL_FAMILIES[secondaryIdx],
    paletteTemperature,
    grainPreference,
    bloomBias,
    contrastCharacter,
    showHash: showDateHash,
  };
}
