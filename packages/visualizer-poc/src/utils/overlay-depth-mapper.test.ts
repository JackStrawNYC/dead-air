import { describe, it, expect } from "vitest";
import { getOverlayDepthConfig } from "./overlay-depth-mapper";

describe("getOverlayDepthConfig", () => {
  // ── Basic validity ──

  it("returns valid config for all 10 known layers", () => {
    for (let layer = 1; layer <= 10; layer++) {
      const config = getOverlayDepthConfig(layer);
      expect(config.depth).toBeGreaterThanOrEqual(0);
      expect(config.depth).toBeLessThanOrEqual(1);
      expect(config.atmosphericBlend).toBeGreaterThanOrEqual(0);
      expect(config.atmosphericBlend).toBeLessThanOrEqual(1);
      expect(["normal", "screen", "additive"]).toContain(config.blendMode);
    }
  });

  it("returns a fallback config for unknown layer numbers", () => {
    const config = getOverlayDepthConfig(99);
    expect(config.depth).toBeGreaterThanOrEqual(0);
    expect(config.depth).toBeLessThanOrEqual(1);
    expect(["normal", "screen", "additive"]).toContain(config.blendMode);
  });

  // ── Depth ordering ──

  it("atmospheric layers (1) are deeper than info layers (7)", () => {
    const atmospheric = getOverlayDepthConfig(1);
    const info = getOverlayDepthConfig(7);
    expect(atmospheric.depth).toBeGreaterThan(info.depth);
  });

  it("reactive layers (3) are nearer than nature layers (5)", () => {
    const reactive = getOverlayDepthConfig(3);
    const nature = getOverlayDepthConfig(5);
    expect(reactive.depth).toBeLessThan(nature.depth);
  });

  it("distortion layer (10) is at depth 0 — on top of everything", () => {
    const distortion = getOverlayDepthConfig(10);
    expect(distortion.depth).toBe(0);
  });

  it("character layer (6) is nearer than atmospheric layer (1)", () => {
    const character = getOverlayDepthConfig(6);
    const atmospheric = getOverlayDepthConfig(1);
    expect(character.depth).toBeLessThan(atmospheric.depth);
  });

  // ── Atmospheric blend ──

  it("atmospheric blend increases with depth for background layers", () => {
    // Layer 1 (depth 0.9) should have more fog than Layer 7 (depth 0.1)
    const atmospheric = getOverlayDepthConfig(1);
    const info = getOverlayDepthConfig(7);
    expect(atmospheric.atmosphericBlend).toBeGreaterThan(info.atmosphericBlend);
  });

  it("info layer (7) has zero atmospheric fog — text must be readable", () => {
    const info = getOverlayDepthConfig(7);
    expect(info.atmosphericBlend).toBe(0);
  });

  it("distortion layer (10) has zero atmospheric fog", () => {
    const distortion = getOverlayDepthConfig(10);
    expect(distortion.atmosphericBlend).toBe(0);
  });

  it("HUD layer (9) has zero atmospheric fog", () => {
    const hud = getOverlayDepthConfig(9);
    expect(hud.atmosphericBlend).toBe(0);
  });

  it("nature layer (5) has more fog than reactive layer (3)", () => {
    const nature = getOverlayDepthConfig(5);
    const reactive = getOverlayDepthConfig(3);
    expect(nature.atmosphericBlend).toBeGreaterThan(reactive.atmosphericBlend);
  });

  // ── Blend modes ──

  it("atmospheric layer (1) uses additive blending", () => {
    const config = getOverlayDepthConfig(1);
    expect(config.blendMode).toBe("additive");
  });

  it("sacred layer (2) uses screen blending", () => {
    const config = getOverlayDepthConfig(2);
    expect(config.blendMode).toBe("screen");
  });

  it("reactive layer (3) uses additive blending for bright flashes", () => {
    const config = getOverlayDepthConfig(3);
    expect(config.blendMode).toBe("additive");
  });

  it("info layer (7) uses normal blending for readability", () => {
    const config = getOverlayDepthConfig(7);
    expect(config.blendMode).toBe("normal");
  });

  it("all layers return a valid blend mode string", () => {
    const validModes = new Set(["normal", "screen", "additive"]);
    for (let layer = 1; layer <= 10; layer++) {
      const config = getOverlayDepthConfig(layer);
      expect(validModes.has(config.blendMode)).toBe(true);
    }
  });

  // ── Specific layer values ──

  it("layer 1 (Atmospheric) has correct values", () => {
    const config = getOverlayDepthConfig(1);
    expect(config).toEqual({ depth: 0.9, atmosphericBlend: 0.4, blendMode: "additive" });
  });

  it("layer 2 (Sacred) has correct values", () => {
    const config = getOverlayDepthConfig(2);
    expect(config).toEqual({ depth: 0.5, atmosphericBlend: 0.15, blendMode: "screen" });
  });

  it("layer 6 (Character) has correct values", () => {
    const config = getOverlayDepthConfig(6);
    expect(config).toEqual({ depth: 0.4, atmosphericBlend: 0.1, blendMode: "screen" });
  });

  it("layer 10 (Distortion) has correct values", () => {
    const config = getOverlayDepthConfig(10);
    expect(config).toEqual({ depth: 0.0, atmosphericBlend: 0.0, blendMode: "normal" });
  });
});
