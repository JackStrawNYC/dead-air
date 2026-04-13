/**
 * SceneConfigContext — provides per-scene configuration from the scene registry
 * to FullscreenQuad/MultiPassQuad without requiring prop drilling through scene components.
 */

import { createContext, useContext } from "react";
import { type CameraProfile, DEFAULT_CAMERA_PROFILE } from "../config/camera-profiles";
import type { ShaderParameterProfile } from "../config/shader-parameters";
import type { PostProcessConfig } from "../shaders/shared/postprocess.glsl";

export interface SceneConfig {
  /** Post-process grading intensity (0-1, default 1.0). Lower = more raw color. */
  gradingIntensity: number;
  /** Camera behavior profile. Default: DEFAULT_CAMERA_PROFILE */
  cameraProfile?: CameraProfile;
  /** Per-song shader parameter modulation. Defaults to identity (1.0 scales, 0.0 biases). */
  shaderParams?: ShaderParameterProfile;
  /** Per-shader post-processing personality from the scene registry. */
  postProcessOverrides?: Partial<PostProcessConfig>;
}

const DEFAULT_CONFIG: SceneConfig = {
  gradingIntensity: 1.0,
  cameraProfile: DEFAULT_CAMERA_PROFILE,
};

const SceneConfigCtx = createContext<SceneConfig>(DEFAULT_CONFIG);

export const SceneConfigProvider = SceneConfigCtx.Provider;

export function useSceneConfig(): SceneConfig {
  return useContext(SceneConfigCtx);
}
