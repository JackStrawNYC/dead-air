/**
 * Streamers — 6-10 party streamers unfurling from top of screen.
 * Each streamer is a wavy ribbon path that extends downward over time.
 * Bright party colors (hot pink, electric blue, lime green, gold, purple).
 * Streamers wave side-to-side with energy. Ribbon width varies along length.
 * Cycle: 50s, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500;    // 50 seconds at 30fps
const DURATION = 450;  // 15 seconds
const NUM_STREAMERS = 8;

const STREAMER_COLORS = [
  "#FF1493", // hot pink
  "#00BFFF", // electric blue
  "#32CD32", // lime green
  "#FFD700", // gold
  "#9B59B6", // purple
  "#FF6347", // tomato red
  "#00FA9A", // spring green
  "#FF69B4", // pink
];

interface StreamerData {
  x: number;            // horizontal position 0-1
  maxLength: number;    // max unfurl length (fraction of height)
  color: string;
  waveFreq: number;     // side-to-side wave frequency
  wavePhase: number;
  waveAmp: number;      // base wave amplitude
  unfurlDelay: number;  // stagger unfurl start 0-0.2
  curlFreq: number;     // curl frequency along the ribbon
  ribbonWidth: number;  // base width 4-12
}

function generateStreamers(seed: number): StreamerData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STREAMERS }, () => ({
    x: 0.05 + rng() * 0.9,
    maxLength: 0.5 + rng() * 0.4,
    color: STREAMER_COLORS[Math.floor(rng() * STREAMER_COLORS.length)],
    waveFreq: 0.03 + rng() * 0.03,
    wavePhase: rng() * Math.PI * 2,
    waveAmp: 20 + rng() * 40,
    unfurlDelay: rng() * 0.2,
    curlFreq: 0.015 + rng() * 0.02,
    ribbonWidth: 5 + rng() * 8,
  }));
}

function buildStreamerPath(
  startX: number,
  startY: number,
  length: number,
  streamer: StreamerData,
  frame: number,
  energy: number,
  side: "left" | "right",
): { leftPath: string; rightPath: string } {
  const segments = 40;
  const leftPoints: [number, number][] = [];
  const rightPoints: [number, number][] = [];

  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const y = startY + t * length;

    // Side-to-side wave (energy amplifies)
    const waveScale = 1 + energy * 2;
    const wave = Math.sin(frame * streamer.waveFreq + t * 8 + streamer.wavePhase) *
      streamer.waveAmp * waveScale * t;

    // Curl -- tighter at the bottom
    const curl = Math.sin(frame * streamer.curlFreq + t * 12) * 8 * t * t;

    const x = startX + wave + curl;

    // Ribbon width varies: wider in middle, narrower at ends
    const widthFactor = Math.sin(t * Math.PI) * 0.7 + 0.3;
    const halfW = streamer.ribbonWidth * widthFactor * 0.5;

    // Perpendicular offset (simplified as horizontal for wavy vertical ribbon)
    leftPoints.push([x - halfW, y]);
    rightPoints.push([x + halfW, y]);
  }

  // Build closed path: left side down, right side up
  const leftPath = leftPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const rightPath = rightPoints.reverse().map((p, i) => `${i === 0 ? "L" : "L"} ${p[0]} ${p[1]}`).join(" ");

  return { leftPath: leftPath + " " + rightPath + " Z", rightPath: "" };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Streamers: React.FC<Props> = ({ frames }) => {
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

  const streamers = React.useMemo(() => generateStreamers(42_1977), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="streamer-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {streamers.map((streamer, i) => {
          // Staggered unfurl
          const unfurlProgress = interpolate(
            progress,
            [streamer.unfurlDelay, streamer.unfurlDelay + 0.4, 0.85, 1],
            [0, 1, 1, 0.3],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );

          if (unfurlProgress < 0.01) return null;

          const startX = streamer.x * width;
          const startY = -5;
          const length = height * streamer.maxLength * unfurlProgress;

          const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
          const { leftPath } = buildStreamerPath(startX, startY, length, streamer, frame, energy, side);

          // Lighter highlight stripe
          const highlightX = startX + 2;
          const highlightLen = length * 0.7;

          return (
            <g key={i} filter="url(#streamer-glow)">
              {/* Main ribbon body */}
              <path
                d={leftPath}
                fill={streamer.color}
                opacity={0.65}
              />
              {/* Highlight stripe */}
              <line
                x1={highlightX}
                y1={startY + length * 0.1}
                x2={highlightX + Math.sin(frame * streamer.waveFreq + streamer.wavePhase) * streamer.waveAmp * 0.3}
                y2={startY + highlightLen}
                stroke="white"
                strokeWidth={1}
                opacity={0.2}
              />
              {/* Curl at bottom */}
              {unfurlProgress > 0.5 && (
                <circle
                  cx={startX + Math.sin(frame * streamer.waveFreq + streamer.wavePhase) * streamer.waveAmp * unfurlProgress}
                  cy={startY + length}
                  r={streamer.ribbonWidth * 0.8}
                  fill="none"
                  stroke={streamer.color}
                  strokeWidth={streamer.ribbonWidth * 0.4}
                  opacity={0.4}
                  strokeDasharray={`${streamer.ribbonWidth * 1.5} ${streamer.ribbonWidth * 3}`}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
