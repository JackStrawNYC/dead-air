/**
 * LoFiGrainScene — warm 16mm film aesthetic.
 * Heavy grain, desaturated palette, slow organic movement.
 * Best for early-era shows (primal/classic) and low-energy sections.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { loFiGrainVert, loFiGrainFrag } from "../shaders/lo-fi-grain";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const LoFiGrainScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={loFiGrainVert}
        fragmentShader={loFiGrainFrag}
      />
    </AudioReactiveCanvas>
  );
};
