/**
 * MyceliumNetworkScene — organic branching fungal growth with spore bursts.
 * Uses MultiPassQuad with feedback for growth state persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { myceliumNetworkVert, myceliumNetworkFrag } from "../shaders/mycelium-network";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MyceliumNetworkScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={myceliumNetworkVert}
        fragmentShader={myceliumNetworkFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
