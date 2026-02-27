/**
 * ParticleField — Unified parametric particle engine (SVG circles).
 *
 * Replaces: Fireflies, CosmicStarfield, CampfireSparks, SpiritWisps, EmberRise, PollenDrift.
 * 8 variants, each producing distinct visual personality from the same engine.
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

interface ParticleVariantConfig {
  name: string;
  seed: number;
  particleCount: number;
  sizeRange: [number, number];
  colorMode: "palette_blend" | "rainbow" | "warm_glow" | "cool_mist";
  driftSpeed: number;
  blinkFreq: number;
  glowRadius: number;
  energyResponse: "inverse" | "proportional" | "peak_only";
  trailLength: number;
  hueRange: [number, number];
  saturation: number;
  lightness: number;
}

const VARIANT_CONFIGS: ParticleVariantConfig[] = [
  {
    name: "fireflies",
    seed: 4001,
    particleCount: 45,
    sizeRange: [2, 5],
    colorMode: "warm_glow",
    driftSpeed: 0.15,
    blinkFreq: 0.08,
    glowRadius: 4,
    energyResponse: "inverse",
    trailLength: 0,
    hueRange: [50, 105],
    saturation: 90,
    lightness: 75,
  },
  {
    name: "stardust",
    seed: 4002,
    particleCount: 120,
    sizeRange: [1, 3],
    colorMode: "cool_mist",
    driftSpeed: 0.04,
    blinkFreq: 0.03,
    glowRadius: 3,
    energyResponse: "inverse",
    trailLength: 0,
    hueRange: [200, 280],
    saturation: 70,
    lightness: 85,
  },
  {
    name: "embers",
    seed: 4003,
    particleCount: 60,
    sizeRange: [2, 6],
    colorMode: "warm_glow",
    driftSpeed: 0.3,
    blinkFreq: 0.12,
    glowRadius: 5,
    energyResponse: "proportional",
    trailLength: 3,
    hueRange: [10, 45],
    saturation: 100,
    lightness: 60,
  },
  {
    name: "pollen_drift",
    seed: 4004,
    particleCount: 80,
    sizeRange: [1, 4],
    colorMode: "palette_blend",
    driftSpeed: 0.06,
    blinkFreq: 0.02,
    glowRadius: 2,
    energyResponse: "inverse",
    trailLength: 0,
    hueRange: [40, 90],
    saturation: 50,
    lightness: 80,
  },
  {
    name: "aurora_motes",
    seed: 4005,
    particleCount: 50,
    sizeRange: [2, 5],
    colorMode: "rainbow",
    driftSpeed: 0.08,
    blinkFreq: 0.04,
    glowRadius: 6,
    energyResponse: "inverse",
    trailLength: 2,
    hueRange: [100, 280],
    saturation: 80,
    lightness: 70,
  },
  {
    name: "spirit_orbs",
    seed: 4006,
    particleCount: 30,
    sizeRange: [3, 8],
    colorMode: "palette_blend",
    driftSpeed: 0.05,
    blinkFreq: 0.025,
    glowRadius: 8,
    energyResponse: "inverse",
    trailLength: 4,
    hueRange: [180, 300],
    saturation: 60,
    lightness: 80,
  },
  {
    name: "rain_sparkle",
    seed: 4007,
    particleCount: 150,
    sizeRange: [1, 2],
    colorMode: "cool_mist",
    driftSpeed: 0.5,
    blinkFreq: 0.2,
    glowRadius: 2,
    energyResponse: "proportional",
    trailLength: 5,
    hueRange: [190, 240],
    saturation: 40,
    lightness: 90,
  },
  {
    name: "dandelion_seeds",
    seed: 4008,
    particleCount: 40,
    sizeRange: [2, 5],
    colorMode: "warm_glow",
    driftSpeed: 0.03,
    blinkFreq: 0.015,
    glowRadius: 3,
    energyResponse: "inverse",
    trailLength: 1,
    hueRange: [30, 60],
    saturation: 30,
    lightness: 90,
  },
];

// ─── Particle Data ───

interface ParticleData {
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  sineFreqX: number;
  sineFreqY: number;
  ampX: number;
  ampY: number;
  blinkOn: number;
  blinkOff: number;
  blinkPhase: number;
  radius: number;
  hue: number;
  brightness: number;
}

function generateParticles(
  config: ParticleVariantConfig,
  showSeed: number,
): ParticleData[] {
  const rng = seeded(config.seed ^ showSeed);
  const [hMin, hMax] = config.hueRange;
  const hRange = hMax - hMin;

  return Array.from({ length: config.particleCount }, () => ({
    x: rng(),
    y: rng(),
    driftX: (rng() - 0.5) * config.driftSpeed,
    driftY: (rng() - 0.5) * config.driftSpeed * (config.name === "embers" || config.name === "rain_sparkle" ? -2 : 0.8),
    sineFreqX: 0.003 + rng() * 0.012,
    sineFreqY: 0.002 + rng() * 0.01,
    ampX: 10 + rng() * 50,
    ampY: 8 + rng() * 40,
    blinkOn: 50 + Math.floor(rng() * 70),
    blinkOff: 20 + Math.floor(rng() * 40),
    blinkPhase: Math.floor(rng() * 200),
    radius: config.sizeRange[0] + rng() * (config.sizeRange[1] - config.sizeRange[0]),
    hue: hMin + rng() * hRange,
    brightness: 0.4 + rng() * 0.6,
  }));
}

// ─── Factory ───

function createParticleFieldVariant(config: ParticleVariantConfig): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);

    const showSeed = ctx?.showSeed ?? 19770508;
    const particles = React.useMemo(
      () => generateParticles(config, showSeed),
      [showSeed],
    );

    // Energy mapping per variant
    let energyFactor: number;
    if (config.energyResponse === "inverse") {
      energyFactor = 1 - interpolate(energy, [0.03, 0.22], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
    } else if (config.energyResponse === "proportional") {
      energyFactor = interpolate(energy, [0.03, 0.3], [0.3, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
    } else {
      // peak_only: only visible during energy spikes
      energyFactor = interpolate(energy, [0.15, 0.35], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
    }

    // Master fade-in (staggered, 4s)
    const masterFade = interpolate(frame, [120, 240], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    const masterOpacity = interpolate(energyFactor, [0, 1], [0.1, 0.6], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }) * masterFade;

    if (masterOpacity < 0.01) return null;

    // Sync strength (energy-driven blink convergence)
    const syncStrength = interpolate(energy, [0.1, 0.35], [0, 0.7], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    const globalBlink = (Math.sin(frame * config.blinkFreq) + 1) * 0.5;

    const activeCount = Math.floor(
      interpolate(energyFactor, [0, 1], [
        config.particleCount * 0.3,
        config.particleCount,
      ], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <svg width={width} height={height} style={{ opacity: masterOpacity }}>
          {particles.slice(0, activeCount).map((p, i) => {
            // Staggered entrance
            const pFade = interpolate(
              frame, [120 + i * 4, 120 + i * 4 + 60], [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
            );
            if (pFade < 0.01) return null;

            // Position with drift + sine wander + edge wrap
            const rawX = p.x * width + Math.sin(frame * p.sineFreqX + p.blinkPhase) * p.ampX + frame * p.driftX;
            const rawY = p.y * height + Math.cos(frame * p.sineFreqY + p.blinkPhase * 1.3) * p.ampY + frame * p.driftY;
            const wx = ((rawX % width) + width) % width;
            const wy = ((rawY % height) + height) % height;

            // Blink cycle
            const cycle = p.blinkOn + p.blinkOff;
            const blinkFrame = (frame + p.blinkPhase) % cycle;
            let individualBlink: number;
            if (blinkFrame < p.blinkOn) {
              individualBlink = Math.sin((blinkFrame / p.blinkOn) * Math.PI);
            } else {
              individualBlink = 0;
            }
            const blinkValue = individualBlink * (1 - syncStrength) + globalBlink * syncStrength;

            const alpha = blinkValue * p.brightness * pFade;
            if (alpha < 0.02) return null;

            // Color: blend with palette when in palette mode
            let hue = p.hue;
            if (config.colorMode === "palette_blend") {
              hue = blendWithPalette(p.hue, palette, 0.4);
            } else if (config.colorMode === "rainbow") {
              hue = (p.hue + frame * 0.3) % 360;
            }

            const r = p.radius * (0.7 + blinkValue * 0.5);
            const gr = config.glowRadius;
            const coreColor = `hsla(${hue}, ${config.saturation}%, ${config.lightness}%, ${alpha})`;
            const glowColor = `hsla(${hue}, 100%, ${config.lightness - 15}%, ${alpha * 0.6})`;
            const outerGlow = `hsla(${hue}, 100%, ${config.lightness - 25}%, ${alpha * 0.25})`;

            return (
              <g key={i}>
                <circle cx={wx} cy={wy} r={r * gr} fill={outerGlow} style={{ filter: `blur(${3 + blinkValue * 3}px)` }} />
                <circle cx={wx} cy={wy} r={r * (gr * 0.5)} fill={glowColor} style={{ filter: `blur(${1.5 + blinkValue * 2}px)` }} />
                <circle cx={wx} cy={wy} r={r} fill={coreColor} />
                {config.trailLength > 0 && alpha > 0.1 && (
                  <line
                    x1={wx}
                    y1={wy}
                    x2={wx - p.driftX * config.trailLength * 10}
                    y2={wy - p.driftY * config.trailLength * 10}
                    stroke={glowColor}
                    strokeWidth={r * 0.5}
                    strokeLinecap="round"
                    style={{ filter: `blur(${2}px)` }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  Component.displayName = `ParticleField_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const ParticleField_Fireflies = createParticleFieldVariant(VARIANT_CONFIGS[0]);
export const ParticleField_Stardust = createParticleFieldVariant(VARIANT_CONFIGS[1]);
export const ParticleField_Embers = createParticleFieldVariant(VARIANT_CONFIGS[2]);
export const ParticleField_PollenDrift = createParticleFieldVariant(VARIANT_CONFIGS[3]);
export const ParticleField_AuroraMotes = createParticleFieldVariant(VARIANT_CONFIGS[4]);
export const ParticleField_SpiritOrbs = createParticleFieldVariant(VARIANT_CONFIGS[5]);
export const ParticleField_RainSparkle = createParticleFieldVariant(VARIANT_CONFIGS[6]);
export const ParticleField_DandelionSeeds = createParticleFieldVariant(VARIANT_CONFIGS[7]);
