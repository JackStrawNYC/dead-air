/**
 * DesertRoadScene — endless highway through desert landscape.
 * Perspective road, mesa silhouettes, heat shimmer, dust, desert sky.
 * FullscreenQuad GLSL — guaranteed headless Chrome / ANGLE compatibility.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { desertRoadGlslVert, desertRoadGlslFrag } from "../shaders/desert-road-glsl";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const DesertRoadScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={desertRoadGlslVert}
        fragmentShader={desertRoadGlslFrag}
      />
    </AudioReactiveCanvas>
  );
};
