/**
 * FractalFlamesScene — IFS fractal flames with temporal feedback accumulation.
 * Uses MultiPassQuad with feedback for persistent flame structures.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { fractalFlamesVert, fractalFlamesFrag } from "../shaders/fractal-flames";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const FractalFlamesScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={fractalFlamesVert}
        fragmentShader={fractalFlamesFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
