/**
 * JamPhaseContext — provides jam evolution phase data to AudioReactiveCanvas
 * without threading through 51 scene components.
 *
 * Set by SongVisualizer, consumed by AudioReactiveCanvas for GLSL uniforms.
 */

import { createContext, useContext } from "react";

export interface JamPhaseData {
  /** 0=exploration, 1=building, 2=peak_space, 3=resolution, -1=not a long jam */
  phase: number;
  /** 0-1 progress within current jam phase */
  progress: number;
}

const DEFAULT: JamPhaseData = { phase: -1, progress: 0 };

const JamPhaseCtx = createContext<JamPhaseData>(DEFAULT);

export const JamPhaseProvider = JamPhaseCtx.Provider;

export function useJamPhase(): JamPhaseData {
  return useContext(JamPhaseCtx);
}
