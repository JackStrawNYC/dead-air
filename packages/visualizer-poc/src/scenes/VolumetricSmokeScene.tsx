/**
 * VolumetricSmokeScene — concert smoke with volumetric spotlights.
 * Single-pass FullscreenQuad (no feedback needed).
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { volumetricSmokeVert, volumetricSmokeFrag } from "../shaders/volumetric-smoke";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const VolumetricSmokeScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={volumetricSmokeVert}
        fragmentShader={volumetricSmokeFrag}
      />
    </AudioReactiveCanvas>
  );
};
