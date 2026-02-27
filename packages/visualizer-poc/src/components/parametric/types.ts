/**
 * Parametric Overlay Library — shared types.
 *
 * Every parametric component exports variants as React.FC<OverlayProps>.
 * Variants are registered by name in the overlay system (e.g. "ParticleField_Fireflies").
 */

import type React from "react";
import type { EnhancedFrameData, OverlayEntry } from "../../data/types";

/** Standard overlay component props — single `frames` array */
export type OverlayProps = { frames: EnhancedFrameData[] };

/** A parametric overlay component */
export type OverlayComponent = React.FC<OverlayProps>;

/** Entry for OVERLAY_COMPONENTS map */
export interface OverlayComponentEntry {
  Component: OverlayComponent;
  layer: number;
}
