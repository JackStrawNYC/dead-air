/**
 * GPUTransition — GPU-level scene crossfade via DualShaderQuad.
 *
 * Unlike SceneCrossfade (CSS opacity), this renders both shaders to
 * GPU render targets and composites them with blend modes (luminance_key,
 * noise_dissolve, additive, multiplicative, depth_aware).
 *
 * Used for high-energy-delta transitions where organic GPU blending
 * produces richer results than CSS opacity stacking.
 *
 * NOTE: This component renders DualShaderQuad directly — it does NOT
 * wrap in AudioReactiveCanvas because it's already rendered inside
 * a scene tree that provides audio context. DualShaderQuad reads
 * audio data from the existing AudioDataContext via useAudioData().
 */

import React from "react";
import { DualShaderQuad, type DualBlendMode } from "../components/DualShaderQuad";
import { getShaderStrings } from "../shaders/shader-strings";
import { renderScene } from "./scene-registry";
import type { EnhancedFrameData, SectionBoundary, ColorPalette, VisualMode } from "../data/types";

interface Props {
  /** Outgoing shader mode */
  outMode: VisualMode;
  /** Incoming shader mode */
  inMode: VisualMode;
  /** Blend progress: 0 = all outgoing, 1 = all incoming */
  progress: number;
  /** GPU blend mode */
  blendMode: DualBlendMode;
  /** Per-frame audio analysis data */
  frames: EnhancedFrameData[];
  /** Song sections */
  sections: SectionBoundary[];
  /** Color palette */
  palette?: ColorPalette;
  /** Song tempo */
  tempo?: number;
  /** Jam density */
  jamDensity?: number;
}

/**
 * Map SceneTransitionStyle to DualBlendMode.
 * CSS-only styles (flash, void, distortion) fall back to noise_dissolve
 * since they have no GPU equivalent.
 */
export function transitionStyleToBlendMode(
  style: string,
  energy?: number,
): DualBlendMode {
  switch (style) {
    case "shader_dissolve":
    case "dissolve":
    case "morph":
      return "noise_dissolve";
    case "shader_luminance":
      return "luminance_key";
    case "shader_additive":
    case "flash":
      return "additive";
    case "void":
      return "depth_aware";
    case "distortion":
      return "noise_dissolve";
    default:
      // Energy-based fallback
      if (energy !== undefined && energy > 0.25) return "luminance_key";
      return "noise_dissolve";
  }
}

export const GPUTransition: React.FC<Props> = ({
  outMode,
  inMode,
  progress,
  blendMode,
  frames,
  sections,
  palette,
  tempo,
  jamDensity,
}) => {
  const stringsA = getShaderStrings(outMode);
  const stringsB = getShaderStrings(inMode);

  // If either shader isn't available as raw GLSL strings (e.g. Three.js scenes),
  // fall back to CSS-based SceneCrossfade by rendering both scenes as React nodes.
  // The caller (SceneRouter) handles this fallback when GPUTransition returns null.
  if (!stringsA || !stringsB) {
    return null;
  }

  // DualShaderQuad renders both shaders to separate GPU targets and composites
  // them with the blend shader. It reads audio data from AudioDataContext
  // (provided by the AudioReactiveCanvas that wraps the entire scene tree).
  return (
    <DualShaderQuad
      vertexShaderA={stringsA.vert}
      fragmentShaderA={stringsA.frag}
      vertexShaderB={stringsB.vert}
      fragmentShaderB={stringsB.frag}
      blendMode={blendMode}
      blendProgress={progress}
    />
  );
};
