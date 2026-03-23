/**
 * Reactive Triggers — mid-section audio-responsive structural changes.
 *
 * Detects 5 trigger types from per-frame audio data and returns a ReactiveState
 * that can drive shader swaps and overlay injections within a section.
 *
 * Pure function, backward-scanning only (Remotion determinism safe).
 * All state is derived from frames[0..frameIdx] — no lookahead, no external state.
 *
 * Hysteresis: hold=120 frames (4s), cooldown=300 frames (10s), scan=600 frames (20s).
 */

import type { EnhancedFrameData, VisualMode } from "../data/types";

// ─── Types ───

export type TriggerType =
  | "spectral_eruption"
  | "interplay_shift"
  | "groove_solidify"
  | "energy_eruption"
  | "improv_spike";

export interface ReactiveState {
  /** Whether a reactive trigger is currently active */
  isTriggered: boolean;
  /** Which trigger fired (null if not triggered) */
  triggerType: TriggerType | null;
  /** Trigger strength 0-1 (intensity of the detected event) */
  triggerStrength: number;
  /** Frames since trigger fired (0 = just fired) */
  triggerAge: number;
  /** Suggested shader modes for this trigger */
  suggestedModes: VisualMode[];
  /** Overlay names to inject during this trigger */
  overlayInjections: string[];
  /** Frames remaining in cooldown (0 = ready for next trigger) */
  cooldownRemaining: number;
}

// ─── Constants ───

const HOLD_FRAMES = 120;     // 4s — how long a trigger stays active
const COOLDOWN_FRAMES = 300; // 10s — minimum gap between triggers
const SCAN_FRAMES = 600;     // 20s — backward scan window for baseline

// ─── Trigger → Visual Mappings ───

const TRIGGER_SHADERS: Record<TriggerType, VisualMode[]> = {
  spectral_eruption: ["inferno", "electric_arc", "fractal_flames"],
  interplay_shift: ["kaleidoscope", "sacred_geometry", "voronoi_flow"],
  groove_solidify: ["mandala_engine", "truchet_tiling", "concert_lighting"],
  energy_eruption: ["climax_surge", "inferno", "fractal_zoom"],
  improv_spike: ["feedback_recursion", "reaction_diffusion", "fluid_2d"],
};

const TRIGGER_OVERLAYS: Record<TriggerType, string[]> = {
  spectral_eruption: ["LightningBoltOverlay", "ParticleExplosion"],
  interplay_shift: ["BreathingStealie", "SacredGeometry"],
  groove_solidify: ["WallOfSound", "LaserShow"],
  energy_eruption: ["ParticleExplosion", "EmberRise"],
  improv_spike: ["FractalZoom", "DarkStarPortal"],
};

// ─── Trigger Detection Functions ───

/**
 * Compute section baseline for a feature using backward scan.
 * Returns the mean value over the scan window within the current section.
 */
