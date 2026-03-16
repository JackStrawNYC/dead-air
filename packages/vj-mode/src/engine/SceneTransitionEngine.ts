/**
 * SceneTransitionEngine — state machine for crossfade transitions between scenes.
 * Manages current/next scene with smooth opacity crossfade.
 */

import type { VisualMode } from "@visualizer/data/types";

export interface TransitionState {
  currentScene: VisualMode;
  nextScene: VisualMode | null;
  progress: number; // 0-1, where 1 = transition complete
  isTransitioning: boolean;
}

export class SceneTransitionEngine {
  private _current: VisualMode;
  private _next: VisualMode | null = null;
  private _progress = 0;
  private _duration = 2; // seconds
  private _isTransitioning = false;

  constructor(initialScene: VisualMode = "liquid_light") {
    this._current = initialScene;
  }

  get state(): TransitionState {
    return {
      currentScene: this._current,
      nextScene: this._next,
      progress: this._progress,
      isTransitioning: this._isTransitioning,
    };
  }

  triggerTransition(nextScene: VisualMode, duration: number = 2): void {
    if (nextScene === this._current && !this._isTransitioning) return;
    if (this._isTransitioning) {
      // Complete current transition instantly
      this._current = this._next ?? this._current;
    }
    this._next = nextScene;
    this._progress = 0;
    this._duration = Math.max(0.5, duration);
    this._isTransitioning = true;
  }

  update(deltaTime: number): void {
    if (!this._isTransitioning || !this._next) return;

    this._progress += deltaTime / this._duration;

    if (this._progress >= 1) {
      this._current = this._next;
      this._next = null;
      this._progress = 0;
      this._isTransitioning = false;
    }
  }

  /** Set scene immediately without transition */
  setScene(scene: VisualMode): void {
    this._current = scene;
    this._next = null;
    this._progress = 0;
    this._isTransitioning = false;
  }
}
