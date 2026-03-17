/**
 * ClimaxSurgeScene — fullscreen spectacle burst for show peaks.
 * Radial shockwaves, prismatic scattering, and starburst rays.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { climaxSurgeVert, climaxSurgeFrag } from "../shaders/climax-surge";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ClimaxSurgeScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={climaxSurgeVert}
        fragmentShader={climaxSurgeFrag}
      />
    </AudioReactiveCanvas>
  );
};
