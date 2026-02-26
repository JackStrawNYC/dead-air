/**
 * PinballMachine — Top-down pinball playfield elements.
 * Bumpers (circles that flash on beat), flippers (angled rectangles at bottom),
 * ramps (curved lines), targets (small circles in a row).
 * A ball (bright circle) bounces between bumpers. Ball speed tied to energy.
 * Bright neon colors on dark playfield. Score display at top.
 * Cycle: 45s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1350; // 45 seconds at 30fps
const DURATION = 420; // 14 seconds visible

// Bumper positions (fraction of playfield)
const BUMPERS = [
  { x: 0.35, y: 0.30, r: 28, color: "#FF1744" },
  { x: 0.65, y: 0.30, r: 28, color: "#00E5FF" },
  { x: 0.50, y: 0.45, r: 32, color: "#FFD600" },
  { x: 0.30, y: 0.55, r: 25, color: "#76FF03" },
  { x: 0.70, y: 0.55, r: 25, color: "#E040FB" },
];

// Target row positions
const TARGETS = [
  { x: 0.30, y: 0.18 },
  { x: 0.40, y: 0.18 },
  { x: 0.50, y: 0.18 },
  { x: 0.60, y: 0.18 },
  { x: 0.70, y: 0.18 },
];

// Neon colors
const NEON_PINK = "#FF1493";
const NEON_CYAN = "#00FFFF";
const NEON_GREEN = "#39FF14";
const NEON_YELLOW = "#FFD600";
const BALL_COLOR = "#FFFFFF";

interface Props {
  frames: EnhancedFrameData[];
}

export const PinballMachine: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate ball trajectory waypoints
  const waypoints = React.useMemo(() => {
    const r = seeded(8842);
    return Array.from({ length: 20 }).map(() => ({
      x: 0.2 + r() * 0.6,
      y: 0.15 + r() * 0.6,
    }));
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Beat detection for bumper flash
  const fd = frames[idx];
  const onBeat = fd.beat;

  // Timing gate
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Playfield area
  const pfLeft = width * 0.2;
  const pfRight = width * 0.8;
  const pfTop = height * 0.1;
  const pfBottom = height * 0.9;
  const pfWidth = pfRight - pfLeft;
  const pfHeight = pfBottom - pfTop;

  // Ball position: interpolate along waypoints with energy-based speed
  const ballSpeed = 0.5 + energy * 3.0;
  const ballPhase = (cycleFrame * ballSpeed * 0.008) % waypoints.length;
  const wpIdx = Math.floor(ballPhase);
  const wpFrac = ballPhase - wpIdx;
  const wp0 = waypoints[wpIdx % waypoints.length];
  const wp1 = waypoints[(wpIdx + 1) % waypoints.length];
  const ballX = pfLeft + (wp0.x + (wp1.x - wp0.x) * wpFrac) * pfWidth;
  const ballY = pfTop + (wp0.y + (wp1.y - wp0.y) * wpFrac) * pfHeight;

  // Score: increases over time
  const score = Math.floor(progress * 99999);
  const scoreStr = String(score).padStart(6, "0");

  // Flipper angle driven by beat
  const flipperAngle = onBeat ? -30 : 15;

  const glowSize = interpolate(energy, [0.02, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        {/* Playfield border */}
        <rect
          x={pfLeft}
          y={pfTop}
          width={pfWidth}
          height={pfHeight}
          fill="none"
          stroke={NEON_PINK}
          strokeWidth={2.5}
          opacity={0.4}
          rx={12}
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${NEON_PINK})` }}
        />

        {/* Ramps (curved guide lines) */}
        <path
          d={`M ${pfLeft + pfWidth * 0.15} ${pfTop + pfHeight * 0.7} Q ${pfLeft + pfWidth * 0.1} ${pfTop + pfHeight * 0.4} ${pfLeft + pfWidth * 0.25} ${pfTop + pfHeight * 0.15}`}
          fill="none"
          stroke={NEON_CYAN}
          strokeWidth={2}
          opacity={0.35}
          style={{ filter: `drop-shadow(0 0 4px ${NEON_CYAN})` }}
        />
        <path
          d={`M ${pfLeft + pfWidth * 0.85} ${pfTop + pfHeight * 0.7} Q ${pfLeft + pfWidth * 0.9} ${pfTop + pfHeight * 0.4} ${pfLeft + pfWidth * 0.75} ${pfTop + pfHeight * 0.15}`}
          fill="none"
          stroke={NEON_CYAN}
          strokeWidth={2}
          opacity={0.35}
          style={{ filter: `drop-shadow(0 0 4px ${NEON_CYAN})` }}
        />

        {/* Targets row */}
        {TARGETS.map((tgt, ti) => {
          const tx = pfLeft + tgt.x * pfWidth;
          const ty = pfTop + tgt.y * pfHeight;
          const lit = Math.abs(ballX - tx) < 40 && Math.abs(ballY - ty) < 40;
          return (
            <circle
              key={`target-${ti}`}
              cx={tx}
              cy={ty}
              r={8}
              fill={lit ? NEON_YELLOW : "none"}
              stroke={NEON_YELLOW}
              strokeWidth={2}
              opacity={lit ? 0.8 : 0.4}
              style={{ filter: lit ? `drop-shadow(0 0 8px ${NEON_YELLOW})` : "none" }}
            />
          );
        })}

        {/* Bumpers */}
        {BUMPERS.map((bmp, bi) => {
          const bx = pfLeft + bmp.x * pfWidth;
          const by = pfTop + bmp.y * pfHeight;
          const distToBall = Math.sqrt((ballX - bx) ** 2 + (ballY - by) ** 2);
          const nearBall = distToBall < bmp.r + 20;
          const flash = onBeat || nearBall;
          const flashScale = flash ? 1.15 : 1.0;
          const flashOpacity = flash ? 0.8 : 0.4;

          return (
            <g key={`bumper-${bi}`}>
              <circle
                cx={bx}
                cy={by}
                r={bmp.r * flashScale}
                fill={bmp.color}
                opacity={flashOpacity * 0.3}
                style={{ filter: flash ? `drop-shadow(0 0 ${glowSize * 1.5}px ${bmp.color})` : "none" }}
              />
              <circle
                cx={bx}
                cy={by}
                r={bmp.r * flashScale}
                fill="none"
                stroke={bmp.color}
                strokeWidth={2.5}
                opacity={flashOpacity}
              />
              {/* Inner ring */}
              <circle
                cx={bx}
                cy={by}
                r={bmp.r * 0.5 * flashScale}
                fill="none"
                stroke={bmp.color}
                strokeWidth={1.5}
                opacity={flashOpacity * 0.6}
              />
            </g>
          );
        })}

        {/* Flippers */}
        {[
          { cx: pfLeft + pfWidth * 0.35, cy: pfTop + pfHeight * 0.82, dir: 1 },
          { cx: pfLeft + pfWidth * 0.65, cy: pfTop + pfHeight * 0.82, dir: -1 },
        ].map((flip, fi) => (
          <g
            key={`flipper-${fi}`}
            transform={`translate(${flip.cx}, ${flip.cy}) rotate(${flipperAngle * flip.dir}) scale(${flip.dir}, 1)`}
          >
            <rect
              x={0}
              y={-6}
              width={60}
              height={12}
              fill={NEON_GREEN}
              opacity={0.5}
              rx={6}
              style={{ filter: `drop-shadow(0 0 6px ${NEON_GREEN})` }}
            />
          </g>
        ))}

        {/* Ball */}
        <circle
          cx={ballX}
          cy={ballY}
          r={10}
          fill={BALL_COLOR}
          opacity={0.9}
          style={{
            filter: `drop-shadow(0 0 8px ${BALL_COLOR}) drop-shadow(0 0 16px ${NEON_CYAN})`,
          }}
        />
        <circle
          cx={ballX}
          cy={ballY}
          r={4}
          fill={NEON_CYAN}
          opacity={0.6}
        />

        {/* Score display */}
        <text
          x={width * 0.5}
          y={pfTop - 10}
          textAnchor="middle"
          fill={NEON_YELLOW}
          fontSize={28}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.6}
          style={{ filter: `drop-shadow(0 0 6px ${NEON_YELLOW})` }}
        >
          {scoreStr}
        </text>
      </svg>
    </div>
  );
};
