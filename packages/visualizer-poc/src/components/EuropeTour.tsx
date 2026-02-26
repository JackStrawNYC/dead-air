/**
 * EuropeTour -- The Europe '72 ice cream kid silhouette.
 * Simple child figure silhouette holding an ice cream cone.
 * Dripping colors flow down from the ice cream (animated drip lines).
 * Colors are psychedelic rainbow, cycling. Figure positioned off-center.
 * Drip speed and color intensity from energy. Appears every 75s for 10s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75 seconds at 30fps
const DURATION = 300; // 10 seconds
const DRIP_COUNT = 8;

interface DripData {
  xOffset: number; // offset from ice cream center
  speed: number;
  phase: number;
  hueOffset: number;
  thickness: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const EuropeTour: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate drip data
  const drips = React.useMemo(() => {
    const rng = seeded(72_720_619);
    const result: DripData[] = [];
    for (let d = 0; d < DRIP_COUNT; d++) {
      result.push({
        xOffset: (rng() - 0.5) * 40,
        speed: 0.5 + rng() * 1.5,
        phase: rng() * Math.PI * 2,
        hueOffset: rng() * 360,
        thickness: 2 + rng() * 3,
      });
    }
    return result;
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Positioned off-center (right third)
  const figureScale = Math.min(width, height) * 0.0025;
  const figX = width * 0.65;
  const figY = height * 0.25;

  // Rainbow hue cycling
  const hueBase = (frame * 1.5) % 360;

  // Drip speed from energy
  const dripSpeed = 0.6 + energy * 2.5;

  // Silhouette color
  const silhouetteColor = `hsl(${hueBase}, 60%, 25%)`;
  const outlineColor = `hsl(${(hueBase + 180) % 360}, 90%, 65%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 8px ${outlineColor}) drop-shadow(0 0 18px rgba(255,100,255,0.3))`,
        }}
      >
        <g transform={`translate(${figX}, ${figY}) scale(${figureScale})`}>
          {/* Child figure silhouette */}
          {/* Head */}
          <circle cx="0" cy="0" r="28" fill={silhouetteColor} stroke={outlineColor} strokeWidth="2" />

          {/* Body */}
          <path
            d="M -18 25 L -22 100 Q 0 110 22 100 L 18 25 Q 0 20 -18 25 Z"
            fill={silhouetteColor}
            stroke={outlineColor}
            strokeWidth="2"
          />

          {/* Left arm (reaching up to ice cream) */}
          <path
            d="M -16 32 Q -35 20 -42 -15 L -38 -18 Q -30 15 -12 30"
            fill={silhouetteColor}
            stroke={outlineColor}
            strokeWidth="2"
          />

          {/* Right arm (down) */}
          <path
            d="M 16 35 Q 30 55 35 80"
            stroke={outlineColor}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />

          {/* Left leg */}
          <path
            d="M -12 98 Q -18 140 -22 180"
            stroke={outlineColor}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Right leg */}
          <path
            d="M 12 98 Q 18 140 22 180"
            stroke={outlineColor}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />

          {/* Feet */}
          <ellipse cx="-25" cy="183" rx="10" ry="4" fill={silhouetteColor} stroke={outlineColor} strokeWidth="1.5" />
          <ellipse cx="25" cy="183" rx="10" ry="4" fill={silhouetteColor} stroke={outlineColor} strokeWidth="1.5" />

          {/* Ice cream cone (held by left hand) */}
          {/* Cone */}
          <polygon
            points="-42,-18 -55,-55 -28,-55"
            fill={`hsl(35, 70%, 50%)`}
            stroke={outlineColor}
            strokeWidth="1.5"
          />
          {/* Cone crosshatch */}
          <line x1="-50" y1="-45" x2="-34" y2="-30" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
          <line x1="-34" y1="-45" x2="-50" y2="-30" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />

          {/* Ice cream scoops */}
          <circle cx="-42" cy="-68" r="16" fill={`hsl(${hueBase}, 90%, 65%)`} stroke={outlineColor} strokeWidth="1.5" />
          <circle cx="-30" cy="-72" r="13" fill={`hsl(${(hueBase + 120) % 360}, 85%, 60%)`} stroke={outlineColor} strokeWidth="1.5" />
          <circle cx="-52" cy="-72" r="12" fill={`hsl(${(hueBase + 240) % 360}, 85%, 60%)`} stroke={outlineColor} strokeWidth="1.5" />

          {/* Dripping colors from ice cream */}
          {drips.map((drip, di) => {
            const dripHue = (hueBase + drip.hueOffset) % 360;
            const dripY = ((frame * drip.speed * dripSpeed + drip.phase * 100) % 250);
            const dripOpacity = interpolate(dripY, [0, 30, 200, 250], [0, 0.8, 0.6, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <line
                key={di}
                x1={-42 + drip.xOffset}
                y1={-55}
                x2={-42 + drip.xOffset + Math.sin(dripY * 0.05) * 5}
                y2={-55 + dripY}
                stroke={`hsl(${dripHue}, 95%, 60%)`}
                strokeWidth={drip.thickness}
                strokeLinecap="round"
                opacity={dripOpacity}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
