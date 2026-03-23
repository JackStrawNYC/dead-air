/**
 * BioluminescenceScene — Glowing organisms with branching tendrils.
 * Phosphorescent cyan/green/magenta organisms floating in dark void with persistence trails.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { bioluminescenceVert, bioluminescenceFrag } from "../shaders/bioluminescence";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const BioluminescenceScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={bioluminescenceVert}
        fragmentShader={bioluminescenceFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
