/**
 * CosmicDustScene — starfield with slow cosmic drift and nebula clouds.
 * Works well for Space/quiet passages. Deep, contemplative visuals.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { cosmicDustVert, cosmicDustFrag } from "../shaders/cosmic-dust";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const CosmicDustScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={cosmicDustVert}
        fragmentShader={cosmicDustFrag}
      />
    </AudioReactiveCanvas>
  );
};
