/**
 * VenueAtmosphere — Stage and venue environmental lighting (CSS + SVG).
 *
 * 6 variants simulating different stage/venue lighting effects.
 * Light beams, washes, haze, and gobos react to music energy and palette.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../../data/types";
import { useShowContext } from "../../data/ShowContext";
import { useSongPalette, blendWithPalette } from "../../data/SongPaletteContext";
import { seeded } from "../../utils/seededRandom";
import { useSmoothedEnergy, useFrameIndex } from "./audio-helpers";
import type { OverlayProps } from "./types";

// ─── Variant Configuration ───

interface VenueVariantConfig {
  name: string;
  seed: number;
  lightCount: number;
  colorMode: "palette" | "warm_white" | "gel_colors" | "rainbow_sweep";
  sweepSpeed: number;
  beamWidth: number;
  hazeAmount: number;
  position: "overhead" | "floor" | "sides" | "behind";
}

const VARIANT_CONFIGS: VenueVariantConfig[] = [
  { name: "stage_wash", seed: 9001, lightCount: 4, colorMode: "palette", sweepSpeed: 0.3, beamWidth: 0.3, hazeAmount: 0.4, position: "overhead" },
  { name: "spotlight_sweep", seed: 9002, lightCount: 2, colorMode: "warm_white", sweepSpeed: 0.8, beamWidth: 0.15, hazeAmount: 0.2, position: "overhead" },
  { name: "haze_layer", seed: 9003, lightCount: 1, colorMode: "palette", sweepSpeed: 0.05, beamWidth: 1.0, hazeAmount: 0.8, position: "behind" },
  { name: "par_cans", seed: 9004, lightCount: 6, colorMode: "gel_colors", sweepSpeed: 0.1, beamWidth: 0.2, hazeAmount: 0.3, position: "overhead" },
  { name: "follow_spot", seed: 9005, lightCount: 1, colorMode: "warm_white", sweepSpeed: 1.2, beamWidth: 0.12, hazeAmount: 0.15, position: "overhead" },
  { name: "gobo_pattern", seed: 9006, lightCount: 3, colorMode: "gel_colors", sweepSpeed: 0.2, beamWidth: 0.25, hazeAmount: 0.5, position: "floor" },
];

// ─── Light Data ───

interface LightData {
  baseAngle: number;
  sweepRange: number;
  hue: number;
  intensity: number;
  phaseOffset: number;
  xPosition: number;
}

function generateLights(config: VenueVariantConfig, showSeed: number, paletteHue: number): LightData[] {
  const rng = seeded(config.seed ^ showSeed);

  const gelHues = [0, 30, 200, 280, 330, 120]; // R, amber, blue, purple, magenta, green

  return Array.from({ length: config.lightCount }, (_, i) => {
    let hue: number;
    switch (config.colorMode) {
      case "warm_white": hue = 40 + rng() * 20; break;
      case "gel_colors": hue = gelHues[i % gelHues.length] + rng() * 20 - 10; break;
      case "rainbow_sweep": hue = (i / config.lightCount) * 360; break;
      default: hue = paletteHue + rng() * 60 - 30; break;
    }

    return {
      baseAngle: (i / config.lightCount) * 180 - 90 + rng() * 20 - 10,
      sweepRange: 20 + rng() * 40,
      hue: ((hue % 360) + 360) % 360,
      intensity: 0.6 + rng() * 0.4,
      phaseOffset: rng() * Math.PI * 2,
      xPosition: (i + 0.5) / config.lightCount,
    };
  });
}

// ─── Factory ───

function createVenueAtmosphereVariant(config: VenueVariantConfig): React.FC<OverlayProps> {
  const Component: React.FC<OverlayProps> = ({ frames }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const ctx = useShowContext();
    const palette = useSongPalette();
    const energy = useSmoothedEnergy(frames);
    const idx = useFrameIndex(frames);

    const showSeed = ctx?.showSeed ?? 19770508;
    const lights = React.useMemo(
      () => generateLights(config, showSeed, palette.primary),
      [showSeed, palette.primary],
    );

    const isBeat = idx < frames.length && frames[idx].beat;

    // Master fade-in
    const masterFade = interpolate(frame, [60, 180], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    const masterOpacity = interpolate(energy, [0.02, 0.2], [0.15, 0.5], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }) * masterFade;

    if (masterOpacity < 0.01) return null;

    // Haze layer (fullscreen overlay)
    const hazeOpacity = config.hazeAmount * energy * 0.5;

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {/* Haze background */}
        {hazeOpacity > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse 120% 80% at 50% 30%, hsla(${palette.primary}, 30%, 50%, ${hazeOpacity}), transparent 70%)`,
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* Light beams via SVG */}
        <svg width={width} height={height} style={{ opacity: masterOpacity }}>
          <defs>
            {lights.map((light, i) => (
              <radialGradient key={`g${i}`} id={`venue-beam-${config.seed}-${i}`}>
                <stop offset="0%" stopColor={`hsla(${light.hue}, 80%, 70%, 0.6)`} />
                <stop offset="50%" stopColor={`hsla(${light.hue}, 70%, 60%, 0.2)`} />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            ))}
          </defs>

          {lights.map((light, i) => {
            const t = frame + light.phaseOffset;
            const sweepAngle = light.baseAngle + Math.sin(t * 0.005 * config.sweepSpeed) * light.sweepRange;
            const angleRad = (sweepAngle * Math.PI) / 180;

            // Light source position
            let sx: number, sy: number;
            switch (config.position) {
              case "floor":
                sx = light.xPosition * width;
                sy = height;
                break;
              case "sides":
                sx = i % 2 === 0 ? 0 : width;
                sy = height * 0.3 + light.xPosition * height * 0.4;
                break;
              case "behind":
                sx = width / 2;
                sy = height * 0.3;
                break;
              default: // overhead
                sx = light.xPosition * width;
                sy = 0;
            }

            // Beam endpoint
            const beamLength = Math.max(width, height) * 1.2;
            const endDir = config.position === "floor" ? -1 : 1;
            const ex = sx + Math.sin(angleRad) * beamLength;
            const ey = sy + Math.cos(angleRad) * beamLength * endDir;

            // Beam width at endpoint
            const beamW = beamLength * config.beamWidth;

            // Beat flash
            const beatIntensity = isBeat ? 1.3 : 1;

            // Beam as polygon (trapezoid)
            const perpX = Math.cos(angleRad) * beamW * 0.5;
            const perpY = -Math.sin(angleRad) * beamW * 0.5;
            const sourceW = 5; // narrow at source
            const spX = Math.cos(angleRad) * sourceW;
            const spY = -Math.sin(angleRad) * sourceW;

            const opacity = light.intensity * beatIntensity * energy;

            // Rainbow sweep: rotate hue over time
            let hue = light.hue;
            if (config.colorMode === "rainbow_sweep") {
              hue = (light.hue + frame * 0.5) % 360;
            }

            return (
              <g key={i}>
                <polygon
                  points={`${sx - spX},${sy - spY} ${sx + spX},${sy + spY} ${ex + perpX},${ey + perpY} ${ex - perpX},${ey - perpY}`}
                  fill={`hsla(${hue}, 70%, 65%, ${opacity * 0.15})`}
                  style={{ filter: `blur(${15 + config.hazeAmount * 20}px)` }}
                />
                {/* Hot spot at source */}
                <circle
                  cx={sx}
                  cy={sy}
                  r={8 + energy * 5}
                  fill={`hsla(${hue}, 60%, 85%, ${opacity * 0.4})`}
                  style={{ filter: `blur(${6}px)` }}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  Component.displayName = `VenueAtmosphere_${config.name.charAt(0).toUpperCase() + config.name.slice(1)}`;
  return Component;
}

// ─── Exports ───

export const VenueAtmosphere_StageWash = createVenueAtmosphereVariant(VARIANT_CONFIGS[0]);
export const VenueAtmosphere_SpotlightSweep = createVenueAtmosphereVariant(VARIANT_CONFIGS[1]);
export const VenueAtmosphere_HazeLayer = createVenueAtmosphereVariant(VARIANT_CONFIGS[2]);
export const VenueAtmosphere_ParCans = createVenueAtmosphereVariant(VARIANT_CONFIGS[3]);
export const VenueAtmosphere_FollowSpot = createVenueAtmosphereVariant(VARIANT_CONFIGS[4]);
export const VenueAtmosphere_GoboPattern = createVenueAtmosphereVariant(VARIANT_CONFIGS[5]);
