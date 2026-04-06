/**
 * EmberMeadowScene — soft golden nebula clouds via layered FBM.
 * Amber/copper/rose palette with particle dust. Contemplative, slow movement.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { emberMeadowVert, emberMeadowFrag } from "../shaders/ember-meadow";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const EmberMeadowScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={emberMeadowVert}
        fragmentShader={emberMeadowFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
