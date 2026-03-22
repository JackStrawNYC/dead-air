/**
 * CampfireScene — warm bonfire under a starfield sky.
 * Ground-level bonfire with rising embers, tree silhouettes, warm ground glow.
 * FullscreenQuad GLSL — guaranteed headless Chrome / ANGLE compatibility.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { campfireGlslVert, campfireGlslFrag } from "../shaders/campfire-glsl";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const CampfireScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={campfireGlslVert}
        fragmentShader={campfireGlslFrag}
      />
    </AudioReactiveCanvas>
  );
};
