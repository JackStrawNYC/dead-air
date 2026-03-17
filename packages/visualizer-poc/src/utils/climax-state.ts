/**
 * Climax/Release State Machine — emotional arc awareness.
 *
 * Detects build→climax→sustain→release phases from smoothed energy +
 * section boundaries, and produces small additive modifiers that compose
 * with the existing EnergyEnvelope system.
 *
 * 5 phases: idle | build | climax | sustain | release
 * + anticipation sub-state when approaching a high-energy section.
 */

import type { EnhancedFrameData, SectionBoundary } from "../data/types";
import { gaussianSmooth, type AudioSnapshot } from "./audio-reactive";
import { smoothstepSimple as smoothstep, lerp } from "./math";
import { findCurrentSection } from "./section-lookup";
import type { ClimaxBehavior } from "../data/song-identities";

// ─── Types ───

export type ClimaxPhase = "idle" | "build" | "climax" | "sustain" | "release";

export type AnticipationStage = "distant" | "approaching" | "imminent" | null;

export interface ClimaxState {
  phase: ClimaxPhase;
  /** 0-1 progress within the current phase (for smooth interpolation) */
  intensity: number;
  /** true when in build phase approaching a high-energy section within 300 frames */
  anticipation: boolean;
  /** Granular anticipation stage for extended arcs */
  anticipationStage: AnticipationStage;
  /** true during a micro-climax (onset cluster peak within sustain phase) */
  microClimax: boolean;
  /** 0-1 micro-climax intensity for additive burst effects */
  microClimaxIntensity: number;
}

export interface ClimaxModulation {
  saturationOffset: number;
  brightnessOffset: number;
  vignetteOffset: number;
  bloomOffset: number;
  contrastOffset: number;
  overlayDensityMult: number;
}

// ─── Phase Detection ───

/**
 * Compute the current climax phase from energy data + section context.
 *
 * @param frames  Full frame array (for Gaussian smoothing of lookback delta)
 * @param idx     Current frame index
 * @param sections  Section boundaries from analysis
 * @param precomputedEnergy  Pre-computed Gaussian-smoothed energy from AudioSnapshot
 *                           (avoids duplicate 150-frame smoothing loop)
 */
