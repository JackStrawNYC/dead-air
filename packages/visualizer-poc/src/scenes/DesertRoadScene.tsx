/**
 * DesertRoadScene — endless highway through desert landscape under a vast sky.
 * Warm oranges, dusty atmosphere, mesa silhouettes, forward momentum.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { desertRoadVert, desertRoadFrag } from "../shaders/desert-road";
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
        vertexShader={desertRoadVert}
        fragmentShader={desertRoadFrag}
      />
    </AudioReactiveCanvas>
  );
};
