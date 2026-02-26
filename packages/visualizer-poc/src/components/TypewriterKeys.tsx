/**
 * TypewriterKeys -- Visual representation of typewriter keys pressing down.
 * A row of 8-10 circular keys at bottom of screen.  Keys depress (translateY)
 * on beat/onset hits, each key assigned to a frequency band.  Higher
 * frequency bands trigger the rightmost keys.  Vintage cream/brown colours
 * with black letters.  Click-clack mechanical feel.  Always visible at low
 * opacity; keys animate on onsets.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const NUM_KEYS = 10;
const KEY_LABELS = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];

/* Each key maps to a frequency band or onset property.
   Left keys = low freq, right keys = high freq. */
function getKeyEnergy(fd: EnhancedFrameData, keyIndex: number): number {
  const bandMap: (keyof EnhancedFrameData)[] = [
    "sub", "sub", "low", "low", "mid", "mid", "high", "high", "centroid", "onset",
  ];
  const field = bandMap[keyIndex];
  const val = fd[field];
  return typeof val === "number" ? val : 0;
}

/* Key appearance constants */
const KEY_RADIUS = 28;
const KEY_GAP = 14;
const KEY_BG = "#F5E6C8";       // vintage cream
const KEY_RING = "#8B7355";     // brown ring
const KEY_LETTER = "#2B1D0E";   // dark brown
const KEY_SHADOW = "#6B5B3E";

interface Props {
  frames: EnhancedFrameData[];
}

export const TypewriterKeys: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* memos BEFORE conditional returns */
  const keyPhases = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 770501);
    return Array.from({ length: NUM_KEYS }, () => rng() * Math.PI * 2);
  }, [ctx?.showSeed]);

  /* gentle fade-in at start */
  const masterFade = interpolate(frame, [0, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  /* base opacity: always visible at low opacity */
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (baseOpacity < 0.01) return null;

  /* layout */
  const totalWidth = NUM_KEYS * (KEY_RADIUS * 2 + KEY_GAP) - KEY_GAP;
  const startX = (width - totalWidth) / 2 + KEY_RADIUS;
  const baseY = height - KEY_RADIUS * 2 - 30;

  const fd = frames[idx];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: baseOpacity }}>
        {KEY_LABELS.map((label, ki) => {
          const keyE = getKeyEnergy(fd, ki);

          /* depress amount: driven by per-key energy, with decay over a few frames */
          const pressDepth = interpolate(keyE, [0.05, 0.5], [0, 14], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          /* slight mechanical jitter */
          const jitter = Math.sin(frame * 0.3 + keyPhases[ki]) * keyE * 2;

          const cx = startX + ki * (KEY_RADIUS * 2 + KEY_GAP);
          const cy = baseY + pressDepth + jitter;

          /* brighten key on hit */
          const hitBright = interpolate(keyE, [0.1, 0.6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const fillLightness = 90 - hitBright * 10; // 80-90%
          const fillColor = `hsl(35, 50%, ${fillLightness}%)`;

          /* shadow offset reduces when key is depressed (pressed flush) */
          const shadowOff = 4 - pressDepth * 0.25;

          return (
            <g key={ki}>
              {/* drop shadow */}
              <circle
                cx={cx + 2}
                cy={cy + shadowOff + 2}
                r={KEY_RADIUS}
                fill={KEY_SHADOW}
                opacity={0.35}
              />
              {/* key body */}
              <circle
                cx={cx}
                cy={cy}
                r={KEY_RADIUS}
                fill={fillColor}
                stroke={KEY_RING}
                strokeWidth={3}
              />
              {/* inner ring */}
              <circle
                cx={cx}
                cy={cy}
                r={KEY_RADIUS - 6}
                fill="none"
                stroke={KEY_RING}
                strokeWidth={1.2}
                opacity={0.5}
              />
              {/* letter */}
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={KEY_LETTER}
                style={{
                  fontSize: 22,
                  fontFamily: "'Courier New', monospace",
                  fontWeight: 700,
                }}
              >
                {label}
              </text>
              {/* hit flash glow */}
              {hitBright > 0.1 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={KEY_RADIUS + 4}
                  fill="none"
                  stroke={KEY_BG}
                  strokeWidth={2}
                  opacity={hitBright * 0.5}
                  style={{
                    filter: `drop-shadow(0 0 8px ${KEY_BG})`,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
