/**
 * VJShowIntelligence — multi-song show arc awareness for VJ mode.
 * Tracks scene usage across the entire session and biases scene scoring
 * based on show phase (opening → building → peak → wind_down).
 *
 * Integrates with AutoTransitionEngine by providing per-scene scores
 * that favor variety and phase-appropriate energy levels.
 */

import type { VisualMode } from "@visualizer/data/types";
import { VJ_SCENES } from "../scenes/scene-list";

export type VJShowPhase = "opening" | "building" | "peak" | "wind_down";

/** Thresholds in minutes for show phase transitions */
const PHASE_THRESHOLDS = {
  building: 10,
  peak: 40,
  windDown: 80,
};

/** Energy affinity preferences by show phase */
const PHASE_ENERGY_PREFERENCE: Record<VJShowPhase, ("low" | "mid" | "high" | "any")[]> = {
  opening: ["mid", "low"],
  building: ["mid", "high", "any"],
  peak: ["high", "any", "mid"],
  wind_down: ["low", "mid"],
};

export class VJShowIntelligence {
  private _sceneUsage: Map<VisualMode, number> = new Map();
  private _sessionStartTime: number;

  constructor() {
    this._sessionStartTime = performance.now();
  }

  /** Record that a scene was shown */
  recordSceneUsage(scene: VisualMode): void {
    const count = this._sceneUsage.get(scene) ?? 0;
    this._sceneUsage.set(scene, count + 1);
  }

  /** Get scenes that haven't been used or are underused */
  getUnderusedScenes(available: VisualMode[]): VisualMode[] {
    if (this._sceneUsage.size === 0) return available;

    const avgUsage = Array.from(this._sceneUsage.values())
      .reduce((sum, c) => sum + c, 0) / Math.max(this._sceneUsage.size, 1);

    return available.filter((scene) => {
      const usage = this._sceneUsage.get(scene) ?? 0;
      return usage < avgUsage;
    });
  }

  /** Determine current show phase based on session duration */
  getShowPhase(): VJShowPhase {
    const minutes = (performance.now() - this._sessionStartTime) / 60000;

    if (minutes < PHASE_THRESHOLDS.building) return "opening";
    if (minutes < PHASE_THRESHOLDS.peak) return "building";
    if (minutes < PHASE_THRESHOLDS.windDown) return "peak";
    return "wind_down";
  }

  /**
   * Score a scene for AutoTransitionEngine integration.
   * Returns a value from -2 to +3:
   *   +3: strongly recommended (underused + phase-appropriate)
   *   +2: phase-appropriate energy
   *   +1: slightly underused
   *    0: neutral
   *   -1: overused
   *   -2: strongly overused + wrong phase energy
   */
  getSceneScore(scene: VisualMode): number {
    let score = 0;
    const phase = this.getShowPhase();
    const entry = VJ_SCENES[scene];
    if (!entry) return 0;

    // Phase energy matching
    const preferredEnergies = PHASE_ENERGY_PREFERENCE[phase];
    if (preferredEnergies.includes(entry.energyAffinity)) {
      score += 2;
    } else {
      score -= 1;
    }

    // Usage-based scoring
    const usage = this._sceneUsage.get(scene) ?? 0;
    const totalUsage = Array.from(this._sceneUsage.values())
      .reduce((sum, c) => sum + c, 0);
    const avgUsage = totalUsage / Math.max(this._sceneUsage.size, 1);

    if (usage === 0) {
      score += 1; // never used — encourage variety
    } else if (usage > avgUsage * 1.5) {
      score -= 1; // overused
    }

    return Math.max(-2, Math.min(3, score));
  }

  /** Reset all tracking (e.g., when starting a new show) */
  reset(): void {
    this._sceneUsage.clear();
    this._sessionStartTime = performance.now();
  }
}
