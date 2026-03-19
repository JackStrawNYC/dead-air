/**
 * IT Visual Response -- state machine for coherence lock visual treatment.
 *
 * When the band "locks in" (the "IT" that Deadheads describe), the visual
 * response should be equally transcendent:
 *
 *   normal -> locking: convergence animation (15 frames)
 *     - Overlays dissolve to 0.05 opacity
 *     - Palette converges toward single chroma-derived hue
 *     - Camera Lissajous path freezes
 *
 *   locking -> locked: graduated lock depth (shallow/medium/deep/transcendent)
 *     - Shallow (0-90 frames): camera freeze + overlay reduce
 *     - Medium (90-150 frames): + luminance lift + musical time snap
 *     - Deep (150-300 frames): + strobe + time dilation
 *     - Transcendent (300+ frames): force sacred shaders, overlay -> 0, max time dilation
 *
 *   locked -> releasing: graceful wind-down (90 frames)
 *     - Luminance lift fades 0.15 -> 0
 *     - Overlay opacity fades 0.05 -> 1.0
 *     - Camera releases at frame 30
 *     - Time dilation eases back to 1.0
 *
 *   locked -> breaking: sudden drop (score drops > 0.3 in < 15 frames)
 *     - Chromatic burst flash (hue-tinted, not pure white)
 *     - Trigger complete visual state change
 *
 *   releasing/breaking -> normal: new visual state active
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Remotion renders frames in parallel, so state must be derived
 * from the data at frame N vs N-1.
 */

import type { EnhancedFrameData } from "../data/types";
import { computeCoherence } from "./coherence";

// --- Types ---

export type ITPhase = "normal" | "locking" | "locked" | "releasing" | "breaking";

export type LockDepth = "shallow" | "medium" | "deep" | "transcendent";

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
  /** Flash hue for chromatic burst (0-360, derived from dominant chroma at break) */
  flashHue: number;
  /** Current lock depth tier */
  lockDepth: LockDepth;
  /** Whether to force a transcendent shader (sacred_geometry/fractal_zoom) */
  forceTranscendentShader: boolean;
}

// --- Constants ---

const LOCK_CONVERGENCE_FRAMES = 15;
const BREAK_FLASH_FRAMES = 2;
const BREAK_RECOVERY_FRAMES = 10;
const LOCKED_OVERLAY_OPACITY = 0.05;
const LOCKED_LUMINANCE_LIFT = 0.15;

// Lock depth tier thresholds (frames since lock start)
const SHALLOW_END = 90;     // 3 seconds
const MEDIUM_END = 150;     // 5 seconds
const DEEP_END = 300;       // 10 seconds
// Beyond DEEP_END = transcendent

/** Max strobe intensity during deep lock */
const STROBE_MAX = 0.30;
/** Time dilation factor during deep lock (slow-motion shader drift) */
const LOCKED_TIME_DILATION = 0.3;
/** Transcendent time dilation (maximum slow-motion) */
const TRANSCENDENT_TIME_DILATION = 0.15;

/** Releasing phase duration (frames) */
const RELEASING_FRAMES = 90;
/** Sudden break detection: score drop threshold in < 15 frames */
const SUDDEN_BREAK_SCORE_DROP = 0.3;
const SUDDEN_BREAK_WINDOW = 15;

// --- Helpers ---

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

/** Determine lock depth tier from frames since lock start */
function getLockDepth(framesSinceLock: number): LockDepth {
  if (framesSinceLock < SHALLOW_END) return "shallow";
  if (framesSinceLock < MEDIUM_END) return "medium";
  if (framesSinceLock < DEEP_END) return "deep";
  return "transcendent";
}

// --- Main computation ---

