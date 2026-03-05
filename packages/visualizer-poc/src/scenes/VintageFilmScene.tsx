/**
 * VintageFilmScene — 16mm film projector simulation with light leaks,
 * sprocket holes, gate weave, and grain. References actual concert
 * film footage aesthetic. Best for mid-energy sections.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { vintageFilmVert, vintageFilmFrag } from "../shaders/vintage-film";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const VintageFilmScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={vintageFilmVert}
        fragmentShader={vintageFilmFrag}
      />
    </AudioReactiveCanvas>
  );
};
