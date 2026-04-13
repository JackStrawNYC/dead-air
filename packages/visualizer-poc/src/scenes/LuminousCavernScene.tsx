import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { FullscreenQuad } from "../components/FullscreenQuad";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { luminousCavernVert, luminousCavernFrag } from "../shaders/luminous-cavern";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const LuminousCavernScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <FullscreenQuad
        vertexShader={luminousCavernVert}
        fragmentShader={luminousCavernFrag}
      />
    </AudioReactiveCanvas>
  );
};
