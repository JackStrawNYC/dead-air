/**
 * LavaFlowScene — viscous fluid with cooling crust.
 * Uses MultiPassQuad with feedback for cooling persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { lavaFlowVert, lavaFlowFrag } from "../shaders/lava-flow";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const LavaFlowScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={lavaFlowVert}
        fragmentShader={lavaFlowFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
