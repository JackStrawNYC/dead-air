/**
 * ConcertLightingScene — concert-style volumetric beams + stage silhouette.
 * Beat-triggered flash, beam sweep driven by audio.
 * Uses fullscreen quad shader approach (ANGLE-friendly, no ray marching).
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { concertBeamsVert, concertBeamsFrag } from "../shaders/concert-beams";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const ConcertLightingScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={concertBeamsVert}
        fragmentShader={concertBeamsFrag}
      />
    </AudioReactiveCanvas>
  );
};
