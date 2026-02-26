/**
 * FilmBurn — 8mm film burn / light leak effect on edges.
 * Warm orange/amber/white gradients bleeding in from corners and edges.
 * Appears in bursts every 35s for 6-8s. Multiple gradient hotspots that drift.
 * Overexposure simulation. Use radial gradients with screen blend mode.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── HOTSPOT DATA ────────────────────────────────────────────────

const CYCLE = 1050; // 35 seconds
const DURATION = 210; // 7 seconds
const NUM_HOTSPOTS = 5;

interface HotspotData {
  edgeX: number; // 0=left, 1=right
  edgeY: number; // 0=top, 1=bottom
  driftFreqX: number;
  driftFreqY: number;
  driftAmpX: number;
  driftAmpY: number;
  phaseX: number;
  phaseY: number;
  size: number;
  warmth: number; // 0=amber, 1=white
  peakOpacity: number;
}

function generateHotspots(seed: number): HotspotData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_HOTSPOTS }, () => {
    // Prefer edges and corners
    const edge = rng();
    let edgeX: number;
    let edgeY: number;
    if (edge < 0.25) { edgeX = 0; edgeY = rng(); }         // left
    else if (edge < 0.5) { edgeX = 1; edgeY = rng(); }      // right
    else if (edge < 0.75) { edgeX = rng(); edgeY = 0; }      // top
    else { edgeX = rng(); edgeY = 1; }                        // bottom

    return {
      edgeX,
      edgeY,
      driftFreqX: 0.005 + rng() * 0.01,
      driftFreqY: 0.004 + rng() * 0.008,
      driftAmpX: 3 + rng() * 8,
      driftAmpY: 3 + rng() * 8,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      size: 25 + rng() * 35,
      warmth: rng(),
      peakOpacity: 0.3 + rng() * 0.4,
    };
  });
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const FilmBurn: React.FC<Props> = ({ frames }) => {
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

  const cycleIdx = Math.floor(frame / CYCLE);
  const hotspots = React.useMemo(() => generateHotspots(cycleIdx * 41 + 8888), [cycleIdx]);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  // Quick flare in, slower fade out
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.7, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const envelope = Math.min(fadeIn, fadeOut);

  // Energy boost
  const energyBoost = 0.7 + energy * 0.8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {hotspots.map((hs, i) => {
        const cx = hs.edgeX * 100 + Math.sin(frame * hs.driftFreqX + hs.phaseX) * hs.driftAmpX;
        const cy = hs.edgeY * 100 + Math.sin(frame * hs.driftFreqY + hs.phaseY) * hs.driftAmpY;

        // Warm color interpolation: amber -> orange -> white
        const r = Math.round(255);
        const g = Math.round(interpolate(hs.warmth, [0, 0.5, 1], [140, 180, 240], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }));
        const b = Math.round(interpolate(hs.warmth, [0, 0.5, 1], [30, 60, 200], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }));

        // Per-hotspot flicker
        const flicker = 0.8 + Math.sin(frame * 0.12 + i * 2.7) * 0.2;
        const opacity = hs.peakOpacity * envelope * energyBoost * flicker;

        const gradient = `radial-gradient(ellipse ${hs.size}% ${hs.size * 0.8}% at ${cx}% ${cy}%, ` +
          `rgba(${r}, ${g}, ${b}, ${opacity}), ` +
          `rgba(${r}, ${Math.round(g * 0.7)}, ${Math.round(b * 0.3)}, ${opacity * 0.5}) 40%, ` +
          `transparent 100%)`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              background: gradient,
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Overall warm overexposure wash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(255, 180, 60, ${envelope * 0.08 * energyBoost}) 100%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
