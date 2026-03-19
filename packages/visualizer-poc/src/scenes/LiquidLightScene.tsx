/**
 * LiquidLightScene — primary visual mode (60% of show).
 * Oil-on-glass aesthetic via GLSL domain warping.
 * Assembles AudioReactiveCanvas + FullscreenQuad.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { liquidLightVert, liquidLightFrag } from "../shaders/liquid-light";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const LiquidLightScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={liquidLightVert}
        fragmentShader={liquidLightFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
