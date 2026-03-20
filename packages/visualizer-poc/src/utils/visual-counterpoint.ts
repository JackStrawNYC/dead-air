/**
 * Visual Counterpoint — artistic tension through anti-correlation.
 *
 * Instead of everything going up when the music gets loud, counterpoint
 * creates drama by pulling certain parameters in the opposite direction.
 * Peak desaturation makes loud moments stark. Quiet flooding makes silence
 * lush. Bass isolation lets low frequencies own the visual field.
 *
 * Think like a VJ: the most powerful moments come from contrast, not agreement.
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Scans backward to derive state, safe for Remotion's out-of-order rendering.
 */

import type { EnhancedFrameData } from "../data/types";
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
  /** Brightness counterpoint (-0.1..+0.1): brief dim on transients, recovery over 20 frames */
  brightnessCounterpoint: number;
}

const DESAT_RECOVERY_FRAMES = 45;  // 1.5s recovery
const QUIET_FLOOD_THRESHOLD = 60;  // 2s of consecutive quiet
const FREEZE_DURATION = 10;        // frames to hold camera still
const BRIGHTNESS_RECOVERY_FRAMES = 20; // recovery from brightness dip

/**
 * Compute counterpoint modulation for the current frame.
 *
 * Pure function — derives all state by scanning backward through frames.
 * No module-level mutable state. Safe for Remotion's parallel rendering.
 *
 * @param frames - Full frame array
 * @param frameIdx - Current frame index
 * @param climaxPhase - Current climax phase
 */
export function computeCounterpoint(
  frames: EnhancedFrameData[],
  frameIdx: number,
  climaxPhase: ClimaxPhase,
): CounterpointModulation {
  if (frames.length === 0 || frameIdx < 0) {
    return { saturationMult: 1, overlayInversion: 0, cameraFreeze: false, cameraFreezeFrames: 0, brightnessCounterpoint: 0 };
  }

  const idx = Math.min(frameIdx, frames.length - 1);
  const f = frames[idx];

  let saturationMult = 1.0;
  let overlayInversion = 0;
  let cameraFreeze = false;
  let cameraFreezeFrames = 0;
  let brightnessCounterpoint = 0;

  // ─── 1. Peak desaturation ───
  // Scan backward to find most recent peak desaturation trigger.
  // When energy > 0.35 AND onset > 0.6 → push saturation to 0.5.
  // Recovery over 45 frames (1.5s). Creates "time stops" feeling.
  let lastDesatFrame = -999;
  for (let i = idx; i >= Math.max(0, idx - DESAT_RECOVERY_FRAMES); i--) {
    if (frames[i].rms > 0.35 && frames[i].onset > 0.6) {
      lastDesatFrame = i;
      break;
    }
  }

  const framesSinceDesat = idx - lastDesatFrame;
  if (framesSinceDesat >= 0 && framesSinceDesat < DESAT_RECOVERY_FRAMES) {
    const t = framesSinceDesat / DESAT_RECOVERY_FRAMES;
    const smooth = t * t * (3 - 2 * t);
    saturationMult = 0.5 + 0.5 * smooth;
  }

  // ─── 2. Quiet flooding ───
  // Scan backward to count consecutive low-energy frames.
  // When quiet for >60 frames, push saturation to 1.3. Silence feels lush.
  let consecutiveLowFrames = 0;
  for (let i = idx; i >= 0; i--) {
    if (frames[i].rms < 0.08) {
      consecutiveLowFrames++;
    } else {
      break;
    }
  }

  if (consecutiveLowFrames > QUIET_FLOOD_THRESHOLD) {
    const floodProgress = Math.min(1, (consecutiveLowFrames - QUIET_FLOOD_THRESHOLD) / 30);
    const floodMult = 1.0 + 0.3 * floodProgress;
    if (saturationMult >= 0.95) {
      saturationMult = floodMult;
    }
  }

  // ─── 3. Bass isolation ───
  // When bass > 0.5 AND highs < 0.15, suppress overlays.
  // Let the shader fill the visual field. The bass owns the frame.
  if (f.low > 0.5 && f.high < 0.15) {
    overlayInversion = 0.8;
  } else if (f.low > 0.4 && f.high < 0.2) {
    overlayInversion = 0.3;
  }

  // ─── 4. Downbeat freeze ───
  // During climax, scan backward for recent strong beat hits.
  // If one occurred within FREEZE_DURATION frames, freeze camera.
  if (climaxPhase === "climax" || climaxPhase === "sustain") {
    for (let i = idx; i >= Math.max(0, idx - FREEZE_DURATION); i--) {
      const fr = frames[i];
      const beatDecayProxy = fr.beat ? 1.0 : 0;
      if (beatDecayProxy > 0.5 && fr.onset > 0.5) {
        cameraFreezeFrames = FREEZE_DURATION - (idx - i);
        cameraFreeze = cameraFreezeFrames > 0;
        break;
      }
    }
  }

  // ─── 5. Brightness counterpoint ───
  // On energy transients (energy > 0.35, onset > 0.5):
  //   - During idle/build/release: brief dim of -0.06 for drama
  //   - During climax/sustain: brief BOOST of +0.06 to reinforce peak moments
  // Recovery over 20 frames via smoothstep.
  let lastTransientFrame = -999;
  for (let i = idx; i >= Math.max(0, idx - BRIGHTNESS_RECOVERY_FRAMES); i--) {
    if (frames[i].rms > 0.35 && frames[i].onset > 0.5) {
      lastTransientFrame = i;
      break;
    }
  }

  const framesSinceTransient = idx - lastTransientFrame;
  if (framesSinceTransient >= 0 && framesSinceTransient < BRIGHTNESS_RECOVERY_FRAMES) {
    const t = framesSinceTransient / BRIGHTNESS_RECOVERY_FRAMES;
    const smooth = t * t * (3 - 2 * t);
    // During climax/sustain: boost brightness on transients instead of dimming
    const isClimaxSustain = climaxPhase === "climax" || climaxPhase === "sustain";
    const magnitude = isClimaxSustain ? 0.06 : -0.06;
    brightnessCounterpoint = magnitude * (1 - smooth);
  }

  return {
    saturationMult,
    overlayInversion,
    cameraFreeze,
    cameraFreezeFrames: Math.max(0, cameraFreezeFrames),
    brightnessCounterpoint,
  };
}