export function computeClimaxState(
  frames: EnhancedFrameData[],
  idx: number,
  sections: SectionBoundary[],
  precomputedEnergy?: number,
): ClimaxState {
  if (frames.length === 0 || sections.length === 0) {
    return { phase: "idle", intensity: 0, anticipation: false, anticipationStage: null, microClimax: false, microClimaxIntensity: 0 };
  }

  // 1. Smoothed energy — use precomputed if available (saves one 150-frame Gaussian loop)
  const energy = precomputedEnergy ?? gaussianSmooth(frames, idx, (f) => f.rms, 150);

  // 2. Energy delta: slope over 60-frame lookback
  const lookbackIdx = Math.max(0, idx - 60);
  const prevEnergy = gaussianSmooth(frames, lookbackIdx, (f) => f.rms, 150);
  const delta = energy - prevEnergy;

  // 3. Find current section
  const { sectionIndex: currentSectionIdx, section: currentSection } = findCurrentSection(sections, idx);

  // 4. Find next and previous sections
  const nextSection =
    currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1
      ? sections[currentSectionIdx + 1]
      : null;
  const prevSection =
    currentSectionIdx > 0 ? sections[currentSectionIdx - 1] : null;

  // 5. Section progress (0-1)
  let sectionProgress = 0;
  if (currentSection) {
    const sectionLen = currentSection.frameEnd - currentSection.frameStart;
    sectionProgress = sectionLen > 0
      ? (idx - currentSection.frameStart) / sectionLen
      : 0;
  }

  // 6. Onset density: detect peak timing within sections via onset clustering
  // Instead of assuming first 20% = climax, find the actual onset cluster peak
  let onsetDensity = 0;
  if (currentSection) {
    const windowR = 15; // ±0.5s window for onset density
    let onsetSum = 0;
    for (let i = Math.max(currentSection.frameStart, idx - windowR); i <= Math.min(currentSection.frameEnd, idx + windowR); i++) {
      if (i >= 0 && i < frames.length) {
        onsetSum += frames[i].onset;
      }
    }
    onsetDensity = onsetSum / (2 * windowR + 1);
  }

  // 7. Phase rules (enhanced with onset-based peak detection)
  let phase: ClimaxPhase = "idle";
  let intensity = 0;

  const isHigh = currentSection?.energy === "high";

  // Find the peak onset density position within the current high section
  // This replaces the rigid "first 20%" rule with actual peak timing
  let peakProgress = 0.2; // fallback to original behavior
  if (isHigh && currentSection) {
    const sLen = currentSection.frameEnd - currentSection.frameStart;
    if (sLen > 30) {
      // Scan section for onset density peak
      let maxDensity = 0;
      let maxDensityFrame = currentSection.frameStart;
      const scanStep = Math.max(1, Math.floor(sLen / 30));
      for (let si = currentSection.frameStart; si <= currentSection.frameEnd; si += scanStep) {
        if (si >= frames.length) break;
        let d = 0;
        const lo = Math.max(currentSection.frameStart, si - 15);
        const hi = Math.min(currentSection.frameEnd, si + 15);
        for (let j = lo; j <= hi; j++) {
          if (j >= 0 && j < frames.length) d += frames[j].onset;
        }
        d /= (hi - lo + 1);
        if (d > maxDensity) {
          maxDensity = d;
          maxDensityFrame = si;
        }
      }
      peakProgress = (maxDensityFrame - currentSection.frameStart) / sLen;
      peakProgress = Math.max(0.05, Math.min(0.8, peakProgress)); // clamp to sane range
    }
  }

  // Climax window: centered around the onset peak (±10% of section)
  const climaxStart = Math.max(0, peakProgress - 0.10);
  const climaxEnd = Math.min(1, peakProgress + 0.10);

  if (energy < 0.08) {
    // Idle: very low energy
    phase = "idle";
    intensity = 1 - energy / 0.08;
  } else if (isHigh && sectionProgress >= climaxStart && sectionProgress <= climaxEnd) {
    // Climax: centered around onset density peak
    const climaxWidth = climaxEnd - climaxStart;
    const climaxLocalProgress = (sectionProgress - climaxStart) / climaxWidth;
    phase = "climax";
    // Bell curve: peak at center of climax window
    intensity = 1 - Math.abs(climaxLocalProgress - 0.5) * 1.2;
    intensity = Math.max(0, Math.min(1, intensity));
  } else if (isHigh && sectionProgress < climaxStart) {
    // Build within high section (before the climax peak)
    phase = "build";
    intensity = smoothstep(sectionProgress / climaxStart);
  } else if (isHigh && sectionProgress > climaxEnd && sectionProgress <= 0.85) {
    // Sustain: after climax peak, middle of high-energy section
    phase = "sustain";
    const sustainProgress = (sectionProgress - climaxEnd) / (0.85 - climaxEnd);
    intensity = 1 - sustainProgress * 0.3; // gentle fade from 1.0 to 0.7
  } else if (isHigh && sectionProgress > 0.85) {
    // Release: last 15% of high-energy section
    phase = "release";
    intensity = smoothstep(1 - (sectionProgress - 0.85) / 0.15);
  } else if (energy >= 0.08 && energy <= 0.25 && delta > 0.001) {
    // Build: moderate energy and rising
    phase = "build";
    intensity = smoothstep((energy - 0.08) / 0.17);
  } else if (energy > 0.20 && delta < -0.001) {
    // Release: energy falling from high
    phase = "release";
    intensity = smoothstep((energy - 0.08) / 0.17);
    // Smooth ramp after leaving a high-energy section
    if (prevSection?.energy === "high" && currentSection) {
      const framesSinceBoundary = idx - currentSection.frameStart;
      if (framesSinceBoundary < 30) {
        intensity *= smoothstep(framesSinceBoundary / 30);
      }
    }
  } else if (energy >= 0.08) {
    // Moderate energy, stable — mild build
    phase = "build";
    intensity = smoothstep((energy - 0.08) / 0.17) * 0.5;
  }

  // 8. Extended anticipation: in build AND next section is high AND within 300 frames (10s)
  // Three stages: distant (300-150), approaching (150-60), imminent (60-0)
  let anticipation = false;
  let anticipationStage: AnticipationStage = null;
  if (phase === "build" && nextSection?.energy === "high") {
    const distToNext = nextSection.frameStart - idx;
    if (distToNext > 0 && distToNext < 300) {
      anticipation = true;
      if (distToNext >= 150) {
        // Distant: 300-150 frames, 30% anticipation modifiers
        anticipationStage = "distant";
        intensity = smoothstep(1 - distToNext / 300) * 0.3;
      } else if (distToNext >= 60) {
        // Approaching: 150-60 frames, 60% anticipation modifiers
        anticipationStage = "approaching";
        intensity = smoothstep(1 - distToNext / 150) * 0.6;
      } else {
        // Imminent: 60-0 frames, 100% (original behavior)
        anticipationStage = "imminent";
        intensity = smoothstep(1 - distToNext / 60);
      }
    }
  }

  // 9. Micro-climax detection: onset clusters within sustain phase
  // When in sustain, detect local onset peaks for mini burst effects
  let microClimax = false;
  let microClimaxIntensity = 0;
  if (phase === "sustain" && onsetDensity > 0.15) {
    // Check if this is a local onset peak (higher than ±30 frame neighborhood)
    const neighborWindow = 30;
    let isLocalPeak = true;
    for (let offset = -neighborWindow; offset <= neighborWindow; offset += 10) {
      if (offset === 0) continue;
      const checkIdx = idx + offset;
      if (checkIdx < 0 || checkIdx >= frames.length) continue;
      let neighborDensity = 0;
      for (let j = Math.max(0, checkIdx - 15); j <= Math.min(frames.length - 1, checkIdx + 15); j++) {
        neighborDensity += frames[j].onset;
      }
      neighborDensity /= 31;
      if (neighborDensity > onsetDensity) {
        isLocalPeak = false;
        break;
      }
    }
    if (isLocalPeak) {
      microClimax = true;
      microClimaxIntensity = Math.min(1, (onsetDensity - 0.15) / 0.15);
    }
  }

  return { phase, intensity, anticipation, anticipationStage, microClimax, microClimaxIntensity };
}

