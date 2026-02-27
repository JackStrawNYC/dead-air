/**
 * DeadMotif — Parametric Dead iconography animations (SVG paths).
 *
 * Replaces: SkeletonBand, BearParade, AmericanBeauty, ThirteenPointBolt, MarchingTerrapins.
 * 8 variants with different motifs, arrangements, and animation styles.
 * Per-show variation via showSeed, per-song tinting via palette.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { useShowContext } from "../../data/ShowContext";
import { useSongPalette, blendWithPalette } from "../../data/SongPaletteContext";
import { seeded } from "../../utils/seededRandom";
import { useSmoothedEnergy } from "./audio-helpers";
import { MOTIF_PATHS, type MotifName } from "./DeadMotif.paths";
import type { OverlayProps } from "./types";

// ─── Variant Configuration ───

interface DeadMotifVariantConfig {
  name: string;
  seed: number;
  motif: MotifName;
  count: number;
  arrangement: "parade" | "scatter" | "centered" | "border" | "spiral";
  animation: "bob" | "drift" | "pulse" | "rotate" | "march";
  colorMode: "silhouette" | "neon_outline" | "palette_fill" | "rainbow";
  energyResponse: "dance" | "breathe" | "glow" | "multiply";
  scale: number;
}

const VARIANT_CONFIGS: DeadMotifVariantConfig[] = [
  { name: "skeleton_march", seed: 7001, motif: "skeleton", count: 6, arrangement: "parade", animation: "march", colorMode: "neon_outline", energyResponse: "dance", scale: 0.8 },
  { name: "bear_parade", seed: 7002, motif: "bear", count: 5, arrangement: "parade", animation: "bob", colorMode: "palette_fill", energyResponse: "dance", scale: 0.9 },
  { name: "rose_garden", seed: 7003, motif: "rose", count: 8, arrangement: "scatter", animation: "pulse", colorMode: "palette_fill", energyResponse: "breathe", scale: 0.6 },
  { name: "bolt_flash", seed: 7004, motif: "bolt", count: 3, arrangement: "scatter", animation: "pulse", colorMode: "neon_outline", energyResponse: "glow", scale: 1.2 },
  { name: "terrapin_drift", seed: 7005, motif: "terrapin", count: 4, arrangement: "scatter", animation: "drift", colorMode: "palette_fill", energyResponse: "breathe", scale: 0.7 },
  { name: "scarab_scatter", seed: 7006, motif: "scarab", count: 6, arrangement: "scatter", animation: "rotate", colorMode: "silhouette", energyResponse: "glow", scale: 0.5 },
  { name: "stealie_pulse", seed: 7007, motif: "stealie", count: 1, arrangement: "centered", animation: "pulse", colorMode: "neon_outline", energyResponse: "breathe", scale: 2.5 },
  { name: "mushroom_bloom", seed: 7008, motif: "mushroom", count: 7, arrangement: "border", animation: "bob", colorMode: "rainbow", energyResponse: "multiply", scale: 0.6 },
  { name: "vw_bus_convoy", seed: 7009, motif: "vw_bus", count: 4, arrangement: "parade", animation: "bob", colorMode: "rainbow", energyResponse: "breathe", scale: 1.0 },
  { name: "garcia_hand_drift", seed: 7010, motif: "garcia_hand", count: 2, arrangement: "scatter", animation: "drift", colorMode: "neon_outline", energyResponse: "glow", scale: 1.5 },
];

// ─── Instance Layout ───

interface MotifInstance {
  x: number; // 0-1 normalized
  y: number;
  scaleJitter: number;
  rotationOffset: number;
  phaseOffset: number;
  hueOffset: number;
}

function generateInstances(
  config: DeadMotifVariantConfig,
  showSeed: number,
  width: number,
  height: number,
): MotifInstance[] {
  const rng = seeded(config.seed ^ showSeed);
  const instances: MotifInstance[] = [];

  for (let i = 0; i < config.count; i++) {
    let x: number, y: number;

    switch (config.arrangement) {
      case "parade":
        x = (i + 0.5) / config.count;
        y = 0.75 + rng() * 0.1;
        break;
      case "centered":
        x = 0.5;
        y = 0.5;
        break;
      case "border": {
        // Distribute around edges
        const edge = i % 4;
        const t = ((Math.floor(i / 4) + 0.5) / Math.ceil(config.count / 4));
        if (edge === 0) { x = t; y = 0.05; }
        else if (edge === 1) { x = 0.95; y = t; }
        else if (edge === 2) { x = 1 - t; y = 0.95; }
        else { x = 0.05; y = 1 - t; }
        break;
      }
      case "spiral": {
        const angle = (i / config.count) * Math.PI * 4;
        const r = 0.1 + (i / config.count) * 0.35;
        x = 0.5 + Math.cos(angle) * r;
        y = 0.5 + Math.sin(angle) * r;
        break;
      }
      default: // scatter
        x = 0.1 + rng() * 0.8;
        y = 0.1 + rng() * 0.8;
    }

    instances.push({
      x,
      y,
      scaleJitter: 0.8 + rng() * 0.4,
      rotationOffset: rng() * 360,
      phaseOffset: rng() * 200,
      hueOffset: rng() * 60 - 30,
    });
  }

  return instances;
}

// ─── Factory ───

function createDeadMotifVariant(config: DeadMotifVariantConfig): React.FC<OverlayProps> {
  const pathData = MOTIF_PATHS[config.motif];

  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);

    const showSeed = ctx?.showSeed ?? 19770508;
    const instances = React.useMemo(
      () => generateInstances(config, showSeed, width, height),
      [showSeed, width, height],
    );

    // Master fade-in
    const masterFade = interpolate(frame, [150, 300], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    const masterOpacity = interpolate(energy, [0.03, 0.2], [0.3, 0.6], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }) * masterFade;

    if (masterOpacity < 0.01) return null;

    const motifSize = 60 * config.scale;

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <svg width={width} height={height} style={{ opacity: masterOpacity }}>
          {instances.map((inst, i) => {
            // Staggered entrance
            const iFade = interpolate(
              frame, [150 + i * 30, 150 + i * 30 + 90], [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
            );
            if (iFade < 0.01) return null;

            // Animation
            const t = frame + inst.phaseOffset;
            let dx = 0, dy = 0, rot = 0, sc = inst.scaleJitter;

            switch (config.animation) {
              case "bob":
                dy = Math.sin(t * 0.04) * 8;
                break;
              case "drift":
                dx = Math.sin(t * 0.008) * 30;
                dy = Math.cos(t * 0.006) * 20;
                break;
              case "pulse":
                sc *= 1 + Math.sin(t * 0.03) * 0.15 * (1 + energy);
                break;
              case "rotate":
                rot = t * 0.5;
                break;
              case "march":
                dx = Math.sin(t * 0.06) * 3;
                dy = Math.sin(t * 0.08) * 5;
                // Leg swing via slight rotation
                rot = Math.sin(t * 0.08) * 8;
                break;
            }

            // Energy response
            let energyMod = 1;
            switch (config.energyResponse) {
              case "dance":
                dy += Math.sin(t * 0.1) * energy * 15;
                break;
              case "breathe":
                sc *= 1 + energy * 0.3;
                break;
              case "glow":
                energyMod = 0.5 + energy * 2;
                break;
              case "multiply":
                energyMod = 0.3 + energy * 3;
                break;
            }

            // Color
            const hue = blendWithPalette(palette.primary + inst.hueOffset, palette, 0.4);
            let fill = "none";
            let stroke = "none";
            let strokeWidth = 0;
            let filterStr = "";

            switch (config.colorMode) {
              case "silhouette":
                fill = `hsla(${hue}, 30%, 15%, ${0.6 * iFade * energyMod})`;
                break;
              case "neon_outline":
                stroke = `hsla(${hue}, 90%, 65%, ${0.8 * iFade * energyMod})`;
                strokeWidth = 1.5;
                filterStr = `drop-shadow(0 0 ${4 + energy * 6}px hsla(${hue}, 100%, 50%, 0.7))`;
                break;
              case "palette_fill":
                fill = `hsla(${hue}, 70%, 55%, ${0.6 * iFade * energyMod})`;
                stroke = `hsla(${hue}, 80%, 40%, ${0.3 * iFade})`;
                strokeWidth = 0.8;
                break;
              case "rainbow":
                fill = `hsla(${(hue + frame * 0.5 + i * 40) % 360}, 80%, 60%, ${0.6 * iFade * energyMod})`;
                break;
            }

            const px = inst.x * width + dx;
            const py = inst.y * height + dy;

            return (
              <g
                key={i}
                transform={`translate(${px.toFixed(1)}, ${py.toFixed(1)}) scale(${(sc * motifSize / 100).toFixed(3)}) rotate(${rot.toFixed(1)})`}
                style={{ filter: filterStr || undefined }}
              >
                <path
                  d={pathData}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  transform="translate(-50, -50)"
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  Component.displayName = `DeadMotif_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const DeadMotif_SkeletonMarch = createDeadMotifVariant(VARIANT_CONFIGS[0]);
export const DeadMotif_BearParade = createDeadMotifVariant(VARIANT_CONFIGS[1]);
export const DeadMotif_RoseGarden = createDeadMotifVariant(VARIANT_CONFIGS[2]);
export const DeadMotif_BoltFlash = createDeadMotifVariant(VARIANT_CONFIGS[3]);
export const DeadMotif_TerrapinDrift = createDeadMotifVariant(VARIANT_CONFIGS[4]);
export const DeadMotif_ScarabScatter = createDeadMotifVariant(VARIANT_CONFIGS[5]);
export const DeadMotif_StealiePulse = createDeadMotifVariant(VARIANT_CONFIGS[6]);
export const DeadMotif_MushroomBloom = createDeadMotifVariant(VARIANT_CONFIGS[7]);
export const DeadMotif_VWBusConvoy = createDeadMotifVariant(VARIANT_CONFIGS[8]);
export const DeadMotif_GarciaHandDrift = createDeadMotifVariant(VARIANT_CONFIGS[9]);
