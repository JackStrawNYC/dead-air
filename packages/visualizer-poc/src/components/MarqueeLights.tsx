/**
 * MarqueeLights -- Theater marquee border of chaser lights around screen edges.
 * 60-80 small circular bulbs evenly spaced along all 4 edges. Lights chase in
 * sequence (every Nth bulb lit, pattern shifts each frame). Warm incandescent
 * yellow/amber with occasional color bulbs. Chase speed driven by energy/tempo.
 * Cycle: 45s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1350;   // 45 seconds at 30fps
const DURATION = 420;  // 14 seconds visible

// Warm incandescent palette
const WARM_YELLOW = "#FFD54F";
const WARM_AMBER = "#FFB300";
const WARM_WHITE = "#FFF8E1";
const DIM_BULB = "#4A3800";

// Occasional accent colors
const ACCENT_COLORS = [
  "#FF1744", // red
  "#00E676", // green
  "#2979FF", // blue
  "#FF9100", // orange
];

interface BulbDef {
  /** Position along perimeter (0-1) */
  perimFrac: number;
  /** Whether this is an accent-colored bulb */
  isAccent: boolean;
  /** Accent color index */
  accentIdx: number;
}

function generateBulbs(seed: number, count: number): BulbDef[] {
  const rng = seeded(seed);
  const bulbs: BulbDef[] = [];
  for (let i = 0; i < count; i++) {
    const isAccent = rng() < 0.12; // ~12% are accent colors
    bulbs.push({
      perimFrac: i / count,
      isAccent,
      accentIdx: Math.floor(rng() * ACCENT_COLORS.length),
    });
  }
  return bulbs;
}

/**
 * Convert a perimeter fraction (0-1) to screen coordinates.
 * Perimeter travels: top-left -> top-right -> bottom-right -> bottom-left -> top-left
 */
function perimToXY(
  frac: number,
  w: number,
  h: number,
  inset: number,
): { x: number; y: number } {
  const totalPerim = 2 * (w - 2 * inset) + 2 * (h - 2 * inset);
  const dist = frac * totalPerim;

  const tw = w - 2 * inset; // top/bottom edge length
  const th = h - 2 * inset; // left/right edge length

  if (dist < tw) {
    // Top edge: left to right
    return { x: inset + dist, y: inset };
  } else if (dist < tw + th) {
    // Right edge: top to bottom
    return { x: w - inset, y: inset + (dist - tw) };
  } else if (dist < 2 * tw + th) {
    // Bottom edge: right to left
    return { x: w - inset - (dist - tw - th), y: h - inset };
  } else {
    // Left edge: bottom to top
    return { x: inset, y: h - inset - (dist - 2 * tw - th) };
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MarqueeLights: React.FC<Props> = ({ frames }) => {
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

  const NUM_BULBS = 72;
  const bulbs = React.useMemo(() => generateBulbs(45772, NUM_BULBS), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.2], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Chase speed driven by energy: frames per chase step
  const chaseSpeed = interpolate(energy, [0.03, 0.3], [0.15, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chase pattern: every 3rd bulb is lit, pattern shifts over time
  const CHASE_GROUP = 3;
  const chaseOffset = Math.floor(frame * chaseSpeed) % CHASE_GROUP;

  // Glow intensity driven by energy
  const glowSize = interpolate(energy, [0.03, 0.3], [2, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const INSET = 20; // how far from screen edge
  const BULB_RADIUS = 4;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="ml-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="ml-bulb-on">
            <stop offset="0%" stopColor={WARM_WHITE} />
            <stop offset="40%" stopColor={WARM_YELLOW} />
            <stop offset="100%" stopColor={WARM_AMBER} />
          </radialGradient>
        </defs>

        {/* Bulbs */}
        {bulbs.map((bulb, bi) => {
          const pos = perimToXY(bulb.perimFrac, width, height, INSET);
          const isLit = bi % CHASE_GROUP === chaseOffset;

          // Dim/lit state
          const litBrightness = isLit ? 1 : 0.15;

          // Slight flicker for lit bulbs (deterministic)
          const flicker = isLit
            ? 0.9 + Math.sin(frame * 0.3 + bi * 2.1) * 0.1
            : 1;

          const finalOpacity = litBrightness * flicker;

          let fillColor: string;
          if (!isLit) {
            fillColor = DIM_BULB;
          } else if (bulb.isAccent) {
            fillColor = ACCENT_COLORS[bulb.accentIdx];
          } else {
            fillColor = WARM_YELLOW;
          }

          return (
            <g key={`bulb-${bi}`}>
              {/* Glow halo for lit bulbs */}
              {isLit && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={BULB_RADIUS * 3}
                  fill={bulb.isAccent ? ACCENT_COLORS[bulb.accentIdx] : WARM_AMBER}
                  opacity={0.15 * flicker}
                />
              )}
              {/* Bulb body */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={BULB_RADIUS}
                fill={isLit && !bulb.isAccent ? "url(#ml-bulb-on)" : fillColor}
                opacity={finalOpacity}
                filter={isLit ? "url(#ml-glow)" : undefined}
              />
              {/* Specular highlight */}
              {isLit && (
                <circle
                  cx={pos.x - 1}
                  cy={pos.y - 1}
                  r={BULB_RADIUS * 0.35}
                  fill="white"
                  opacity={0.4 * flicker}
                />
              )}
              {/* Socket (small dark ring) */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={BULB_RADIUS + 1}
                fill="none"
                stroke="#333"
                strokeWidth={1}
                opacity={0.3}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
