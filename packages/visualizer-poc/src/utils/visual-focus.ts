/**
 * Visual Focus System — focal layer hierarchy.
 *
 * Directs the viewer's eye by modulating layer opacities based on
 * climax phase. During climax, the shader IS the moment —
 * everything else gets out of the way. During release, art comes back
 * as emotional anchor. During idle, gentle breathing keeps the eye engaged.
 */

import type { ClimaxPhase } from "./climax-state";

export type FocalLayer = "shader" | "art" | "overlay" | "text";

export interface VisualFocusState {
  shaderOpacity: number;    // 0.6-1.0
  artOpacity: number;       // 0.0-1.0 (multiplier on existing SongArtLayer logic)
  overlayOpacity: number;   // 0.0-1.0 (multiplier on DynamicOverlayStack)
  grainOpacity: number;     // 0.5-1.0
}

/** Focus rules by climax phase — shader IS the show at peaks.
 *  Overlays are zero during climax/sustain so the shader owns the moment. */
/** Overlay opacity reduced to enforce "shader is the star" — overlays are subtle accents.
 *  Screen blend always ADDS brightness, so even moderate opacity overlays dominate dark shaders.
 *  At 0.40 idle: effective overlay contribution ≈ 0.40 * rotation * mediaSuppression ≈ 0.15-0.20.
 *  This prevents overlays from washing out shader character (especially warm shaders like inferno). */
const PHASE_FOCUS: Record<ClimaxPhase, VisualFocusState> = {
  climax:  { shaderOpacity: 1.0,  artOpacity: 0.0,  overlayOpacity: 0.05, grainOpacity: 0.5 },
  sustain: { shaderOpacity: 0.95, artOpacity: 0.0,  overlayOpacity: 0.05, grainOpacity: 0.6 },
  build:   { shaderOpacity: 0.85, artOpacity: 0.12, overlayOpacity: 0.18, grainOpacity: 0.8 },
  release: { shaderOpacity: 0.75, artOpacity: 0.35, overlayOpacity: 0.15, grainOpacity: 1.0 },
  idle:    { shaderOpacity: 0.85, artOpacity: 0.25, overlayOpacity: 0.20, grainOpacity: 1.0 },
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
 * @param frame - Current frame number (for idle breathing cycle)
 */
export function computeVisualFocus(
  phase: ClimaxPhase,
  intensity: number,
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
      artOpacity: lerp(0.35, 0.50, breathT),
      shaderOpacity: lerp(0.80, 0.90, 1 - breathT),
    };
  }

  // Smooth transitions: blend toward target based on intensity
  // During build/release, intensity drives how far we've moved toward the phase
  if (phase === "build" || phase === "release") {
    const idleFocus = PHASE_FOCUS.idle;
    state = lerpState(idleFocus, state, intensity);
  }

  return state;
}
