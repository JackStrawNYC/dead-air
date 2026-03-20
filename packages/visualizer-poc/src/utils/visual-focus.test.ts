import { describe, it, expect } from "vitest";
import { computeVisualFocus } from "./visual-focus";
import type { ClimaxPhase } from "./climax-state";

describe("computeVisualFocus", () => {
  it("climax: shader at full, art gone, overlays at minimal opacity", () => {
    const state = computeVisualFocus("climax", 1.0, 100);
    expect(state.shaderOpacity).toBe(1.0);
    expect(state.artOpacity).toBe(0.0); // art fully suppressed during climax
    expect(state.overlayOpacity).toBe(0.05); // overlays near-zero during climax
    expect(state.grainOpacity).toBeLessThanOrEqual(0.5);
  });

  it("sustain: shader near full, overlays at minimal opacity", () => {
    const state = computeVisualFocus("sustain", 1.0, 100);
    expect(state.shaderOpacity).toBeGreaterThanOrEqual(0.85);
    expect(state.artOpacity).toBe(0.0); // art fully suppressed during sustain
    expect(state.overlayOpacity).toBe(0.05); // overlays near-zero during sustain
  });

  it("build: overlays present, shader below full", () => {
    const state = computeVisualFocus("build", 1.0, 100);
    // Build phase should show overlays and have shader below full
    expect(state.overlayOpacity).toBeGreaterThanOrEqual(0.1);
    expect(state.shaderOpacity).toBeLessThan(1.0);
  });

  it("release: art comes back as emotional anchor, overlays gentle", () => {
    const state = computeVisualFocus("release", 1.0, 100);
    expect(state.artOpacity).toBeGreaterThanOrEqual(0.3);
    expect(state.shaderOpacity).toBeLessThanOrEqual(0.75);
    expect(state.grainOpacity).toBeGreaterThanOrEqual(0.9);
  });

  it("idle: breathing cycle modulates art and shader", () => {
    // Frame 0: sin(0)=0 → breathT=0.5 (mid-cycle)
    // Frame 60: sin(π/2)=1 → breathT=1.0 (peak)
    // Frame 180: sin(3π/2)=-1 → breathT=0.0 (trough)
    const peak = computeVisualFocus("idle", 0, 60);
    const trough = computeVisualFocus("idle", 0, 180);
    // Art opacity should differ across the breathing cycle (range 0.10-0.15)
    expect(Math.abs(peak.artOpacity - trough.artOpacity)).toBeGreaterThan(0.01);
  });

  it("all values stay within 0-1 range for every phase", () => {
    const phases: ClimaxPhase[] = ["idle", "build", "climax", "sustain", "release"];
    for (const phase of phases) {
      const state = computeVisualFocus(phase, 0.5, 200);
      expect(state.shaderOpacity).toBeGreaterThanOrEqual(0);
      expect(state.shaderOpacity).toBeLessThanOrEqual(1);
      expect(state.artOpacity).toBeGreaterThanOrEqual(0);
      expect(state.artOpacity).toBeLessThanOrEqual(1);
      expect(state.overlayOpacity).toBeGreaterThanOrEqual(0);
      expect(state.overlayOpacity).toBeLessThanOrEqual(1);
      expect(state.grainOpacity).toBeGreaterThanOrEqual(0);
      expect(state.grainOpacity).toBeLessThanOrEqual(1);
    }
  });
});
