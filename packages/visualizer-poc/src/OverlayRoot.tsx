import React from "react";
import { Composition } from "remotion";
import { OverlayPreview } from "./OverlayPreview";
import { TexturePreview } from "./TexturePreview";

export const OverlayRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OverlayPreview"
        component={OverlayPreview as any}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ overlayName: "BreathingStealie" }}
      />
      <Composition
        id="TexturePreview"
        component={TexturePreview as any}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ textureName: "LiquidLightTexture", variant: 1 }}
      />
    </>
  );
};
