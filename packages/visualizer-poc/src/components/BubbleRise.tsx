/**
 * BubbleRise — Iridescent soap bubbles floating upward.
 * 20-30 circles with thin stroke, no fill (or very transparent fill).
 * Each bubble has a small highlight arc (partial circle) suggesting light reflection.
 * Bubbles rise slowly with gentle sine horizontal drift.
 * Rainbow iridescent stroke color per bubble.
 * Pop effect when reaching top (scale up briefly then disappear).
 * Always visible at 15-30% opacity. More bubbles during quiet moments.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const NUM_BUBBLES = 25;
const RISE_CYCLE = 58 * 30; // 58s stagger for wrapping

interface BubbleData {
  x: number;       // initial x 0-1
  y: number;       // initial y 0-1
  radius: number;  // 6-20px
  riseSpeed: number;
  wobbleFreq: number;
  wobbleAmp: number;
  wobblePhase: number;
  hueBase: number; // iridescent base hue
  hueSpeed: number;
  highlightAngle: number; // angle of the light reflection arc
}

function generateBubbles(seed: number): BubbleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BUBBLES }, () => ({
    x: rng(),
    y: rng(),
    radius: 6 + rng() * 14,
    riseSpeed: 0.4 + rng() * 0.8,
    wobbleFreq: 0.006 + rng() * 0.015,
    wobbleAmp: 15 + rng() * 35,
    wobblePhase: rng() * Math.PI * 2,
    hueBase: rng() * 360,
    hueSpeed: 0.3 + rng() * 0.8,
    highlightAngle: -40 + rng() * 30,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BubbleRise: React.FC<Props> = ({ frames }) => {
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

  const bubbles = React.useMemo(() => generateBubbles(6_15_1969), []);

  // More bubbles visible during quiet moments, fewer during loud
  const quietBoost = interpolate(energy, [0.05, 0.25], [1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Master opacity: 15-30%
  const masterOpacity = interpolate(energy, [0, 0.2], [0.3, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="bubble-soft">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>
        {bubbles.map((bubble, i) => {
          // Only show subset based on quiet boost
          const showThreshold = i / NUM_BUBBLES;
          if (showThreshold > quietBoost) return null;

          // Rising position with wrapping
          const rawY = bubble.y * height - frame * bubble.riseSpeed;
          const totalRange = height + bubble.radius * 4;
          const y = ((rawY % totalRange) + totalRange) % totalRange;

          // Horizontal wobble
          const x =
            bubble.x * width +
            Math.sin(frame * bubble.wobbleFreq + bubble.wobblePhase) * bubble.wobbleAmp;
          const wx = ((x % width) + width) % width;

          // Pop effect near top: scale up briefly then vanish
          const popZone = bubble.radius * 3;
          const distFromTop = y;
          let scale = 1;
          let popOpacity = 1;
          if (distFromTop < popZone) {
            const popProgress = 1 - distFromTop / popZone;
            scale = 1 + popProgress * 0.6;
            popOpacity = 1 - popProgress;
          }

          if (popOpacity < 0.01) return null;

          // Iridescent hue shifts over time
          const hue = (bubble.hueBase + frame * bubble.hueSpeed) % 360;
          const hue2 = (hue + 120) % 360;

          const r = bubble.radius * scale;

          // Highlight arc: a partial ellipse inside the bubble suggesting light reflection
          const hlAngle = bubble.highlightAngle * (Math.PI / 180);
          const hlR = r * 0.65;
          const hlCx = wx + Math.cos(hlAngle) * r * 0.25;
          const hlCy = y + Math.sin(hlAngle) * r * 0.25;

          // Arc path (60 degree arc)
          const arcStart = hlAngle - 0.5;
          const arcEnd = hlAngle + 0.5;
          const arcPath = `M ${hlCx + Math.cos(arcStart) * hlR} ${hlCy + Math.sin(arcStart) * hlR} A ${hlR} ${hlR} 0 0 1 ${hlCx + Math.cos(arcEnd) * hlR} ${hlCy + Math.sin(arcEnd) * hlR}`;

          return (
            <g key={i} opacity={popOpacity}>
              {/* Bubble outline — thin iridescent stroke */}
              <circle
                cx={wx}
                cy={y}
                r={r}
                fill={`hsla(${hue}, 60%, 70%, 0.04)`}
                stroke={`hsla(${hue}, 80%, 75%, 0.5)`}
                strokeWidth={0.8}
              />
              {/* Second stroke for iridescence */}
              <circle
                cx={wx}
                cy={y}
                r={r - 0.5}
                fill="none"
                stroke={`hsla(${hue2}, 70%, 80%, 0.2)`}
                strokeWidth={0.4}
              />
              {/* Light highlight arc */}
              <path
                d={arcPath}
                fill="none"
                stroke={`rgba(255, 255, 255, 0.35)`}
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
