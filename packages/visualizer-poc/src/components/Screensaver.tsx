/**
 * Screensaver -- Classic bouncing DVD-logo style screensaver.
 * A small "GD" or stealie outline bounces off screen edges, changing color
 * at each bounce. Leaves a fading trail behind. Bounce speed tied to energy.
 * When it hits a corner perfectly (rare), brief flash effect.
 * Nostalgic retro computing feel. Always visible at 0.1-0.2 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const LOGO_WIDTH = 80;
const LOGO_HEIGHT = 50;
const TRAIL_LENGTH = 25;
const CORNER_THRESHOLD = 30; // px from corner to count as corner hit

const BOUNCE_COLORS = [
  "#FF1493", // hot pink
  "#00FF7F", // spring green
  "#FFD700", // gold
  "#00BFFF", // deep sky blue
  "#FF4500", // orange red
  "#DA70D6", // orchid
  "#7FFF00", // chartreuse
  "#FF6347", // tomato
  "#40E0D0", // turquoise
  "#FFFF00", // yellow
];

interface BounceState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colorIndex: number;
  cornerFlashFrame: number; // -1 if not active
}

/**
 * Simulate the bouncing logo up to the given frame.
 * We pre-simulate a fixed base speed and apply energy-based speed
 * at render time for the current frame only.
 */
function simulateBounce(
  frame: number,
  width: number,
  height: number,
  baseSpeed: number,
  seed: number,
): { positions: { x: number; y: number; colorIndex: number }[]; cornerFlashFrame: number } {
  const rng = seeded(seed);
  const state: BounceState = {
    x: (rng() * 0.6 + 0.2) * (width - LOGO_WIDTH),
    y: (rng() * 0.6 + 0.2) * (height - LOGO_HEIGHT),
    vx: (rng() > 0.5 ? 1 : -1) * baseSpeed,
    vy: (rng() > 0.5 ? 1 : -1) * baseSpeed * 0.75,
    colorIndex: 0,
    cornerFlashFrame: -1,
  };

  const maxW = width - LOGO_WIDTH;
  const maxH = height - LOGO_HEIGHT;
  const trailStart = Math.max(0, frame - TRAIL_LENGTH);
  const positions: { x: number; y: number; colorIndex: number }[] = [];
  let lastCornerFlash = -1;

  for (let f = 0; f <= frame; f++) {
    state.x += state.vx;
    state.y += state.vy;

    let bounced = false;

    if (state.x <= 0) {
      state.x = 0;
      state.vx = Math.abs(state.vx);
      bounced = true;
    } else if (state.x >= maxW) {
      state.x = maxW;
      state.vx = -Math.abs(state.vx);
      bounced = true;
    }

    if (state.y <= 0) {
      state.y = 0;
      state.vy = Math.abs(state.vy);
      if (bounced) {
        // Corner hit!
        lastCornerFlash = f;
      }
      bounced = true;
    } else if (state.y >= maxH) {
      state.y = maxH;
      state.vy = -Math.abs(state.vy);
      if (bounced) {
        // Corner hit!
        lastCornerFlash = f;
      }
      bounced = true;
    }

    if (bounced) {
      state.colorIndex = (state.colorIndex + 1) % BOUNCE_COLORS.length;
    }

    if (f >= trailStart) {
      positions.push({ x: state.x, y: state.y, colorIndex: state.colorIndex });
    }
  }

  return { positions, cornerFlashFrame: lastCornerFlash };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Screensaver: React.FC<Props> = ({ frames }) => {
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

  // Speed tied to energy
  const speed = interpolate(energy, [0.02, 0.35], [1.5, 5.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Simulate bounce -- we use a deterministic simulation
  // To avoid expensive full re-simulation each frame, use modular approach
  const { positions, cornerFlashFrame } = React.useMemo(
    () => simulateBounce(frame, width, height, speed, 42197708),
    [frame, width, height, speed],
  );

  // Always visible at low opacity
  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.1, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Corner flash effect
  const cornerFlashAge = frame - cornerFlashFrame;
  const isCornerFlash = cornerFlashAge >= 0 && cornerFlashAge < 15;
  const flashOpacity = isCornerFlash
    ? interpolate(cornerFlashAge, [0, 15], [0.6, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  if (positions.length === 0) return null;

  const current = positions[positions.length - 1];
  const currentColor = BOUNCE_COLORS[current.colorIndex];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Corner flash */}
      {isCornerFlash && (
        <div
          style={{
            position: "absolute",
            left: current.x + LOGO_WIDTH / 2 - 100,
            top: current.y + LOGO_HEIGHT / 2 - 100,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(255,255,255,${flashOpacity}) 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
      )}

      <svg width={width} height={height} style={{ opacity: baseOpacity }}>
        {/* Trail */}
        {positions.slice(0, -1).map((pos, ti) => {
          const trailOpacity = (ti / positions.length) * 0.4;
          const trailColor = BOUNCE_COLORS[pos.colorIndex];
          return (
            <g
              key={ti}
              opacity={trailOpacity}
              transform={`translate(${pos.x}, ${pos.y})`}
            >
              <text
                x={LOGO_WIDTH / 2}
                y={LOGO_HEIGHT / 2 + 8}
                textAnchor="middle"
                fill={trailColor}
                fontSize={28}
                fontFamily="monospace"
                fontWeight="bold"
              >
                GD
              </text>
            </g>
          );
        })}

        {/* Main logo */}
        <g transform={`translate(${current.x}, ${current.y})`}>
          {/* Glow */}
          <text
            x={LOGO_WIDTH / 2}
            y={LOGO_HEIGHT / 2 + 8}
            textAnchor="middle"
            fill={currentColor}
            fontSize={28}
            fontFamily="monospace"
            fontWeight="bold"
            style={{
              filter: `drop-shadow(0 0 6px ${currentColor}) drop-shadow(0 0 12px ${currentColor})`,
            }}
          >
            GD
          </text>

          {/* Stealie outline below text */}
          <circle
            cx={LOGO_WIDTH / 2}
            cy={LOGO_HEIGHT / 2}
            r={22}
            fill="none"
            stroke={currentColor}
            strokeWidth={1.5}
            opacity={0.5}
          />
          {/* Lightning bolt */}
          <path
            d={`M ${LOGO_WIDTH / 2 - 4} ${LOGO_HEIGHT / 2 - 10}
                L ${LOGO_WIDTH / 2 + 2} ${LOGO_HEIGHT / 2 - 2}
                L ${LOGO_WIDTH / 2 - 2} ${LOGO_HEIGHT / 2 + 2}
                L ${LOGO_WIDTH / 2 + 4} ${LOGO_HEIGHT / 2 + 10}`}
            stroke={currentColor}
            strokeWidth={1.2}
            fill="none"
            opacity={0.4}
          />
        </g>
      </svg>
    </div>
  );
};
