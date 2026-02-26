/**
 * OilProjectorScene — overhead projector oil-lamp aesthetic.
 * Large colorful blobs morphing slowly, high saturation, 1960s light show feel.
 * Best for classic-era shows and mid-energy psychedelic passages.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { oilProjectorVert, oilProjectorFrag } from "../shaders/oil-projector";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const OilProjectorScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={oilProjectorVert}
        fragmentShader={oilProjectorFrag}
      />
    </AudioReactiveCanvas>
  );
};
