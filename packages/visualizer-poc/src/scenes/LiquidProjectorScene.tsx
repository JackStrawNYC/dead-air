/**
 * LiquidProjectorScene — colored oils mixing on an overhead projector glass.
 * The actual visual technology used at Dead shows from 1966-1995.
 * Bill Ham and Glenn McKay pioneered this: mineral oils, water, and dyes
 * on a heated glass plate projected onto a wall.
 * AudioReactiveCanvas + MultiPassQuad with feedback for oil persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { liquidProjectorVert, liquidProjectorFrag } from "../shaders/liquid-projector";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const LiquidProjectorScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <MultiPassQuad
        vertexShader={liquidProjectorVert}
        fragmentShader={liquidProjectorFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
