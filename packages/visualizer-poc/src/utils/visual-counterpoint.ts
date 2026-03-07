/**
 * Visual Counterpoint — artistic tension through anti-correlation.
 *
 * Instead of everything going up when the music gets loud, counterpoint
 * creates drama by pulling certain parameters in the opposite direction.
 * Peak desaturation makes loud moments stark. Quiet flooding makes silence
 * lush. Bass isolation lets low frequencies own the visual field.
 *
 * Think like a VJ: the most powerful moments come from contrast, not agreement.
 */

import type { AudioSnapshot } from "./audio-reactive";
import type { ClimaxPhase } from "./climax-state";

export interface CounterpointModulation {
  /** Saturation multiplier (0.4-1.3). <1 = desaturated, >1 = oversaturated */
  saturationMult: number;
  /** 0-1: how much to invert overlay presence (1 = kill overlays during bass) */
  overlayInversion: number;
  /** Hold camera still on downbeats during climax */
  cameraFreeze: boolean;
  /** Frames remaining in camera freeze (countdown) */
  cameraFreezeFrames: number;
}

// ─── State for multi-frame tracking ───

/** Frames of consecutive low energy for quiet flooding detection */
let consecutiveLowFrames = 0;
/** Frame of last peak desaturation trigger */
let lastDesatFrame = -999;
/** Remaining camera freeze frames */
let freezeFramesRemaining = 0;

const DESAT_RECOVERY_FRAMES = 45;  // 1.5s recovery
const QUIET_FLOOD_THRESHOLD = 60;  // 2s of consecutive quiet
const FREEZE_DURATION = 10;        // frames to hold camera still

/**
 * Reset counterpoint state (call when starting a new song).
 */
export function resetCounterpoint(): void {
  consecutiveLowFrames = 0;
  lastDesatFrame = -999;
  freezeFramesRemaining = 0;
}

/**
 * Compute counterpoint modulation for the current frame.
 *
 * @param snapshot - Current audio snapshot
 * @param climaxPhase - Current climax phase
 * @param frame - Current frame number
 */
export function computeCounterpoint(
  snapshot: AudioSnapshot,
  climaxPhase: ClimaxPhase,
  frame: number,
): CounterpointModulation {
  let saturationMult = 1.0;
  let overlayInversion = 0;
  let cameraFreeze = false;

  // ─── 1. Peak desaturation ───
  // When energy > 0.35 AND onsetEnvelope > 0.6, push saturation to 0.5.
  // The loudest moment goes stark. Recovery over 45 frames (1.5s).
  // Creates the "time stops" feeling.
  if (snapshot.energy > 0.35 && snapshot.onsetEnvelope > 0.6) {
    lastDesatFrame = frame;
  }

  const framesSinceDesat = frame - lastDesatFrame;
  if (framesSinceDesat < DESAT_RECOVERY_FRAMES) {
    // Smoothstep recovery: 0.5 at trigger → 1.0 after recovery
    const t = framesSinceDesat / DESAT_RECOVERY_FRAMES;
    const smooth = t * t * (3 - 2 * t);
    saturationMult = 0.5 + 0.5 * smooth;
  }

  // ─── 2. Quiet flooding ───
  // When energy < 0.08 for >60 consecutive frames, push saturation to 1.3.
  // Silence should feel lush, not empty.
  if (snapshot.energy < 0.08) {
    consecutiveLowFrames++;
  } else {
    consecutiveLowFrames = 0;
  }

  if (consecutiveLowFrames > QUIET_FLOOD_THRESHOLD) {
    // Smooth ramp up to 1.3 over 30 frames after threshold
    const floodProgress = Math.min(1, (consecutiveLowFrames - QUIET_FLOOD_THRESHOLD) / 30);
    const floodMult = 1.0 + 0.3 * floodProgress;
    // Only apply if we're not also recovering from a desat
    if (saturationMult >= 0.95) {
      saturationMult = floodMult;
    }
  }

  // ─── 3. Bass isolation ───
  // When bass > 0.5 AND highs < 0.15, kill overlays.
  // Let the shader fill the visual field. The bass should own the frame.
  if (snapshot.bass > 0.5 && snapshot.highs < 0.15) {
    overlayInversion = 0.8;
  } else if (snapshot.bass > 0.4 && snapshot.highs < 0.2) {
    // Gentle ramp for less extreme cases
    overlayInversion = 0.3;
  }

  // ─── 4. Downbeat freeze ───
  // During climax, on strong beats, freeze camera for 10 frames.
  // The visual holds its breath with the music.
  if (freezeFramesRemaining > 0) {
    freezeFramesRemaining--;
    cameraFreeze = true;
  }

  if (climaxPhase === "climax" || climaxPhase === "sustain") {
    // Use beatDecay as beat proxy: high value means recent beat hit
    if (snapshot.beatDecay > 0.8 && snapshot.onsetEnvelope > 0.5) {
      freezeFramesRemaining = FREEZE_DURATION;
      cameraFreeze = true;
    }
  }

  return {
    saturationMult,
    overlayInversion,
    cameraFreeze,
    cameraFreezeFrames: freezeFramesRemaining,
  };
}
