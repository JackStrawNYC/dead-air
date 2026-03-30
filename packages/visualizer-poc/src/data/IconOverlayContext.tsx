/**
 * IconOverlayContext — provides the current image overlay to FullscreenQuad
 * without prop-drilling through 69 scene components.
 *
 * SongVisualizer sets the icon path + opacity via this context.
 * FullscreenQuad reads it and composites the icon in its GLSL render pipeline.
 */

import { createContext, useContext } from "react";
import type * as THREE from "three";

export interface IconOverlayState {
  /** Loaded Three.js texture (null if not loaded yet or no icon active) */
  texture: THREE.Texture | null;
  /** Overlay opacity from scoring engine (0-1) */
  opacity: number;
}

const DEFAULT: IconOverlayState = { texture: null, opacity: 0 };

const IconOverlayCtx = createContext<IconOverlayState>(DEFAULT);

export const IconOverlayProvider = IconOverlayCtx.Provider;

export function useIconOverlay(): IconOverlayState {
  return useContext(IconOverlayCtx);
}
