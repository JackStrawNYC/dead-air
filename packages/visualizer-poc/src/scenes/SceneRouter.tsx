/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { LiquidLightScene } from "./LiquidLightScene";
import { ParticleNebulaScene } from "./ParticleNebulaScene";
import { ConcertLightingScene } from "./ConcertLightingScene";
import { LoFiGrainScene } from "./LoFiGrainScene";
import { StarkMinimalScene } from "./StarkMinimalScene";
import { OilProjectorScene } from "./OilProjectorScene";
import { TieDyeScene } from "./TieDyeScene";
import { CosmicDustScene } from "./CosmicDustScene";
import { VintageFilmScene } from "./VintageFilmScene";
import { SceneCrossfade } from "./SceneCrossfade";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";

const CROSSFADE_FRAMES = 90; // 3 seconds at 30fps (default when no beat found)
const BEAT_CROSSFADE_FRAMES = 60; // 2 seconds when beat-synced (30 before + 30 after)

// Auto-variety: complementary modes for each default mode.
// When a long song lacks sectionOverrides, alternate sections get a contrasting shader.
const COMPLEMENT_MODES: Record<VisualMode, VisualMode> = {
  liquid_light: "oil_projector",
  oil_projector: "liquid_light",
  concert_lighting: "lo_fi_grain",
  lo_fi_grain: "concert_lighting",
  particle_nebula: "cosmic_dust",
  stark_minimal: "liquid_light",
  tie_dye: "vintage_film",
  cosmic_dust: "particle_nebula",
  vintage_film: "tie_dye",
};

// Energy-appropriate mode pools — seed selects from these
const HIGH_ENERGY_MODES: VisualMode[] = ["concert_lighting", "tie_dye", "liquid_light", "oil_projector"];
const MID_ENERGY_MODES: VisualMode[] = ["liquid_light", "oil_projector", "vintage_film", "lo_fi_grain"];
const LOW_ENERGY_MODES: VisualMode[] = ["cosmic_dust", "particle_nebula", "stark_minimal", "vintage_film"];

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

/** Simple deterministic PRNG */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
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
      const pool = energy === "high" ? HIGH_ENERGY_MODES
        : energy === "low" ? LOW_ENERGY_MODES
        : MID_ENERGY_MODES;
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
      return COMPLEMENT_MODES[song.defaultMode] ?? song.defaultMode;
    }
  }

  return song.defaultMode;
}

/** Render a scene for a given mode */
function renderMode(
  mode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette?: ColorPalette,
  tempo?: number,
  style?: React.CSSProperties,
): React.ReactNode {
  switch (mode) {
    case "liquid_light":
      return <LiquidLightScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "particle_nebula":
      return <ParticleNebulaScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "concert_lighting":
      return <ConcertLightingScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "lo_fi_grain":
      return <LoFiGrainScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "stark_minimal":
      return <StarkMinimalScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "oil_projector":
      return <OilProjectorScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "tie_dye":
      return <TieDyeScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "cosmic_dust":
      return <CosmicDustScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    case "vintage_film":
      return <VintageFilmScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
    default:
      return <LiquidLightScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
  }
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed }) => {
  const frame = useCurrentFrame();
  const palette = song.palette;

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo)}</>;
  }

  // Find current section
  let currentSectionIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    if (frame >= sections[i].frameStart && frame < sections[i].frameEnd) {
      currentSectionIdx = i;
      break;
    }
    if (i === sections.length - 1) {
      currentSectionIdx = i;
    }
  }

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
