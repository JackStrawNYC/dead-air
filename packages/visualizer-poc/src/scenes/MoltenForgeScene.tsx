import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { moltenForgeVert, moltenForgeFrag } from "../shaders/molten-forge";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MoltenForgeScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={moltenForgeVert}
        fragmentShader={moltenForgeFrag}
      />
    </AudioReactiveCanvas>
  );
};
