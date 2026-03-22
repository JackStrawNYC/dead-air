/**
 * MountainFireScene — wildfire blazing behind mountain silhouettes.
 * Layered mountain ridges, fire glow, rising embers, smoke, dramatic sky.
 * FullscreenQuad GLSL — guaranteed headless Chrome / ANGLE compatibility.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { mountainFireGlslVert, mountainFireGlslFrag } from "../shaders/mountain-fire-glsl";
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
        vertexShader={mountainFireGlslVert}
        fragmentShader={mountainFireGlslFrag}
      />
    </AudioReactiveCanvas>
  );
};
