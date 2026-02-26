/**
 * VHSGlitch — VHS tracking distortion during intense peaks.
 * Only appears when energy > 0.3 (peak moments).
 * Horizontal scan line displacement, color channel split,
 * static noise bars, flickering white horizontal lines.
 * Brief appearances (10-30 frames) with rapid on/off.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// ── GLITCH EVENTS ───────────────────────────────────────────────

const ENERGY_THRESHOLD = 0.3;
const MIN_GLITCH_DURATION = 10;
const MAX_GLITCH_DURATION = 30;
const COOLDOWN = 60; // min frames between glitch events

interface GlitchEvent {
  startFrame: number;
  duration: number;
  intensity: number;
}

interface ScanLine {
  y: number;
  height: number;
  xOffset: number;
  opacity: number;
}

interface NoiseBand {
  y: number;
  height: number;
  opacity: number;
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const VHSGlitch: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute glitch events deterministically
  const glitchEvents = React.useMemo(() => {
    const events: GlitchEvent[] = [];
    let lastEnd = -COOLDOWN;

    for (let f = 0; f < frames.length; f++) {
      // Rolling energy at frame f
      let rSum = 0;
      let rCount = 0;
      for (let j = Math.max(0, f - 75); j <= Math.min(frames.length - 1, f + 75); j++) {
        rSum += frames[j].rms;
        rCount++;
      }
      const re = rCount > 0 ? rSum / rCount : 0;

      if (re >= ENERGY_THRESHOLD && f - lastEnd >= COOLDOWN) {
        const rng = seeded(f * 13 + 666);
        const dur = MIN_GLITCH_DURATION + Math.floor(rng() * (MAX_GLITCH_DURATION - MIN_GLITCH_DURATION));
        events.push({
          startFrame: f,
          duration: dur,
          intensity: interpolate(re, [ENERGY_THRESHOLD, 0.5], [0.4, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        });
        lastEnd = f + dur;
      }
    }
    return events;
  }, [frames]);

  // Find active glitch event
  const activeGlitch = glitchEvents.find(
    g => frame >= g.startFrame && frame < g.startFrame + g.duration
  );

  if (!activeGlitch) return null;

  const glitchAge = frame - activeGlitch.startFrame;
  const glitchProgress = glitchAge / activeGlitch.duration;
  const envelope = interpolate(glitchProgress, [0, 0.1, 0.8, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const intensity = activeGlitch.intensity * envelope;

  // Generate per-frame randomness deterministically
  const rng = seeded(frame * 7 + 31337);

  // Scan line displacements
  const numScanLines = 3 + Math.floor(rng() * 5);
  const scanLines: ScanLine[] = Array.from({ length: numScanLines }, () => ({
    y: rng() * height,
    height: 2 + rng() * 8,
    xOffset: (rng() - 0.5) * 40 * intensity,
    opacity: 0.3 + rng() * 0.5,
  }));

  // Noise bands
  const numNoiseBands = 2 + Math.floor(rng() * 4);
  const noiseBands: NoiseBand[] = Array.from({ length: numNoiseBands }, () => ({
    y: rng() * height,
    height: 1 + rng() * 3,
    opacity: 0.2 + rng() * 0.6,
  }));

  // Color channel split offset
  const channelOffset = 2 + intensity * 10;

  // Rapid flicker (on/off per frame)
  const flickerOn = rng() > 0.25;
  if (!flickerOn) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Color channel split - Red offset */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(255, 0, 0, ${intensity * 0.08})`,
          transform: `translateX(${channelOffset}px)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      {/* Color channel split - Blue offset */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0, 0, 255, ${intensity * 0.08})`,
          transform: `translateX(${-channelOffset}px)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      {/* Color channel split - Green stays centered */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0, 255, 0, ${intensity * 0.04})`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {/* Scan line displacements */}
        {scanLines.map((sl, i) => (
          <rect
            key={`scan-${i}`}
            x={sl.xOffset}
            y={sl.y}
            width={width}
            height={sl.height}
            fill={`rgba(255, 255, 255, ${sl.opacity * intensity})`}
          />
        ))}

        {/* Static noise horizontal bars */}
        {noiseBands.map((nb, i) => (
          <rect
            key={`noise-${i}`}
            x={0}
            y={nb.y}
            width={width}
            height={nb.height}
            fill={`rgba(200, 200, 200, ${nb.opacity * intensity})`}
          />
        ))}

        {/* Tracking distortion line */}
        <rect
          x={0}
          y={((frame * 3.7) % height)}
          width={width}
          height={2}
          fill={`rgba(255, 255, 255, ${0.5 * intensity})`}
        />
      </svg>

      {/* Overall VHS tint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(100, 80, 120, ${intensity * 0.06})`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
