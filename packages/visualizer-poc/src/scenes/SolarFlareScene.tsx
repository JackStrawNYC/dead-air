/**
 * SolarFlareScene — stellar surface with granulation, magnetic prominences,
 * and coronal mass ejections on onset.
 * Uses MultiPassQuad with feedback for plasma state persistence.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { MultiPassQuad } from "../components/MultiPassQuad";
import { solarFlareVert, solarFlareFrag } from "../shaders/solar-flare";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const SolarFlareScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <MultiPassQuad
        vertexShader={solarFlareVert}
        fragmentShader={solarFlareFrag}
        feedback
      />
    </AudioReactiveCanvas>
  );
};
