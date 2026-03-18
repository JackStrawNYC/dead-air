/**
 * VJSceneWrapper — factory for creating VJ scene components from shader pairs.
 * createVJScene(vert, frag) → R3F component using VJFullscreenQuad.
 * createVJFeedbackScene(vert, frag) → R3F component using VJFeedbackQuad (ping-pong buffer).
 *
 * All shaders are injected with VJ PostProcess controls (uniform-gated FX).
 */

import React from "react";
import { VJFullscreenQuad } from "../engine/VJFullscreenQuad";
import { VJFeedbackQuad } from "../engine/VJFeedbackQuad";
import { injectVJPostProcess } from "../engine/VJPostProcess";

/** Create a VJ scene component from a vertex/fragment shader pair */
export function createVJScene(
  vertexShader: string,
  fragmentShader: string,
  _name?: string,
): React.FC {
  const processedFragment = injectVJPostProcess(fragmentShader);
  const VJScene: React.FC = () => {
    return (
      <VJFullscreenQuad
        vertexShader={vertexShader}
        fragmentShader={processedFragment}
      />
    );
  };
  VJScene.displayName = _name ?? "VJScene";
  return VJScene;
}

/** Create a VJ scene component with feedback (ping-pong buffer) support */
export function createVJFeedbackScene(
  vertexShader: string,
  fragmentShader: string,
  _name?: string,
  decay?: number,
): React.FC {
  const processedFragment = injectVJPostProcess(fragmentShader);
  const VJFeedbackScene: React.FC = () => {
    return (
      <VJFeedbackQuad
        vertexShader={vertexShader}
        fragmentShader={processedFragment}
        decay={decay}
      />
    );
  };
  VJFeedbackScene.displayName = _name ?? "VJFeedbackScene";
  return VJFeedbackScene;
}
