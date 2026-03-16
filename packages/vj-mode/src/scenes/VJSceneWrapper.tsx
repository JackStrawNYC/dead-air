/**
 * VJSceneWrapper — factory for creating VJ scene components from shader pairs.
 * createVJScene(vert, frag) → R3F component using VJFullscreenQuad.
 */

import React from "react";
import { VJFullscreenQuad } from "../engine/VJFullscreenQuad";

/** Create a VJ scene component from a vertex/fragment shader pair */
export function createVJScene(
  vertexShader: string,
  fragmentShader: string,
  _name?: string,
): React.FC {
  const VJScene: React.FC = () => {
    return (
      <VJFullscreenQuad
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    );
  };
  VJScene.displayName = _name ?? "VJScene";
  return VJScene;
}
