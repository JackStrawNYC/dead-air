/**
 * ElectricArcScene — Tesla coil lightning field with feedback trails.
 * Uses MultiPassQuad with feedback for arc persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { electricArcVert, electricArcFrag } from "../shaders/electric-arc";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ElectricArcScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={electricArcVert}
        fragmentShader={electricArcFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
