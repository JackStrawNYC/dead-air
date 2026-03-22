/**
 * ForestScene — deep woodland with volumetric fog, tree trunks, and fireflies.
 * Calm and immersive for contemplative songs; massive dynamic range from
 * impenetrable fog to sun-dappled clearing.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { forestVert, forestFrag } from "../shaders/forest";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ForestScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={forestVert}
        fragmentShader={forestFrag}
      />
    </AudioReactiveCanvas>
  );
};
