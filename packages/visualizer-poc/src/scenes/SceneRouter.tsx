/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { renderScene, getComplement, getModesForEnergy, TRANSITION_AFFINITY, SCENE_REGISTRY } from "./scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { findCurrentSection } from "../utils/section-lookup";
import { type SongIdentity, getShowModesForSong } from "../data/song-identities";
import type { StemSectionType } from "../utils/stem-features";
import { detectChordMood } from "../utils/chord-mood";
import { estimateImprovisationScore } from "../utils/improv-detector";
import { selectTransitionStyle } from "../utils/transition-selector";

/**
 * Dynamic crossfade duration based on energy context and spectral flux.
 * Quiet→quiet: 240 frames (8s) — gentle dissolve
 * Loud→loud:     8 frames     — hard cut
 * Quiet→loud:   18 frames     — fast snap
 * Loud→quiet:   50 frames     — moderate fade
 * Mid (default): 30 frames    — standard crossfade
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

  let baseDuration: number;
  if (beforeQuiet && afterQuiet) baseDuration = 240;   // gentle dissolve
  else if (beforeLoud && afterLoud) baseDuration = 8;  // hard cut
  else if (beforeQuiet && afterLoud) baseDuration = 18; // fast snap
  else if (beforeLoud && afterQuiet) baseDuration = 50; // moderate fade
  else baseDuration = 30;                               // default

  // Spectral flux compression: measure timbral change rate at the boundary.
  // High flux = rapid spectral change = faster visual crossfade.
  // Compute average spectral flux in a narrow window around the boundary.
  const fluxWindow = 8;
  const fluxLo = Math.max(1, boundary - fluxWindow);
  const fluxHi = Math.min(frames.length - 1, boundary + fluxWindow);
  let fluxSum = 0, fluxCount = 0;
  for (let i = fluxLo; i <= fluxHi; i++) {
    // Compute per-frame spectral flux from contrast vectors
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

  // Flux typically ranges 0-0.5. Above 0.15 is a significant timbral shift.
  // Scale factor: 1.0 (no flux) down to 0.5 (high flux)
  const fluxCompression = Math.max(0.5, 1 - Math.min(avgFlux / 0.3, 1) * 0.5);

  return Math.max(4, Math.round(baseDuration * fluxCompression));
}

const BEAT_CROSSFADE_FRAMES = 30; // 1 second when beat-synced (15 before + 15 after)

// Complement modes and energy pools are now in scene-registry.ts

// Minimum section duration (in frames) to qualify for auto-variety
const AUTO_VARIETY_MIN_SECTION = 2700; // 1.5 minutes at 30fps

/**
 * Find nearest strong beat within a frame range for beat-synced transitions.
 * Prefers downbeats (first beat of measure) when beatConfidence is high,
 * then falls back to regular beats and strong onsets.
 * Returns the frame index of the best alignment point, or null if none found.
 */
/** @internal exported for testing */
export function findNearestBeat(
  frames: EnhancedFrameData[],
  searchStart: number,
  searchEnd: number,
): number | null {
  let bestFrame: number | null = null;
  let bestScore = 0;

  for (let i = Math.max(0, searchStart); i < Math.min(frames.length, searchEnd); i++) {
    const f = frames[i];
    const confidence = f.beatConfidence ?? 0;
    // Downbeats score highest when beat confidence is strong (>0.5)
    // This snaps transitions to measure boundaries for musical phrasing
    const downbeatBonus = (f.downbeat && confidence > 0.5) ? 2.0 * confidence : 0;
    const beatScore = f.beat ? 1.0 : 0;
    const onsetScore = f.onset > 0.7 ? f.onset * 0.5 : 0;
    const score = downbeatBonus + beatScore + onsetScore;
    if (score > bestScore) {
      bestScore = score;
      bestFrame = i;
    }
  }

  return bestScore > 0 ? bestFrame : null;
}

/**
 * Validate section overrides against actual section count.
 * Call during calculateMetadata or at load time to catch invalid indices early.
 * Returns list of warnings (empty = all valid).
 */
