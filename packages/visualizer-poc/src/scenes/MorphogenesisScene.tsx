/**
 * MorphogenesisScene — activator-inhibitor Turing growth patterns.
 * Uses MultiPassQuad with feedback for simulation state persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { morphogenesisVert, morphogenesisFrag } from "../shaders/morphogenesis";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MorphogenesisScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={morphogenesisVert}
        fragmentShader={morphogenesisFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
