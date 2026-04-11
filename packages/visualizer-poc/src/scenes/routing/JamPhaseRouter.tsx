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
import { getComplement, TRANSITION_AFFINITY } from "../scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  ColorPalette,
} from "../../data/types";
import { seededLCG as seededRandom } from "../../utils/seededRandom";
import { getShaderStrings } from "../../shaders/shader-strings";
import type { JamEvolution, JamPhaseBoundaries } from "../../utils/jam-evolution";
import { JAM_PHASE_INDEX } from "../../utils/jam-evolution";
import type { JamCycleState } from "../../utils/jam-cycles";
import { selectDualBlendMode, renderMode } from "./scene-utils";

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

  // Not at a phase boundary — render the phase shader.
  // During jam cycle peaks, use DualShaderQuad to blend current phase shader
  // with the NEXT phase's shader for sub-cycle visual climaxes.
  if (jamCycle && (jamCycle.phase === "peak" || (jamCycle.phase === "build" && jamCycle.progress > 0.6)) && jamCycle.progress > 0.2) {
    // Find the next phase's shader for the sub-cycle peak blend
    const phaseOrder: string[] = ["exploration", "building", "peak_space", "resolution"];
    const currentPhaseIdx = phaseOrder.indexOf(jamEvolution.phase);
    const nextPhaseKey = currentPhaseIdx < phaseOrder.length - 1
      ? phaseOrder[currentPhaseIdx + 1]
      : phaseOrder[currentPhaseIdx]; // resolution stays on resolution
    const peakBlendMode = jamPhaseShaders[nextPhaseKey] ?? jpMode;

    if (peakBlendMode !== jpMode) {
      const stringsA = getShaderStrings(jpMode);
      const stringsB = getShaderStrings(peakBlendMode);
      if (stringsA && stringsB) {
        // Blend toward next phase shader proportional to cycle peak intensity
        const peakBlend = 0.15 + jamCycle.progress * 0.25;
        const blendMode = selectDualBlendMode(
          frames[Math.min(frame, frames.length - 1)]?.rms ?? 0,
          currentSection?.energy,
          undefined,
          "jam",
        );
        return <>{_renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
      }
    }
  }

  // Standard jam phase render (with dual-shader composition if energy warrants)
  const frameEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0;
  const jamShouldDual = frameEnergy > 0.05;
  if (jamShouldDual) {
    const affinityPool = TRANSITION_AFFINITY[jpMode];
    const rng = seededRandom((seed ?? 0) + JAM_PHASE_INDEX[jamEvolution.phase] * 31);
    const secondaryMode = affinityPool && affinityPool.length > 0
      ? affinityPool[Math.floor(rng() * affinityPool.length)]
      : getComplement(jpMode);
    const stringsA = getShaderStrings(jpMode);
    const stringsB = getShaderStrings(secondaryMode);
    if (stringsA && stringsB) {
      const blendMode = selectDualBlendMode(frameEnergy, currentSection?.energy, undefined, "jam");
      // Phase ramp: blend builds over first 15% of phase (not instant)
      const phaseRamp = Math.min(1, jamEvolution.phaseProgress / 0.15);
      const baseJamBlend = 0.10 + frameEnergy * 0.20;
      const arcJamBlend = Math.sin(jamEvolution.phaseProgress * Math.PI) * 0.12;
      const jamFrameData = frames[Math.min(frame, frames.length - 1)];
      const jamBeatPulse = (jamFrameData?.beat ? 0.12 : 0) * Math.max(0.3, frameEnergy);
      const blendProgress = (baseJamBlend + arcJamBlend + jamBeatPulse) * phaseRamp;
      return <>{_renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
    }
  }

  // Fallback: simple single-shader render for this jam phase
  return <>{_renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
}
