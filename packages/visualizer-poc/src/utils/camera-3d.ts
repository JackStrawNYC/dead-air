/**
 * 3D Camera System — pure function mapping audio state to camera parameters.
 *
 * Computes camera position via path generators (orbital, dolly, crane, etc.),
 * then layers bass-driven shake, drum jolts, DOF, and FOV from audio features.
 * CSS camera stays for DOM layers; these uniforms are consumed by GLSL shaders
 * via setupCameraRay().
 */

import {
  type CameraPathType,
  type CameraProfile,
  DEFAULT_CAMERA_PROFILE,
} from "../config/camera-profiles";

export interface Camera3DState {
  /** Camera position in world space */
  position: [number, number, number];
  /** Camera look-at target */
  target: [number, number, number];
  /** Field of view in degrees */
  fov: number;
  /** Depth of field blur strength (0-1) */
  dofStrength: number;
  /** Focus distance in world units */
  focusDistance: number;
}

/** Return type for path generator functions */
interface PathResult {
  position: [number, number, number];
  target: [number, number, number];
}

// ---------------------------------------------------------------------------
// Path generators — each is a pure function producing base position + target.
// Shake, jolt, FOV, and DOF are applied on top by compute3DCamera().
// ---------------------------------------------------------------------------

/** Orbital: circle around the origin (original / default behavior). */
function orbitalPath(
  _time: number, dynamicTime: number, energy: number, _bass: number,
  _sectionProgress: number, profile: CameraProfile, vocalPresence: number,
): PathResult {
  const orbitRadius = profile.orbitRadius - energy * profile.energyRadiusShrink;
  const vocalRadiusMod = vocalPresence > 0.3 ? 0.9 : 1.0;
  const radius = orbitRadius * vocalRadiusMod;

  const orbitAngle = dynamicTime * profile.orbitSpeed;
  const orbitHeight = Math.sin(dynamicTime * profile.orbitBobSpeed) * profile.orbitBobAmplitude;

  const position: [number, number, number] = [
    Math.sin(orbitAngle) * radius,
    orbitHeight,
    Math.cos(orbitAngle) * radius,
  ];

  const target: [number, number, number] = [
    Math.sin(dynamicTime * profile.targetSwaySpeed[0]) * profile.targetSway[0],
    Math.cos(dynamicTime * profile.targetSwaySpeed[1]) * profile.targetSway[1],
    0,
  ];

  return { position, target };
}

/** Dolly: linear forward motion through the scene. */
function dollyPath(
  _time: number, dynamicTime: number, energy: number, _bass: number,
  sectionProgress: number, profile: CameraProfile,
): PathResult {
  const r = profile.orbitRadius;
  // Progress driven by sectionProgress; energy modulates speed via easing
  const speedBias = 1.0 + energy * 0.5;
  const t = Math.min(1, sectionProgress * speedBias);

  // Lerp start → end
  const startZ = -r;
  const endZ = r * 0.5;
  const startY = 0.5;
  const endY = 0.3;

  const z = startZ + (endZ - startZ) * t;
  const y = startY + (endY - startY) * t;
  // Slight lateral sine drift for organic feel
  const x = Math.sin(dynamicTime * 0.012) * 0.3;

  const position: [number, number, number] = [x, y, z];
  // Target: slightly ahead of camera on the path
  const target: [number, number, number] = [x * 0.5, y - 0.1, z + r * 0.3];

  return { position, target };
}

/** Crane: vertical arc from low angle to bird's eye. */
function cranePath(
  _time: number, _dynamicTime: number, energy: number, bass: number,
  sectionProgress: number, profile: CameraProfile,
): PathResult {
  const r = profile.orbitRadius;
  const t = sectionProgress;

  // Parabolic arc: low → peak → down
  // At t=0: low position; t=0.5: highest; t=1: back down
  const arcY = -0.5 + (r * 1.5 + 0.5) * Math.sin(t * Math.PI);
  const arcX = r * 0.3 * (1 - t);
  const arcZ = r * (1 - t);

  // Bass adds subtle vertical bob at peak (where sin is high)
  const peakInfluence = Math.sin(t * Math.PI);
  const bobY = bass * 0.15 * peakInfluence;

  const position: [number, number, number] = [arcX, arcY + bobY, arcZ];
  // Target: origin with slight energy sway
  const target: [number, number, number] = [
    energy * 0.1 * Math.sin(t * 3.0),
    0,
    0,
  ];

  return { position, target };
}

