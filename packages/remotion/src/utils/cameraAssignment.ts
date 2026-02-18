import type { Mood } from '../styles/themes';

export type CameraPreset =
  | 'random'
  | 'push_in'
  | 'pull_out'
  | 'breathing'
  | 'handheld'
  | 'drift_left'
  | 'drift_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'arc_left'
  | 'arc_right'
  | 'handheld_subtle'
  | 'dolly_left'
  | 'dolly_right'
  | 'crane_up'
  | 'crane_down';

/** Camera movement speed multiplier per mood */
const MOOD_SPEED: Record<Mood, number> = {
  warm: 0.6,
  cosmic: 0.7,
  electric: 1.2,
  dark: 0.5,
  earthy: 0.5,
  psychedelic: 1.0,
};

/** Pool of fitting camera presets per mood */
const MOOD_CAMERA: Record<Mood, CameraPreset[]> = {
  warm: ['push_in', 'breathing', 'drift_right', 'crane_up'],
  cosmic: ['pull_out', 'arc_left', 'crane_up', 'tilt_up'],
  electric: ['handheld', 'handheld_subtle', 'dolly_right', 'arc_right'],
  dark: ['push_in', 'drift_left', 'tilt_down', 'crane_down'],
  earthy: ['breathing', 'drift_left', 'drift_right', 'pull_out'],
  psychedelic: ['arc_left', 'arc_right', 'handheld_subtle', 'dolly_left'],
};

/** Get camera movement speed multiplier for a mood */
export function getCameraSpeed(mood: string): number {
  return MOOD_SPEED[mood as Mood] ?? 1.0;
}

/**
 * Deterministic camera preset from mood pool.
 * Uses index to cycle through the pool, avoiding consecutive repeats.
 */
export function assignCameraPreset(mood: string, index: number): CameraPreset {
  const pool = MOOD_CAMERA[mood as Mood];
  if (!pool) return 'random';

  const pick = pool[index % pool.length];

  // Avoid consecutive repeats: if same as previous, advance one
  if (index > 0) {
    const prev = pool[(index - 1) % pool.length];
    if (pick === prev) {
      return pool[(index + 1) % pool.length];
    }
  }

  return pick;
}
