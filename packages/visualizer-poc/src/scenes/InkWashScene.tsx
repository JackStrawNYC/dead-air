/**
 * InkWashScene — Sumi-e inspired watercolor bleeding with calligraphic strokes.
 * Uses MultiPassQuad with feedback for ink persistence (paper absorbs ink).
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { inkWashVert, inkWashFrag } from "../shaders/ink-wash";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const InkWashScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={inkWashVert}
        fragmentShader={inkWashFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
