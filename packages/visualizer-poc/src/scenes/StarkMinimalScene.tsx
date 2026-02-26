/**
 * StarkMinimalScene — clean geometric abstraction.
 * High contrast, slow-moving shapes, mostly monochrome with accent color.
 * Best for contemplative/acoustic sections and low-energy passages.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { starkMinimalVert, starkMinimalFrag } from "../shaders/stark-minimal";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const StarkMinimalScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={starkMinimalVert}
        fragmentShader={starkMinimalFrag}
      />
    </AudioReactiveCanvas>
  );
};
