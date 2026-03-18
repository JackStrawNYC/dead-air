/**
 * MandalaEngineScene — concentric petal rings with N-fold symmetry.
 * Chord index drives petal count; FBM domain warp for organic breathing.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { mandalaEngineVert, mandalaEngineFrag } from "../shaders/mandala-engine";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MandalaEngineScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={mandalaEngineVert}
        fragmentShader={mandalaEngineFrag}
      />
    </AudioReactiveCanvas>
  );
};
