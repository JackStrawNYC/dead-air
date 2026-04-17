/**
 * JamPhaseRouter — extracted from SceneRouter.tsx
 *
 * Handles jam phase shader transitions for long jams (10+ min).
 * Each phase (exploration/building/peak_space/resolution) gets its own shader,
 * with crossfades at phase boundaries. This makes a 20-minute Dark Star
 * visually evolve as the music evolves.
 *
 * Returns React.ReactNode if jam phase routing applies, or null to fall through.
 */

import React from "react";
import { SceneCrossfade } from "../SceneCrossfade";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  ColorPalette,
} from "../../data/types";
import type { JamEvolution, JamPhaseBoundaries } from "../../utils/jam-evolution";
import type { JamCycleState } from "../../utils/jam-cycles";
import { renderMode } from "./scene-utils";

/**
 * Evaluate jam phase routing for the current frame.
 *
 * ─── JAM PHASE SHADER TRANSITIONS ───
 * For long jams (10+ min), override the section shader with phase-specific shaders.
 * Each phase (exploration/building/peak_space/resolution) gets its own shader,
 * with crossfades at phase boundaries. This makes a 20-minute Dark Star
 * visually evolve as the music evolves.
 */
export function renderJamPhase(
  jamEvolution: JamEvolution | undefined,
  jamPhaseBoundaries: JamPhaseBoundaries | null | undefined,
  jamPhaseShaders: Record<string, VisualMode> | undefined,
  jamCycle: JamCycleState | null | undefined,
  frame: number,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette: ColorPalette | undefined,
  tempo: number | undefined,
  jamDensity: number | undefined,
  seed: number | undefined,
  currentSection: SectionBoundary | undefined,
  _renderMode: typeof renderMode,
): React.ReactNode | null {
  if (!(jamEvolution?.isLongJam && jamPhaseBoundaries && jamPhaseShaders)) return null;

  const jpMode = jamPhaseShaders[jamEvolution.phase];
  if (!jpMode) return null;

  // Detect if we're near a phase boundary and need to crossfade
  const JAM_CROSSFADE_FRAMES = 120; // 4 seconds — slow organic transition
  const boundaries = [
    { frame: jamPhaseBoundaries.explorationEnd, from: "exploration", to: "building" },
    { frame: jamPhaseBoundaries.buildingEnd, from: "building", to: "peak_space" },
    { frame: jamPhaseBoundaries.peakSpaceEnd, from: "peak_space", to: "resolution" },
  ] as const;

  for (const b of boundaries) {
    const fromMode = jamPhaseShaders[b.from];
    const toMode = jamPhaseShaders[b.to];
    if (!fromMode || !toMode || fromMode === toMode) continue;

    const halfCF = Math.floor(JAM_CROSSFADE_FRAMES / 2);
    const cfStart = b.frame - halfCF;
    const cfEnd = b.frame + halfCF;

    if (frame >= cfStart && frame < cfEnd) {
      const progress = (frame - cfStart) / JAM_CROSSFADE_FRAMES;
      return (
        <SceneCrossfade
          progress={progress}
          outgoing={_renderMode(fromMode, frames, sections, palette, tempo, undefined, jamDensity)}
          incoming={_renderMode(toMode, frames, sections, palette, tempo, undefined, jamDensity)}
          style="morph"
        />
      );
    }
  }

  // TODO: dual-shader jam blending not yet wired — render single mode
  return <>{_renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
}
