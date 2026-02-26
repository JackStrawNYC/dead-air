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
import { SceneCrossfade } from "./SceneCrossfade";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";

const CROSSFADE_FRAMES = 90; // 3 seconds at 30fps

interface Props {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  song: SetlistEntry;
  tempo?: number;
}

/** Determine the visual mode for a given section index */
function getModeForSection(song: SetlistEntry, sectionIndex: number): VisualMode {
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return override.mode;
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
    default:
      return <LiquidLightScene frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} />;
  }
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo }) => {
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

  const currentMode = getModeForSection(song, currentSectionIdx);
  const currentSection = sections[currentSectionIdx];

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;

  // Crossfade INTO this section (from previous)
  if (prevSectionIdx >= 0) {
    const prevMode = getModeForSection(song, prevSectionIdx);
    if (prevMode !== currentMode) {
      const distFromStart = frame - currentSection.frameStart;
      if (distFromStart < CROSSFADE_FRAMES) {
        const progress = distFromStart / CROSSFADE_FRAMES;
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(prevMode, frames, sections, palette, tempo)}
            incoming={renderMode(currentMode, frames, sections, palette, tempo)}
          />
        );
      }
    }
  }

  // Crossfade OUT of this section (to next)
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx);
    if (nextMode !== currentMode) {
      const distToEnd = currentSection.frameEnd - frame;
      if (distToEnd < CROSSFADE_FRAMES) {
        const progress = 1 - distToEnd / CROSSFADE_FRAMES;
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(currentMode, frames, sections, palette, tempo)}
            incoming={renderMode(nextMode, frames, sections, palette, tempo)}
          />
        );
      }
    }
  }

  return <>{renderMode(currentMode, frames, sections, palette, tempo)}</>;
};
