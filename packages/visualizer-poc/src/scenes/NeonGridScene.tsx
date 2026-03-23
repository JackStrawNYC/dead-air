/**
 * NeonGridScene — Perspective laser grid with intersection node strobes on beat.
 * Synthwave-inspired vanishing-point grid with neon glow and scan lines.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { neonGridVert, neonGridFrag } from "../shaders/neon-grid";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const NeonGridScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={neonGridVert}
        fragmentShader={neonGridFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
