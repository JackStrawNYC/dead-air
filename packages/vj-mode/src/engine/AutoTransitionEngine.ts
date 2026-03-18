/**
 * AutoTransitionEngine — multi-factor decision engine for automatic VJ scene transitions.
 *
 * Replaces simple energy-threshold crossing with:
 *   - Energy state machine: quiet / building / peak / releasing / groove
 *   - Scene scoring: affinity match, recency penalty, climax awareness
 *   - Transition style selection per state change
 */

import type { VisualMode } from "@visualizer/data/types";
import { TRANSITION_AFFINITY } from "../scenes/transition-affinity";
import { VJ_SCENES } from "../scenes/scene-list";
import type { TransitionMode } from "./SceneTransitionEngine";
import type { VJShowIntelligence } from "./VJShowIntelligence";

export type EnergyState = "quiet" | "building" | "peak" | "releasing" | "groove";

export interface AutoTransitionDecision {
  nextScene: VisualMode;
  transitionMode: TransitionMode;
  /** Duration in seconds for linear/beat_pumped, beats for beat_synced */
  duration: number;
  /** Beats for beat_synced mode */
  beatDuration: number;
}

interface AudioSnapshot {
  energy: number;
  bass: number;
  onset: number;
  tempo: number;
  harmonicTension: number;
  climaxPhase: number;
  beatSnap: number;
}

export class AutoTransitionEngine {
  private _state: EnergyState = "quiet";
  private _prevEnergy = 0;
  private _energyHistory: number[] = [];
  private _recentScenes: VisualMode[] = [];
  private _lastTransitionTime = 0;
  private _stateEntryTime = 0;
  private _showIntelligence: VJShowIntelligence | null = null;

  /** Minimum seconds between auto-transitions */
  readonly minInterval = 10;
  /** Maximum recent scenes to track for recency penalty */
  readonly maxRecent = 6;

  /** Set show intelligence instance for multi-song awareness */
  setShowIntelligence(intel: VJShowIntelligence | null): void {
    this._showIntelligence = intel;
  }

  get energyState(): EnergyState {
    return this._state;
  }

  /**
   * Update energy state machine and optionally recommend a transition.
   * Returns null if no transition is recommended.
   */
  evaluate(audio: AudioSnapshot, now: number): AutoTransitionDecision | null {
    // Track energy history for trend detection
    this._energyHistory.push(audio.energy);
    if (this._energyHistory.length > 30) this._energyHistory.shift();

    // Update energy state
    const prevState = this._state;
    this._updateEnergyState(audio);

    // Check if state changed
    const stateChanged = prevState !== this._state;
    const timeSinceTransition = now - this._lastTransitionTime;

    // Only suggest transition on state change with minimum interval
    if (!stateChanged || timeSinceTransition < this.minInterval) {
      this._prevEnergy = audio.energy;
      return null;
    }

    // Score and select next scene
    const nextScene = this._selectScene(audio);
    if (!nextScene) {
      this._prevEnergy = audio.energy;
      return null;
    }

    // Determine transition style based on state change
    const { mode, duration, beatDuration } = this._selectTransitionStyle(
      prevState,
      this._state,
      audio.tempo,
    );

    this._lastTransitionTime = now;
    this._recentScenes.push(nextScene);
    if (this._recentScenes.length > this.maxRecent) this._recentScenes.shift();

    this._prevEnergy = audio.energy;
    return { nextScene, transitionMode: mode, duration, beatDuration };
  }

  /** Reset the engine state (e.g., on manual scene change) */
  reset(): void {
    this._state = "quiet";
    this._energyHistory = [];
    this._recentScenes = [];
    this._prevEnergy = 0;
  }

  /** Record a scene that was set (for recency tracking) */
  recordScene(scene: VisualMode): void {
    this._recentScenes.push(scene);
    if (this._recentScenes.length > this.maxRecent) this._recentScenes.shift();
    this._lastTransitionTime = performance.now() / 1000;
  }

  private _updateEnergyState(audio: AudioSnapshot): void {
    const e = audio.energy;
    const trend = this._getEnergyTrend();

    switch (this._state) {
      case "quiet":
        if (e > 0.35 && trend > 0.02) this._setState("building");
        else if (e > 0.6) this._setState("peak");
        break;
      case "building":
        if (e > 0.6) this._setState("peak");
        else if (e < 0.2) this._setState("quiet");
        else if (trend < -0.02 && e < 0.4) this._setState("quiet");
        break;
      case "peak":
        if (e < 0.45 && trend < -0.01) this._setState("releasing");
        else if (e > 0.4 && e < 0.7 && Math.abs(trend) < 0.01) this._setState("groove");
        break;
      case "releasing":
        if (e < 0.2) this._setState("quiet");
        else if (e > 0.55) this._setState("peak");
        else if (Math.abs(trend) < 0.005 && e > 0.3) this._setState("groove");
        break;
      case "groove":
        if (e > 0.7) this._setState("peak");
        else if (e < 0.2) this._setState("quiet");
        else if (trend > 0.03) this._setState("building");
        else if (trend < -0.03) this._setState("releasing");
        break;
    }
  }

