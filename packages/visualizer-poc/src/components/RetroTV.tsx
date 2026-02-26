/**
 * RetroTV — CRT TV frame overlay with scan lines and periodic static bursts.
 * Scan lines are thin horizontal lines every 3px at 4% opacity, always visible.
 * Static bursts appear every 55s for 3s (random horizontal bars of noise).
 * TV frame is a rounded rectangle border with thick dark edges and inner glow.
 * Phosphor glow effect on edges.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const STATIC_CYCLE = 55 * 30; // 55 seconds at 30fps = 1650 frames
const STATIC_DURATION = 3 * 30; // 3 seconds = 90 frames

interface Props {
  frames: EnhancedFrameData[];
}

export const RetroTV: React.FC<Props> = ({ frames }) => {
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

  // Static burst: every 55s for 3s
  const cyclePos = frame % STATIC_CYCLE;
  const inStatic = cyclePos >= STATIC_CYCLE - STATIC_DURATION;

  // Static noise bars (deterministic per frame)
  const staticBars = React.useMemo(() => {
    if (!inStatic) return [];
    const rng = seeded(frame * 17 + 4242);
    const numBars = 15 + Math.floor(rng() * 25);
    return Array.from({ length: numBars }, () => ({
      y: rng() * height,
      h: 1 + rng() * 6,
      opacity: 0.1 + rng() * 0.5,
      xOffset: (rng() - 0.5) * 20,
    }));
  }, [inStatic, frame, height]);

  // Static envelope: fade in/out within the 3s window
  const staticAge = inStatic ? cyclePos - (STATIC_CYCLE - STATIC_DURATION) : 0;
  const staticEnvelope = inStatic
    ? interpolate(staticAge, [0, 15, STATIC_DURATION - 15, STATIC_DURATION], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Phosphor glow intensity reacts slightly to energy
  const phosphorGlow = interpolate(energy, [0, 0.3], [0.15, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scan line count
  const scanLineCount = Math.floor(height / 3);

  // TV frame dimensions
  const borderThickness = 28;
  const borderRadius = 40;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Scan lines — always visible */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: 0.04 }}
      >
        {Array.from({ length: scanLineCount }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={i * 3}
            x2={width}
            y2={i * 3}
            stroke="white"
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* Static burst noise bars */}
      {inStatic && staticEnvelope > 0.01 && (
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, opacity: staticEnvelope * 0.7 }}
        >
          {staticBars.map((bar, i) => (
            <rect
              key={i}
              x={bar.xOffset}
              y={bar.y}
              width={width}
              height={bar.h}
              fill={`rgba(220, 220, 220, ${bar.opacity})`}
            />
          ))}
          {/* Rolling static line */}
          <rect
            x={0}
            y={((frame * 5.3) % height)}
            width={width}
            height={3}
            fill={`rgba(255, 255, 255, ${0.6 * staticEnvelope})`}
          />
        </svg>
      )}

      {/* TV frame border — thick dark edges with rounded corners */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: borderRadius,
          border: `${borderThickness}px solid rgba(15, 12, 10, 0.85)`,
          boxShadow: [
            `inset 0 0 ${30 + phosphorGlow * 20}px rgba(80, 220, 160, ${phosphorGlow * 0.3})`,
            `inset 0 0 ${60 + phosphorGlow * 40}px rgba(60, 180, 140, ${phosphorGlow * 0.15})`,
            `0 0 15px rgba(0, 0, 0, 0.6)`,
          ].join(", "),
        }}
      />

      {/* Phosphor glow on edges — subtle green/amber CRT glow */}
      <div
        style={{
          position: "absolute",
          inset: borderThickness - 4,
          borderRadius: borderRadius - 12,
          border: `2px solid rgba(100, 255, 180, ${phosphorGlow * 0.2})`,
          boxShadow: `inset 0 0 20px rgba(100, 255, 180, ${phosphorGlow * 0.1})`,
        }}
      />

      {/* Corner vignette — darker corners like a real CRT */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: borderRadius,
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 50%, rgba(0,0,0,0.25) 100%)",
        }}
      />
    </div>
  );
};
