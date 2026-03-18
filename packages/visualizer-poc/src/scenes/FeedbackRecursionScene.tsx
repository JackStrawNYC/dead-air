/**
 * FeedbackRecursionScene — infinite-regress tunnel via video feedback.
 * Uses MultiPassQuad with feedback for recursive frame compositing.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { feedbackRecursionVert, feedbackRecursionFrag } from "../shaders/feedback-recursion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const FeedbackRecursionScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={feedbackRecursionVert}
        fragmentShader={feedbackRecursionFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
