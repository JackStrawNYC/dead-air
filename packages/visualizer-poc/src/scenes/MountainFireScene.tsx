/**
 * MountainFireScene — blazing wildfire behind a mountain silhouette at night.
 * Massive dynamic range from faint campfire glow to raging inferno.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { mountainFireVert, mountainFireFrag } from "../shaders/mountain-fire";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MountainFireScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={mountainFireVert}
        fragmentShader={mountainFireFrag}
      />
    </AudioReactiveCanvas>
  );
};
