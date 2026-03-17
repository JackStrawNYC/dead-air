/**
 * ParticleSwarmScene — Boid-like flocking particles as a density field.
 * Emergent swarm behavior with audio-driven cohesion and separation.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import { particleSwarmVert, particleSwarmFrag } from "../shaders/particle-swarm";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ParticleSwarmScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={particleSwarmVert}
        fragmentShader={particleSwarmFrag}
      />
    </AudioReactiveCanvas>
  );
};
