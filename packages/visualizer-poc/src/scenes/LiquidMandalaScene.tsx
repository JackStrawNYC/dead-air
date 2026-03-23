/**
 * LiquidMandalaScene — Psychedelic concentric color-shifting rings in polar coordinates.
 * FBM domain warp on ring edges. Palette hue cycling with beat-driven ring pulses.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { liquidMandalaVert, liquidMandalaFrag } from "../shaders/liquid-mandala";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const LiquidMandalaScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={liquidMandalaVert}
        fragmentShader={liquidMandalaFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
