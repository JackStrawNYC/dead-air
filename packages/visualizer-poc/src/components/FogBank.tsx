/**
 * FogBank — Layer 1 (Atmospheric)
 * Layered horizontal fog/mist with parallax depth.
 * Thickens during quiet, thins during energy.
 * Tier B | Tags: organic, contemplative | dutyCycle: 100 | energyBand: low
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const NUM_LAYERS = 5;
const STAGGER_START = 120;

interface FogLayer {
  y: number;
  height: number;
  speed: number;
  phase: number;
  opacity: number;
}

function generateLayers(seed: number): FogLayer[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LAYERS }, (_, i) => ({
    y: 0.3 + (i / NUM_LAYERS) * 0.5,
    height: 0.08 + rng() * 0.12,
    speed: 0.2 + rng() * 0.6,
    phase: rng() * 1000,
    opacity: 0.08 + rng() * 0.12,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const FogBank: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[idx].rms;

  const layers = React.useMemo(() => generateLayers((ctx?.showSeed ?? 19770508) + 400), [ctx?.showSeed]);

  const quietness = 1 - interpolate(energy, [0.03, 0.20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(quietness, [0, 1], [0.02, 0.30]) * masterFade;
  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {layers.map((layer, i) => {
        const xOffset = Math.sin((frame + layer.phase) * 0.003 * layer.speed) * width * 0.1;
        const yBase = layer.y * height;
        const layerHeight = layer.height * height * (1 + quietness * 0.5);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xOffset - width * 0.1,
              top: yBase - layerHeight / 2,
              width: width * 1.2,
              height: layerHeight,
              background: `radial-gradient(ellipse 120% 100% at 50% 50%, hsla(210, 20%, 80%, ${layer.opacity * masterOpacity}) 0%, transparent 70%)`,
              filter: `blur(${20 + i * 8}px)`,
              mixBlendMode: "screen",
            }}
          />
        );
      })}
    </div>
  );
};
