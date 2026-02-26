/**
 * GuitarStrings — 6 horizontal "strings" stretched across the screen.
 * Each string vibrates with displacement driven by a different frequency band
 * (sub, low, mid, high, centroid, rms). Vibration uses sine waves with
 * amplitude from the frequency value. Thin SVG paths with neon colors.
 * More vibration during loud passages.
 * Appears periodically (every 60s, visible 18s).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1800;    // 60 seconds at 30fps
const DURATION = 540;  // 18 seconds visible

const STRING_COLORS = [
  "#FF0066",  // sub — hot pink
  "#FF9900",  // low — orange
  "#FFFF00",  // mid — yellow
  "#00FF99",  // high — green
  "#00CCFF",  // centroid — cyan
  "#CC66FF",  // rms — purple
];

const STRING_GLOW = [
  "rgba(255,0,102,0.7)",
  "rgba(255,153,0,0.7)",
  "rgba(255,255,0,0.7)",
  "rgba(0,255,153,0.7)",
  "rgba(0,204,255,0.7)",
  "rgba(204,102,255,0.7)",
];

// Each string maps to a different frequency band
type BandKey = "sub" | "low" | "mid" | "high" | "centroid" | "rms";
const STRING_BANDS: BandKey[] = ["sub", "low", "mid", "high", "centroid", "rms"];

// Vibration frequency multiplier per string (higher strings vibrate faster)
const VIB_FREQ = [3, 5, 8, 12, 16, 20];

const NUM_POINTS = 120;

interface Props {
  frames: EnhancedFrameData[];
}

export const GuitarStrings: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy window: idx-75 to idx+75
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Periodic visibility
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Staggered fade in/out per string
  const fd = frames[idx];

  // Layout: strings spread vertically across middle of screen
  const topMargin = height * 0.25;
  const bottomMargin = height * 0.75;
  const stringSpacing = (bottomMargin - topMargin) / (STRING_BANDS.length - 1);

  // Glow intensity
  const glowSize = interpolate(energy, [0.03, 0.3], [3, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        {STRING_BANDS.map((band, s) => {
          // Staggered timing: each string fades in 0.5s apart
          const staggerOffset = s * 0.04; // 0 to 0.20
          const fadeIn = interpolate(
            progress,
            [staggerOffset, staggerOffset + 0.08],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          const fadeOutStart = 0.85 + (5 - s) * 0.02; // reverse stagger out
          const fadeOut = interpolate(
            progress,
            [fadeOutStart, Math.min(fadeOutStart + 0.08, 1)],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
          );
          const stringOpacity = Math.min(fadeIn, fadeOut);

          if (stringOpacity < 0.01) return null;

          const baseY = topMargin + s * stringSpacing;
          const bandValue = fd[band];

          // Vibration amplitude driven by band value + energy
          const maxAmp = interpolate(energy, [0.02, 0.3], [5, 35], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const amp = bandValue * maxAmp;

          // Build the vibrating string path
          const pathParts: string[] = [];
          for (let p = 0; p < NUM_POINTS; p++) {
            const t = p / (NUM_POINTS - 1);
            const x = t * width;

            // Standing wave envelope: zero at ends, max in center
            const envelope = Math.sin(t * Math.PI);

            // Multi-harmonic vibration
            const freq = VIB_FREQ[s];
            const phase = frame * 0.15 * (1 + energy * 2);
            const vib1 = Math.sin(t * freq + phase) * amp * envelope;
            const vib2 = Math.sin(t * freq * 2.3 + phase * 1.3) * amp * 0.3 * envelope;
            const vib3 = Math.sin(t * freq * 0.5 + phase * 0.7) * amp * 0.15 * envelope;

            const y = baseY + vib1 + vib2 + vib3;

            if (p === 0) {
              pathParts.push(`M ${x} ${y}`);
            } else {
              pathParts.push(`L ${x} ${y}`);
            }
          }

          const pathD = pathParts.join(" ");
          const color = STRING_COLORS[s];
          const glow = STRING_GLOW[s];

          // String thickness: thicker for lower strings
          const strokeW = interpolate(s, [0, 5], [2.5, 1.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g
              key={s}
              opacity={stringOpacity}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${glow}) drop-shadow(0 0 ${glowSize * 2}px ${glow})`,
              }}
            >
              {/* String shadow / blur layer */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={strokeW + 2}
                opacity={0.15}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Main string */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Bright center highlight */}
              <path
                d={pathD}
                fill="none"
                stroke="white"
                strokeWidth={strokeW * 0.3}
                opacity={0.4 * bandValue}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Anchor points at screen edges */}
              <circle cx={0} cy={baseY} r={3} fill={color} opacity={0.6} />
              <circle cx={width} cy={baseY} r={3} fill={color} opacity={0.6} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
