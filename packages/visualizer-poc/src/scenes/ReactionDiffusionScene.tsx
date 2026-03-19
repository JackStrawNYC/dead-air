/**
 * ReactionDiffusionScene — Gray-Scott-inspired Turing patterns via FBM domain warping.
 * Single-pass approximation of reaction-diffusion dynamics with audio reactivity.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { reactionDiffusionVert, reactionDiffusionFrag } from "../shaders/reaction-diffusion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ReactionDiffusionScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={reactionDiffusionVert}
        fragmentShader={reactionDiffusionFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
