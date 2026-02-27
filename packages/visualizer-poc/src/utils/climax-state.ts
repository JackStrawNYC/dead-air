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
import { gaussianSmooth } from "./audio-reactive";

// ─── Types ───

export type ClimaxPhase = "idle" | "build" | "climax" | "sustain" | "release";

export interface ClimaxState {
  phase: ClimaxPhase;
  /** 0-1 progress within the current phase (for smooth interpolation) */
  intensity: number;
  /** true when in build phase approaching a high-energy section within 90 frames */
  anticipation: boolean;
}

export interface ClimaxModulation {
  saturationOffset: number;
  brightnessOffset: number;
  vignetteOffset: number;
  bloomOffset: number;
  overlayDensityMult: number;
}

// ─── Smoothstep ───

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Phase Detection ───

/**
 * Compute the current climax phase from energy data + section context.
 *
 * @param frames  Full frame array (for Gaussian smoothing)
 * @param idx     Current frame index
 * @param sections  Section boundaries from analysis
 */
export function computeClimaxState(
  frames: EnhancedFrameData[],
  idx: number,
  sections: SectionBoundary[],
): ClimaxState {
  if (frames.length === 0 || sections.length === 0) {
    return { phase: "idle", intensity: 0, anticipation: false };
  }

  // 1. Smoothed energy at current frame (150-frame Gaussian, same as EnergyEnvelope)
  const energy = gaussianSmooth(frames, idx, (f) => f.rms, 150);

  // 2. Energy delta: slope over 60-frame lookback
  const lookbackIdx = Math.max(0, idx - 60);
  const prevEnergy = gaussianSmooth(frames, lookbackIdx, (f) => f.rms, 150);
  const delta = energy - prevEnergy;

  // 3. Find current section
  let currentSection: SectionBoundary | null = null;
  let currentSectionIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (idx >= sections[i].frameStart && idx < sections[i].frameEnd) {
      currentSection = sections[i];
      currentSectionIdx = i;
      break;
    }
  }

  // 4. Find next section
  const nextSection =
    currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1
      ? sections[currentSectionIdx + 1]
      : null;

  // 5. Section progress (0-1)
  let sectionProgress = 0;
  if (currentSection) {
    const sectionLen = currentSection.frameEnd - currentSection.frameStart;
    sectionProgress = sectionLen > 0
      ? (idx - currentSection.frameStart) / sectionLen
      : 0;
  }

  // 6. Phase rules
  let phase: ClimaxPhase = "idle";
  let intensity = 0;

  const isHigh = currentSection?.energy === "high";

  if (energy < 0.08) {
    // Idle: very low energy
    phase = "idle";
    intensity = 1 - energy / 0.08; // 1 at silence, 0 at threshold
  } else if (isHigh && sectionProgress < 0.20) {
    // Climax: first 20% of a high-energy section
    phase = "climax";
    intensity = smoothstep(sectionProgress / 0.20); // ramp 0→1 over first 20%
  } else if (isHigh && sectionProgress <= 0.85) {
    // Sustain: middle of high-energy section
    phase = "sustain";
    // Gentle arc: peak at 50% of section, ease at edges
    const midProgress = (sectionProgress - 0.20) / 0.65; // 0→1 over 20%-85%
    intensity = 1 - Math.abs(midProgress - 0.5) * 0.4; // 0.8→1.0→0.8
  } else if (isHigh && sectionProgress > 0.85) {
    // Release: last 15% of high-energy section
    phase = "release";
    intensity = smoothstep(1 - (sectionProgress - 0.85) / 0.15); // 1→0
  } else if (energy >= 0.08 && energy <= 0.25 && delta > 0.001) {
    // Build: moderate energy and rising
    phase = "build";
    intensity = smoothstep((energy - 0.08) / 0.17); // 0→1 over 0.08-0.25
  } else if (energy > 0.20 && delta < -0.001) {
    // Release: energy falling from high
    phase = "release";
    intensity = smoothstep((energy - 0.08) / 0.17); // fades as energy drops
  } else if (energy >= 0.08) {
    // Moderate energy, stable — mild build
    phase = "build";
    intensity = smoothstep((energy - 0.08) / 0.17) * 0.5;
  }

  // 7. Anticipation: in build AND next section is high AND within 90 frames
  let anticipation = false;
  if (phase === "build" && nextSection?.energy === "high") {
    const distToNext = nextSection.frameStart - idx;
    if (distToNext > 0 && distToNext < 90) {
      anticipation = true;
      // Override intensity to ramp up as we approach
      intensity = smoothstep(1 - distToNext / 90);
    }
  }

  return { phase, intensity, anticipation };
}

// ─── Modulation Output ───

/** Per-phase target values */
const PHASE_TARGETS: Record<
  ClimaxPhase,
  { sat: number; bright: number; vig: number; bloom: number; density: number }
> = {
  idle:    { sat: -0.03, bright: -0.01, vig: -0.03, bloom: 0,    density: 0.7 },
  build:   { sat: +0.04, bright: +0.02, vig: +0.04, bloom: 0.03, density: 1.1 },
  climax:  { sat: +0.08, bright: +0.04, vig: +0.08, bloom: 0.06, density: 1.3 },
  sustain: { sat: +0.05, bright: +0.02, vig: +0.05, bloom: 0.04, density: 1.1 },
  release: { sat: -0.02, bright: 0,     vig: -0.02, bloom: 0,    density: 0.7 },
};

/** Anticipation sub-state overrides (desaturation dip before peak) */
const ANTICIPATION = { sat: -0.06, bright: +0.01, vig: +0.02, bloom: 0.01, density: 0.9 };

/** Build phase start values (intensity interpolates from start → target) */
const BUILD_START = { sat: 0, bright: 0, vig: 0, bloom: 0, density: 0.8 };

/** Release phase start values (intensity interpolates from start → target) */
const RELEASE_START = { sat: +0.04, bright: +0.01, vig: +0.03, bloom: 0.02, density: 1.0 };

/**
 * Map a ClimaxState to additive visual modifiers.
 * All values are small offsets that compose with EnergyEnvelope's existing modulation.
 */
export function climaxModulation(state: ClimaxState): ClimaxModulation {
  const { phase, intensity, anticipation } = state;

  // Anticipation overrides build modulation
  if (anticipation) {
    const t = smoothstep(intensity);
    return {
      saturationOffset: lerp(0, ANTICIPATION.sat, t),
      brightnessOffset: lerp(0, ANTICIPATION.bright, t),
      vignetteOffset: lerp(0, ANTICIPATION.vig, t),
      bloomOffset: lerp(0, ANTICIPATION.bloom, t),
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
      overlayDensityMult: lerp(BUILD_START.density, target.density, t),
    };
  }

  if (phase === "release") {
    return {
      saturationOffset: lerp(RELEASE_START.sat, target.sat, t),
      brightnessOffset: lerp(RELEASE_START.bright, target.bright, t),
      vignetteOffset: lerp(RELEASE_START.vig, target.vig, t),
      bloomOffset: lerp(RELEASE_START.bloom, target.bloom, t),
      overlayDensityMult: lerp(RELEASE_START.density, target.density, t),
    };
  }

  // Idle, climax, sustain: intensity scales the offset
  return {
    saturationOffset: target.sat * t,
    brightnessOffset: target.bright * t,
    vignetteOffset: target.vig * t,
    bloomOffset: target.bloom * t,
    overlayDensityMult: lerp(1, target.density, t),
  };
}
