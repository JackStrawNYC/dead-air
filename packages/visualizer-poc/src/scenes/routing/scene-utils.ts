/**
 * Scene utility functions — energy averaging, blend mode selection, and render delegation.
 */

import React from "react";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  ColorPalette,
} from "../../data/types";
import type { DualBlendMode } from "../../components/DualShaderQuad";
import { renderScene } from "../scene-registry";

/** Average energy (rms) over a frame range */
export function averageEnergy(frames: EnhancedFrameData[], start: number, end: number): number {
  const lo = Math.max(0, start);
  const hi = Math.min(frames.length, end);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += frames[i].rms;
  return sum / (hi - lo);
}

/** Select GPU blend mode based on energy context, climax phase, and section type */
export function selectDualBlendMode(
  energy: number,
  sectionEnergy?: string,
  climaxPhase?: number,
  sectionType?: string,
): DualBlendMode {
  if (climaxPhase !== undefined && climaxPhase >= 2 && climaxPhase <= 3) return "noise_dissolve";
  if (sectionType === "jam" || sectionType === "solo") return "depth_aware";
  if (energy > 0.25) return "luminance_key";
  if (energy < 0.08) return "additive";
  if (sectionEnergy === "low") return "depth_aware";
  return "luminance_key";
}

/** Render a scene for a given mode (delegates to scene registry) */
export function renderMode(
  mode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette?: ColorPalette,
  tempo?: number,
  style?: React.CSSProperties,
  jamDensity?: number,
): React.ReactNode {
  return renderScene(mode, { frames, sections, palette, tempo, style, jamDensity });
}
