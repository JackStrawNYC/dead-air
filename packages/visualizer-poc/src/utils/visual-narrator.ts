/**
 * Visual Narrator — synthesizes show arc + song identity + section + groove
 * into a unified NarrativeDirective that shapes all visual systems.
 *
 * The narrator answers: "What should this moment look and feel like?"
 * by combining:
 *   - Show-level pacing (set 1 warmth → set 2 depth → encore party)
 *   - Song identity (from song-identities.ts)
 *   - Section type (verse/chorus/jam/space/solo)
 *   - Groove state (pocket/driving/floating/freeform)
 *   - Jam cycle phase (explore/build/peak/release)
 *
 * Returns small additive modifiers that compose with existing systems.
 */

import type { GrooveType } from "./groove-detector";
import type { JamCyclePhase } from "./jam-cycles";
import type { CameraPathType } from "../config/camera-profiles";

export interface NarrativeDirective {
  /** Overlay density multiplier (0-2) */
  overlayDensityMult: number;
  /** Saturation offset (-0.3 to +0.3) */
  saturationOffset: number;
  /** Brightness offset (-0.2 to +0.2) */
  brightnessOffset: number;
  /** Color temperature: -1 cool, 0 neutral, +1 warm */
  temperature: number;
  /** Abstraction level: 0 = representational (overlays), 1 = pure geometry (shaders only) */
  abstractionLevel: number;
  /** Hero event permission: whether fullscreen hero icons should fire */
  heroPermitted: boolean;
  /** Motion multiplier for drift/camera speed */
  motionMult: number;
  /** Recommended camera path type for this moment */
  cameraPath?: CameraPathType;
}

export interface NarrativeContext {
  /** Set number (1, 2, 3=encore) */
  setNumber: number;
  /** Position within set (0-1) */
  setProgress: number;
  /** Current section type from analysis */
  sectionType?: string;
  /** Current groove classification */
  grooveType?: GrooveType;
  /** Current jam cycle phase (if in a jam section) */
  jamPhase?: JamCyclePhase;
  /** Whether jam is deepening (successive peaks climbing) */
  jamDeepening?: boolean;
  /** Current smoothed energy (0-1) */
  energy: number;
  /** Whether this is a Drums/Space section */
  isDrumsSpace?: boolean;
  /** Climax phase number: 0=idle, 1=build, 2=climax, 3=sustain, 4=release */
  climaxPhase?: number;
  /** Position within the song (0-1) */
  songProgress?: number;
}

/** Base narrative from show-level pacing */
function showArcDirective(setNumber: number, setProgress: number): Partial<NarrativeDirective> {
  if (setNumber === 1) {
    // Set 1: warm opening, build familiarity
    return {
      temperature: 0.3 - setProgress * 0.2,
      overlayDensityMult: 1.1 - setProgress * 0.2,
      abstractionLevel: 0.2 + setProgress * 0.3,
      saturationOffset: 0,
      brightnessOffset: 0.05,
    };
  }
  if (setNumber === 2) {
    // Set 2: deep exploration, maximum abstraction mid-set
    const abstractionPeak = 1 - Math.abs(setProgress - 0.5) * 2;
    return {
      temperature: -0.1,
      overlayDensityMult: 0.6 + setProgress * 0.4,
      abstractionLevel: 0.4 + abstractionPeak * 0.5,
      saturationOffset: -0.03,
      brightnessOffset: 0,
    };
  }
  // Encore: party mode, full energy
  return {
    temperature: 0.5,
    overlayDensityMult: 1.4,
    abstractionLevel: 0.1,
    saturationOffset: +0.15,
    brightnessOffset: +0.10,
  };
}

/** Drums/Space override: near-void, floating */
function drumsSpaceDirective(): NarrativeDirective {
  return {
    overlayDensityMult: 0.1,
    saturationOffset: -0.10,
    brightnessOffset: -0.04,
    temperature: -0.6,
    abstractionLevel: 0.9,
    heroPermitted: false,
    motionMult: 0.3,
    cameraPath: "crane",
  };
}

const DEFAULT: NarrativeDirective = {
  overlayDensityMult: 1.0,
  saturationOffset: 0,
  brightnessOffset: 0,
  temperature: 0,
  abstractionLevel: 0.5,
  heroPermitted: true,
  motionMult: 1.0,
};

