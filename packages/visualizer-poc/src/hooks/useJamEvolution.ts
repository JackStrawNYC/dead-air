/**
 * useJamEvolution — extracts jam evolution state from SongVisualizer.
 *
 * Computes jam phase, density, phase boundaries, and shader map per jam phase.
 * All logic is a pure extraction from SongVisualizer.tsx with no behavior changes.
 */

import { useMemo } from "react";
import type { EnhancedFrameData, VisualMode } from "../data/types";
import type { SongIdentity } from "../data/song-identities";
import {
  computeJamEvolution,
  getJamPhaseBoundaries,
  getJamPhaseSequence,
  type JamEvolution,
  type JamPhase,
  type JamPhaseBoundaries,
} from "../utils/jam-evolution";

export interface UseJamEvolutionInput {
  frames: EnhancedFrameData[];
  frameIdx: number;
  isDrumsSpace: boolean;
  showSeed: number | undefined;
  songIdentity: SongIdentity | undefined;
  defaultMode: VisualMode | undefined;
}

export interface UseJamEvolutionResult {
  jamEvolution: JamEvolution;
  /** Normalized 0-1 range (0.5 = neutral) for shader-friendly consumption */
  jamDensity: number;
  jamPhaseBoundaries: JamPhaseBoundaries | null;
  jamPhaseShaders: Record<JamPhase, VisualMode> | undefined;
}

export function useJamEvolution(input: UseJamEvolutionInput): UseJamEvolutionResult {
  const { frames, frameIdx, isDrumsSpace, showSeed, songIdentity, defaultMode } = input;

  const jamEvolution = useMemo(
    () => computeJamEvolution(frames, frameIdx, isDrumsSpace),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, Math.floor(frameIdx / 30), isDrumsSpace],
  );

  // Normalize densityMult (0.75-1.25) to shader-friendly 0-1 range (0.5 = neutral)
  const jamDensity = jamEvolution.isLongJam
    ? Math.max(0, Math.min(1, (jamEvolution.densityMult - 0.75) / 0.5))
    : 0.5;

  // Precompute jam phase boundaries + shader sequence (once per song, not per frame)
  const jamPhaseBoundaries = useMemo(
    () => getJamPhaseBoundaries(frames, isDrumsSpace),
    [frames, isDrumsSpace],
  );
  const jamPhaseShaders = useMemo(
    () => jamEvolution.isLongJam
      ? getJamPhaseSequence(showSeed ?? 0, songIdentity, defaultMode)
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jamEvolution.isLongJam, showSeed, songIdentity, defaultMode],
  );

  return { jamEvolution, jamDensity, jamPhaseBoundaries, jamPhaseShaders };
}
