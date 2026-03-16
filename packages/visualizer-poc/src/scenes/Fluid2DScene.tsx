/**
 * Fluid2DScene — 2D fluid simulation with ping-pong feedback buffers.
 *
 * Uses MultiPassQuad instead of FullscreenQuad to enable feedback mode:
 * the previous frame's output is passed back as uPrevFrame for advection,
 * diffusion, and persistent fluid state.
 *
 * The fluid effect only works properly during sequential rendering (video
 * export). During Remotion preview/seeking, MultiPassQuad's gap detection
 * resets the feedback buffer so the fluid starts fresh.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { fluid2DVert, fluid2DFrag } from "../shaders/fluid-2d";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const Fluid2DScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={fluid2DVert}
        fragmentShader={fluid2DFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
