/**
 * NewtonsCradle — 5 suspended balls in Newton's cradle arrangement.
 * Balls hang from V-shaped strings from a top bar.
 * End ball swings out and clicks — transfers energy through the line.
 * Swing amplitude driven by energy. Metallic silver balls with reflective highlights.
 * Satisfying pendulum physics. Cycle: 40s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1200; // 40s at 30fps
const DURATION = 420; // 14s visible
const NUM_BALLS = 5;
const BALL_RADIUS = 18;
const STRING_LENGTH = 160;
const BALL_SPACING = BALL_RADIUS * 2 + 2;

interface Props {
  frames: EnhancedFrameData[];
}

export const NewtonsCradle: React.FC<Props> = ({ frames }) => {
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

  // Highlight positions for metallic look (deterministic)
  const highlights = React.useMemo(() => {
    const rng = seeded(5050);
    return Array.from({ length: NUM_BALLS }, () => ({
      hx: (rng() - 0.5) * BALL_RADIUS * 0.5,
      hy: -BALL_RADIUS * 0.3 + rng() * BALL_RADIUS * 0.2,
      size: BALL_RADIUS * (0.2 + rng() * 0.15),
    }));
  }, []);

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
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Cradle position
  const cradleCx = width * 0.4;
  const barY = height * 0.25;
  const totalWidth = (NUM_BALLS - 1) * BALL_SPACING;
  const barLeft = cradleCx - totalWidth / 2 - 30;
  const barRight = cradleCx + totalWidth / 2 + 30;

  // Pendulum swing physics
  // Swing period: ~60 frames (2 seconds)
  const swingPeriod = 60;
  const maxAmplitude = interpolate(energy, [0.03, 0.15, 0.35], [0.15, 0.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Phase determines which side is swinging
  const swingPhase = (cycleFrame % swingPeriod) / swingPeriod;
  const swingAngle = Math.sin(swingPhase * Math.PI * 2) * maxAmplitude * 0.7; // radians

  // Ball positions: only end balls swing, middle balls stay still
  const ballAngles: number[] = [];
  for (let i = 0; i < NUM_BALLS; i++) {
    if (i === 0 && swingAngle < 0) {
      // Left ball swings out when phase is negative
      ballAngles.push(swingAngle);
    } else if (i === NUM_BALLS - 1 && swingAngle > 0) {
      // Right ball swings out when phase is positive
      ballAngles.push(swingAngle);
    } else {
      // Middle balls: tiny oscillation for realism
      const microBounce = i > 0 && i < NUM_BALLS - 1
        ? Math.sin(swingPhase * Math.PI * 2 + i * 0.5) * 0.01 * maxAmplitude
        : 0;
      ballAngles.push(microBounce);
    }
  }

  // Impact flash when balls click
  const clickProximity = Math.abs(swingAngle);
  const isClicking = clickProximity < 0.05 && maxAmplitude > 0.1;
  const clickFlash = isClicking ? 0.4 : 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="cradle-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="ball-grad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#E8E8E8" />
            <stop offset="40%" stopColor="#B0B0B0" />
            <stop offset="80%" stopColor="#787878" />
            <stop offset="100%" stopColor="#505050" />
          </radialGradient>
          <linearGradient id="bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A0A0A0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#606060" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Top bar */}
        <rect
          x={barLeft}
          y={barY - 4}
          width={barRight - barLeft}
          height={8}
          rx={3}
          fill="url(#bar-grad)"
        />

        {/* Support legs (V-shape) */}
        <line x1={barLeft + 10} y1={barY + 4} x2={barLeft - 15} y2={barY + 80} stroke="#808080" strokeWidth={3} opacity={0.4} />
        <line x1={barRight - 10} y1={barY + 4} x2={barRight + 15} y2={barY + 80} stroke="#808080" strokeWidth={3} opacity={0.4} />

        {/* Balls and strings */}
        {Array.from({ length: NUM_BALLS }).map((_, i) => {
          const anchorX = cradleCx + (i - (NUM_BALLS - 1) / 2) * BALL_SPACING;
          const angle = ballAngles[i];

          // Ball position from pendulum angle
          const ballX = anchorX + Math.sin(angle) * STRING_LENGTH;
          const ballY = barY + Math.cos(angle) * STRING_LENGTH;

          const hl = highlights[i];

          return (
            <g key={`ball-${i}`}>
              {/* V-shaped strings (two strings per ball) */}
              <line
                x1={anchorX - 8}
                y1={barY}
                x2={ballX}
                y2={ballY - BALL_RADIUS}
                stroke="#888"
                strokeWidth={1}
                opacity={0.5}
              />
              <line
                x1={anchorX + 8}
                y1={barY}
                x2={ballX}
                y2={ballY - BALL_RADIUS}
                stroke="#888"
                strokeWidth={1}
                opacity={0.5}
              />

              {/* Ball shadow */}
              <ellipse
                cx={ballX + 2}
                cy={ballY + 2}
                rx={BALL_RADIUS}
                ry={BALL_RADIUS}
                fill="#000"
                opacity={0.1}
              />

              {/* Ball */}
              <circle
                cx={ballX}
                cy={ballY}
                r={BALL_RADIUS}
                fill="url(#ball-grad)"
                opacity={0.8}
              />

              {/* Metallic highlight */}
              <circle
                cx={ballX + hl.hx}
                cy={ballY + hl.hy}
                r={hl.size}
                fill="#FFF"
                opacity={0.25}
              />

              {/* Edge rim light */}
              <circle
                cx={ballX}
                cy={ballY}
                r={BALL_RADIUS - 1}
                fill="none"
                stroke="#D0D0D0"
                strokeWidth={0.8}
                opacity={0.2}
              />
            </g>
          );
        })}

        {/* Click impact flash */}
        {isClicking && (
          <circle
            cx={cradleCx}
            cy={barY + STRING_LENGTH}
            r={BALL_RADIUS * 2}
            fill="#FFF"
            opacity={clickFlash}
            filter="url(#cradle-glow)"
          />
        )}
      </svg>
    </div>
  );
};