// ─── Musical Texture Detection ───

export type MusicalTexture = "sparse" | "melodic" | "rhythmic" | "building" | "peak" | "ambient";

/**
 * Detect the musical texture from audio features + energy.
 * Used to modulate overlay counts and vignette — Space/Drums gets near-void,
 * driving grooves get moderate density, peaks get full flood.
 */
export function detectTexture(snapshot: AudioSnapshot, energy: number): MusicalTexture {
  if (energy < 0.10 && snapshot.flatness > 0.4) return "ambient";   // Space/Drums
  if (energy < 0.08) return "sparse";                                // quiet/tonal
  if (energy > 0.25 && snapshot.onsetEnvelope > 0.3) return "peak"; // loud+percussive
  if (energy > 0.12 && snapshot.beatDecay > 0.5) return "rhythmic"; // driving groove
  if (energy > 0.08 && snapshot.flatness < 0.3) return "melodic";   // tonal, moderate
  return "building";
}

// ─── Modulation Output ───

/** Per-phase target values — concert-grade visual intensity.
 *  Climax = VIVID SATURATED COLOR, not white blowout.
 *  Push saturation hard, keep brightness restrained. */
const PHASE_TARGETS: Record<
  ClimaxPhase,
  { sat: number; bright: number; vig: number; bloom: number; contrast: number; density: number }
> = {
  idle:    { sat: -0.10, bright: -0.08, vig: -0.04, bloom: -0.05, contrast: -0.03, density: 0.70 },
  build:   { sat: +0.25, bright: +0.02, vig: -0.02, bloom: 0.10, contrast: +0.10, density: 1.10 },
  climax:  { sat: +0.50, bright: +0.20, vig: -0.08, bloom: 0.15, contrast: +0.15, density: 1.60 },
  sustain: { sat: +0.35, bright: +0.10, vig: -0.06, bloom: 0.10, contrast: +0.10, density: 1.40 },
  release: { sat: -0.10, bright: -0.05, vig: -0.03, bloom: 0,    contrast: -0.03, density: 0.50 },
};

