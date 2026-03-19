/**
 * Crowd Energy Simulation — models audience momentum across a show.
 *
 * Real concert crowds have momentum: excitement builds through peaks,
 * fatigue accumulates, and set breaks provide recovery. This creates
 * a subtle energy baseline that modulates the visual experience.
 *
 * Inputs:
 *   - Song peak energies from the show so far
 *   - Set number (set breaks provide recovery)
 *   - Songs completed (show position)
 *   - Current song's average energy
 *
 * Outputs (all subtle — ±5% energy, ±10% density):
 *   - energyBaselineOffset: additive energy modifier
 *   - densityMult: overlay density multiplier
 *   - motionMult: camera motion multiplier
 *
 * The crowd model:
 *   - Excitement ramps with consecutive high-energy songs
 *   - Fatigue builds after sustained intensity (>5 high-energy songs)
 *   - Set breaks (set 2 start, encore) provide partial recovery
 *   - Quiet songs let the crowd breathe (reduces fatigue)
 */

export interface CrowdEnergyState {
  /** Additive energy baseline offset (-0.05 to +0.05) */
  energyBaselineOffset: number;
  /** Overlay density multiplier (0.9-1.1) */
  densityMult: number;
  /** Camera motion multiplier (0.9-1.1) */
  motionMult: number;
  /** Crowd excitement level (0-1) — informational */
  excitement: number;
  /** Crowd fatigue level (0-1) — informational */
  fatigue: number;
}

const NEUTRAL: CrowdEnergyState = {
  energyBaselineOffset: 0,
  densityMult: 1,
  motionMult: 1,
  excitement: 0,
  fatigue: 0,
};

/**
 * Compute crowd energy state from show history.
 *
 * @param songPeakEnergies - Peak RMS from each completed song
 * @param setNumber - Current song's set (1, 2, 3+)
 * @param songsCompleted - Songs completed before this one
 * @param currentSongAvgEnergy - Running average energy of current song
 */
export function computeCrowdEnergy(
  songPeakEnergies: number[],
  setNumber: number,
  songsCompleted: number,
  currentSongAvgEnergy: number,
): CrowdEnergyState {
  if (songPeakEnergies.length === 0) return NEUTRAL;

  // Excitement: weighted average of recent peak energies (last 3 songs weighted 2x)
  let excitementSum = 0;
  let excitementWeight = 0;
  for (let i = 0; i < songPeakEnergies.length; i++) {
    const recency = i >= songPeakEnergies.length - 3 ? 2 : 1;
    excitementSum += songPeakEnergies[i] * recency;
    excitementWeight += recency;
  }
  const excitement = Math.min(1, (excitementSum / excitementWeight) * 3); // normalized to ~0-1

  // Fatigue: builds after sustained intensity
  // Count consecutive high-energy songs from the end
  let highEnergyStreak = 0;
  for (let i = songPeakEnergies.length - 1; i >= 0; i--) {
    if (songPeakEnergies[i] > 0.2) {
      highEnergyStreak++;
    } else {
      break;
    }
  }
  // Fatigue ramps 0→1 over 5+ consecutive high-energy songs
  let fatigue = Math.min(1, Math.max(0, (highEnergyStreak - 2) / 5));

  // Set break recovery: set 2 gets 40% fatigue reduction, encore gets 60%
  if (setNumber === 2 && songsCompleted > 0) {
    fatigue *= 0.6;
  } else if (setNumber >= 3) {
    fatigue *= 0.4;
  }

  // Quiet current song reduces fatigue pressure by 30%
  if (currentSongAvgEnergy < 0.1) {
    fatigue *= 0.7;
  }

  // Net crowd energy = excitement - fatigue
  const netEnergy = excitement - fatigue * 0.5;

  // Subtle modulations
  const energyBaselineOffset = netEnergy * 0.05; // ±5% max
  const densityMult = 1 + netEnergy * 0.1; // 0.9-1.1
  const motionMult = 1 + netEnergy * 0.1;

  return {
    energyBaselineOffset: Math.max(-0.05, Math.min(0.05, energyBaselineOffset)),
    densityMult: Math.max(0.9, Math.min(1.1, densityMult)),
    motionMult: Math.max(0.9, Math.min(1.1, motionMult)),
    excitement,
    fatigue,
  };
}
