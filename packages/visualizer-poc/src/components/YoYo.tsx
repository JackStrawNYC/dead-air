/**
 * YoYo — A yo-yo going up and down on its string.
 * Side-view: two circles connected by an axle, string extends from a hand point at top.
 * Yo-yo travels down, sleeps at bottom, returns. Speed tied to energy.
 * Bright colored yo-yo with decorative star on face. Spins (rotation animation).
 * Cycle: 35s (1050 frames), 10s (300 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 1050; // 35s at 30fps
const VISIBLE_DURATION = 300; // 10s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const YoYo: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Seeded position for each cycle
  const rng = React.useMemo(() => {
    const r = seeded(42424242);
    // Pre-generate positions for 200 cycles
    return Array.from({ length: 200 }, () => ({
      xNorm: 0.15 + r() * 0.7, // 15-85% of width
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);

  // Only visible during first VISIBLE_DURATION frames of cycle
  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION; // 0 to 1

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  if (opacity < 0.01) return null;

  const posData = rng[cycleIndex % rng.length];
  const handX = posData.xNorm * width;
  const handY = height * 0.08;

  const yoyoRadius = 28;
  const stringMaxLen = height * 0.55;

  // Yo-yo motion: down (0-0.35), sleep (0.35-0.55), up (0.55-0.9), rest (0.9-1)
  // Speed influenced by energy
  const speedMult = 1 + energy * 2;

  let yoyoProgress: number;
  if (progress < 0.35) {
    // Going down
    yoyoProgress = interpolate(progress, [0.05, 0.35], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.quad),
    });
  } else if (progress < 0.55) {
    // Sleeping at bottom
    yoyoProgress = 1;
  } else if (progress < 0.9) {
    // Coming back up
    yoyoProgress = interpolate(progress, [0.55, 0.88], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    });
  } else {
    // Back at top
    yoyoProgress = 0;
  }

  const stringLen = yoyoProgress * stringMaxLen;
  const yoyoCenterY = handY + stringLen;

  // Yo-yo spin: faster with energy, always spinning when moving
  const spinSpeed = (3 + energy * 8) * speedMult;
  const rotation = frame * spinSpeed;

  // Slight horizontal sway
  const sway = Math.sin(frame * 0.04) * 8 * yoyoProgress;
  const yoyoCenterX = handX + sway;

  // Colors: alternate red/blue per cycle
  const isRed = cycleIndex % 2 === 0;
  const primaryColor = isRed ? "#E53935" : "#1E88E5";
  const secondaryColor = isRed ? "#C62828" : "#1565C0";
  const starColor = isRed ? "#FFD54F" : "#FFF176";
  const glowColor = isRed ? "rgba(229, 57, 53, 0.5)" : "rgba(30, 136, 229, 0.5)";

  // Axle width (side view)
  const axleWidth = 8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="yoyo-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="yoyo-face-l" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
          <linearGradient id="yoyo-face-r" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        </defs>

        {/* Hand point */}
        <circle cx={handX} cy={handY} r={5} fill="#FFCCBC" opacity={0.7} />
        {/* Finger silhouette */}
        <line
          x1={handX - 4}
          y1={handY - 6}
          x2={handX + 4}
          y2={handY - 6}
          stroke="#FFCCBC"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.5}
        />

        {/* String */}
        <line
          x1={handX}
          y1={handY}
          x2={yoyoCenterX}
          y2={yoyoCenterY}
          stroke="#EEEEEE"
          strokeWidth={1.5}
          opacity={0.7}
        />

        {/* Yo-yo body */}
        <g
          transform={`translate(${yoyoCenterX}, ${yoyoCenterY}) rotate(${rotation})`}
          filter="url(#yoyo-glow)"
        >
          {/* Left disc */}
          <circle
            cx={-axleWidth / 2}
            cy={0}
            r={yoyoRadius}
            fill="url(#yoyo-face-l)"
          />
          {/* Right disc */}
          <circle
            cx={axleWidth / 2}
            cy={0}
            r={yoyoRadius}
            fill="url(#yoyo-face-r)"
          />
          {/* Axle */}
          <rect
            x={-axleWidth / 2}
            y={-6}
            width={axleWidth}
            height={12}
            rx={2}
            fill="#B0BEC5"
            opacity={0.8}
          />
          {/* Decorative star on left face */}
          <g transform={`translate(${-axleWidth / 2}, 0)`}>
            <polygon
              points="0,-12 3,-4 12,-4 5,2 7,10 0,6 -7,10 -5,2 -12,-4 -3,-4"
              fill={starColor}
              opacity={0.9}
            />
          </g>
          {/* Decorative star on right face */}
          <g transform={`translate(${axleWidth / 2}, 0)`}>
            <polygon
              points="0,-12 3,-4 12,-4 5,2 7,10 0,6 -7,10 -5,2 -12,-4 -3,-4"
              fill={starColor}
              opacity={0.9}
            />
          </g>
          {/* Rim highlights */}
          <circle
            cx={-axleWidth / 2}
            cy={0}
            r={yoyoRadius}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
          />
          <circle
            cx={axleWidth / 2}
            cy={0}
            r={yoyoRadius}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
          />
        </g>

        {/* Outer glow */}
        <circle
          cx={yoyoCenterX}
          cy={yoyoCenterY}
          r={yoyoRadius + 10}
          fill={glowColor}
          opacity={0.2 + energy * 0.3}
        />
      </svg>
    </div>
  );
};