export function validateSectionOverrides(
  song: SetlistEntry,
  sectionCount: number,
): string[] {
  if (!song.sectionOverrides?.length) return [];
  const warnings: string[] = [];
  for (const override of song.sectionOverrides) {
    if (override.sectionIndex >= sectionCount) {
      warnings.push(
        `[${song.trackId}] sectionOverride index ${override.sectionIndex} (mode: ${override.mode}) ` +
        `exceeds section count ${sectionCount} (valid: 0-${sectionCount - 1})`
      );
    }
  }
  if (warnings.length > 0) {
    console.warn(`Section override validation failed for "${song.title}":`);
    warnings.forEach((w) => console.warn(`  ${w}`));
  }
  return warnings;
}

interface Props {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  song: SetlistEntry;
  tempo?: number;
  /** Optional seed for generative variation — different seed → different scene assignments */
  seed?: number;
  /** Normalized jam density from jam evolution system (0-1, default 0.5) */
  jamDensity?: number;
  /** Ambient visual mode to crossfade into during dead air */
  deadAirMode?: VisualMode;
  /** 0→1 crossfade progress into dead air ambient mode */
  deadAirFactor?: number;
  /** Show era for mode pool filtering */
  era?: string;
  /** When true, coherence is locked — hold current shader (no transitions during peak moments) */
  coherenceIsLocked?: boolean;
  /** Map of shader modes already used in this show (for variety enforcement) */
  usedShaderModes?: Map<VisualMode, number>;
  /** Drums/Space sub-phase override for forced shader selection */
  drumsSpacePhase?: string;
  /** Per-song visual identity for preferred modes and D/S shader overrides */
  songIdentity?: SongIdentity;
  /** Stem-derived section type for mode bias */
  stemSection?: StemSectionType;
  /** Total song duration in seconds for duration-aware shader routing */
  songDuration?: number;
  /** Effective palette (chroma-blended) — overrides song.palette when provided */
  palette?: ColorPalette;
  /** Segue in from previous song */
  segueIn?: boolean;
  /** Sacred segue: suppress first within-song scene crossfade for 90 frames */
  isSacredSegueIn?: boolean;
}

/** Determine the visual mode for a given section index.
 *  Priority: explicit sectionOverrides > seeded variation > energy-aware affinity morphing > defaultMode.
 *
 *  Energy-aware morphing: when a section's energy differs from the previous,
 *  pick from the affinity map. Coherence lock holds the current shader.
 */
