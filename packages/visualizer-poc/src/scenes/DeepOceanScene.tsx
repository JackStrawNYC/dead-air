/**
 * DeepOceanScene — underwater caustics and god rays.
 * Designed for quiet passages. Energy-inverse bioluminescence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { deepOceanVert, deepOceanFrag } from "../shaders/deep-ocean";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const DeepOceanScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={deepOceanVert}
        fragmentShader={deepOceanFrag}
      />
    </AudioReactiveCanvas>
  );
};
