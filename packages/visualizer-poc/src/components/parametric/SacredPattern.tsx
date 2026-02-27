/**
 * SacredPattern — Parametric sacred geometry (SVG paths).
 *
 * Replaces: SacredGeometry, MandalaGenerator, FractalZoom.
 * 8 variants with different symmetry, ring count, and build modes.
 * Per-show variation via showSeed, per-song tinting via palette.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { useShowContext } from "../../data/ShowContext";
import { useSongPalette, blendWithPalette } from "../../data/SongPaletteContext";
import { seeded } from "../../utils/seededRandom";
import { useSmoothedEnergy } from "./audio-helpers";
import type { OverlayProps } from "./types";

// ─── Variant Configuration ───

interface SacredVariantConfig {
  name: string;
  seed: number;
  symmetry: number;
  ringCount: number;
  lineWeight: number;
  rotationSpeed: number;
  breatheAmplitude: number;
  buildMode: "instant" | "ring_by_ring" | "spiral_draw";
  innerRadius: number;
  ringSpacing: number;
  complexity: number; // path detail per ring (segments)
}

const VARIANT_CONFIGS: SacredVariantConfig[] = [
  { name: "mandala", seed: 6001, symmetry: 8, ringCount: 6, lineWeight: 1.5, rotationSpeed: 0.15, breatheAmplitude: 0.15, buildMode: "ring_by_ring", innerRadius: 40, ringSpacing: 45, complexity: 24 },
  { name: "flower_of_life", seed: 6002, symmetry: 6, ringCount: 7, lineWeight: 1.2, rotationSpeed: 0.08, breatheAmplitude: 0.1, buildMode: "instant", innerRadius: 50, ringSpacing: 50, complexity: 36 },
  { name: "metatrons_cube", seed: 6003, symmetry: 6, ringCount: 3, lineWeight: 1.0, rotationSpeed: 0.1, breatheAmplitude: 0.08, buildMode: "instant", innerRadius: 60, ringSpacing: 80, complexity: 12 },
  { name: "sri_yantra", seed: 6004, symmetry: 9, ringCount: 5, lineWeight: 1.3, rotationSpeed: 0.05, breatheAmplitude: 0.12, buildMode: "spiral_draw", innerRadius: 30, ringSpacing: 50, complexity: 18 },
  { name: "seed_of_life", seed: 6005, symmetry: 6, ringCount: 4, lineWeight: 1.5, rotationSpeed: 0.12, breatheAmplitude: 0.18, buildMode: "ring_by_ring", innerRadius: 80, ringSpacing: 0, complexity: 36 },
  { name: "torus_knot", seed: 6006, symmetry: 3, ringCount: 8, lineWeight: 1.0, rotationSpeed: 0.25, breatheAmplitude: 0.2, buildMode: "spiral_draw", innerRadius: 30, ringSpacing: 30, complexity: 48 },
  { name: "vesica_piscis", seed: 6007, symmetry: 2, ringCount: 5, lineWeight: 1.8, rotationSpeed: 0.06, breatheAmplitude: 0.1, buildMode: "instant", innerRadius: 100, ringSpacing: 40, complexity: 36 },
  { name: "golden_spiral", seed: 6008, symmetry: 1, ringCount: 9, lineWeight: 1.2, rotationSpeed: 0.2, breatheAmplitude: 0.15, buildMode: "spiral_draw", innerRadius: 10, ringSpacing: 0, complexity: 60 },
];

// ─── Geometry Generation ───

interface RingPath {
  d: string;
  ring: number;
}

function generateGeometry(
  config: SacredVariantConfig,
  cx: number,
  cy: number,
  showSeed: number,
): RingPath[] {
  const rng = seeded(config.seed ^ showSeed);
  const paths: RingPath[] = [];

  if (config.name === "golden_spiral") {
    // Golden spiral: Fibonacci growth
    const phi = (1 + Math.sqrt(5)) / 2;
    for (let ring = 0; ring < config.ringCount; ring++) {
      const points: string[] = [];
      const segs = config.complexity;
      for (let s = 0; s <= segs; s++) {
        const t = (s / segs) * Math.PI * 2 * (ring + 1);
        const r = config.innerRadius * Math.pow(phi, t / (Math.PI * 2)) * 0.3;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        points.push(`${s === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      paths.push({ d: points.join(" "), ring });
    }
    return paths;
  }

  if (config.name === "seed_of_life" || config.name === "flower_of_life") {
    // Overlapping circles pattern
    const baseR = config.innerRadius;
    // Center circle
    paths.push({ d: circlePath(cx, cy, baseR), ring: 0 });
    // Ring of circles
    for (let ring = 1; ring < config.ringCount; ring++) {
      const count = ring === 1 ? config.symmetry : config.symmetry * ring;
      const ringR = baseR * ring * 0.5;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rng() * 0.1;
        const px = cx + Math.cos(angle) * ringR;
        const py = cy + Math.sin(angle) * ringR;
        paths.push({ d: circlePath(px, py, baseR * 0.6), ring });
      }
    }
    return paths;
  }

  if (config.name === "metatrons_cube") {
    // Points on concentric circles connected by lines
    const points: [number, number][] = [];
    for (let ring = 0; ring < config.ringCount; ring++) {
      const r = config.innerRadius + ring * config.ringSpacing;
      for (let i = 0; i < config.symmetry; i++) {
        const angle = (i / config.symmetry) * Math.PI * 2;
        points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }
    }
    // Connect all points
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        paths.push({
          d: `M ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)} L ${points[j][0].toFixed(1)} ${points[j][1].toFixed(1)}`,
          ring: Math.floor(i / config.symmetry),
        });
      }
    }
    return paths;
  }

  // Default: symmetric petal/mandala rings
  for (let ring = 0; ring < config.ringCount; ring++) {
    const r = config.innerRadius + ring * config.ringSpacing;
    const segs = config.complexity;
    const points: string[] = [];
    for (let s = 0; s <= segs; s++) {
      const angle = (s / segs) * Math.PI * 2;
      const wobble = Math.sin(angle * config.symmetry + rng() * 0.5) * (r * 0.15);
      const pr = r + wobble;
      const x = cx + Math.cos(angle) * pr;
      const y = cy + Math.sin(angle) * pr;
      points.push(`${s === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    paths.push({ d: points.join(" ") + " Z", ring });
  }

  return paths;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

// ─── Factory ───

function createSacredPatternVariant(config: SacredVariantConfig): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);

    const showSeed = ctx?.showSeed ?? 19770508;
    const cx = width / 2;
    const cy = height / 2;

    const geometry = React.useMemo(
      () => generateGeometry(config, cx, cy, showSeed),
      [cx, cy, showSeed],
    );

    // Master fade-in
    const masterFade = interpolate(frame, [90, 240], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    // Energy-driven opacity — visible in mid-energy ranges
    const energyOpacity = interpolate(energy, [0.03, 0.15, 0.3], [0.2, 0.6, 0.4], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });

    const masterOpacity = energyOpacity * masterFade;
    if (masterOpacity < 0.01) return null;

    // Rotation
    const rotation = frame * config.rotationSpeed;

    // Breathe (energy-driven scale oscillation)
    const breathe = 1 + Math.sin(frame * 0.02) * config.breatheAmplitude * energy;

    // Color from palette
    const hue1 = palette.primary;
    const hue2 = palette.secondary;

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <svg
          width={width}
          height={height}
          style={{
            opacity: masterOpacity,
            transform: `rotate(${rotation}deg) scale(${breathe})`,
            transformOrigin: "center center",
          }}
        >
          {geometry.map((path, i) => {
            // Build mode: ring-by-ring reveal
            let pathOpacity = 1;
            if (config.buildMode === "ring_by_ring") {
              pathOpacity = interpolate(
                frame,
                [180 + path.ring * 90, 180 + path.ring * 90 + 120],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
              );
            } else if (config.buildMode === "spiral_draw") {
              const totalPaths = geometry.length;
              const drawStart = 120 + (i / totalPaths) * 300;
              pathOpacity = interpolate(
                frame, [drawStart, drawStart + 60], [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
            }

            if (pathOpacity < 0.01) return null;

            const ringHue = blendWithPalette(
              hue1 + (path.ring / config.ringCount) * (hue2 - hue1),
              palette,
              0.3,
            );

            return (
              <path
                key={i}
                d={path.d}
                fill="none"
                stroke={`hsla(${ringHue}, 70%, 65%, ${pathOpacity * 0.7})`}
                strokeWidth={config.lineWeight}
                style={{ filter: `drop-shadow(0 0 ${3 + energy * 4}px hsla(${ringHue}, 80%, 50%, 0.5))` }}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  Component.displayName = `SacredPattern_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const SacredPattern_Mandala = createSacredPatternVariant(VARIANT_CONFIGS[0]);
export const SacredPattern_FlowerOfLife = createSacredPatternVariant(VARIANT_CONFIGS[1]);
export const SacredPattern_MetatronsCube = createSacredPatternVariant(VARIANT_CONFIGS[2]);
export const SacredPattern_SriYantra = createSacredPatternVariant(VARIANT_CONFIGS[3]);
export const SacredPattern_SeedOfLife = createSacredPatternVariant(VARIANT_CONFIGS[4]);
export const SacredPattern_TorusKnot = createSacredPatternVariant(VARIANT_CONFIGS[5]);
export const SacredPattern_VesicaPiscis = createSacredPatternVariant(VARIANT_CONFIGS[6]);
export const SacredPattern_GoldenSpiral = createSacredPatternVariant(VARIANT_CONFIGS[7]);
