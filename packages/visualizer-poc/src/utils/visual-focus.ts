/**
 * Visual Focus System — focal layer hierarchy.
 *
 * Directs the viewer's eye by modulating layer opacities based on
 * climax phase and media state. During climax, the shader IS the moment —
 * everything else gets out of the way. During release, art comes back
 * as emotional anchor. During idle, gentle breathing keeps the eye engaged.
 */

import type { ClimaxPhase } from "./climax-state";

export type FocalLayer = "shader" | "art" | "video" | "overlay" | "text";

export interface VisualFocusState {
  shaderOpacity: number;    // 0.6-1.0
  artOpacity: number;       // 0.0-1.0 (multiplier on existing SongArtLayer logic)
  overlayOpacity: number;   // 0.0-1.0 (multiplier on DynamicOverlayStack)
  grainOpacity: number;     // 0.5-1.0
}

/** Focus rules by climax phase */
const PHASE_FOCUS: Record<ClimaxPhase, VisualFocusState> = {
  climax:  { shaderOpacity: 1.0, artOpacity: 0.0, overlayOpacity: 0.15, grainOpacity: 0.5 },
  sustain: { shaderOpacity: 0.9, artOpacity: 0.0, overlayOpacity: 0.3,  grainOpacity: 0.6 },
  build:   { shaderOpacity: 0.8, artOpacity: 0.1, overlayOpacity: 0.7,  grainOpacity: 0.8 },
  release: { shaderOpacity: 0.7, artOpacity: 0.6, overlayOpacity: 0.4,  grainOpacity: 1.0 },
  idle:    { shaderOpacity: 0.85, artOpacity: 0.4, overlayOpacity: 0.6, grainOpacity: 1.0 },
};

/** Focus state when a scene video is actively playing */
const VIDEO_ACTIVE_FOCUS: VisualFocusState = {
  shaderOpacity: 0.4,
  artOpacity: 0.0,
  overlayOpacity: 0.2,
  grainOpacity: 0.7,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpState(a: VisualFocusState, b: VisualFocusState, t: number): VisualFocusState {
  return {
    shaderOpacity: lerp(a.shaderOpacity, b.shaderOpacity, t),
    artOpacity: lerp(a.artOpacity, b.artOpacity, t),
    overlayOpacity: lerp(a.overlayOpacity, b.overlayOpacity, t),
    grainOpacity: lerp(a.grainOpacity, b.grainOpacity, t),
  };
}

/**
 * Compute the visual focus state for the current frame.
 *
 * @param phase - Current climax phase
 * @param intensity - 0-1 intensity within the phase (for smooth interpolation)
 * @param isVideoActive - Whether a scene video is currently playing
 * @param frame - Current frame number (for idle breathing cycle)
 */
export function computeVisualFocus(
  phase: ClimaxPhase,
  intensity: number,
  isVideoActive: boolean,
  frame: number,
): VisualFocusState {
  // Start with phase-driven focus
  let state = PHASE_FOCUS[phase];

  // Idle breathing: gentle oscillation between shader and art
  if (phase === "idle") {
    // 8-second breathing cycle (240 frames at 30fps)
    const breathT = (Math.sin(frame * Math.PI * 2 / 240) + 1) * 0.5;
    state = {
      ...state,
      artOpacity: lerp(0.25, 0.55, breathT),
      shaderOpacity: lerp(0.80, 0.90, 1 - breathT),
    };
  }

  // Smooth transitions: blend toward target based on intensity
  // During build/release, intensity drives how far we've moved toward the phase
  if (phase === "build" || phase === "release") {
    const idleFocus = PHASE_FOCUS.idle;
    state = lerpState(idleFocus, state, intensity);
  }

  // Video override: when scene video is active, suppress everything else
  if (isVideoActive) {
    state = lerpState(state, VIDEO_ACTIVE_FOCUS, 0.8);
  }

  return state;
}