/** @internal exported for testing */
export function getModeForSection(
  song: SetlistEntry,
  sectionIndex: number,
  sections: SectionBoundary[],
  seed?: number,
  era?: string,
  coherenceIsLocked?: boolean,
  usedShaderModes?: Map<VisualMode, number>,
  songIdentity?: SongIdentity,
  stemSection?: StemSectionType,
  frames?: EnhancedFrameData[],
  songDuration?: number,
): VisualMode {
  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return override.mode;

  // Coherence lock: hold current shader during peak moments
  if (coherenceIsLocked && sectionIndex > 0) {
    return getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration);
  }

  // Seeded variation with affinity-aware morphing
  if (seed !== undefined && !song.sectionOverrides?.length) {
    const section = sections[sectionIndex];
    if (section) {
      const prevSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null;
      const prevMode = sectionIndex > 0
        ? getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, undefined, frames, songDuration)
        : song.defaultMode;

      // Energy transition detection: pick from affinity map when energy changes
      const energyChanged = prevSection && prevSection.energy !== section.energy;

      if (energyChanged) {
        const affinityPool = TRANSITION_AFFINITY[prevMode];
        if (affinityPool && affinityPool.length > 0) {
          // Filter by energy affinity and era
          const energyPool = getModesForEnergy(section.energy, era, song.defaultMode);
          const energySet = new Set(energyPool);
          let candidates = affinityPool.filter((m) => energySet.has(m));
          if (candidates.length === 0) candidates = affinityPool;

          // Preferred mode awareness: intersect with preferred modes first
          if (songIdentity?.preferredModes?.length && seed !== undefined) {
            const preferredSet = new Set(songIdentity.preferredModes);
            const preferredCandidates = candidates.filter((m) => preferredSet.has(m));
            if (preferredCandidates.length > 0) candidates = preferredCandidates;
          }

          // Prefer modes not yet used in this show (variety enforcement)
          if (usedShaderModes && usedShaderModes.size > 0) {
            const unused = candidates.filter((m) => !usedShaderModes.has(m));
            if (unused.length > 0) candidates = unused;
          }

          const rng = seededRandom(seed + sectionIndex * 7919);
          return candidates[Math.floor(rng() * candidates.length)];
        }
      }

      // No energy change: use energy-appropriate mode pool with seeded selection
      const pool = getModesForEnergy(section.energy, era, song.defaultMode);

      // Prefer modes not yet used in show
      let filteredPool = pool;
      if (usedShaderModes && usedShaderModes.size > 0) {
        const unused = pool.filter((m) => !usedShaderModes.has(m) || (usedShaderModes.get(m) ?? 0) < 2);
        if (unused.length > 0) filteredPool = unused;
      }

      // Preferred-first pool: start from show modes, add remaining preferred + registry splash
      if (songIdentity?.preferredModes?.length && seed !== undefined) {
        const showModes = getShowModesForSong(songIdentity.preferredModes, seed, song.title);
        const showModeSet = new Set(showModes);
        const remainingPreferred = songIdentity.preferredModes.filter((m) => !showModeSet.has(m));
        // Registry splash: 2 energy-matched modes not in preferred for surprise variety
        const preferredSet = new Set(songIdentity.preferredModes);
        const registrySplash = filteredPool
          .filter((m) => !preferredSet.has(m))
          .slice(0, 2);
        // Build weighted pool: showModes×5 + remainingPreferred×1 + registrySplash×1
        const weightedPool: VisualMode[] = [];
        for (const m of showModes) { for (let i = 0; i < 5; i++) weightedPool.push(m); }
        for (const m of remainingPreferred) { weightedPool.push(m); }
        for (const m of registrySplash) { weightedPool.push(m); }
        if (weightedPool.length > 0) filteredPool = weightedPool;
      }

      // Stem section bias: solo prefers dramatic modes, vocal prefers warm modes
      if (stemSection === "solo") {
        const dramaticModes: VisualMode[] = ["inferno", "concert_lighting", "liquid_light"];
        const dramatic = dramaticModes.filter((m) => filteredPool.includes(m));
        if (dramatic.length > 0) {
          filteredPool = [...filteredPool, ...dramatic, ...dramatic];
        }
      } else if (stemSection === "vocal") {
        const warmModes: VisualMode[] = ["oil_projector", "vintage_film", "aurora"];
        const warm = warmModes.filter((m) => filteredPool.includes(m));
        if (warm.length > 0) {
          filteredPool = [...filteredPool, ...warm, ...warm];
        }
      }

      // Chord mood bias: weight mood-matching modes 2x when confidence > 0.3
      if (frames && section) {
        const moodResult = detectChordMood(frames, section.frameStart);
        if (moodResult.confidence > 0.3) {
          const moodMatches = moodResult.preferredModes.filter((m) => filteredPool.includes(m));
          if (moodMatches.length > 0) {
            filteredPool = [...filteredPool, ...moodMatches]; // 2x weight
          }
        }

        // Improvisation bias: high improv biases toward fluid/generative shaders
        const improvScore = estimateImprovisationScore(frames, section.frameStart);
        if (improvScore > 0.6) {
          const improvModes: VisualMode[] = ["fluid_2d", "fractal_zoom", "reaction_diffusion", "kaleidoscope", "mandala_engine"];
          const improvMatches = improvModes.filter((m) => filteredPool.includes(m));
          if (improvMatches.length > 0) {
            filteredPool = [...filteredPool, ...improvMatches, ...improvMatches]; // 3x weight
          }
        }
      }

      // Duration bias: short songs → structured, extended jams → feedback/generative
      if (songDuration !== undefined) {
        if (songDuration < 300) {
          const structuredModes: VisualMode[] = [
            "concert_lighting", "vintage_film", "lo_fi_grain",
            "stark_minimal", "tie_dye", "inferno", "oil_projector",
          ];
          const matches = structuredModes.filter((m) => filteredPool.includes(m));
          if (matches.length > 0) {
            filteredPool = [...filteredPool, ...matches, ...matches];
          }
        } else if (songDuration > 600) {
          const feedbackModes: VisualMode[] = [
            "feedback_recursion", "reaction_diffusion", "morphogenesis",
            "fractal_zoom", "kaleidoscope", "mandala_engine", "neural_web", "voronoi_flow",
          ];
          const matches = feedbackModes.filter((m) => filteredPool.includes(m));
          if (matches.length > 0) {
            filteredPool = [...filteredPool, ...matches, ...matches];
          }
        }
      }

      const rng = seededRandom(seed + sectionIndex * 7919);
      const idx = Math.floor(rng() * filteredPool.length);
      return filteredPool[idx];
    }
  }

  // Auto-variety: if no overrides at all and the song has sections long enough,
  // use affinity-based selection instead of simple complement
  if (!song.sectionOverrides?.length && sections.length >= 3) {
    const section = sections[sectionIndex];
    const sectionLen = section ? section.frameEnd - section.frameStart : 0;
    const totalLen = sections[sections.length - 1]?.frameEnd ?? 0;

    if (totalLen > 5400 && sectionLen > AUTO_VARIETY_MIN_SECTION && sectionIndex % 2 === 1) {
      const affinityPool = TRANSITION_AFFINITY[song.defaultMode];
      if (affinityPool && affinityPool.length > 0) {
        const rng = seededRandom((seed ?? 0) + sectionIndex * 7919);
        return affinityPool[Math.floor(rng() * affinityPool.length)];
      }
      return getComplement(song.defaultMode);
    }
  }

  return song.defaultMode;
}

