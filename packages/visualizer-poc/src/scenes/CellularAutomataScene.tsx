/**
 * CellularAutomataScene — hexagonal cellular automata with feedback persistence.
 * Organic cell division/multiplication patterns on a hex grid with glowing walls.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { cellularAutomataVert, cellularAutomataFrag } from "../shaders/cellular-automata";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const CellularAutomataScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={cellularAutomataVert}
        fragmentShader={cellularAutomataFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
