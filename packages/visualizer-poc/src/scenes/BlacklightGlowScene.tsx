/**
 * BlacklightGlowScene — UV blacklight reactive neon visuals.
 * Dark purple-black background with vivid neon glowing organic shapes
 * (amoeba blobs, mushroom caps, spore particles) pulsing with the music.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { blacklightGlowVert, blacklightGlowFrag } from "../shaders/blacklight-glow";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const BlacklightGlowScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={blacklightGlowVert}
        fragmentShader={blacklightGlowFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
