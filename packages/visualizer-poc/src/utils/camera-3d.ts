/**
 * 3D Camera System — pure function mapping audio state to camera parameters.
 *
 * Computes orbital position, bass-driven shake, drum jolts, DOF,
 * and FOV from audio features. CSS camera stays for DOM layers;
 * these uniforms are consumed by GLSL shaders via setupCameraRay().
 */

import { type CameraProfile, DEFAULT_CAMERA_PROFILE } from "../config/camera-profiles";

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

/**
 * Compute 3D camera state from audio parameters.
 * All inputs should be 0-1 normalized (except time/dynamicTime/sectionIndex).
 * Optional profile parameter overrides default orbital/shake/FOV behavior.
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

  // === Orbital motion ===
  const orbitRadius = p.orbitRadius - energy * p.energyRadiusShrink;
  const vocalRadiusMod = vocalPresence > 0.3 ? 0.9 : 1.0;
  const radius = orbitRadius * vocalRadiusMod;

  const orbitAngle = dynamicTime * p.orbitSpeed;
  const orbitHeight = Math.sin(dynamicTime * p.orbitBobSpeed) * p.orbitBobAmplitude;

  const orbX = Math.sin(orbitAngle) * radius;
  const orbZ = Math.cos(orbitAngle) * radius;
  const orbY = orbitHeight;

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

  // === Final position ===
  const position: [number, number, number] = [
    orbX + shakeX + joltX,
    orbY + shakeY + joltY,
    orbZ + shakeZ + joltZ,
  ];

  // === Target: always look at origin with slight sway ===
  const target: [number, number, number] = [
    Math.sin(dynamicTime * p.targetSwaySpeed[0]) * p.targetSway[0],
    Math.cos(dynamicTime * p.targetSwaySpeed[1]) * p.targetSway[1],
    0,
  ];

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