/**
 * Compute IT visual state for the current frame.
 *
 * Pure function -- derives state from frame data only.
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

  // Get target hue from current frame's dominant chroma
  const targetHue = dominantHue(frames[idx]);

  // Find how long we've been locked (look backward)
  let lockStartFrame = -1;
  if (current.isLocked) {
    for (let i = idx; i >= Math.max(0, idx - 600); i--) {
      const state = computeCoherence(frames, i);
      if (!state.isLocked) {
        lockStartFrame = i + 1;
        break;
      }
    }
    if (lockStartFrame === -1) lockStartFrame = Math.max(0, idx - 600);
  }

  // Find how long since we unlocked (look backward for break/release detection)
  let unlockFrame = -1;
  if (!current.isLocked && idx > 0) {
    for (let i = idx; i >= Math.max(0, idx - RELEASING_FRAMES); i--) {
      const state = computeCoherence(frames, i);
      if (state.isLocked) {
        unlockFrame = i + 1;
        break;
      }
    }
  }

  // --- Phase determination ---

  // Check if we just unlocked and determine if it was sudden (breaking) or gradual (releasing)
  if (unlockFrame >= 0) {
    const framesSinceUnlock = idx - unlockFrame;

    // Detect sudden break: check score drop rate around unlock point
    let isSuddenBreak = false;
    if (unlockFrame > 0 && unlockFrame < frames.length) {
      const scoreAtUnlock = computeCoherence(frames, unlockFrame).score;
      const scoreBefore = computeCoherence(frames, Math.max(0, unlockFrame - SUDDEN_BREAK_WINDOW)).score;
      isSuddenBreak = (scoreBefore - scoreAtUnlock) > SUDDEN_BREAK_SCORE_DROP;
    }

    if (isSuddenBreak) {
      // Breaking: sudden drop -- flash + reset
      if (framesSinceUnlock < BREAK_FLASH_FRAMES + BREAK_RECOVERY_FRAMES) {
        let flashIntensity = 0;
        if (framesSinceUnlock === 0) flashIntensity = 0.4;
        else if (framesSinceUnlock === 1) flashIntensity = 0.2;

        const recoveryProgress = Math.max(0, framesSinceUnlock - BREAK_FLASH_FRAMES) / BREAK_RECOVERY_FRAMES;
        // Flash hue: use dominant chroma at the break point for chromatic burst
        const breakHue = unlockFrame < frames.length ? dominantHue(frames[unlockFrame]) : 0;

        return {
          phase: "breaking",
          convergenceProgress: 0,
          targetHue,
          overlayOpacityOverride: smoothstep(recoveryProgress),
          cameraLock: false,
          luminanceLift: LOCKED_LUMINANCE_LIFT * (1 - smoothstep(recoveryProgress)),
          snapToMusicalTime: false,
          flashIntensity,
          triggerReset: framesSinceUnlock === 0,
          strobeIntensity: 0,
          timeDilation: 1,
          flashHue: breakHue,
          lockDepth: "shallow",
          forceTranscendentShader: false,
        };
      }
    } else {
      // Releasing: gradual wind-down over 90 frames
      if (framesSinceUnlock < RELEASING_FRAMES) {
        const releaseProgress = framesSinceUnlock / RELEASING_FRAMES;
        const eased = smoothstep(releaseProgress);

        return {
          phase: "releasing",
          convergenceProgress: 0,
          targetHue,
          overlayOpacityOverride: LOCKED_OVERLAY_OPACITY + (1 - LOCKED_OVERLAY_OPACITY) * eased,
          cameraLock: framesSinceUnlock < 30, // camera releases at frame 30
          luminanceLift: LOCKED_LUMINANCE_LIFT * (1 - eased),
          snapToMusicalTime: false,
          flashIntensity: 0,
          triggerReset: false,
          strobeIntensity: 0,
          timeDilation: 1 - (1 - LOCKED_TIME_DILATION) * (1 - eased) * 0.3, // ease back toward 1.0
          flashHue: 0,
          lockDepth: "shallow",
          forceTranscendentShader: false,
        };
      }
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
        flashHue: 0,
        lockDepth: "shallow",
        forceTranscendentShader: false,
      };
    }

    // Fully locked -- graduated depth
    const lockDepth = getLockDepth(framesSinceLock);
    const onsetStrength = frames[idx]?.onset ?? 0;

    // Compute depth-specific values
    let overlayOpacity = LOCKED_OVERLAY_OPACITY;
    let luminanceLift = LOCKED_LUMINANCE_LIFT;
    let snapToMusicalTime = false;
    let strobeIntensity = 0;
    let timeDilation = 1.0;
    let forceTranscendentShader = false;

    switch (lockDepth) {
      case "shallow":
        // Camera freeze + overlay reduce (basic lock)
        overlayOpacity = LOCKED_OVERLAY_OPACITY;
        break;

      case "medium":
        // + luminance lift + musical time snap
        luminanceLift = LOCKED_LUMINANCE_LIFT;
        snapToMusicalTime = true;
        break;

      case "deep": {
        // + strobe + time dilation
        luminanceLift = LOCKED_LUMINANCE_LIFT;
        snapToMusicalTime = true;
        const deepProgress = Math.max(0, Math.min(1,
          (framesSinceLock - MEDIUM_END) / (DEEP_END - MEDIUM_END),
        ));
        strobeIntensity = deepProgress > 0.3
          ? STROBE_MAX * smoothstep((deepProgress - 0.3) / 0.7) * Math.min(1, onsetStrength * 3)
          : 0;
        timeDilation = 1 - (1 - LOCKED_TIME_DILATION) * smoothstep(deepProgress);
        break;
      }

      case "transcendent":
        // Maximum: force sacred shaders, overlay -> 0, max time dilation
        luminanceLift = LOCKED_LUMINANCE_LIFT;
        snapToMusicalTime = true;
        overlayOpacity = 0;
        timeDilation = TRANSCENDENT_TIME_DILATION;
        strobeIntensity = STROBE_MAX * Math.min(1, onsetStrength * 3);
        forceTranscendentShader = true;
        break;
    }

    return {
      phase: "locked",
      convergenceProgress: 1,
      targetHue,
      overlayOpacityOverride: overlayOpacity,
      cameraLock: true,
      luminanceLift,
      snapToMusicalTime,
      flashIntensity: 0,
      triggerReset: false,
      strobeIntensity,
      timeDilation,
      flashHue: 0,
      lockDepth,
      forceTranscendentShader,
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
    flashHue: 0,
    lockDepth: "shallow",
    forceTranscendentShader: false,
  };
}