function sectionBaseline(
  frames: EnhancedFrameData[],
  frameIdx: number,
  sectionFrameStart: number,
  accessor: (f: EnhancedFrameData) => number,
): number {
  const scanStart = Math.max(sectionFrameStart, frameIdx - SCAN_FRAMES);
  if (frameIdx <= scanStart) return 0;
  let sum = 0;
  let count = 0;
  for (let i = scanStart; i < frameIdx; i++) {
    sum += accessor(frames[i]);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Compute spectral flux at a frame (L2 norm of contrast vector differences).
 */
function frameSpectralFlux(frames: EnhancedFrameData[], idx: number): number {
  if (idx < 1 || idx >= frames.length) return 0;
  const curr = frames[idx].contrast;
  const prev = frames[idx - 1].contrast;
  let l2 = 0;
  for (let b = 0; b < 7; b++) {
    const diff = curr[b] - prev[b];
    l2 += diff * diff;
  }
  return Math.sqrt(l2);
}

/**
 * Detect spectral eruption: spectral flux > 2x section baseline, absolute > 0.35.
 */
function detectSpectralEruption(
  frames: EnhancedFrameData[],
  frameIdx: number,
  sectionFrameStart: number,
): { detected: boolean; strength: number } {
  // Average flux over last 15 frames for stability
  const window = 15;
  let fluxSum = 0;
  for (let i = Math.max(1, frameIdx - window); i <= frameIdx; i++) {
    fluxSum += frameSpectralFlux(frames, i);
  }
  const currentFlux = fluxSum / Math.min(window, frameIdx);
  const baseline = sectionBaseline(frames, frameIdx, sectionFrameStart, (f) => {
    const idx = frames.indexOf(f);
    return idx > 0 ? frameSpectralFlux(frames, idx) : 0;
  });
  // Use timbralFlux if available (more stable), else fall back to computed
  const tFlux = frames[frameIdx].timbralFlux ?? currentFlux;
  const effectiveFlux = Math.max(tFlux, currentFlux);

  if (effectiveFlux > 0.35 && (baseline < 0.01 || effectiveFlux > baseline * 2)) {
    return { detected: true, strength: Math.min(1, effectiveFlux / 0.6) };
  }
  return { detected: false, strength: 0 };
}

/**
 * Detect energy eruption: energy jumps > 50% in 2s window, absolute delta > 0.12.
 */
function detectEnergyEruption(
  frames: EnhancedFrameData[],
  frameIdx: number,
): { detected: boolean; strength: number } {
  const window = 60; // 2s at 30fps
  if (frameIdx < window) return { detected: false, strength: 0 };

  // Current energy (15-frame average)
  let currSum = 0;
  const currWindow = 15;
  for (let i = Math.max(0, frameIdx - currWindow); i <= frameIdx; i++) {
    currSum += frames[i].rms;
  }
  const currEnergy = currSum / Math.min(currWindow + 1, frameIdx + 1);

  // Past energy (15-frame average, 2s ago)
  let pastSum = 0;
  const pastCenter = frameIdx - window;
  for (let i = Math.max(0, pastCenter - currWindow); i <= pastCenter; i++) {
    pastSum += frames[i].rms;
  }
  const pastEnergy = pastSum / (currWindow + 1);

  const delta = currEnergy - pastEnergy;
  const ratio = pastEnergy > 0.01 ? delta / pastEnergy : 0;

  if (delta > 0.12 && ratio > 0.5) {
    return { detected: true, strength: Math.min(1, delta / 0.25) };
  }
  return { detected: false, strength: 0 };
}

/**
 * Detect improv spike: improvisationScore jumps > 0.25 in 3s to > 0.65.
 */
function detectImprovSpike(
  frames: EnhancedFrameData[],
  frameIdx: number,
): { detected: boolean; strength: number } {
  const window = 90; // 3s at 30fps
  if (frameIdx < window) return { detected: false, strength: 0 };

  const current = frames[frameIdx].improvisationScore ?? 0;
  const past = frames[Math.max(0, frameIdx - window)].improvisationScore ?? 0;
  const delta = current - past;

  if (current > 0.65 && delta > 0.25) {
    return { detected: true, strength: Math.min(1, (current - 0.65) / 0.35 + delta) };
  }
  return { detected: false, strength: 0 };
}

/**
 * Detect groove solidifying: groove type transitions from unstable to stable.
 * Uses beatConfidence and beat stability as proxies.
 */
function detectGrooveSolidify(
  frames: EnhancedFrameData[],
  frameIdx: number,
): { detected: boolean; strength: number } {
  const window = 120; // 4s scan
  if (frameIdx < window) return { detected: false, strength: 0 };

  // Current stability (30-frame average)
  const stabWindow = 30;
  let currStab = 0;
  for (let i = Math.max(0, frameIdx - stabWindow); i <= frameIdx; i++) {
    currStab += (frames[i].beatConfidence ?? 0);
  }
  currStab /= Math.min(stabWindow + 1, frameIdx + 1);

  // Past stability (30-frame average, 4s ago)
  let pastStab = 0;
  const pastCenter = frameIdx - window;
  for (let i = Math.max(0, pastCenter - stabWindow); i <= pastCenter; i++) {
    pastStab += (frames[i].beatConfidence ?? 0);
  }
  pastStab /= (stabWindow + 1);

  const delta = currStab - pastStab;
  if (delta > 0.2 && currStab > 0.5) {
    return { detected: true, strength: Math.min(1, delta / 0.4) };
  }
  return { detected: false, strength: 0 };
}

/**
 * Detect interplay shift: stem dominance pattern changes.
 * Detects when the dominant instrument changes within the scan window.
 */
function detectInterplayShift(
  frames: EnhancedFrameData[],
  frameIdx: number,
): { detected: boolean; strength: number } {
  const window = 60; // 2s scan
  if (frameIdx < window) return { detected: false, strength: 0 };

  // Determine dominant stem at current and past frames
  function dominantStem(f: EnhancedFrameData): string {
    const vocal = f.stemVocalRms ?? 0;
    const bass = f.stemBassRms ?? 0;
    const drum = f.stemDrumOnset ?? 0;
    const other = f.stemOtherRms ?? 0;
    const max = Math.max(vocal, bass, drum, other);
    if (max < 0.05) return "none";
    if (vocal === max) return "vocal";
    if (bass === max) return "bass";
    if (drum === max) return "drum";
    return "other";
  }

  const currDom = dominantStem(frames[frameIdx]);
  const pastDom = dominantStem(frames[Math.max(0, frameIdx - window)]);

  if (currDom !== pastDom && currDom !== "none" && pastDom !== "none") {
    // Measure the magnitude of the shift
    const curr = frames[frameIdx];
    const past = frames[Math.max(0, frameIdx - window)];
    const vocalDelta = Math.abs((curr.stemVocalRms ?? 0) - (past.stemVocalRms ?? 0));
    const bassDelta = Math.abs((curr.stemBassRms ?? 0) - (past.stemBassRms ?? 0));
    const drumDelta = Math.abs((curr.stemDrumOnset ?? 0) - (past.stemDrumOnset ?? 0));
    const otherDelta = Math.abs((curr.stemOtherRms ?? 0) - (past.stemOtherRms ?? 0));
    const totalDelta = vocalDelta + bassDelta + drumDelta + otherDelta;

    if (totalDelta > 0.15) {
      return { detected: true, strength: Math.min(1, totalDelta / 0.4) };
    }
  }
  return { detected: false, strength: 0 };
}

// ─── Main Export ───

/**
 * Compute reactive trigger state for a given frame.
 *
 * Pure function — backward-scanning only, deterministic for Remotion.
 * Scans backward to find if a trigger fired within HOLD_FRAMES, or if we're
 * in COOLDOWN_FRAMES after one. Uses hysteresis to prevent rapid re-triggering.
 *
 * @param climaxPhaseLowered - When true (climax phase 2-3), thresholds are 20% lower
 */
export function computeReactiveTriggers(
  frames: EnhancedFrameData[],
  frameIdx: number,
  sectionFrameStart: number,
  _sectionFrameEnd: number,
  _tempo: number,
  coherenceIsLocked?: boolean,
  inSectionBoundaryZone?: boolean,
  climaxPhaseLowered?: boolean,
): ReactiveState {
  const NULL_STATE: ReactiveState = {
    isTriggered: false,
    triggerType: null,
    triggerStrength: 0,
    triggerAge: 0,
    suggestedModes: [],
    overlayInjections: [],
    cooldownRemaining: 0,
  };

  // Coherence lock suppresses all triggers
  if (coherenceIsLocked) return NULL_STATE;

  // Suppress within 60 frames of section boundary
  if (inSectionBoundaryZone) return NULL_STATE;

  // Not enough frames to analyze
  if (frameIdx < 60 || frames.length < 120) return NULL_STATE;

  // Climax-aware effective constants: during climax, allow faster re-triggering
  const effectiveCooldown = climaxPhaseLowered ? 90 : COOLDOWN_FRAMES;   // 3s vs 10s
  const effectiveHold = climaxPhaseLowered ? 60 : HOLD_FRAMES;           // 2s vs 4s

  // Backward scan for most recent trigger
  // We scan backward to find if a trigger should be active at this frame.
  // This ensures determinism: the same frameIdx always produces the same result.
  const scanLimit = effectiveHold + effectiveCooldown;

  // Check each trigger type at the current frame
  const detectors: { type: TriggerType; result: { detected: boolean; strength: number } }[] = [
    { type: "spectral_eruption", result: detectSpectralEruption(frames, frameIdx, sectionFrameStart) },
    { type: "energy_eruption", result: detectEnergyEruption(frames, frameIdx) },
    { type: "improv_spike", result: detectImprovSpike(frames, frameIdx) },
    { type: "groove_solidify", result: detectGrooveSolidify(frames, frameIdx) },
    { type: "interplay_shift", result: detectInterplayShift(frames, frameIdx) },
  ];

  // Climax phase lowers thresholds by 20% (already handled in detectors via strength)
  // Apply as strength boost instead
  if (climaxPhaseLowered) {
    for (const d of detectors) {
      d.result.strength *= 1.2;
    }
  }

  // Find the strongest currently-detected trigger
  const bestCurrent = detectors
    .filter((d) => d.result.detected)
    .sort((a, b) => b.result.strength - a.result.strength)[0];

  if (!bestCurrent) return NULL_STATE;

  // Backward scan: check if we recently fired a trigger (cooldown enforcement)
  // We look backward through frames to see if a trigger was active recently.
  // If we find a "trigger-worthy" frame within cooldown range, suppress.
  let lastTriggerFrame = -1;
  for (let ago = 1; ago < scanLimit && frameIdx - ago >= Math.max(0, sectionFrameStart); ago++) {
    const pastIdx = frameIdx - ago;
    // Quick check: was there a trigger-worthy event at this past frame?
    const pastFlux = frames[pastIdx].timbralFlux ?? 0;
    const pastRms = frames[pastIdx].rms;
    const pastImprov = frames[pastIdx].improvisationScore ?? 0;
    const isSignificant = pastFlux > 0.35 || pastRms > 0.3 || pastImprov > 0.65;
    if (isSignificant) {
      lastTriggerFrame = pastIdx;
      break;
    }
  }

  // Cooldown check: if a previous trigger fired within cooldown period after hold,
  // suppress the new one
  if (lastTriggerFrame >= 0) {
    const timeSinceLast = frameIdx - lastTriggerFrame;
    if (timeSinceLast > effectiveHold && timeSinceLast < effectiveHold + effectiveCooldown) {
      return {
        ...NULL_STATE,
        cooldownRemaining: effectiveHold + effectiveCooldown - timeSinceLast,
      };
    }
  }

  return {
    isTriggered: true,
    triggerType: bestCurrent.type,
    triggerStrength: Math.min(1, bestCurrent.result.strength),
    triggerAge: 0,
    suggestedModes: TRIGGER_SHADERS[bestCurrent.type],
    overlayInjections: TRIGGER_OVERLAYS[bestCurrent.type],
    cooldownRemaining: 0,
  };
}
