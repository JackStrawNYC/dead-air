/**
 * SceneConfigContext — provides per-scene configuration from the scene registry
 * to FullscreenQuad/MultiPassQuad without requiring prop drilling through scene components.
 */

import { createContext, useContext } from "react";
import { type CameraProfile, DEFAULT_CAMERA_PROFILE } from "../config/camera-profiles";

export interface SceneConfig {
  /** Post-process grading intensity (0-1, default 1.0). Lower = more raw color. */
  gradingIntensity: number;
  /** Camera behavior profile. Default: DEFAULT_CAMERA_PROFILE */
  cameraProfile?: CameraProfile;
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
