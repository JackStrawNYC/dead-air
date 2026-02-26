/**
 * OilSlick — Iridescent rainbow surface.
 * Full-screen overlay with shifting rainbow colors derived from chroma data.
 * Multiple overlapping radial-gradient layers with different centers that drift slowly.
 * Very subtle: 5-15% opacity. Always visible.
 * Colors shift with dominant chroma pitch class.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// ── LAYER DATA ──────────────────────────────────────────────────

const NUM_LAYERS = 5;

interface LayerData {
  baseCxPct: number;
  baseCyPct: number;
  driftFreqX: number;
  driftFreqY: number;
  driftAmpX: number;
  driftAmpY: number;
  phaseX: number;
  phaseY: number;
  hueOffset: number;
  size: number;
}

function generateLayers(seed: number): LayerData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LAYERS }, () => ({
    baseCxPct: 10 + rng() * 80,
    baseCyPct: 10 + rng() * 80,
    driftFreqX: 0.002 + rng() * 0.004,
    driftFreqY: 0.003 + rng() * 0.003,
    driftAmpX: 10 + rng() * 15,
    driftAmpY: 8 + rng() * 12,
    phaseX: rng() * Math.PI * 2,
    phaseY: rng() * Math.PI * 2,
    hueOffset: rng() * 120,
    size: 30 + rng() * 40,
  }));
}

function getDominantChroma(chroma: number[]): { idx: number; strength: number } {
  let maxVal = 0;
  let maxIdx = 0;
  for (let i = 0; i < chroma.length; i++) {
    if (chroma[i] > maxVal) {
      maxVal = chroma[i];
      maxIdx = i;
    }
  }
  return { idx: maxIdx, strength: maxVal };
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const OilSlick: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const currentFrame = frames[idx];
  const { idx: chromaIdx } = getDominantChroma(currentFrame ? currentFrame.chroma : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const layers = React.useMemo(() => generateLayers(420420), []);

  // Always visible, 5-15% opacity based on energy
  const opacity = interpolate(energy, [0, 0.3], [0.05, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Base hue from dominant chroma pitch class
  const baseHue = chromaIdx * 30;
  // Rapid iridescent shifting
  const hueShift = frame * 0.8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {layers.map((layer, i) => {
        const cx = layer.baseCxPct + Math.sin(frame * layer.driftFreqX + layer.phaseX) * layer.driftAmpX;
        const cy = layer.baseCyPct + Math.sin(frame * layer.driftFreqY + layer.phaseY) * layer.driftAmpY;

        const hue1 = (baseHue + hueShift + layer.hueOffset) % 360;
        const hue2 = (hue1 + 60) % 360;
        const hue3 = (hue1 + 180) % 360;

        const gradient = `radial-gradient(ellipse ${layer.size}% ${layer.size * 1.2}% at ${cx}% ${cy}%, ` +
          `hsla(${hue1}, 90%, 60%, 0.4), ` +
          `hsla(${hue2}, 85%, 50%, 0.25) 40%, ` +
          `hsla(${hue3}, 80%, 45%, 0.1) 70%, ` +
          `transparent 100%)`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              background: gradient,
              opacity: opacity * (0.7 + i * 0.06),
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
};
