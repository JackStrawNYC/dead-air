/**
 * ChromaticSplit — RGB channel separation / chromatic aberration effect.
 * Three overlapping versions of a Stealie circle offset in R, G, B.
 * Offset distance driven by energy — subtle at low energy, dramatic at peaks.
 * The shapes slowly rotate. Screen blend mode for additive color mixing.
 * Cycle: 35s (1050 frames), 10s (300 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1050; // 35s at 30fps
const DURATION = 300; // 10s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const ChromaticSplit: React.FC<Props> = ({ frames }) => {
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

  // Cycle gating
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
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.18;

  // Offset distance: subtle (3px) at low energy, dramatic (25px) at peaks
  const offset = interpolate(energy, [0.02, 0.4], [3, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation
  const rotation = frame * 0.15;

  // Three channel offset directions at 120 degrees apart, rotating slowly
  const baseAngle = frame * 0.01;
  const redAngle = baseAngle;
  const greenAngle = baseAngle + (Math.PI * 2) / 3;
  const blueAngle = baseAngle + (Math.PI * 4) / 3;

  const redDx = Math.cos(redAngle) * offset;
  const redDy = Math.sin(redAngle) * offset;
  const greenDx = Math.cos(greenAngle) * offset;
  const greenDy = Math.sin(greenAngle) * offset;
  const blueDx = Math.cos(blueAngle) * offset;
  const blueDy = Math.sin(blueAngle) * offset;

  // Stealie: outer circle + inner circle + 13-point ring + lightning bolt
  const innerR = radius * 0.6;
  const boltPath = `M ${-innerR * 0.15} ${-innerR * 0.35} L ${innerR * 0.12} ${-innerR * 0.05} L ${-innerR * 0.08} ${-innerR * 0.05} L ${innerR * 0.15} ${innerR * 0.35} L ${-innerR * 0.12} ${innerR * 0.05} L ${innerR * 0.08} ${innerR * 0.05} Z`;

  // Breathing scale
  const breathe = 1 + Math.sin(frame * 0.025) * 0.03;
  const r = radius * breathe;
  const ir = innerR * breathe;

  // Stroke width varies with energy
  const sw = interpolate(energy, [0.02, 0.3], [2, 3.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const renderChannel = (dx: number, dy: number, color: string, channelOpacity: number) => (
    <g transform={`translate(${cx + dx}, ${cy + dy}) rotate(${rotation})`}>
      <circle r={r} fill="none" stroke={color} strokeWidth={sw} opacity={channelOpacity} />
      <circle r={ir} fill="none" stroke={color} strokeWidth={sw * 0.7} opacity={channelOpacity * 0.7} />
      <path d={boltPath} fill={color} opacity={channelOpacity * 0.4} strokeLinejoin="round" />
      <path d={boltPath} stroke={color} strokeWidth={sw * 0.8} fill="none" opacity={channelOpacity * 0.8} strokeLinejoin="round" />
      {/* 13-point ring */}
      {Array.from({ length: 13 }, (_, pi) => {
        const a = (pi / 13) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * (r + 6);
        const py = Math.sin(a) * (r + 6);
        return <circle key={pi} cx={px} cy={py} r={2.5} fill={color} opacity={channelOpacity * 0.6} />;
      })}
    </g>
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        {renderChannel(redDx, redDy, "rgba(255, 30, 30, 0.85)", 0.8)}
        {renderChannel(greenDx, greenDy, "rgba(30, 255, 30, 0.85)", 0.8)}
        {renderChannel(blueDx, blueDy, "rgba(30, 30, 255, 0.85)", 0.8)}
      </svg>
    </div>
  );
};
