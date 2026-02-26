/**
 * CassetteReels — spinning tape reels in the corner.
 * Taper culture homage. Speed tied to tempo + energy.
 * Includes tape counter and REC indicator.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Single spinning reel SVG */
const Reel: React.FC<{ size: number; rotation: number; color: string; fillAmount: number }> = ({
  size,
  rotation,
  color,
  fillAmount,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <g transform={`rotate(${rotation} 50 50)`}>
      {/* Outer rim */}
      <circle cx="50" cy="50" r="46" stroke={color} strokeWidth="2" opacity="0.7" />
      {/* Tape on reel (thicker = more tape) */}
      <circle cx="50" cy="50" r={18 + fillAmount * 26} stroke={color} strokeWidth={2 + fillAmount * 8} opacity="0.3" />
      {/* Hub */}
      <circle cx="50" cy="50" r="16" stroke={color} strokeWidth="2" opacity="0.8" />
      <circle cx="50" cy="50" r="6" fill={color} opacity="0.6" />
      {/* Spokes */}
      <line x1="50" y1="34" x2="50" y2="16" stroke={color} strokeWidth="2" opacity="0.5" />
      <line x1="36" y1="42" x2="24" y2="30" stroke={color} strokeWidth="2" opacity="0.5" />
      <line x1="36" y1="58" x2="24" y2="70" stroke={color} strokeWidth="2" opacity="0.5" />
      <line x1="50" y1="66" x2="50" y2="84" stroke={color} strokeWidth="2" opacity="0.5" />
      <line x1="64" y1="58" x2="76" y2="70" stroke={color} strokeWidth="2" opacity="0.5" />
      <line x1="64" y1="42" x2="76" y2="30" stroke={color} strokeWidth="2" opacity="0.5" />
    </g>
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const CassetteReels: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Energy for speed modulation
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 30); i <= Math.min(frames.length - 1, idx + 30); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Rotation speed: base + energy boost
  const baseSpeed = 2.5; // degrees per frame
  const energyBoost = energy * 4;
  const rotation = frame * (baseSpeed + energyBoost);

  // Tape progress (left reel empties, right reel fills)
  const tapeProgress = frame / durationInFrames;
  const leftFill = 1 - tapeProgress;
  const rightFill = tapeProgress;

  // Tape counter (minutes:seconds format)
  const seconds = Math.floor(frame / 30);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const counter = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  // REC blink
  const recVisible = Math.floor(frame / 20) % 2 === 0;

  const reelSize = 70;
  const color = "#FF6347"; // warm tomato

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        pointerEvents: "none",
        opacity: 0.55,
        filter: `drop-shadow(0 0 6px ${color})`,
      }}
    >
      {/* Cassette housing */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 6,
          border: `1.5px solid ${color}`,
          background: "rgba(0,0,0,0.4)",
        }}
      >
        {/* Left reel (supply) */}
        <Reel size={reelSize} rotation={rotation} color={color} fillAmount={leftFill} />

        {/* Tape path between reels */}
        <div style={{ width: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 16, height: 1.5, background: color, opacity: 0.4 }} />
          <div style={{ width: 16, height: 1.5, background: color, opacity: 0.4 }} />
        </div>

        {/* Right reel (take-up) */}
        <Reel size={reelSize} rotation={rotation * 1.1} color={color} fillAmount={rightFill} />
      </div>

      {/* Counter + REC */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
          padding: "2px 14px",
          fontFamily: "monospace",
          fontSize: 13,
          color,
        }}
      >
        <span style={{ letterSpacing: 2 }}>{counter}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: recVisible ? 1 : 0.2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF1744", display: "inline-block" }} />
          REC
        </span>
      </div>
    </div>
  );
};
