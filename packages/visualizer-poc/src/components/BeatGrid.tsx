/**
 * BeatGrid — Concentric pulsing rings synced to detected tempo.
 * Makes rhythm visible even during quiet passages. 5 rings that cascade
 * outward from center on each beat detection.
 */
import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useSongPalette } from "../data/SongPaletteContext";

const RING_COUNT = 5;
const MIN_RADIUS = 60;
const PROPAGATION_FRAMES = 8; // frames for pulse to travel between rings
const MAX_LOOKBACK = 60; // frames to scan for recent beats
const DOWNBEAT_THICKNESS = 3.5;
const NORMAL_THICKNESS = 2;

export const BeatGrid: React.FC<{ frames: EnhancedFrameData[] }> = ({
  frames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const palette = useSongPalette();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  const beatConfidence = fd.beatConfidence ?? 0.5;

  const opacity = interpolate(beatConfidence, [0.2, 0.8], [0.1, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const palettePrimary = palette.primary;
  const paletteSecondary = palette.secondary;
  const paletteSaturation = palette.saturation ?? 1;

  const maxRadius = Math.min(width, height) * 0.35;
  const ringSpacing = (maxRadius - MIN_RADIUS) / (RING_COUNT - 1);

  // Scan backward for recent beats and downbeats (deterministic, no state)
  const recentBeats = useMemo(() => {
    const beats: { frame: number; isDownbeat: boolean }[] = [];
    const start = Math.max(0, idx - MAX_LOOKBACK);
    for (let i = idx; i >= start; i--) {
      if (frames[i].beat) {
        beats.push({
          frame: i,
          isDownbeat: frames[i].downbeat ?? false,
        });
      }
    }
    return beats;
  }, [frames, idx]);

  // Drum onset brightness boost
  const drumBoost = fd.stemDrumOnset ?? 0;

  // Compute ring intensities
  const rings = useMemo(() => {
    const ringData: {
      radius: number;
      intensity: number;
      isDownbeat: boolean;
      saturation: number;
    }[] = [];

    for (let r = 0; r < RING_COUNT; r++) {
      const radius = MIN_RADIUS + r * ringSpacing;
      let maxIntensity = 0;
      let isDownbeat = false;

      // Each beat creates a cascade: ring 0 fires immediately,
      // ring 1 fires PROPAGATION_FRAMES later, etc.
      for (const beat of recentBeats) {
        const framesSinceBeat = idx - beat.frame;
        const targetFrame = r * PROPAGATION_FRAMES;
        const dist = Math.abs(framesSinceBeat - targetFrame);

        if (dist < PROPAGATION_FRAMES) {
          // Intensity peaks when pulse arrives at this ring
          const t = 1 - dist / PROPAGATION_FRAMES;
          const intensity = t * t; // quadratic falloff
          if (intensity > maxIntensity) {
            maxIntensity = intensity;
            isDownbeat = beat.isDownbeat;
          }
        }
      }

      // Add drum onset brightness
      if (r === 0) {
        maxIntensity = Math.min(1, maxIntensity + drumBoost * 0.3);
      }

      // Saturation decreases outward
      const sat = paletteSaturation * (1 - r * 0.12);

      ringData.push({
        radius,
        intensity: maxIntensity,
        isDownbeat,
        saturation: sat,
      });
    }

    return ringData;
  }, [recentBeats, idx, ringSpacing, drumBoost, paletteSaturation]);

  const cx = width / 2;
  const cy = height / 2;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {rings.map((ring, i) => {
          const hue = ring.isDownbeat ? paletteSecondary : palettePrimary;
          const lightness = 40 + ring.intensity * 35;
          const strokeW = ring.isDownbeat
            ? DOWNBEAT_THICKNESS + ring.intensity * 2
            : NORMAL_THICKNESS + ring.intensity * 1.5;
          const color = `hsl(${hue}, ${ring.saturation * 100}%, ${lightness}%)`;
          const baseAlpha = 0.15 + ring.intensity * 0.85;
          const glowSize = 3 + ring.intensity * 12;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={ring.radius + ring.intensity * 4}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              opacity={baseAlpha}
              style={{
                filter:
                  ring.intensity > 0.1
                    ? `drop-shadow(0 0 ${glowSize}px ${color})`
                    : "none",
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};