/** Handheld: noise-based organic wandering (documentary/concert feel). */
function handheldPath(
  time: number, dynamicTime: number, energy: number, _bass: number,
  _sectionProgress: number, profile: CameraProfile,
): PathResult {
  const r = profile.orbitRadius;
  // Amplitude scales inversely with orbit speed (slower = calmer handheld)
  const baseAmp = Math.max(0.05, 1.0 - profile.orbitSpeed * 10);
  // Energy increases handheld shake
  const amp = baseAmp * (0.3 + energy * 0.7);

  // 3 octaves of sine-based pseudo-noise per axis (different frequencies)
  const noiseX =
    Math.sin(dynamicTime * 0.017) * 0.5 +
    Math.sin(dynamicTime * 0.041 + 1.3) * 0.3 +
    Math.sin(dynamicTime * 0.089 + 2.7) * 0.2;
  const noiseY =
    Math.sin(dynamicTime * 0.013 + 0.7) * 0.5 +
    Math.sin(dynamicTime * 0.037 + 2.1) * 0.3 +
    Math.sin(dynamicTime * 0.079 + 3.4) * 0.2;
  const noiseZ =
    Math.sin(dynamicTime * 0.011 + 1.9) * 0.5 +
    Math.sin(dynamicTime * 0.031 + 0.5) * 0.3 +
    Math.sin(dynamicTime * 0.071 + 4.1) * 0.2;

  const position: [number, number, number] = [
    noiseX * amp,
    0.5 + noiseY * amp * 0.5,
    r + noiseZ * amp * 0.3,
  ];

  // Target: origin + small noise offset (camera hunting for focus)
  const targetNoise =
    Math.sin(time * 0.023 + 1.1) * 0.05 +
    Math.sin(time * 0.053 + 2.3) * 0.03;
  const target: [number, number, number] = [targetNoise, targetNoise * 0.5, 0];

  return { position, target };
}

/** Static drift: nearly still with micro-movement (contemplative / space). */
function staticDriftPath(
  _time: number, dynamicTime: number, energy: number, _bass: number,
  _sectionProgress: number, profile: CameraProfile,
): PathResult {
  const r = profile.orbitRadius;

  // Extremely slow micro-drift (barely perceptible)
  const x = Math.sin(dynamicTime * 0.003) * 0.15;
  // Energy adds the tiniest sway
  const energySway = energy * 0.03;
  const y = 0.3 + Math.sin(dynamicTime * 0.002) * energySway;
  const z = r + Math.cos(dynamicTime * 0.0025) * 0.05;

  const position: [number, number, number] = [x, y, z];
  // Target: origin, no sway
  const target: [number, number, number] = [0, 0, 0];

  return { position, target };
}

/** Pull-back: slow reveal zoom-out (close → far with ease-out). */
function pullBackPath(
  _time: number, _dynamicTime: number, energy: number, _bass: number,
  sectionProgress: number, profile: CameraProfile,
): PathResult {
  const r = profile.orbitRadius;
  // Ease-out curve: fast start, slow finish — t = 1 - (1-p)^2
  const t = 1 - (1 - sectionProgress) * (1 - sectionProgress);

  const startZ = r * 0.4;
  // Energy affects final distance (more energy = wider reveal)
  const endZ = r * 2.0 + energy * r * 0.5;
  const startY = 0.2;
  const endY = 0.8;

  const z = startZ + (endZ - startZ) * t;
  const y = startY + (endY - startY) * t;

  const position: [number, number, number] = [0, y, z];
  const target: [number, number, number] = [0, 0, 0];

  return { position, target };
}

/** Spiral-in: decreasing radius spiral toward center. */
function spiralInPath(
  _time: number, dynamicTime: number, energy: number, _bass: number,
  sectionProgress: number, profile: CameraProfile,
): PathResult {
  const t = sectionProgress;
  const startRadius = profile.orbitRadius * 1.5;
  const endRadius = profile.orbitRadius * 0.3;
  // Energy at peak triggers tightest point
  const radiusMod = 1.0 - energy * 0.15;

  // Radius decreases linearly with progress
  const currentRadius = (startRadius + (endRadius - startRadius) * t) * radiusMod;

  // Angular speed increases as radius decreases (conservation of angular momentum feel)
  // Base angle increases with time; acceleration increases as we spiral tighter
  const angularAccel = 1.0 + t * 2.0;
  const angle = dynamicTime * profile.orbitSpeed * angularAccel;

  const x = Math.sin(angle) * currentRadius;
  const z = Math.cos(angle) * currentRadius;
  // Slight vertical bob
  const y = Math.sin(t * Math.PI) * 0.3;

  const position: [number, number, number] = [x, y, z];
  const target: [number, number, number] = [0, y * 0.3, 0];

  return { position, target };
}

