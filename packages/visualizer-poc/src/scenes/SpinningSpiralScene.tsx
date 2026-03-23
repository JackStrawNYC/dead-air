/**
 * SpinningSpiralScene — hypnotic rotating vortex with rainbow color cycling.
 * Classic 60s psychedelia: the spinning spiral behind the band at the Acid Tests.
 * Uses MultiPassQuad with feedback for rotational motion blur trails.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { spinningSpiralVert, spinningSpiralFrag } from "../shaders/spinning-spiral";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const SpinningSpiralScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={spinningSpiralVert}
        fragmentShader={spinningSpiralFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
