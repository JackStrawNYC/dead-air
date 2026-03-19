/**
 * DualShaderScene — renders two GLSL shaders composited via GPU blending.
 *
 * Used for second-set visual richness: two shaders run simultaneously,
 * creating psychedelic depth that a single shader can't achieve.
 * Falls back gracefully when shader strings aren't available.
 */

import React from "react";
import { AudioReactiveCanvas } from "../components/AudioReactiveCanvas";
import { DualShaderQuad, type DualBlendMode } from "../components/DualShaderQuad";
import type { SceneProps } from "./scene-registry";

interface Props extends SceneProps {
  vertA: string;
  fragA: string;
  vertB: string;
  fragB: string;
  blendMode: DualBlendMode;
  blendProgress: number;
}

export const DualShaderScene: React.FC<Props> = ({
  frames, sections, palette, tempo, style, jamDensity,
  vertA, fragA, vertB, fragB, blendMode, blendProgress,
}) => (
  <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
    <DualShaderQuad
      vertexShaderA={vertA}
      fragmentShaderA={fragA}
      vertexShaderB={vertB}
      fragmentShaderB={fragB}
      blendMode={blendMode}
      blendProgress={blendProgress}
    />
  </AudioReactiveCanvas>
);
