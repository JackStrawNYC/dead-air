/**
 * SignalDecayScene — CRT losing signal with scanline drift, horizontal hold
 * failure, vertical roll, snow intrusion, and beat-synchronized recovery.
 * Uses MultiPassQuad with feedback for signal coherence state persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { signalDecayVert, signalDecayFrag } from "../shaders/signal-decay";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const SignalDecayScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={signalDecayVert}
        fragmentShader={signalDecayFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
