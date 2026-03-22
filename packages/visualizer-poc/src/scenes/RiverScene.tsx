/**
 * RiverScene — flowing river with reflections, bank vegetation, sky mirror.
 * Serene flowing water with ripples, overhanging trees, atmospheric mist.
 * FullscreenQuad GLSL — guaranteed headless Chrome / ANGLE compatibility.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { riverGlslVert, riverGlslFrag } from "../shaders/river-glsl";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const RiverScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={riverGlslVert}
        fragmentShader={riverGlslFrag}
      />
    </AudioReactiveCanvas>
  );
};
