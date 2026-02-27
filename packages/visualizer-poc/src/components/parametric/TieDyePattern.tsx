/**
 * TieDyePattern — Full-screen psychedelic washes using CSS gradients.
 *
 * Near-zero render cost (single div, no SVG/canvas).
 * 8 variants producing wildly different looks from conic/radial/linear gradients.
 * Per-show variation via showSeed, per-song tinting via palette.
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { useShowContext } from "../../data/ShowContext";
import { useSongPalette } from "../../data/SongPaletteContext";
import { seeded } from "../../utils/seededRandom";
import { useSmoothedEnergy } from "./audio-helpers";
import type { OverlayProps } from "./types";

// ─── Variant Configuration ───

interface TieDyeVariantConfig {
  name: string;
  seed: number;
  gradientType: "conic" | "radial" | "linear" | "multi-radial";
  stopCount: number;
  rotationSpeed: number;
  colorDrift: number;
  blurRadius: number;
  blendMode: string;
  scale: number;
  centerDrift: number;
}

const VARIANT_CONFIGS: TieDyeVariantConfig[] = [
  { name: "spiral", seed: 5001, gradientType: "conic", stopCount: 8, rotationSpeed: 0.4, colorDrift: 0.5, blurRadius: 30, blendMode: "screen", scale: 1.2, centerDrift: 0.1 },
  { name: "bullseye", seed: 5002, gradientType: "radial", stopCount: 10, rotationSpeed: 0, colorDrift: 0.3, blurRadius: 20, blendMode: "overlay", scale: 1.5, centerDrift: 0.05 },
  { name: "crumple", seed: 5003, gradientType: "multi-radial", stopCount: 6, rotationSpeed: 0.15, colorDrift: 0.8, blurRadius: 40, blendMode: "screen", scale: 1.0, centerDrift: 0.2 },
  { name: "sunburst", seed: 5004, gradientType: "conic", stopCount: 12, rotationSpeed: 0.6, colorDrift: 0.4, blurRadius: 15, blendMode: "color-dodge", scale: 1.3, centerDrift: 0.08 },
  { name: "ice_dye", seed: 5005, gradientType: "multi-radial", stopCount: 5, rotationSpeed: 0.05, colorDrift: 0.2, blurRadius: 50, blendMode: "soft-light", scale: 1.8, centerDrift: 0.15 },
  { name: "shibori", seed: 5006, gradientType: "linear", stopCount: 8, rotationSpeed: 0.3, colorDrift: 0.6, blurRadius: 25, blendMode: "overlay", scale: 1.0, centerDrift: 0 },
  { name: "nebula_wash", seed: 5007, gradientType: "multi-radial", stopCount: 7, rotationSpeed: 0.1, colorDrift: 0.7, blurRadius: 60, blendMode: "screen", scale: 2.0, centerDrift: 0.12 },
  { name: "liquid_pour", seed: 5008, gradientType: "conic", stopCount: 6, rotationSpeed: 0.8, colorDrift: 1.0, blurRadius: 35, blendMode: "color-dodge", scale: 1.1, centerDrift: 0.18 },
];

// ─── Gradient Generation ───

function generateHues(config: TieDyeVariantConfig, showSeed: number, paletteHue: number, frame: number): number[] {
  const rng = seeded(config.seed ^ showSeed);
  const hues: number[] = [];
  for (let i = 0; i < config.stopCount; i++) {
    const baseHue = paletteHue + rng() * 180 - 90;
    const drifted = baseHue + Math.sin(frame * 0.005 * config.colorDrift + i * 1.3) * 40;
    hues.push(((drifted % 360) + 360) % 360);
  }
  return hues;
}

function buildGradient(config: TieDyeVariantConfig, hues: number[], frame: number, showSeed: number, energy: number): string {
  const rng = seeded(config.seed ^ showSeed ^ 999);
  const rotation = frame * config.rotationSpeed;
  const satBase = 70 + energy * 20;
  const lightBase = 40 + energy * 15;

  const stops = hues.map((h, i) => {
    const pct = (i / (hues.length - 1)) * 100;
    const sat = satBase + Math.sin(frame * 0.008 + i) * 10;
    const lit = lightBase + Math.sin(frame * 0.006 + i * 0.7) * 8;
    return `hsla(${h}, ${sat}%, ${lit}%, 0.7) ${pct}%`;
  }).join(", ");

  if (config.gradientType === "conic") {
    const cx = 50 + Math.sin(frame * 0.003) * config.centerDrift * 100;
    const cy = 50 + Math.cos(frame * 0.004) * config.centerDrift * 100;
    return `conic-gradient(from ${rotation}deg at ${cx}% ${cy}%, ${stops})`;
  }

  if (config.gradientType === "radial") {
    const cx = 50 + Math.sin(frame * 0.003) * config.centerDrift * 100;
    const cy = 50 + Math.cos(frame * 0.004) * config.centerDrift * 100;
    return `radial-gradient(ellipse ${config.scale * 100}% ${config.scale * 80}% at ${cx}% ${cy}%, ${stops})`;
  }

  if (config.gradientType === "linear") {
    return `linear-gradient(${rotation}deg, ${stops})`;
  }

  // multi-radial: stack 3 radial gradients at different positions
  const layers: string[] = [];
  for (let g = 0; g < 3; g++) {
    const cx = 20 + rng() * 60 + Math.sin(frame * 0.003 + g * 2) * config.centerDrift * 100;
    const cy = 20 + rng() * 60 + Math.cos(frame * 0.004 + g * 2.5) * config.centerDrift * 100;
    const layerStops = hues.slice(g * 2, g * 2 + 4).map((h, i) => {
      const pct = (i / 3) * 100;
      return `hsla(${h}, ${satBase}%, ${lightBase}%, ${0.5 - g * 0.1}) ${pct}%`;
    }).join(", ");
    layers.push(`radial-gradient(circle ${config.scale * 50}% at ${cx}% ${cy}%, ${layerStops}, transparent 100%)`);
  }
  return layers.join(", ");
}

// ─── Factory ───

function createTieDyeVariant(config: TieDyeVariantConfig): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);

    const showSeed = ctx?.showSeed ?? 19770508;

    // Master fade-in
    const masterFade = interpolate(frame, [60, 180], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    // Energy-reactive opacity: always somewhat visible
    const energyOpacity = interpolate(energy, [0.02, 0.25], [0.3, 0.7], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });

    const masterOpacity = energyOpacity * masterFade;
    if (masterOpacity < 0.01) return null;

    const hues = generateHues(config, showSeed, palette.primary, frame);
    const gradient = buildGradient(config, hues, frame, showSeed, energy);

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: gradient,
          filter: `blur(${config.blurRadius}px)`,
          mixBlendMode: config.blendMode as React.CSSProperties["mixBlendMode"],
          opacity: masterOpacity,
          transform: `scale(${config.scale})`,
          willChange: "background, opacity",
        }}
      />
    );
  };

  Component.displayName = `TieDyePattern_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const TieDyePattern_Spiral = createTieDyeVariant(VARIANT_CONFIGS[0]);
export const TieDyePattern_Bullseye = createTieDyeVariant(VARIANT_CONFIGS[1]);
export const TieDyePattern_Crumple = createTieDyeVariant(VARIANT_CONFIGS[2]);
export const TieDyePattern_Sunburst = createTieDyeVariant(VARIANT_CONFIGS[3]);
export const TieDyePattern_IceDye = createTieDyeVariant(VARIANT_CONFIGS[4]);
export const TieDyePattern_Shibori = createTieDyeVariant(VARIANT_CONFIGS[5]);
export const TieDyePattern_NebulaWash = createTieDyeVariant(VARIANT_CONFIGS[6]);
export const TieDyePattern_LiquidPour = createTieDyeVariant(VARIANT_CONFIGS[7]);
