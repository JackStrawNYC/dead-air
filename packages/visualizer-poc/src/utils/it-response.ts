/**
 * IT Visual Response — state machine for coherence lock visual treatment.
 *
 * When the band "locks in" (the "IT" that Deadheads describe), the visual
 * response should be equally transcendent:
 *
 *   normal → locking: convergence animation (15 frames)
 *     - Overlays dissolve to 0.05 opacity
 *     - Palette converges toward single chroma-derived hue
 *     - Camera Lissajous path freezes
 *
 *   locking → locked: full lock state
 *     - Luminance lift +0.15
 *     - Shader drift snaps to musical time
 *     - Single overlay at minimal opacity
 *
 *   locked → breaking: visual reset
 *     - 2-frame white flash (opacity 0.4 then 0.2)
 *     - Trigger complete visual state change
 *
 *   breaking → normal: new visual state active
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Remotion renders frames in parallel, so state must be derived
 * from the data at frame N vs N-1.
 */

import type { EnhancedFrameData } from "../data/types";
import { computeCoherence } from "./coherence";

// ─── Types ───

export type ITPhase = "normal" | "locking" | "locked" | "breaking";

export interface ITVisualState {
  /** Current phase of IT response */
  phase: ITPhase;
  /** 0-1 progress through convergence animation (locking phase) */
  convergenceProgress: number;
  /** Target hue for palette convergence (0-360, derived from chroma) */
  targetHue: number;
  /** Opacity multiplier override for overlays (1.0 = normal, 0.05 = locked) */
  overlayOpacityOverride: number;
  /** Whether camera should be locked (freeze Lissajous path) */
  cameraLock: boolean;
  /** Additive luminance lift (0 = normal, 0.15 = locked) */
  luminanceLift: number;
  /** Whether shaders should snap to musical time instead of organic drift */
  snapToMusicalTime: boolean;
  /** Flash intensity for break transition (0 = none, 0.4 = peak) */
  flashIntensity: number;
  /** Whether to trigger a visual state reset (new shader, new palette, new overlays) */
  triggerReset: boolean;
  /** Strobe intensity during deep lock (0 = none, 0.3 = pulsing, beat-synced) */
  strobeIntensity: number;
  /** Time dilation factor for shader accumulation (1.0 = normal, 0.3 = slow-motion) */
  timeDilation: number;
}

// ─── Constants ───

const LOCK_CONVERGENCE_FRAMES = 15;
const BREAK_FLASH_FRAMES = 2;
const BREAK_RECOVERY_FRAMES = 10;
const LOCKED_OVERLAY_OPACITY = 0.05;
const LOCKED_LUMINANCE_LIFT = 0.15;
/** Frames of sustained lock before strobe kicks in (deep IT territory) */
const DEEP_LOCK_FRAMES = 150; // 5 seconds
/** Max strobe intensity during deep lock */
const STROBE_MAX = 0.30;
/** Time dilation factor during deep lock (slow-motion shader drift) */
const LOCKED_TIME_DILATION = 0.3;

// ─── Helpers ───

/** Find dominant chroma hue (0-360) from frame data */
function dominantHue(frame: EnhancedFrameData): number {
  let maxIdx = 0;
  for (let i = 1; i < 12; i++) {
    if (frame.chroma[i] > frame.chroma[maxIdx]) maxIdx = i;
  }
  return (maxIdx / 12) * 360;
}

/** Smoothstep interpolation */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

// ─── Main computation ───

/**
 * Compute IT visual state for the current frame.
 *
 * Pure function — derives state from frame data only.
 * Compares coherence at current vs previous frame to detect transitions.
 *
 * @param frames Full frame array
 * @param frameIdx Current frame index
 */
