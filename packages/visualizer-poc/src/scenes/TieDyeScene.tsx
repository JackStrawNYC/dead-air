/**
 * TieDyeScene — swirling tie-dye color wash, classic Dead aesthetic.
 * Radial gradient rotation with palette-locked hue bands.
 * Best for high-energy sections.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { tieDyeVert, tieDyeFrag } from "../shaders/tie-dye";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const TieDyeScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={tieDyeVert}
        fragmentShader={tieDyeFrag}
      />
    </AudioReactiveCanvas>
  );
};
