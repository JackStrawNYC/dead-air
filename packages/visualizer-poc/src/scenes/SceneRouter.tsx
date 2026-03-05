/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { renderScene, getComplement, getModesForEnergy } from "./scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { findCurrentSection } from "../utils/section-lookup";

const CROSSFADE_FRAMES = 90; // 3 seconds at 30fps (default when no beat found)
const BEAT_CROSSFADE_FRAMES = 60; // 2 seconds when beat-synced (30 before + 30 after)

// Complement modes and energy pools are now in scene-registry.ts

// Minimum section duration (in frames) to qualify for auto-variety
const AUTO_VARIETY_MIN_SECTION = 7200; // 4 minutes at 30fps

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

interface Props {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  song: SetlistEntry;
  tempo?: number;
  /** Optional seed for generative variation — different seed → different scene assignments */
  seed?: number;
}

/** Determine the visual mode for a given section index.
 *  Priority: explicit sectionOverrides > seeded variation > auto-variety for long songs > defaultMode.
 */
function getModeForSection(
  song: SetlistEntry,
  sectionIndex: number,
  sections: SectionBoundary[],
  seed?: number,
): VisualMode {
  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return override.mode;

  // Seeded variation: if seed is provided and no explicit overrides,
  // pick from energy-appropriate mode pool
  if (seed !== undefined && !song.sectionOverrides?.length) {
    const section = sections[sectionIndex];
    if (section) {
      const energy = section.energy;
      const pool = getModesForEnergy(energy);
      const rng = seededRandom(seed + sectionIndex * 7919);
      const idx = Math.floor(rng() * pool.length);
      return pool[idx];
    }
  }

  // Auto-variety: if no overrides at all and the song has sections long enough,
  // alternate between default and complement to prevent visual fatigue
  if (!song.sectionOverrides?.length && sections.length >= 3) {
    const section = sections[sectionIndex];
    const sectionLen = section ? section.frameEnd - section.frameStart : 0;
    const totalLen = sections[sections.length - 1]?.frameEnd ?? 0;

    // Only auto-vary for songs >6min total with sections >4min
    if (totalLen > 10800 && sectionLen > AUTO_VARIETY_MIN_SECTION && sectionIndex % 2 === 1) {
      return getComplement(song.defaultMode);
    }
  }

  return song.defaultMode;
}

/** Render a scene for a given mode (delegates to scene registry) */
function renderMode(
  mode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette?: ColorPalette,
  tempo?: number,
  style?: React.CSSProperties,
): React.ReactNode {
  return renderScene(mode, { frames, sections, palette, tempo, style });
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed }) => {
  const frame = useCurrentFrame();
  const palette = song.palette;

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo)}</>;
  }

  // Find current section
  const { sectionIndex: currentSectionIdx } = findCurrentSection(sections, frame);

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed);
  const currentSection = sections[currentSectionIdx];

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;

  // Crossfade INTO this section (from previous) — beat-synced when possible
  if (prevSectionIdx >= 0) {
    const prevMode = getModeForSection(song, prevSectionIdx, sections, seed);
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
            outgoing={renderMode(prevMode, frames, sections, palette, tempo)}
            incoming={renderMode(currentMode, frames, sections, palette, tempo)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
          />
        );
      }
    }
  }

  // Crossfade OUT of this section (to next) — beat-synced when possible
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx, sections, seed);
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
            outgoing={renderMode(currentMode, frames, sections, palette, tempo)}
            incoming={renderMode(nextMode, frames, sections, palette, tempo)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
          />
        );
      }
    }
  }

  return <>{renderMode(currentMode, frames, sections, palette, tempo)}</>;
};