export function computeITResponse(
  frames: EnhancedFrameData[],
  frameIdx: number,
): ITVisualState {
  if (frames.length === 0 || frameIdx < 0) {
    return defaultState();
  }

  const idx = Math.min(frameIdx, frames.length - 1);

  // Get coherence state at current and recent frames
  const current = computeCoherence(frames, idx);
  const prev = idx > 0 ? computeCoherence(frames, idx - 1) : { isLocked: false, score: 0, lockDuration: 0 };

  // Detect transitions
  const justLocked = current.isLocked && !prev.isLocked;
  const justUnlocked = !current.isLocked && prev.isLocked;

  // Find how long we've been locked (look backward)
  let lockStartFrame = -1;
  if (current.isLocked) {
    // Scan backward to find where lock began
    for (let i = idx; i >= Math.max(0, idx - 600); i--) {
      const state = computeCoherence(frames, i);
      if (!state.isLocked) {
        lockStartFrame = i + 1;
        break;
      }
    }
    if (lockStartFrame === -1) lockStartFrame = Math.max(0, idx - 600);
  }

  // Find how long since we unlocked (look backward for break detection)
  let unlockFrame = -1;
  if (!current.isLocked && idx > 0) {
    for (let i = idx; i >= Math.max(0, idx - 30); i--) {
      const state = computeCoherence(frames, i);
      if (state.isLocked) {
        unlockFrame = i + 1;
        break;
      }
    }
  }

  // Get target hue from current frame's dominant chroma
  const targetHue = dominantHue(frames[idx]);

  // ─── Phase determination ───

  // Breaking: just unlocked, within flash/recovery window
  if (unlockFrame >= 0) {
    const framesSinceUnlock = idx - unlockFrame;
    if (framesSinceUnlock < BREAK_FLASH_FRAMES + BREAK_RECOVERY_FRAMES) {
      let flashIntensity = 0;
      if (framesSinceUnlock === 0) flashIntensity = 0.4;
      else if (framesSinceUnlock === 1) flashIntensity = 0.2;

      const recoveryProgress = Math.max(0, framesSinceUnlock - BREAK_FLASH_FRAMES) / BREAK_RECOVERY_FRAMES;

      return {
        phase: "breaking",
        convergenceProgress: 0,
        targetHue,
        overlayOpacityOverride: smoothstep(recoveryProgress), // fade back in
        cameraLock: false,
        luminanceLift: LOCKED_LUMINANCE_LIFT * (1 - smoothstep(recoveryProgress)),
        snapToMusicalTime: false,
        flashIntensity,
        triggerReset: framesSinceUnlock === 0, // trigger on first frame of break
        strobeIntensity: 0,
        timeDilation: 1, // snap back to normal time on break
      };
    }
  }

  // Locked: coherence has been locked for longer than convergence period
  if (current.isLocked && lockStartFrame >= 0) {
    const framesSinceLock = idx - lockStartFrame;

    if (framesSinceLock < LOCK_CONVERGENCE_FRAMES) {
      // Locking: convergence animation
      const progress = framesSinceLock / LOCK_CONVERGENCE_FRAMES;
      const eased = smoothstep(progress);

      return {
        phase: "locking",
        convergenceProgress: eased,
        targetHue,
        overlayOpacityOverride: 1 - eased * (1 - LOCKED_OVERLAY_OPACITY),
        cameraLock: eased > 0.5,
        luminanceLift: LOCKED_LUMINANCE_LIFT * eased,
        snapToMusicalTime: eased > 0.7,
        flashIntensity: 0,
        triggerReset: false,
        strobeIntensity: 0,
        timeDilation: 1,
      };
    }

    // Fully locked — check for deep lock (sustained IT → strobe + time dilation)
    const deepLockProgress = Math.max(0, Math.min(1,
      (framesSinceLock - LOCK_CONVERGENCE_FRAMES) / (DEEP_LOCK_FRAMES - LOCK_CONVERGENCE_FRAMES),
    ));
    // Strobe: beat-synced pulse during deep lock, using frame's onset strength
    const onsetStrength = frames[idx]?.onset ?? 0;
    const strobeIntensity = deepLockProgress > 0.5
      ? STROBE_MAX * smoothstep((deepLockProgress - 0.5) * 2) * Math.min(1, onsetStrength * 3)
      : 0;
    // Time dilation: ramp toward slow-motion as lock deepens
    const timeDilation = 1 - (1 - LOCKED_TIME_DILATION) * smoothstep(deepLockProgress);

    return {
      phase: "locked",
      convergenceProgress: 1,
      targetHue,
      overlayOpacityOverride: LOCKED_OVERLAY_OPACITY,
      cameraLock: true,
      luminanceLift: LOCKED_LUMINANCE_LIFT,
      snapToMusicalTime: true,
      flashIntensity: 0,
      triggerReset: false,
      strobeIntensity,
      timeDilation,
    };
  }

  // Normal state
  return defaultState();
}

function defaultState(): ITVisualState {
  return {
    phase: "normal",
    convergenceProgress: 0,
    targetHue: 0,
    overlayOpacityOverride: 1,
    cameraLock: false,
    luminanceLift: 0,
    snapToMusicalTime: false,
    flashIntensity: 0,
    triggerReset: false,
    strobeIntensity: 0,
    timeDilation: 1,
  };
}
