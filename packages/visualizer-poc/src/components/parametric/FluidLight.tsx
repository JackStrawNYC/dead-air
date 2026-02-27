/**
 * FluidLight — Parametric GLSL liquid light projector (via AudioReactiveCanvas).
 *
 * 6 variants using domain-warped fractal noise for true oil-on-glass aesthetics.
 * The crown jewel of the parametric library. Weight=3 so only 1 active at a time.
 * Uses existing AudioReactiveCanvas + FullscreenQuad infrastructure.
 */

import React from "react";
import { AudioReactiveCanvas } from "../AudioReactiveCanvas";
import { FullscreenQuad } from "../FullscreenQuad";
import {
  fluidLightVert,
  oilGlassFrag,
  lavaFlowFrag,
  auroraFrag,
  smokeWispsFrag,
  plasmaFieldFrag,
  inkWaterFrag,
} from "./FluidLight.frag";
import type { EnhancedFrameData } from "../../data/types";
import { useSongPalette } from "../../data/SongPaletteContext";
import type { OverlayProps } from "./types";

// ─── Factory ───

function createFluidLightVariant(
  name: string,
  fragmentShader: string,
): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const palette = useSongPalette();

    return (
      <AudioReactiveCanvas
        frames={frames}
        palette={palette}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <FullscreenQuad
          vertexShader={fluidLightVert}
          fragmentShader={fragmentShader}
        />
      </AudioReactiveCanvas>
    );
  };

  Component.displayName = `FluidLight_${name}`;
  return Component;
}

// ─── Exports ───

export const FluidLight_OilGlass = createFluidLightVariant("OilGlass", oilGlassFrag);
export const FluidLight_LavaFlow = createFluidLightVariant("LavaFlow", lavaFlowFrag);
export const FluidLight_Aurora = createFluidLightVariant("Aurora", auroraFrag);
export const FluidLight_SmokeWisps = createFluidLightVariant("SmokeWisps", smokeWispsFrag);
export const FluidLight_PlasmaField = createFluidLightVariant("PlasmaField", plasmaFieldFrag);
export const FluidLight_InkWater = createFluidLightVariant("InkWater", inkWaterFrag);
