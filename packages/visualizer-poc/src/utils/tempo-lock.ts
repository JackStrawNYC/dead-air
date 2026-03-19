/**
 * Tempo-Locked Visual Rhythms — beat-grid-synced visual modulations.
 *
 * Uses musicalTime (beat-grid-snapped continuous value) for visual pacing:
 *   - Overlay opacity breathing at tempo (±5-10% sinusoidal)
 *   - Subtle beat-locked zoom pulse (0.2% scale oscillation)
 *   - Shader time hint locked to musical beats
 *
 * Groove-gated:
 *   pocket/driving → full lock (rhythmic precision)
 *   freeform       → partial lock (50% blend)
 *   floating       → no lock (organic/ambient)
 */

import type { GrooveType } from "./groove-detector";

export interface TempoLockState {
  /** Overlay opacity multiplier: sinusoidal breathing at tempo (0.92-1.08) */
  overlayBreathing: number;
  /** Camera zoom pulse multiplier: beat-locked scale (0.998-1.002) */
  zoomPulse: number;
  /** Beat phase 0-1 (fractional position within current beat) */
  beatPhase: number;
  /** Bar phase 0-1 (position within current 4-beat bar) */
  barPhase: number;
  /** How much tempo-lock is applied (0 = organic, 1 = fully locked) */
  lockStrength: number;
}

const NEUTRAL: TempoLockState = {
  overlayBreathing: 1,
  zoomPulse: 1,
  beatPhase: 0,
  barPhase: 0,
  lockStrength: 0,
};

/** Groove type → lock strength (how much tempo-lock applies) */
const GROOVE_LOCK: Record<GrooveType, number> = {
  pocket: 1.0,
  driving: 1.0,
  freeform: 0.5,
  floating: 0.0,
};

/**
 * Compute tempo-locked visual modulations.
 *
 * @param musicalTime - Beat-grid-snapped continuous value (integer = beat hit)
 * @param grooveType - Current groove classification
 * @param beatStability - 0-1 consistency of beat spacing
 * @param energy - 0-1 smoothed energy level
 */
export function computeTempoLock(
  musicalTime: number,
  grooveType: GrooveType,
  beatStability: number,
  energy: number,
): TempoLockState {
  // No lock for very low beat stability or near-silence
  if (beatStability < 0.2 || energy < 0.05) return NEUTRAL;

  const baseLock = GROOVE_LOCK[grooveType] ?? 0;
  // Scale lock by beat stability (unstable beats → less lock)
  const lockStrength = baseLock * Math.min(1, beatStability / 0.6);

  if (lockStrength < 0.01) return NEUTRAL;

  // Beat phase: fractional position within current beat (0-1)
  const beatPhase = musicalTime - Math.floor(musicalTime);

  // Bar phase: position within 4-beat bar (0-1)
  const barPhase = (musicalTime % 4) / 4;

  // Overlay breathing: sinusoidal at half-bar rate (2 beats per cycle)
  // Peaks at downbeats, troughs at upbeats — amplitude scales with energy
  const breathAmp = 0.05 + energy * 0.05; // 5-10% amplitude
  const breathRaw = Math.cos(musicalTime * Math.PI); // half-bar sinusoid
  const overlayBreathing = 1 + breathRaw * breathAmp * lockStrength;

  // Zoom pulse: subtle beat-locked zoom (0.2% max, decays from beat hit)
  // Sharp attack on beat, exponential decay within beat
  const beatAttack = Math.exp(-beatPhase * 4); // fast decay from beat
  const zoomAmp = 0.002 * lockStrength * Math.min(1, energy * 3);
  const zoomPulse = 1 + beatAttack * zoomAmp;

  return {
    overlayBreathing,
    zoomPulse,
    beatPhase,
    barPhase,
    lockStrength,
  };
}
