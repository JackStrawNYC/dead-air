/**
 * SceneTransitionEngine — state machine for crossfade transitions between scenes.
 * Manages current/next scene with smooth opacity crossfade.
 * Supports linear, beat-synced, and beat-pumped transition modes.
 */

import type { VisualMode } from "@visualizer/data/types";

export type TransitionMode = "linear" | "beat_synced" | "beat_pumped";

export interface TransitionState {
  currentScene: VisualMode;
  nextScene: VisualMode | null;
  progress: number; // 0-1, where 1 = transition complete
  isTransitioning: boolean;
  mode: TransitionMode;
}

export class SceneTransitionEngine {
  private _current: VisualMode;
  private _next: VisualMode | null = null;
  private _progress = 0;
  private _duration = 2; // seconds
  private _isTransitioning = false;
  private _mode: TransitionMode = "linear";
  // Beat-sync state
  private _beatSyncWaiting = false; // waiting for next beat to start
  private _beatDuration = 4; // duration in beats
  private _beatCount = 0; // beats elapsed since transition start
  private _beatProgress = 0; // sub-beat progress within current beat

  constructor(initialScene: VisualMode = "liquid_light") {
    this._current = initialScene;
  }

  get state(): TransitionState {
    return {
      currentScene: this._current,
      nextScene: this._next,
      progress: this._progress,
      isTransitioning: this._isTransitioning,
      mode: this._mode,
    };
  }

  triggerTransition(
    nextScene: VisualMode,
    duration: number = 2,
    mode: TransitionMode = "linear",
    beatDuration: number = 4,
  ): void {
    if (nextScene === this._current && !this._isTransitioning) return;
    if (this._isTransitioning) {
      // Complete current transition instantly
      this._current = this._next ?? this._current;
    }
    this._next = nextScene;
    this._progress = 0;
    this._duration = Math.max(0.5, duration);
    this._mode = mode;
    this._beatDuration = Math.max(1, beatDuration);
    this._beatCount = 0;
    this._beatProgress = 0;

    if (mode === "beat_synced" || mode === "beat_pumped") {
      // Wait for next beat before starting
      this._beatSyncWaiting = true;
      this._isTransitioning = true;
    } else {
      this._beatSyncWaiting = false;
      this._isTransitioning = true;
    }
  }

  /**
   * Update transition state.
   * @param deltaTime - seconds since last update
   * @param musicalTime - current musical time (beats elapsed), optional for beat sync
   * @param isBeat - whether a beat occurred this frame
   * @param tempo - current BPM
   */
  update(
    deltaTime: number,
    musicalTime?: number,
    isBeat?: boolean,
    tempo?: number,
  ): void {
    if (!this._isTransitioning || !this._next) return;

    if (this._mode === "linear") {
      this._progress += deltaTime / this._duration;
    } else if (this._mode === "beat_synced") {
      if (this._beatSyncWaiting) {
        // Wait for a beat to start the transition
        if (isBeat) {
          this._beatSyncWaiting = false;
          this._beatCount = 0;
          this._beatProgress = 0;
        }
        return;
      }
      // Count beats for progress
      if (isBeat) {
        this._beatCount++;
      }
      // Progress = beats elapsed / total beats
      this._progress = Math.min(1, this._beatCount / this._beatDuration);
    } else if (this._mode === "beat_pumped") {
      // Linear base progress
      this._progress += deltaTime / this._duration;

      if (this._beatSyncWaiting && isBeat) {
        this._beatSyncWaiting = false;
      }

      // Modulate with beat pulse: add a pump envelope on each beat
      if (isBeat && !this._beatSyncWaiting) {
        this._beatProgress = 1.0;
      }
      // Decay beat pump
      this._beatProgress *= 0.85;
    }

    if (this._progress >= 1) {
      this._current = this._next;
      this._next = null;
      this._progress = 0;
      this._isTransitioning = false;
      this._beatSyncWaiting = false;
      this._mode = "linear";
    }
  }

  /**
   * Get effective progress (with beat pump modulation if applicable).
   * Use this for opacity calculations in the crossfade renderer.
   */
  get effectiveProgress(): number {
    if (this._mode === "beat_pumped") {
      // Add subtle pump oscillation on top of linear progress
      const pumpAmount = this._beatProgress * 0.08;
      return Math.min(1, Math.max(0, this._progress + pumpAmount));
    }
    return this._progress;
  }

  /** Set scene immediately without transition */
  setScene(scene: VisualMode): void {
    this._current = scene;
    this._next = null;
    this._progress = 0;
    this._isTransitioning = false;
    this._beatSyncWaiting = false;
    this._mode = "linear";
  }
}
