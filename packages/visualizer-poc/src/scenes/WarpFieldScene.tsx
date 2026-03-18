/**
 * WarpFieldScene — gravitational lensing of space-time grid and background starfield.
 * Central mass distorts spacetime with grid lines bending through the lens.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { warpFieldVert, warpFieldFrag } from "../shaders/warp-field";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const WarpFieldScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={warpFieldVert}
        fragmentShader={warpFieldFrag}
      />
    </AudioReactiveCanvas>
  );
};
