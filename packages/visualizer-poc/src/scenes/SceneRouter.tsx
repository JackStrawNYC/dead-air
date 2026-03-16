/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { renderScene, getComplement, getModesForEnergy, TRANSITION_AFFINITY } from "./scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { findCurrentSection } from "../utils/section-lookup";
import type { SongIdentity } from "../data/song-identities";

const CROSSFADE_FRAMES = 30; // 1 second at 30fps — dramatic flash→blackout→eruption
const BEAT_CROSSFADE_FRAMES = 30; // 1 second when beat-synced (15 before + 15 after)

// Complement modes and energy pools are now in scene-registry.ts

// Minimum section duration (in frames) to qualify for auto-variety
const AUTO_VARIETY_MIN_SECTION = 2700; // 1.5 minutes at 30fps

/**
 * Find nearest strong beat within a frame range for beat-synced transitions.
 * Returns the frame index of the strongest beat/onset, or null if none found.
 */
function findNearestBeat(
  frames: EnhancedFrameData[],
  searchStart: number,
  searchEnd: number,
): number | null {
  let bestFrame: number | null = null;
  let bestScore = 0;

  for (let i = Math.max(0, searchStart); i < Math.min(frames.length, searchEnd); i++) {
    const f = frames[i];
    // Prefer actual beat detections, then strong onsets
    const score = (f.beat ? 1.0 : 0) + (f.onset > 0.7 ? f.onset * 0.5 : 0);
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
}

/** Determine the visual mode for a given section index.
 *  Priority: explicit sectionOverrides > seeded variation > energy-aware affinity morphing > defaultMode.
 *
 *  Energy-aware morphing: when a section's energy differs from the previous,
 *  pick from the affinity map. Coherence lock holds the current shader.
 */
function getModeForSection(
  song: SetlistEntry,
  sectionIndex: number,
  sections: SectionBoundary[],
  seed?: number,
  era?: string,
  coherenceIsLocked?: boolean,
  usedShaderModes?: Map<VisualMode, number>,
  songIdentity?: SongIdentity,
): VisualMode {
  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return override.mode;

  // Coherence lock: hold current shader during peak moments
  if (coherenceIsLocked && sectionIndex > 0) {
    return getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity);
  }

  // Seeded variation with affinity-aware morphing
  if (seed !== undefined && !song.sectionOverrides?.length) {
    const section = sections[sectionIndex];
    if (section) {
      const prevSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null;
      const prevMode = sectionIndex > 0
        ? getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity)
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

      // Song identity preferred modes: weight 3x in selection pool
      if (songIdentity?.preferredModes?.length) {
        const preferred = songIdentity.preferredModes.filter((m) => filteredPool.includes(m));
        if (preferred.length > 0) {
          // Add preferred modes 2 extra times (3x total weight)
          filteredPool = [...filteredPool, ...preferred, ...preferred];
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
function getDrumsSpaceMode(phase: string, seed?: number, songIdentity?: SongIdentity): VisualMode {
  // Song identity overrides for D/S sub-phases
  if (songIdentity?.drumsSpaceShaders) {
    const override = songIdentity.drumsSpaceShaders[phase as import("../utils/drums-space-phase").DrumsSpaceSubPhase];
    if (override) return override;
  }

  const rng = seededRandom((seed ?? 0) + 31337);
  switch (phase) {
    case "drums_tribal": return rng() > 0.5 ? "inferno" : "concert_lighting";
    case "transition": return rng() > 0.5 ? "cosmic_voyage" : "aurora";
    case "space_ambient": {
      const pool: VisualMode[] = ["deep_ocean", "cosmic_dust", "crystal_cavern", "void_light"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "reemergence": return rng() > 0.5 ? "concert_lighting" : "liquid_light";
    default: return "cosmic_voyage";
  }
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

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed, jamDensity, deadAirMode, deadAirFactor, era, coherenceIsLocked, usedShaderModes, drumsSpacePhase, songIdentity }) => {
  const frame = useCurrentFrame();
  const palette = song.palette;

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

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity);
  const currentSection = sections[currentSectionIdx];

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;

  // Crossfade INTO this section (from previous) — beat-synced when possible
  if (prevSectionIdx >= 0) {
    const prevMode = getModeForSection(song, prevSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity);
    if (prevMode !== currentMode) {
      const boundary = currentSection.frameStart;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : CROSSFADE_FRAMES;
      const crossfadeStart = beatFrame !== null ? beatFrame - 30 : boundary;
      const distFromStart = frame - crossfadeStart;

      if (distFromStart >= 0 && distFromStart < crossfadeLen) {
        const progress = distFromStart / crossfadeLen;
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(prevMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
          />
        );
      }
    }
  }

  // Crossfade OUT of this section (to next) — beat-synced when possible
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity);
    if (nextMode !== currentMode) {
      const boundary = currentSection.frameEnd;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : CROSSFADE_FRAMES;
      const crossfadeEnd = beatFrame !== null ? beatFrame + 30 : boundary;
      const distToEnd = crossfadeEnd - frame;

      if (distToEnd >= 0 && distToEnd < crossfadeLen) {
        const progress = 1 - distToEnd / crossfadeLen;
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(nextMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
          />
        );
      }
    }
  }

  const mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity);

  // Dead air crossfade: transition to ambient shader after music ends
  if (deadAirMode && deadAirFactor !== undefined && deadAirFactor > 0) {
    if (deadAirFactor >= 1) {
      return <>{renderMode(deadAirMode, frames, sections, palette, tempo, undefined, 0.2)}</>;
    }
    return (
      <SceneCrossfade
        progress={deadAirFactor}
        outgoing={mainScene}
        incoming={renderMode(deadAirMode, frames, sections, palette, tempo, undefined, 0.2)}
      />
    );
  }

  return <>{mainScene}</>;
};
