/**
 * AuroraSkyScene — realistic aurora borealis curtains over a vast night sky.
 * Star field, mountain silhouette, volumetric curtain raymarching.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { auroraSkyVert, auroraSkyFrag } from "../shaders/aurora-sky";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const AuroraSkyScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={auroraSkyVert}
        fragmentShader={auroraSkyFrag}
      />
    </AudioReactiveCanvas>
  );
};
