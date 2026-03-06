/**
 * AuroraScene — northern lights curtains of luminous color over a starfield.
 * Slow, organic movement for tender/contemplative songs.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { auroraVert, auroraFrag } from "../shaders/aurora";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const AuroraScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={auroraVert}
        fragmentShader={auroraFrag}
      />
    </AudioReactiveCanvas>
  );
};
