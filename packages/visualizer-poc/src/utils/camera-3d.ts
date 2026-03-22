/**
 * 3D Camera System — pure function mapping audio state to camera parameters.
 *
 * Computes orbital position, bass-driven shake, drum jolts, DOF,
 * and FOV from audio features. CSS camera stays for DOM layers;
 * these uniforms are consumed by GLSL shaders via setupCameraRay().
 */

export interface Camera3DState {
  /** Camera position in world space */
  position: [number, number, number];
  /** Camera look-at target */
  target: [number, number, number];
  /** Field of view in degrees (45-65) */
  fov: number;
  /** Depth of field blur strength (0-1) */
  dofStrength: number;
  /** Focus distance in world units (2-5) */
  focusDistance: number;
}

/**
 * Compute 3D camera state from audio parameters.
 * All inputs should be 0-1 normalized (except time/dynamicTime/sectionIndex).
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

  // === Orbital motion ===
  // Radius decreases with energy (closer at peaks)
  const orbitRadius = 3.5 - energy * 0.5;

  // Vocal intimacy: reduce orbit radius 10% when vocals present
  const vocalRadiusMod = vocalPresence > 0.3 ? 0.9 : 1.0;
  const radius = orbitRadius * vocalRadiusMod;

  const orbitAngle = dynamicTime * 0.02;
  const orbitHeight = Math.sin(dynamicTime * 0.015) * 0.3;

  const orbX = Math.sin(orbitAngle) * radius;
  const orbZ = Math.cos(orbitAngle) * radius;
  const orbY = orbitHeight;

  // === Bass shake ===
  // Dampened by steadiness
  const shakeDampen = 1.0 - cameraSteadiness * 0.8;

  // Vocal presence also dampens shake
  const vocalShakeDampen = vocalPresence > 0.3 ? 0.8 : 1.0;

  const shakeX = Math.sin(time * 3.7) * bass * 0.06 * shakeDampen * vocalShakeDampen;
  const shakeY = Math.cos(time * 2.3) * bass * 0.04 * shakeDampen * vocalShakeDampen;
  const shakeZ = Math.sin(time * 4.1) * bass * 0.03 * shakeDampen * vocalShakeDampen;

  // === Drum jolt ===
  // Subtle impulse — felt not seen
  const joltX = drumOnset > 0.5 ? (drumOnset - 0.5) * 0.08 * Math.sin(time * 7.3) : 0;
  const joltY = drumOnset > 0.5 ? (drumOnset - 0.5) * 0.06 * Math.cos(time * 5.1) : 0;
  const joltZ = drumOnset > 0.5 ? (drumOnset - 0.5) * 0.04 * Math.sin(time * 6.7) : 0;

  // === Final position ===
  const position: [number, number, number] = [
    orbX + shakeX + joltX,
    orbY + shakeY + joltY,
    orbZ + shakeZ + joltZ,
  ];

  // === Target: always look at origin with slight sway ===
  const target: [number, number, number] = [
    Math.sin(dynamicTime * 0.01) * 0.1,
    Math.cos(dynamicTime * 0.008) * 0.05,
    0,
  ];

  // === FOV: wider at peaks for immersion ===
  const fov = 50 + energy * 10;

  // === DOF ===
  const dofStrength = energy * 0.4 + climaxIntensity * 0.3;
  const focusDistance = 3.0 - energy * 1.0;

  return {
    position,
    target,
    fov: Math.max(45, Math.min(65, fov)),
    dofStrength: Math.max(0, Math.min(1, dofStrength)),
    focusDistance: Math.max(2, Math.min(5, focusDistance)),
  };
}
