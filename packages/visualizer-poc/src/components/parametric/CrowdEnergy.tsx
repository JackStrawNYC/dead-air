/**
 * CrowdEnergy — Concert audience simulation (SVG shapes).
 *
 * 6 variants simulating different crowd behaviors that track musical energy.
 * Silhouettes at screen bottom/sides respond to beats, energy, and dynamics.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { useShowContext } from "../../data/ShowContext";
import { useSongPalette } from "../../data/SongPaletteContext";
import { seeded } from "../../utils/seededRandom";
import { useSmoothedEnergy, useFrameIndex } from "./audio-helpers";
import type { OverlayProps } from "./types";

// ─── Variant Configuration ───

interface CrowdVariantConfig {
  name: string;
  seed: number;
  personCount: number;
  position: "bottom" | "sides" | "surround";
  silhouetteStyle: "simple" | "detailed" | "abstract";
  energyMapping: "hands" | "sway_amplitude" | "density" | "glow_intensity";
}

const VARIANT_CONFIGS: CrowdVariantConfig[] = [
  { name: "lighter_wave", seed: 8001, personCount: 25, position: "bottom", silhouetteStyle: "simple", energyMapping: "hands" },
  { name: "crowd_sway", seed: 8002, personCount: 30, position: "bottom", silhouetteStyle: "detailed", energyMapping: "sway_amplitude" },
  { name: "clap_sync", seed: 8003, personCount: 20, position: "bottom", silhouetteStyle: "simple", energyMapping: "hands" },
  { name: "dance_floor", seed: 8004, personCount: 35, position: "surround", silhouetteStyle: "abstract", energyMapping: "sway_amplitude" },
  { name: "hands_up", seed: 8005, personCount: 30, position: "bottom", silhouetteStyle: "simple", energyMapping: "hands" },
  { name: "head_bob", seed: 8006, personCount: 25, position: "bottom", silhouetteStyle: "detailed", energyMapping: "density" },
];

// ─── Person Data ───

interface PersonData {
  x: number;       // 0-1
  baseY: number;   // 0-1 (from bottom)
  height: number;  // person height in px
  width: number;
  phase: number;
  swaySpeed: number;
  swayAmount: number;
  armLength: number;
}

function generateCrowd(config: CrowdVariantConfig, showSeed: number): PersonData[] {
  const rng = seeded(config.seed ^ showSeed);
  return Array.from({ length: config.personCount }, (_, i) => {
    let x: number, baseY: number;

    switch (config.position) {
      case "sides":
        x = i < config.personCount / 2 ? rng() * 0.15 : 0.85 + rng() * 0.15;
        baseY = 0.3 + rng() * 0.5;
        break;
      case "surround":
        x = rng();
        baseY = rng() > 0.5 ? 0.8 + rng() * 0.15 : rng() * 0.15;
        break;
      default: // bottom
        x = (i + rng() * 0.5) / config.personCount;
        baseY = 0.82 + rng() * 0.12;
    }

    return {
      x,
      baseY,
      height: 40 + rng() * 30,
      width: 12 + rng() * 8,
      phase: rng() * Math.PI * 2,
      swaySpeed: 0.02 + rng() * 0.03,
      swayAmount: 3 + rng() * 8,
      armLength: 15 + rng() * 10,
    };
  });
}

// ─── Factory ───

function createCrowdEnergyVariant(config: CrowdVariantConfig): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);
    const idx = useFrameIndex(frames);

    const showSeed = ctx?.showSeed ?? 19770508;
    const crowd = React.useMemo(
      () => generateCrowd(config, showSeed),
      [showSeed],
    );

    // Beat detection for clap/hands
    const isBeat = idx < frames.length && frames[idx].beat;
    const onset = idx < frames.length ? frames[idx].onset : 0;

    // Master fade-in
    const masterFade = interpolate(frame, [180, 360], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    // Energy-proportional opacity
    const masterOpacity = interpolate(energy, [0.03, 0.2], [0.15, 0.5], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }) * masterFade;

    if (masterOpacity < 0.01) return null;

    const glowHue = palette.primary;

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <svg width={width} height={height} style={{ opacity: masterOpacity }}>
          {crowd.map((person, i) => {
            const px = person.x * width;
            const py = person.baseY * height;

            // Sway
            let swayX = 0;
            let swayScale = 1;
            const t = frame + person.phase;

            switch (config.energyMapping) {
              case "sway_amplitude":
                swayX = Math.sin(t * person.swaySpeed) * person.swayAmount * (0.5 + energy * 2);
                break;
              case "hands":
                swayX = Math.sin(t * person.swaySpeed) * person.swayAmount * 0.5;
                break;
              case "density":
                swayX = Math.sin(t * person.swaySpeed) * person.swayAmount * 0.3;
                swayScale = 0.8 + energy * 0.4;
                break;
              case "glow_intensity":
                swayX = Math.sin(t * person.swaySpeed) * person.swayAmount * 0.4;
                break;
            }

            // Arm position (for hands_up / lighter_wave / clap_sync)
            const armUp = config.energyMapping === "hands"
              ? interpolate(energy, [0.05, 0.25], [0.2, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
              : 0;

            // Beat reaction
            const beatBounce = isBeat ? -3 : 0;

            // Head bob
            const headBob = config.name === "head_bob"
              ? Math.sin(t * 0.06) * 3 * (0.5 + energy)
              : 0;

            // Person silhouette
            const bx = px + swayX;
            const by = py + beatBounce;
            const h = person.height * swayScale;
            const w = person.width;

            // Build person path
            const headR = w * 0.35;
            const headY = by - h + headBob;
            const shoulderY = headY + headR * 2 + 2;
            const armAngle = -Math.PI * 0.5 * armUp + Math.sin(t * 0.04 + person.phase) * 0.3;

            // Lighter/glow for lighter_wave
            const showLighter = config.name === "lighter_wave" && armUp > 0.5;

            // Glow intensity
            const glowStr = config.energyMapping === "glow_intensity"
              ? energy * 8 : onset * 4;

            const personColor = `hsla(0, 0%, 8%, 0.8)`;
            const glowColor = `hsla(${glowHue}, 80%, 60%, ${energy * 0.5})`;

            return (
              <g key={i}>
                {/* Body */}
                <rect
                  x={bx - w / 2}
                  y={shoulderY}
                  width={w}
                  height={h - headR * 2 - 2}
                  rx={w * 0.2}
                  fill={personColor}
                />
                {/* Head */}
                <circle cx={bx} cy={headY + headR} r={headR} fill={personColor} />
                {/* Arms */}
                {armUp > 0.1 && (
                  <>
                    <line
                      x1={bx - w * 0.4}
                      y1={shoulderY + 5}
                      x2={bx - w * 0.4 + Math.cos(armAngle) * person.armLength}
                      y2={shoulderY + 5 + Math.sin(armAngle) * person.armLength}
                      stroke={personColor}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                    <line
                      x1={bx + w * 0.4}
                      y1={shoulderY + 5}
                      x2={bx + w * 0.4 + Math.cos(-armAngle + Math.PI) * person.armLength * -1}
                      y2={shoulderY + 5 + Math.sin(armAngle) * person.armLength}
                      stroke={personColor}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  </>
                )}
                {/* Lighter flame */}
                {showLighter && (
                  <circle
                    cx={bx - w * 0.4 + Math.cos(armAngle) * person.armLength}
                    cy={shoulderY + 5 + Math.sin(armAngle) * person.armLength - 5}
                    r={3 + Math.sin(t * 0.15) * 1.5}
                    fill={`hsla(40, 100%, 70%, ${0.7 + Math.sin(t * 0.2) * 0.3})`}
                    style={{ filter: `blur(2px) drop-shadow(0 0 6px hsla(40, 100%, 50%, 0.8))` }}
                  />
                )}
                {/* Energy glow behind person */}
                {glowStr > 0.5 && (
                  <rect
                    x={bx - w}
                    y={by - h}
                    width={w * 2}
                    height={h}
                    rx={w}
                    fill={glowColor}
                    style={{ filter: `blur(${8 + glowStr}px)` }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  Component.displayName = `CrowdEnergy_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const CrowdEnergy_LighterWave = createCrowdEnergyVariant(VARIANT_CONFIGS[0]);
export const CrowdEnergy_CrowdSway = createCrowdEnergyVariant(VARIANT_CONFIGS[1]);
export const CrowdEnergy_ClapSync = createCrowdEnergyVariant(VARIANT_CONFIGS[2]);
export const CrowdEnergy_DanceFloor = createCrowdEnergyVariant(VARIANT_CONFIGS[3]);
export const CrowdEnergy_HandsUp = createCrowdEnergyVariant(VARIANT_CONFIGS[4]);
export const CrowdEnergy_HeadBob = createCrowdEnergyVariant(VARIANT_CONFIGS[5]);
