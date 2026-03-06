/**
 * CosmicVoyageScene — volumetric raymarching through 3D fractal nebula clouds.
 * Primary mode for Drums/Space. Deep, immersive flythrough visuals.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { cosmicVoyageVert, cosmicVoyageFrag } from "../shaders/cosmic-voyage";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const CosmicVoyageScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <FullscreenQuad
        vertexShader={cosmicVoyageVert}
        fragmentShader={cosmicVoyageFrag}
      />
    </AudioReactiveCanvas>
  );
};