// ---------------------------------------------------------------------------
// Path generator dispatch table
// ---------------------------------------------------------------------------

type PathGenerator = (
  time: number, dynamicTime: number, energy: number, bass: number,
  sectionProgress: number, profile: CameraProfile, vocalPresence: number,
) => PathResult;

const PATH_GENERATORS: Record<CameraPathType, PathGenerator> = {
  orbital: orbitalPath,
  dolly: dollyPath,
  crane: cranePath,
  handheld: handheldPath,
  static_drift: staticDriftPath,
  pull_back: pullBackPath,
  spiral_in: spiralInPath,
};

/**
 * Compute 3D camera state from audio parameters.
 * All inputs should be 0-1 normalized (except time/dynamicTime/sectionIndex).
 * Optional profile parameter overrides default orbital/shake/FOV behavior.
 *
 * The path generator is selected via profile.pathType (default: "orbital").
 * Shake, jolt, FOV, and DOF are layered on top of every path type.
 */
export function compute3DCamera(
  time: number,
  dynamicTime: number,
  energy: number,
  bass: number,
  fastEnergy: number,
  vocalPresence: number,
  drumOnset: number,
  sectionProgress: number,
  sectionIndex: number,
  climaxPhase: number,
  climaxIntensity: number,
  cameraSteadiness: number,
  beatSnap: number,
  profile: CameraProfile = DEFAULT_CAMERA_PROFILE,
): Camera3DState {
  // Clamp inputs
  energy = Math.max(0, Math.min(1, energy));
  bass = Math.max(0, Math.min(1, bass));
  fastEnergy = Math.max(0, Math.min(1, fastEnergy));
  vocalPresence = Math.max(0, Math.min(1, vocalPresence));
  drumOnset = Math.max(0, Math.min(1, drumOnset));
  climaxIntensity = Math.max(0, Math.min(1, climaxIntensity));
  cameraSteadiness = Math.max(0, Math.min(1, cameraSteadiness));
  beatSnap = Math.max(0, Math.min(1, beatSnap));

  const p = profile;

  // === Dispatch to path generator ===
  const pathType = p.pathType ?? "orbital";
  const generator = PATH_GENERATORS[pathType];
  const { position: basePos, target: baseTarget } = generator(
    time, dynamicTime, energy, bass, sectionProgress, p, vocalPresence,
  );

  // === Bass shake (dampened by steadiness + vocals) ===
  const shakeDampen = 1.0 - cameraSteadiness * 0.8;
  const vocalShakeDampen = vocalPresence > 0.3 ? 0.8 : 1.0;
  const sd = shakeDampen * vocalShakeDampen;

  const shakeX = Math.sin(time * p.shakeFrequency[0]) * bass * p.shakeAmplitude[0] * sd;
  const shakeY = Math.cos(time * p.shakeFrequency[1]) * bass * p.shakeAmplitude[1] * sd;
  const shakeZ = Math.sin(time * p.shakeFrequency[2]) * bass * p.shakeAmplitude[2] * sd;

  // === Drum jolt (subtle impulse — felt not seen) ===
  const jt = p.joltThreshold;
  const joltX = drumOnset > jt ? (drumOnset - jt) * p.joltAmplitude[0] * Math.sin(time * p.joltFrequency[0]) : 0;
  const joltY = drumOnset > jt ? (drumOnset - jt) * p.joltAmplitude[1] * Math.cos(time * p.joltFrequency[1]) : 0;
  const joltZ = drumOnset > jt ? (drumOnset - jt) * p.joltAmplitude[2] * Math.sin(time * p.joltFrequency[2]) : 0;

  // === Final position: base path + shake + jolt ===
  const position: [number, number, number] = [
    basePos[0] + shakeX + joltX,
    basePos[1] + shakeY + joltY,
    basePos[2] + shakeZ + joltZ,
  ];

  // === Target from path generator ===
  const target: [number, number, number] = baseTarget;

  // === FOV: wider at peaks for immersion ===
  const fov = p.baseFov + energy * p.energyFovBoost;

  // === DOF ===
  const dofStrength = energy * p.dofEnergyFactor + climaxIntensity * p.dofClimaxFactor;
  const focusDistance = p.baseFocusDistance - energy * p.energyFocusShrink;

  return {
    position,
    target,
    fov: Math.max(p.fovRange[0], Math.min(p.fovRange[1], fov)),
    dofStrength: Math.max(0, Math.min(1, dofStrength)),
    focusDistance: Math.max(p.focusRange[0], Math.min(p.focusRange[1], focusDistance)),
  };
}
