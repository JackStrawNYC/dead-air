/**
 * TicketStubAnimated — Vintage perforated concert ticket.
 * Small ticket shape (200x80px) in upper-right corner. "GRATEFUL DEAD" header,
 * "BARTON HALL MAY 8 1977", "ADMIT ONE", perforated edge (dashed border on one
 * side). Subtle rotation wobble. Paper-aged color (warm cream/tan). Appears
 * every 85s for 7s with fade in/out. Perforated edge animates as if tearing.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// Timing: appears every 85s (2550 frames) for 7s (210 frames)
const CYCLE_PERIOD = 2550;
const SHOW_DURATION = 210;
const FADE_FRAMES = 40;

// Ticket dimensions
const TICKET_W = 200;
const TICKET_H = 80;
const PERFORATION_X = 155; // where the tear line is
const NUM_PERF_DOTS = 12;

interface Props {
  frames: EnhancedFrameData[];
}

export const TicketStubAnimated: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const ctx = useShowContext();

  const bandName = ctx?.bandName?.toUpperCase() ?? "GRATEFUL DEAD";
  const venueDateLine = ctx
    ? `${ctx.venueShort.toUpperCase()} - ${ctx.date.toUpperCase()}`
    : "LIVE IN CONCERT";
  const locationLine = ctx
    ? ctx.venueLocation.toUpperCase()
    : "THE GRATEFUL DEAD";

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Perforation dots (must be before any return null)
  const perfDots = React.useMemo(() => {
    const rng = seeded(ctx?.dateSeed ?? 19770508);
    return Array.from({ length: NUM_PERF_DOTS }, (_, i) => ({
      y: 6 + (i / (NUM_PERF_DOTS - 1)) * (TICKET_H - 12),
      offsetX: (rng() - 0.5) * 1.5,
      size: 1.5 + rng() * 1,
    }));
  }, [ctx?.dateSeed]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  if (!inShowWindow) return null;

  // Fade envelope
  const fadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cyclePos, [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  if (opacity < 0.01) return null;

  // Subtle rotation wobble
  const wobble = Math.sin(frame * 0.02 + 1.5) * 2 + Math.sin(frame * 0.013) * 1;

  // Tear animation: perforated edge shifts rightward during show
  const tearProgress = interpolate(cyclePos, [SHOW_DURATION * 0.3, SHOW_DURATION * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const tearShift = tearProgress * 6;

  // Subtle energy-responsive pulse on the border
  const borderPulse = 0.3 + energy * 0.4;

  // Position: upper right corner
  const posX = width - TICKET_W - 30;
  const posY = 30;

  // Paper colors
  const paperBg = `rgba(235, 215, 180, ${0.85 + energy * 0.1})`;
  const paperBorder = `rgba(180, 150, 100, ${borderPulse})`;
  const textDark = "rgba(60, 35, 15, 0.9)";
  const textMed = "rgba(90, 60, 30, 0.8)";
  const textLight = "rgba(120, 85, 50, 0.7)";
  const perfColor = "rgba(160, 130, 90, 0.5)";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: posX,
          top: posY,
          width: TICKET_W,
          height: TICKET_H,
          opacity,
          transform: `rotate(${wobble}deg)`,
          willChange: "transform, opacity",
          filter: "drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))",
        }}
      >
        {/* Main ticket body */}
        <svg width={TICKET_W} height={TICKET_H}>
          {/* Aged paper background */}
          <rect
            x={0}
            y={0}
            width={PERFORATION_X}
            height={TICKET_H}
            fill={paperBg}
            stroke={paperBorder}
            strokeWidth={1}
            rx={2}
          />
          {/* Stub portion (right of perforation) */}
          <rect
            x={PERFORATION_X + tearShift}
            y={0}
            width={TICKET_W - PERFORATION_X}
            height={TICKET_H}
            fill={paperBg}
            stroke={paperBorder}
            strokeWidth={1}
            rx={2}
            opacity={1 - tearProgress * 0.3}
          />
          {/* Perforation dots */}
          {perfDots.map((dot, i) => (
            <circle
              key={i}
              cx={PERFORATION_X + dot.offsetX + tearShift * 0.5}
              cy={dot.y}
              r={dot.size}
              fill={perfColor}
            />
          ))}
          {/* Band name */}
          <text
            x={PERFORATION_X / 2}
            y={18}
            textAnchor="middle"
            fill={textDark}
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2.5,
            }}
          >
            {bandName}
          </text>
          {/* Venue / date */}
          <text
            x={PERFORATION_X / 2}
            y={34}
            textAnchor="middle"
            fill={textMed}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 8,
              letterSpacing: 0.5,
            }}
          >
            {venueDateLine}
          </text>
          {/* Location */}
          <text
            x={PERFORATION_X / 2}
            y={47}
            textAnchor="middle"
            fill={textLight}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 7,
              letterSpacing: 0.3,
            }}
          >
            {locationLine}
          </text>
          {/* Divider line */}
          <line
            x1={12}
            y1={55}
            x2={PERFORATION_X - 12}
            y2={55}
            stroke={perfColor}
            strokeWidth={0.5}
          />
          {/* ADMIT ONE */}
          <text
            x={PERFORATION_X / 2}
            y={70}
            textAnchor="middle"
            fill={textDark}
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            ADMIT ONE
          </text>
          {/* Stub text */}
          <text
            x={PERFORATION_X + (TICKET_W - PERFORATION_X) / 2 + tearShift}
            y={35}
            textAnchor="middle"
            fill={textLight}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 7,
              letterSpacing: 0.5,
            }}
            opacity={1 - tearProgress * 0.4}
            transform={`rotate(-90, ${PERFORATION_X + (TICKET_W - PERFORATION_X) / 2 + tearShift}, 35)`}
          >
            STUB
          </text>
        </svg>
      </div>
    </div>
  );
};
