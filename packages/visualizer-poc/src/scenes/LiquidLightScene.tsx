/**
 * LiquidLightScene — primary visual mode (60% of show).
 * Oil-on-glass aesthetic via GLSL domain warping.
 * Assembles AudioReactiveCanvas + FullscreenQuad.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { liquidLightVert, liquidLightFrag } from "../shaders/liquid-light";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const LiquidLightScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={liquidLightVert}
        fragmentShader={liquidLightFrag}
      />
    </AudioReactiveCanvas>
  );
};
