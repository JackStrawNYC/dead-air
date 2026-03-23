/**
 * AcidMeltScene — Multi-layer FBM domain warping for classic psychedelic visuals.
 * Surfaces melting, breathing, morphing. Everything looks alive and gently warping.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { acidMeltVert, acidMeltFrag } from "../shaders/acid-melt";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const AcidMeltScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={acidMeltVert}
        fragmentShader={acidMeltFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
