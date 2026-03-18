/**
 * VJSceneWrapper — factory for creating VJ scene components from shader pairs.
 * createVJScene(vert, frag) → R3F component using VJFullscreenQuad.
 * createVJFeedbackScene(vert, frag) → R3F component using VJFeedbackQuad (ping-pong buffer).
 */

import React from "react";
import { VJFullscreenQuad } from "../engine/VJFullscreenQuad";
import { VJFeedbackQuad } from "../engine/VJFeedbackQuad";

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

/** Create a VJ scene component with feedback (ping-pong buffer) support */
export function createVJFeedbackScene(
  vertexShader: string,
  fragmentShader: string,
  _name?: string,
  decay?: number,
): React.FC {
  const VJFeedbackScene: React.FC = () => {
    return (
      <VJFeedbackQuad
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        decay={decay}
      />
    );
  };
  VJFeedbackScene.displayName = _name ?? "VJFeedbackScene";
  return VJFeedbackScene;
}
