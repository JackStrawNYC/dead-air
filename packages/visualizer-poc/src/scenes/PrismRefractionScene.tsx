/**
 * PrismRefractionScene — Prismatic light splitting into spectral components.
 * Crystal prism SDF with rainbow dispersion, holographic iridescence,
 * and chromatic channel offsets.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { prismRefractionVert, prismRefractionFrag } from "../shaders/prism-refraction";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const PrismRefractionScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={prismRefractionVert}
        fragmentShader={prismRefractionFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