  private _setState(state: EnergyState): void {
    this._state = state;
    this._stateEntryTime = performance.now() / 1000;
  }

  private _getEnergyTrend(): number {
    const h = this._energyHistory;
    if (h.length < 10) return 0;
    const recent = h.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const older = h.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    return recent - older;
  }

  private _selectScene(audio: AudioSnapshot): VisualMode | null {
    const currentScenes = this._recentScenes;
    const lastScene = currentScenes[currentScenes.length - 1];

    // Get candidate scenes from affinity map + all VJ scenes
    const candidates = new Set<VisualMode>();

    // Add affinity targets
    if (lastScene) {
      const affinities = TRANSITION_AFFINITY[lastScene] ?? [];
      for (const s of affinities) candidates.add(s);
    }

    // Add all available VJ scenes
    for (const mode of Object.keys(VJ_SCENES) as VisualMode[]) {
      candidates.add(mode);
    }

    // Remove current scene
    if (lastScene) candidates.delete(lastScene);

    if (candidates.size === 0) return null;

    // Score each candidate
    let bestScore = -Infinity;
    let bestScene: VisualMode | null = null;

    for (const scene of candidates) {
      let score = 0;
      const entry = VJ_SCENES[scene];
      if (!entry) continue;

      // Energy affinity match (+3)
      const targetAffinity = this._getTargetAffinity();
      if (entry.energyAffinity === targetAffinity || entry.energyAffinity === "any") {
        score += 3;
      } else if (
        (entry.energyAffinity === "mid") ||
        (targetAffinity === "mid")
      ) {
        score += 1; // adjacent match
      }

      // Transition affinity (+2)
      if (lastScene) {
        const affinities = TRANSITION_AFFINITY[lastScene] ?? [];
        if (affinities.includes(scene)) score += 2;
      }

      // Recency penalty (-1 per recent appearance)
      const recencyCount = this._recentScenes.filter((s) => s === scene).length;
      score -= recencyCount;

      // Climax awareness (prefer high-affinity during climax)
      if (audio.climaxPhase > 1.5) {
        if (entry.energyAffinity === "high") score += 2;
      }

      // Harmonic tension: prefer complex shaders for tense moments
      if (audio.harmonicTension > 0.5 && entry.feedback) {
        score += 1;
      }

      // Show intelligence scoring (multi-song awareness)
      score += this._showIntelligence?.getSceneScore(scene) ?? 0;

      if (score > bestScore) {
        bestScore = score;
        bestScene = scene;
      }
    }

    return bestScene;
  }

  private _getTargetAffinity(): "low" | "mid" | "high" {
    switch (this._state) {
      case "quiet": return "low";
      case "building": return "mid";
      case "peak": return "high";
      case "releasing": return "mid";
      case "groove": return "mid";
    }
  }

  private _selectTransitionStyle(
    from: EnergyState,
    to: EnergyState,
    tempo: number,
  ): { mode: TransitionMode; duration: number; beatDuration: number } {
    const hasTempo = tempo > 40;

    // State-specific transition styles
    if (from === "quiet" && to === "building") {
      return hasTempo
        ? { mode: "beat_synced", duration: 4, beatDuration: 4 }
        : { mode: "linear", duration: 3, beatDuration: 4 };
    }
    if (from === "building" && to === "peak") {
      return hasTempo
        ? { mode: "beat_synced", duration: 2, beatDuration: 2 }
        : { mode: "linear", duration: 1.5, beatDuration: 2 };
    }
    if (to === "peak" && from === "peak") {
      // Peak to peak: quick snap
      return { mode: "linear", duration: 0.5, beatDuration: 1 };
    }
    if (from === "releasing" && to === "quiet") {
      return hasTempo
        ? { mode: "beat_synced", duration: 6, beatDuration: 8 }
        : { mode: "linear", duration: 5, beatDuration: 8 };
    }
    if (to === "groove") {
      return hasTempo
        ? { mode: "beat_pumped", duration: 3, beatDuration: 4 }
        : { mode: "linear", duration: 2.5, beatDuration: 4 };
    }

    // Default: moderate crossfade
    return hasTempo
      ? { mode: "beat_synced", duration: 3, beatDuration: 4 }
      : { mode: "linear", duration: 2, beatDuration: 4 };
  }
}
