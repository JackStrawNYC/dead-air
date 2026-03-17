/**
 * CrystallineGrowthScene — procedural crystal formations with prismatic light.
 * Voronoi-based lattice that grows with energy and fractures on onset.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { crystallineGrowthVert, crystallineGrowthFrag } from "../shaders/crystalline-growth";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const CrystallineGrowthScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={crystallineGrowthVert}
        fragmentShader={crystallineGrowthFrag}
      />
    </AudioReactiveCanvas>
  );
};
