/**
 * PeakOfShowContext — provides peak-of-show intensity to AudioReactiveCanvas
 * without threading through 51 scene components.
 *
 * Set by SongVisualizer (from detectPeakOfShow), consumed by
 * AudioReactiveCanvas for the uPeakOfShow GLSL uniform.
 */

import { createContext, useContext } from "react";

const PeakOfShowCtx = createContext<number>(0);

export const PeakOfShowProvider = PeakOfShowCtx.Provider;

/** Returns peak-of-show intensity (0-1). 0 = not in peak moment. */
export function usePeakOfShow(): number {
  return useContext(PeakOfShowCtx);
}
