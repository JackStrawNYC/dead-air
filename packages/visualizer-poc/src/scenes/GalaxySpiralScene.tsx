/**
 * GalaxySpiralScene — overhead spiral galaxy with logarithmic arms,
 * dust lanes, nebula emission, and star density modulation.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { galaxySpiralVert, galaxySpiralFrag } from "../shaders/galaxy-spiral";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const GalaxySpiralScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={galaxySpiralVert}
        fragmentShader={galaxySpiralFrag}
      />
    </AudioReactiveCanvas>
  );
};
