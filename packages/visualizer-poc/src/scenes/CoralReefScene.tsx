/**
 * CoralReefScene — underwater coral garden with polyps, bioluminescent plankton,
 * caustic light overlay, and swaying anemone tentacles.
 * No feedback — fully procedural.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { coralReefVert, coralReefFrag } from "../shaders/coral-reef";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const CoralReefScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={coralReefVert}
        fragmentShader={coralReefFrag}
      />
    </AudioReactiveCanvas>
  );
};
