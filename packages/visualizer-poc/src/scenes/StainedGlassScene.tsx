/**
 * StainedGlassScene — gothic tessellation with light transmission.
 * Single-pass FullscreenQuad (no feedback needed).
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { stainedGlassVert, stainedGlassFrag } from "../shaders/stained-glass";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const StainedGlassScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={stainedGlassVert}
        fragmentShader={stainedGlassFrag}
      />
    </AudioReactiveCanvas>
  );
};
