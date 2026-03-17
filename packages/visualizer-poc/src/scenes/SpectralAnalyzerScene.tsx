/**
 * SpectralAnalyzerScene — FFT frequency bar visualization.
 * Classic concert VJ staple with 7 frequency-mapped bars.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { spectralAnalyzerVert, spectralAnalyzerFrag } from "../shaders/spectral-analyzer";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const SpectralAnalyzerScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={spectralAnalyzerVert}
        fragmentShader={spectralAnalyzerFrag}
      />
    </AudioReactiveCanvas>
  );
};
