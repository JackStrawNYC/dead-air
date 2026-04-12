/**
 * ShowVisualSeedContext — provides per-show visual seed to shader quad renderers
 * without threading through scene components.
 *
 * Set by SongVisualizer (from PrecomputedNarrative.showVisualSeed), consumed by
 * FullscreenQuad/MultiPassQuad/DualShaderQuad for the 4 show-character uniforms.
 */

import { createContext, useContext } from "react";
import type { ShowVisualSeed } from "../utils/show-visual-seed";

const ShowVisualSeedCtx = createContext<ShowVisualSeed | null>(null);

export const ShowVisualSeedProvider = ShowVisualSeedCtx.Provider;

/** Returns per-show visual seed, or null if unavailable. */
export function useShowVisualSeed(): ShowVisualSeed | null {
  return useContext(ShowVisualSeedCtx);
}
