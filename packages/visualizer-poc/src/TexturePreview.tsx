/**
 * TexturePreview — renders a texture component for PNG export.
 * Similar to OverlayPreview but for pure texture generators.
 *
 * Usage:
 *   npx remotion still src/overlay-entry.ts TexturePreview --frame 0 \
 *     --output public/assets/textures/liquid-light-1.png --image-format png \
 *     --props '{"textureName":"LiquidLightTexture","variant":1}'
 */

import React from "react";
import { LiquidLightTexture } from "./components/textures/LiquidLightTexture";
import { TieDyeFabricTexture } from "./components/textures/TieDyeFabricTexture";
import { SmokeHazeTexture } from "./components/textures/SmokeHazeTexture";
import { PsychedelicPosterTexture } from "./components/textures/PsychedelicPosterTexture";

const TEXTURE_MAP: Record<string, React.FC<{ variant?: number }>> = {
  LiquidLightTexture,
  TieDyeFabricTexture,
  SmokeHazeTexture,
  PsychedelicPosterTexture,
};

interface Props {
  textureName?: string;
  variant?: number;
}

export const TexturePreview: React.FC<Props> = ({
  textureName = "LiquidLightTexture",
  variant = 1,
}) => {
  const Component = TEXTURE_MAP[textureName];
  if (!Component) {
    return <div style={{ width: "100%", height: "100%", background: "magenta" }} />;
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}>
      <Component variant={variant} />
    </div>
  );
};