/** Anticipation sub-state overrides — dramatic darkness before the drop.
 *  bright: -0.40 = house lights dimming. The inhale before the scream. */
const ANTICIPATION = { sat: -0.50, bright: -0.40, vig: +0.12, bloom: -0.10, contrast: -0.15, density: 0.0 };

/** Build phase start values (intensity interpolates from start → target) */
const BUILD_START = { sat: 0, bright: 0, vig: 0, bloom: 0, contrast: 0, density: 0.95 };

/** Release phase start values (intensity interpolates from start → target) */
const RELEASE_START = { sat: +0.02, bright: +0.005, vig: +0.02, bloom: 0.01, contrast: +0.02, density: 1.0 };

/**
 * Map a ClimaxState to additive visual modifiers.
 * All values are small offsets that compose with EnergyEnvelope's existing modulation.
 */
export function climaxModulation(state: ClimaxState, behavior?: ClimaxBehavior): ClimaxModulation {
  const { phase, intensity, anticipation } = state;

  // Anticipation overrides build modulation
  if (anticipation) {
    const t = smoothstep(intensity);
    return {
      saturationOffset: lerp(0, ANTICIPATION.sat, t),
      brightnessOffset: lerp(0, ANTICIPATION.bright, t),
      vignetteOffset: lerp(0, ANTICIPATION.vig, t),
      bloomOffset: lerp(0, ANTICIPATION.bloom, t),
      contrastOffset: lerp(0, ANTICIPATION.contrast, t),
      overlayDensityMult: lerp(1, ANTICIPATION.density, t),
    };
  }

  const target = PHASE_TARGETS[phase];
  const t = smoothstep(intensity);

  // Build and release interpolate from their start values
  if (phase === "build") {
    return {
      saturationOffset: lerp(BUILD_START.sat, target.sat, t),
      brightnessOffset: lerp(BUILD_START.bright, target.bright, t),
      vignetteOffset: lerp(BUILD_START.vig, target.vig, t),
      bloomOffset: lerp(BUILD_START.bloom, target.bloom, t),
      contrastOffset: lerp(BUILD_START.contrast, target.contrast, t),
      overlayDensityMult: lerp(BUILD_START.density, target.density, t),
    };
  }

  if (phase === "release") {
    return {
      saturationOffset: lerp(RELEASE_START.sat, target.sat, t),
      brightnessOffset: lerp(RELEASE_START.bright, target.bright, t),
      vignetteOffset: lerp(RELEASE_START.vig, target.vig, t),
      bloomOffset: lerp(RELEASE_START.bloom, target.bloom, t),
      contrastOffset: lerp(RELEASE_START.contrast, target.contrast, t),
      overlayDensityMult: lerp(RELEASE_START.density, target.density, t),
    };
  }

  // Idle, climax, sustain: intensity scales the offset
  const result: ClimaxModulation = {
    saturationOffset: target.sat * t,
    brightnessOffset: target.bright * t,
    vignetteOffset: target.vig * t,
    bloomOffset: target.bloom * t,
    contrastOffset: target.contrast * t,
    overlayDensityMult: lerp(1, target.density, t),
  };

  // Apply per-song ClimaxBehavior overrides during climax/sustain phases
  if (behavior && (phase === "climax" || phase === "sustain")) {
    if (behavior.peakSaturation !== undefined) {
      result.saturationOffset = Math.max(result.saturationOffset, behavior.peakSaturation * t);
    }
    if (behavior.peakBrightness !== undefined) {
      result.brightnessOffset = Math.max(result.brightnessOffset, behavior.peakBrightness * t);
    }
    if (behavior.climaxDensityMult !== undefined) {
      result.overlayDensityMult = lerp(1, behavior.climaxDensityMult, t);
    }
  }

  return result;
}
