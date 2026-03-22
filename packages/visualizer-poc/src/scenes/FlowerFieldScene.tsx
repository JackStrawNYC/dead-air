/**
 * FlowerFieldScene — art nouveau flower field that blooms and sways with music.
 * Stylized SDF flowers, warm pastels, butterflies, golden hour sky.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { flowerFieldVert, flowerFieldFrag } from "../shaders/flower-field";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const FlowerFieldScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={flowerFieldVert}
        fragmentShader={flowerFieldFrag}
      />
    </AudioReactiveCanvas>
  );
};
