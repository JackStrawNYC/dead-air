/**
 * SacredGeometryScene — Flower of Life / Metatron's Cube on hex lattice.
 * SDF circles progressively revealed by energy, connecting lines at peak.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { sacredGeometryVert, sacredGeometryFrag } from "../shaders/sacred-geometry";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const SacredGeometryScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={sacredGeometryVert}
        fragmentShader={sacredGeometryFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
