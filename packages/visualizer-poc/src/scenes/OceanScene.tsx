/**
 * OceanScene — vast open ocean with rolling waves, horizon, and sky.
 * Deep blue water with foam crests, swell, sun path, atmospheric sky.
 * FullscreenQuad GLSL — guaranteed headless Chrome / ANGLE compatibility.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { oceanGlslVert, oceanGlslFrag } from "../shaders/ocean-glsl";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const OceanScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={oceanGlslVert}
        fragmentShader={oceanGlslFrag}
      />
    </AudioReactiveCanvas>
  );
};
