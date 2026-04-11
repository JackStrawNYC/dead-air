/**
 * Camera behavior profiles — named configurations for compute3DCamera().
 *
 * Each profile controls orbital motion, shake intensity, FOV range, and DOF
 * behavior. Songs can specify a camera profile in their SongIdentity to get
 * a different camera feel (contemplative ballad vs driving rocker).
 */

export interface CameraProfile {
  /** Base orbit radius (world units). Default: 3.5 */
  orbitRadius: number;
  /** Energy shrinks radius by this factor. Default: 0.5 */
  energyRadiusShrink: number;
  /** Orbital angular speed multiplier. Default: 0.02 */
  orbitSpeed: number;
  /** Orbital vertical bob amplitude. Default: 0.3 */
  orbitBobAmplitude: number;
  /** Orbital vertical bob speed. Default: 0.015 */
  orbitBobSpeed: number;

  /** Bass shake amplitude [x, y, z]. Default: [0.06, 0.04, 0.03] */
  shakeAmplitude: [number, number, number];
  /** Bass shake frequencies [x, y, z] in Hz. Default: [3.7, 2.3, 4.1] */
  shakeFrequency: [number, number, number];

  /** Drum jolt amplitude [x, y, z]. Default: [0.08, 0.06, 0.04] */
  joltAmplitude: [number, number, number];
  /** Drum jolt frequencies [x, y, z] in Hz. Default: [7.3, 5.1, 6.7] */
  joltFrequency: [number, number, number];
  /** Drum onset threshold to trigger jolt. Default: 0.5 */
  joltThreshold: number;

  /** Target sway amplitude [x, y]. Default: [0.1, 0.05] */
  targetSway: [number, number];
  /** Target sway speed [x, y]. Default: [0.01, 0.008] */
  targetSwaySpeed: [number, number];

  /** Base FOV in degrees. Default: 50 */
  baseFov: number;
  /** Energy adds this to FOV. Default: 10 */
  energyFovBoost: number;
  /** FOV clamp range. Default: [45, 65] */
  fovRange: [number, number];

  /** Energy DOF contribution. Default: 0.4 */
  dofEnergyFactor: number;
  /** Climax DOF contribution. Default: 0.3 */
  dofClimaxFactor: number;
  /** Base focus distance. Default: 3.0 */
  baseFocusDistance: number;
  /** Energy shrinks focus distance by this. Default: 1.0 */
  energyFocusShrink: number;
  /** Focus distance clamp range. Default: [2, 5] */
  focusRange: [number, number];
}

/** Default camera profile — matches current hardcoded values exactly */
export const DEFAULT_CAMERA_PROFILE: CameraProfile = {
  orbitRadius: 3.5,
  energyRadiusShrink: 0.5,
  orbitSpeed: 0.02,
  orbitBobAmplitude: 0.3,
  orbitBobSpeed: 0.015,

  shakeAmplitude: [0.06, 0.04, 0.03],
  shakeFrequency: [3.7, 2.3, 4.1],

  joltAmplitude: [0.08, 0.06, 0.04],
  joltFrequency: [7.3, 5.1, 6.7],
  joltThreshold: 0.5,

  targetSway: [0.1, 0.05],
  targetSwaySpeed: [0.01, 0.008],

  baseFov: 50,
  energyFovBoost: 10,
  fovRange: [45, 65],

  dofEnergyFactor: 0.4,
  dofClimaxFactor: 0.3,
  baseFocusDistance: 3.0,
  energyFocusShrink: 1.0,
  focusRange: [2, 5],
};

/** Contemplative — slow orbit, minimal shake, narrow FOV (ballads, space) */
export const CONTEMPLATIVE_CAMERA: CameraProfile = {
  ...DEFAULT_CAMERA_PROFILE,
  orbitRadius: 4.0,
  energyRadiusShrink: 0.2,
  orbitSpeed: 0.01,
  orbitBobAmplitude: 0.15,
  orbitBobSpeed: 0.008,
  shakeAmplitude: [0.02, 0.015, 0.01],
  joltAmplitude: [0.03, 0.02, 0.015],
  baseFov: 45,
  energyFovBoost: 5,
  fovRange: [40, 55],
};

/** Driving — tighter orbit, stronger shake, wider FOV (rockers, jams) */
export const DRIVING_CAMERA: CameraProfile = {
  ...DEFAULT_CAMERA_PROFILE,
  orbitRadius: 3.0,
  energyRadiusShrink: 0.8,
  orbitSpeed: 0.03,
  orbitBobAmplitude: 0.4,
  shakeAmplitude: [0.09, 0.06, 0.05],
  joltAmplitude: [0.12, 0.09, 0.06],
  baseFov: 55,
  energyFovBoost: 15,
  fovRange: [45, 70],
};

/** Intimate — very close, almost no shake, narrow FOV (tender vocals) */
export const INTIMATE_CAMERA: CameraProfile = {
  ...DEFAULT_CAMERA_PROFILE,
  orbitRadius: 2.5,
  energyRadiusShrink: 0.1,
  orbitSpeed: 0.008,
  orbitBobAmplitude: 0.1,
  orbitBobSpeed: 0.006,
  shakeAmplitude: [0.01, 0.008, 0.005],
  joltAmplitude: [0.02, 0.015, 0.01],
  targetSway: [0.05, 0.03],
  baseFov: 42,
  energyFovBoost: 3,
  fovRange: [38, 50],
  dofEnergyFactor: 0.6,
  dofClimaxFactor: 0.4,
};

/** Expansive — wide orbit, gentle movement, maximum FOV (cosmic, peaks) */
export const EXPANSIVE_CAMERA: CameraProfile = {
  ...DEFAULT_CAMERA_PROFILE,
  orbitRadius: 5.0,
  energyRadiusShrink: 1.0,
  orbitSpeed: 0.015,
  orbitBobAmplitude: 0.5,
  shakeAmplitude: [0.04, 0.03, 0.02],
  baseFov: 55,
  energyFovBoost: 15,
  fovRange: [45, 75],
  baseFocusDistance: 4.0,
  focusRange: [2, 7],
};

/** Named profile lookup */
export const CAMERA_PROFILES: Record<string, CameraProfile> = {
  default: DEFAULT_CAMERA_PROFILE,
  contemplative: CONTEMPLATIVE_CAMERA,
  driving: DRIVING_CAMERA,
  intimate: INTIMATE_CAMERA,
  expansive: EXPANSIVE_CAMERA,
};