/** Map Drums/Space sub-phase to forced shader mode */
/** @internal exported for testing */
export function getDrumsSpaceMode(phase: string, seed?: number, songIdentity?: SongIdentity): VisualMode {
  // Song identity overrides for D/S sub-phases
  if (songIdentity?.drumsSpaceShaders) {
    const override = songIdentity.drumsSpaceShaders[phase as import("../utils/drums-space-phase").DrumsSpaceSubPhase];
    if (override) return override;
  }

  const rng = seededRandom((seed ?? 0) + 31337);
  switch (phase) {
    case "drums_tribal": {
      const pool: VisualMode[] = ["inferno", "concert_lighting", "electric_arc"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "transition": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "voronoi_flow"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_ambient": {
      const pool: VisualMode[] = ["deep_ocean", "cosmic_dust", "crystal_cavern", "void_light", "morphogenesis"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "reemergence": return rng() > 0.5 ? "concert_lighting" : "liquid_light";
    default: return "cosmic_voyage";
  }
}

/** Average energy (rms) over a frame range */
function averageEnergy(frames: EnhancedFrameData[], start: number, end: number): number {
  const lo = Math.max(0, start);
  const hi = Math.min(frames.length, end);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += frames[i].rms;
  return sum / (hi - lo);
}

/** Render a scene for a given mode (delegates to scene registry) */
function renderMode(
  mode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette?: ColorPalette,
  tempo?: number,
  style?: React.CSSProperties,
  jamDensity?: number,
): React.ReactNode {
  return renderScene(mode, { frames, sections, palette, tempo, style, jamDensity });
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed, jamDensity, deadAirMode, deadAirFactor, era, coherenceIsLocked, usedShaderModes, drumsSpacePhase, songIdentity, stemSection, songDuration, palette: paletteProp, segueIn, isSacredSegueIn }) => {
  const frame = useCurrentFrame();
  const palette = paletteProp ?? song.palette;

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // Find current section
  const { sectionIndex: currentSectionIdx } = findCurrentSection(sections, frame);

  // Drums/Space phase override: force specific shaders per sub-phase
  if (drumsSpacePhase) {
    const dsMode = getDrumsSpaceMode(drumsSpacePhase, seed, songIdentity);
    return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity, stemSection, frames, songDuration);
  const currentSection = sections[currentSectionIdx];

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;

  // Sacred segue: suppress first within-song scene crossfade for 90 frames (3s)
  // This prevents a jarring shader switch right as the segue lands
  const suppressCrossfade = isSacredSegueIn && frame < 90;

  // Crossfade INTO this section (from previous) — beat-synced when possible
  if (prevSectionIdx >= 0 && !suppressCrossfade) {
    const prevMode = getModeForSection(song, prevSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration);
    if (prevMode !== currentMode) {
      const boundary = currentSection.frameStart;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : dynamicCrossfadeDuration(frames, boundary);
      const crossfadeStart = beatFrame !== null ? beatFrame - 30 : boundary;
      const distFromStart = frame - crossfadeStart;

      if (distFromStart >= 0 && distFromStart < crossfadeLen) {
        const progress = distFromStart / crossfadeLen;
        // Compute energy before/after boundary for transition style selection
        const energyBefore = prevSectionIdx >= 0 && sections[prevSectionIdx] ? averageEnergy(frames, sections[prevSectionIdx].frameStart, boundary) : 0;
        const energyAfter = currentSection ? averageEnergy(frames, boundary, currentSection.frameEnd) : 0;
        const sectionLabel = currentSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOut = SCENE_REGISTRY[prevMode]?.preferredTransitionOut;
        const scenePreferredIn = SCENE_REGISTRY[currentMode]?.preferredTransitionIn;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredIn, scenePreferredOut);
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(prevMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
            style={transitionStyle}
          />
        );
      }
    }
  }

  // Crossfade OUT of this section (to next) — beat-synced when possible
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration);
    if (nextMode !== currentMode) {
      const boundary = currentSection.frameEnd;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : dynamicCrossfadeDuration(frames, boundary);
      const crossfadeEnd = beatFrame !== null ? beatFrame + 30 : boundary;
      const distToEnd = crossfadeEnd - frame;

      if (distToEnd >= 0 && distToEnd < crossfadeLen) {
        const progress = 1 - distToEnd / crossfadeLen;
        const energyBefore = currentSection ? averageEnergy(frames, currentSection.frameStart, boundary) : 0;
        const nextSection = sections[nextSectionIdx];
        const energyAfter = nextSection ? averageEnergy(frames, boundary, nextSection.frameEnd) : 0;
        const sectionLabel = nextSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOutB = SCENE_REGISTRY[currentMode]?.preferredTransitionOut;
        const scenePreferredInB = SCENE_REGISTRY[nextMode]?.preferredTransitionIn;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredInB, scenePreferredOutB);
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(nextMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
            style={transitionStyle}
          />
        );
      }
    }
  }

  const mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity);

  // Dead air crossfade: transition to ambient shader after music ends
  // Use a neutral desaturated palette so the song's personality doesn't bleed into applause
  if (deadAirMode && deadAirFactor !== undefined && deadAirFactor > 0) {
    const deadAirPalette: typeof palette = { primary: 240, secondary: 240, saturation: 0.15, brightness: 0.6 };
    const basePalette = palette ?? { primary: 240, secondary: 240, saturation: 0.5, brightness: 0.8 };
    const blendedPalette = deadAirFactor >= 1 ? deadAirPalette : {
      primary: basePalette.primary + (deadAirPalette.primary - basePalette.primary) * deadAirFactor,
      secondary: basePalette.secondary + (deadAirPalette.secondary - basePalette.secondary) * deadAirFactor,
      saturation: (basePalette.saturation ?? 1) + ((deadAirPalette.saturation ?? 0.15) - (basePalette.saturation ?? 1)) * deadAirFactor,
      brightness: (basePalette.brightness ?? 1) + ((deadAirPalette.brightness ?? 0.6) - (basePalette.brightness ?? 1)) * deadAirFactor,
    };
    if (deadAirFactor >= 1) {
      return <>{renderMode(deadAirMode, frames, sections, deadAirPalette, tempo, undefined, 0.2)}</>;
    }
    return (
      <SceneCrossfade
        progress={deadAirFactor}
        outgoing={mainScene}
        incoming={renderMode(deadAirMode, frames, sections, blendedPalette, tempo, undefined, 0.2)}
      />
    );
  }

  return <>{mainScene}</>;
};
