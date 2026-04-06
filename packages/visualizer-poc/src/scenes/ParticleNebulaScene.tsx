/**
 * ParticleNebulaScene — raymarched volumetric nebula with embedded star
 * clusters and particle filaments. Single-pass FullscreenQuad.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { particleNebulaVert, particleNebulaFrag } from "../shaders/particle-nebula";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ParticleNebulaScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={particleNebulaVert}
        fragmentShader={particleNebulaFrag}
      />
    </AudioReactiveCanvas>
  );
};
