/**
 * Crossfade timing utilities — dynamic crossfade duration and beat-synced timing.
 */

import type { EnhancedFrameData } from "../../data/types";

// Minimum section duration (in frames) to qualify for auto-variety
// Lowered from 2700 (1.5 min) to 1200 (40s) so 5-minute songs get scene transitions.
// Previous threshold meant only 10+ minute songs got within-song variety.
export const AUTO_VARIETY_MIN_SECTION = 2700; // 90 seconds at 30fps — unhurried, not frantic

/**
 * Dynamic crossfade duration based on energy context and spectral flux.
 * Quiet→quiet: 720 frames (24s) — gentle dissolve
 * Loud→loud:    72 frames (2.4s) — hard cut
 * Quiet→loud:  108 frames (3.6s) — fast snap
 * Loud→quiet:  180 frames (6s)   — moderate fade
 * Mid (default): 135 frames (4.5s) — standard crossfade
 *
 * High spectral flux at the boundary compresses the duration by up to 50%,
 * because rapid timbral change means the transition should be visually snappy.
 */
/** @internal exported for testing */
export function dynamicCrossfadeDuration(
  frames: EnhancedFrameData[],
  boundary: number,
  lookback = 60,
): number {
  const lo = Math.max(0, boundary - lookback);
  const hi = Math.min(frames.length - 1, boundary + lookback);

  // Average energy before and after boundary
  let beforeSum = 0, beforeCount = 0;
  for (let i = lo; i < boundary && i < frames.length; i++) {
    beforeSum += frames[i].rms;
    beforeCount++;
  }
  let afterSum = 0, afterCount = 0;
  for (let i = boundary; i <= hi; i++) {
    afterSum += frames[i].rms;
    afterCount++;
  }

  const beforeEnergy = beforeCount > 0 ? beforeSum / beforeCount : 0;
  const afterEnergy = afterCount > 0 ? afterSum / afterCount : 0;

  const QUIET = 0.08;
  const LOUD = 0.20;

  const beforeQuiet = beforeEnergy < QUIET;
  const beforeLoud = beforeEnergy > LOUD;
  const afterQuiet = afterEnergy < QUIET;
  const afterLoud = afterEnergy > LOUD;

  // MUSICAL TIMING: Inverted from "chill" calibration.
  // Old logic: quiet transitions were LONG (24s), loud were SHORT (5s).
  // Problem: quiet changes should be IMPERCEPTIBLE (fast), energy transitions
  // should PRESERVE MOMENTUM (long). The viewer shouldn't notice quiet changes
  // but should FEEL the energy morphing.
  let baseDuration: number;
  if (beforeQuiet && afterQuiet) baseDuration = 60;    // 2s — quick, imperceptible
  else if (beforeLoud && afterLoud) baseDuration = 360; // 12s — slow, momentum preserved
  else if (beforeQuiet && afterLoud) baseDuration = 240; // 8s — builds anticipation
  else if (beforeLoud && afterQuiet) baseDuration = 120; // 4s — energy releases naturally
  else baseDuration = 180;                               // 6s — moderate default

  // Spectral flux compression — capped at 0.7 (was 0.4) so even rapid timbral
  // changes get a smooth 4s+ crossfade instead of a 2s snap.
  const fluxWindow = 8;
  const fluxLo = Math.max(1, boundary - fluxWindow);
  const fluxHi = Math.min(frames.length - 1, boundary + fluxWindow);
  let fluxSum = 0, fluxCount = 0;
  for (let i = fluxLo; i <= fluxHi; i++) {
    const curr = frames[i].contrast;
    const prev = frames[i - 1].contrast;
    let l2 = 0;
    for (let b = 0; b < 7; b++) {
      const diff = curr[b] - prev[b];
      l2 += diff * diff;
    }
    fluxSum += Math.sqrt(l2);
    fluxCount++;
  }
  const avgFlux = fluxCount > 0 ? fluxSum / fluxCount : 0;

  // Chill cap: floor at 0.7 (was 0.4) so high-flux moments still get smooth fades
  const fluxCompression = Math.max(0.7, 1 - Math.min(avgFlux / 0.25, 1) * 0.3);

  // Floor: 45 frames (1.5s) minimum. Quiet transitions can be fast (imperceptible).
  // Old floor was 90 (3s) which made quiet transitions too noticeable.
  return Math.max(45, Math.round(baseDuration * fluxCompression));
}

/**
 * Tempo-scaled beat crossfade.
 *
 * CHILL CALIBRATION (3-hour party background):
 * Now 4 beats worth of frames with floor of 90 (3s). Crossfades land on
 * phrase-friendly boundaries instead of feeling rushed. Ceiling 180 (6s).
 */
export function beatCrossfadeFrames(tempo?: number): number {
  if (!tempo || tempo <= 0) return 120; // 4s default
  // 4 beats at given tempo, at 30fps
  const framesPerBeat = (60 / tempo) * 30;
  return Math.max(90, Math.min(180, Math.round(framesPerBeat * 4)));
}