/**
 * Recommend a camera path type based on section context, groove, energy, and climax.
 * Priority: climax > song position (intro/outro) > section type + groove.
 */
function recommendCameraPath(ctx: NarrativeContext): CameraPathType {
  // Highest priority: climax (phase >= 2 means climax/sustain/release)
  if ((ctx.climaxPhase ?? 0) >= 2) return "dolly";

  // Song position: intro (first 10%) → opening reveal
  if ((ctx.songProgress ?? 0.5) < 0.1) return "pull_back";
  // Song position: outro (last 10%) → ascending farewell
  if ((ctx.songProgress ?? 0.5) > 0.9) return "crane";

  // Section type + groove combinations (most specific first)
  const section = ctx.sectionType;
  const groove = ctx.grooveType;

  if (section === "space") return "crane";
  if (section === "solo") return "pull_back";
  if (section === "drums") return "orbital";
  if (section === "bridge") return "static_drift";

  if (section === "chorus") return "orbital";

  if (section === "jam") {
    if (groove === "freeform") return "handheld";
    // Building energy: spiral_in; peak energy: dolly
    if (ctx.energy > 0.7) return "dolly";
    if (ctx.energy > 0.4) return "spiral_in";
    return "spiral_in";
  }

  if (section === "verse") {
    if (groove === "floating") return "static_drift";
    if (groove === "pocket") return "handheld";
    return "handheld";
  }

  // Default fallback
  return "orbital";
}

/**
 * Compute the narrative directive for the current moment.
 */
export function computeNarrativeDirective(ctx: NarrativeContext): NarrativeDirective {
  // Drums/Space override
  if (ctx.isDrumsSpace) return drumsSpaceDirective();

  // Start from show arc
  const arc = showArcDirective(ctx.setNumber, ctx.setProgress);
  const result: NarrativeDirective = { ...DEFAULT, ...arc, heroPermitted: true, motionMult: 1.0 };

  // Section type modulation
  if (ctx.sectionType === "space") {
    result.overlayDensityMult *= 0.3;
    result.saturationOffset -= 0.1;
    result.motionMult *= 0.4;
    result.heroPermitted = false;
  } else if (ctx.sectionType === "jam") {
    result.abstractionLevel = Math.min(1, result.abstractionLevel + 0.2);
    result.overlayDensityMult *= 0.6;
  } else if (ctx.sectionType === "chorus") {
    result.overlayDensityMult *= 1.2;
    result.saturationOffset += 0.10;
  } else if (ctx.sectionType === "solo") {
    result.motionMult *= 1.3;
    result.saturationOffset += 0.15;
    result.overlayDensityMult *= 0.5;
  }

  // Groove modulation
  if (ctx.grooveType === "floating") {
    result.temperature -= 0.3;
    result.motionMult *= 0.4;
    result.overlayDensityMult *= 0.3;
  } else if (ctx.grooveType === "driving") {
    result.motionMult *= 1.3;
    result.temperature += 0.1;
  } else if (ctx.grooveType === "freeform") {
    result.abstractionLevel = Math.min(1, result.abstractionLevel + 0.3);
  }

  // Jam cycle modulation
  if (ctx.jamPhase === "peak") {
    result.saturationOffset += 0.25;
    result.brightnessOffset += 0.15;
    result.heroPermitted = true;
  } else if (ctx.jamPhase === "explore") {
    result.overlayDensityMult *= 0.5;
    result.abstractionLevel = Math.min(1, result.abstractionLevel + 0.2);
    result.heroPermitted = false;
  } else if (ctx.jamPhase === "build" && ctx.jamDeepening) {
    result.saturationOffset += 0.12;
    result.motionMult *= 1.2;
  }

  // Camera path recommendation
  result.cameraPath = recommendCameraPath(ctx);

  // Clamp values
  result.overlayDensityMult = Math.max(0, Math.min(2, result.overlayDensityMult));
  result.saturationOffset = Math.max(-0.5, Math.min(0.5, result.saturationOffset));
  result.brightnessOffset = Math.max(-0.4, Math.min(0.4, result.brightnessOffset));
  result.temperature = Math.max(-1, Math.min(1, result.temperature));
  result.abstractionLevel = Math.max(0, Math.min(1, result.abstractionLevel));
  result.motionMult = Math.max(0.1, Math.min(2, result.motionMult));

  return result;
}
