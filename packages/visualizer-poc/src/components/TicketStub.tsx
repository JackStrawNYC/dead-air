/**
 * TicketStub — Layer 7 (Artifact)
 * Vintage concert ticket in corner. Era-appropriate design. Brief appearance.
 * Tier B | Tags: dead-culture, retro | dutyCycle: 15 | energyBand: any
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const CYCLE_FRAMES = 900; // 30s
const ON_FRAMES = 135;    // 4.5s
const FADE_FRAMES = 30;
const STAGGER_START = 300; // 10s delay

interface Props {
  frames: EnhancedFrameData[];
}

export const TicketStub: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const delayedFrame = frame - STAGGER_START;
  if (delayedFrame < 0) return null;

  const cycleFrame = delayedFrame % CYCLE_FRAMES;
  if (cycleFrame >= ON_FRAMES) return null;

  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [ON_FRAMES - FADE_FRAMES, ON_FRAMES], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic),
  });

  const masterOpacity = 0.08 * masterFade * Math.min(fadeIn, fadeOut);
  if (masterOpacity < 0.005) return null;

  // Ticket data from show context
  const venue = ctx?.venueShort ?? "BARTON HALL";
  const date = ctx?.dateShort ?? "MAY 8, 1977";
  const band = "GRATEFUL DEAD";

  const rng = seeded((ctx?.showSeed ?? 19770508) + 888);
  // Position: one of 4 corners
  const corner = Math.floor(rng() * 4);
  const ticketW = 200;
  const ticketH = 80;
  const margin = 40;

  let tx: number, ty: number, rotation: number;
  if (corner === 0) { tx = margin; ty = margin; rotation = -3 + rng() * 6; }
  else if (corner === 1) { tx = width - ticketW - margin; ty = margin; rotation = -3 + rng() * 6; }
  else if (corner === 2) { tx = margin; ty = height - ticketH - margin; rotation = -3 + rng() * 6; }
  else { tx = width - ticketW - margin; ty = height - ticketH - margin; rotation = -3 + rng() * 6; }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: tx,
          top: ty,
          width: ticketW,
          height: ticketH,
          opacity: masterOpacity,
          transform: `rotate(${rotation}deg)`,
          mixBlendMode: "screen",
          border: "1px solid hsla(35, 60%, 60%, 0.5)",
          borderRadius: 4,
          padding: "8px 12px",
          background: "hsla(35, 40%, 20%, 0.3)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          fontFamily: "'Courier New', monospace",
          color: "hsla(35, 70%, 70%, 0.8)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: "bold", letterSpacing: 2, marginBottom: 2 }}>
          {band}
        </div>
        <div style={{ fontSize: 9, letterSpacing: 1, opacity: 0.8, marginBottom: 1 }}>
          {venue}
        </div>
        <div style={{ fontSize: 8, letterSpacing: 1, opacity: 0.6 }}>
          {date}
        </div>
        {/* Perforation line on right side */}
        <div style={{
          position: "absolute",
          right: 30,
          top: 4,
          bottom: 4,
          borderRight: "1px dashed hsla(35, 50%, 50%, 0.3)",
        }} />
        <div style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)",
          fontSize: 7,
          opacity: 0.4,
          letterSpacing: 1,
        }}>
          ADMIT ONE
        </div>
      </div>
    </div>
  );
};
