/**
 * VWBusParade — tie-dye VW Microbus parade crossing the bottom of the screen.
 * 5 buses in classic Dead lot colors, bobbing to audio energy.
 * March direction alternates per cycle. Energy drives bob height + speed.
 * Slower and more chill than BearParade — lot scene vibes.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const BUS_COLORS: Array<{ body: string; roof: string; accent: string }> = [
  { body: "#FF6B35", roof: "#FFF3E0", accent: "#E65100" },   // orange/cream
  { body: "#2196F3", roof: "#E3F2FD", accent: "#0D47A1" },   // blue/white
  { body: "#E53935", roof: "#FFEBEE", accent: "#B71C1C" },   // red/cream
  { body: "#43A047", roof: "#E8F5E9", accent: "#1B5E20" },   // green/cream
  { body: "#AB47BC", roof: "#F3E5F5", accent: "#6A1B9A" },   // purple/lavender (tie-dye)
];

const NUM_BUSES = 5;
const PARADE_DURATION = 600; // 20 seconds to cross (slower than bears)
const PARADE_GAP = 1050;     // 35 second gap between parades (55s total cycle)
const PARADE_CYCLE = PARADE_DURATION + PARADE_GAP;
const BUS_SPACING = 200;
const BUS_WIDTH = 140;
const BUS_HEIGHT = 90;

/** Single VW Type 2 Microbus SVG */
const VWBus: React.FC<{
  width: number;
  height: number;
  body: string;
  roof: string;
  accent: string;
  bobOffset: number;
  tiltDeg: number;
}> = ({ width, height, body, roof, accent, bobOffset, tiltDeg }) => (
  <svg width={width} height={height} viewBox="0 0 140 90" fill="none">
    <g transform={`translate(0, ${bobOffset}) rotate(${tiltDeg}, 70, 45)`}>
      {/* Body — rounded rectangle */}
      <rect x="10" y="25" width="120" height="45" rx="12" fill={body} />
      {/* Roof */}
      <path d="M22 25 Q22 8 45 8 L95 8 Q118 8 118 25 Z" fill={roof} />
      {/* Roof accent stripe */}
      <path d="M30 12 L110 12" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      {/* Split windshield */}
      <rect x="85" y="14" width="13" height="18" rx="3" fill="#B3E5FC" opacity="0.8" />
      <rect x="100" y="14" width="13" height="18" rx="3" fill="#B3E5FC" opacity="0.8" />
      {/* Windshield divider */}
      <line x1="98.5" y1="14" x2="98.5" y2="32" stroke={accent} strokeWidth="1.5" />
      {/* Side windows */}
      <rect x="30" y="14" width="18" height="14" rx="3" fill="#B3E5FC" opacity="0.7" />
      <rect x="52" y="14" width="18" height="14" rx="3" fill="#B3E5FC" opacity="0.7" />
      {/* VW logo circle */}
      <circle cx="110" cy="46" r="9" fill={roof} stroke={accent} strokeWidth="1.5" />
      {/* VW "V" */}
      <path d="M105 42 L110 52 L115 42" stroke={accent} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* VW "W" */}
      <path d="M105 46 L107.5 52 L110 48 L112.5 52 L115 46" stroke={accent} strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Peace sign on side */}
      <circle cx="50" cy="48" r="7" stroke={roof} strokeWidth="1.2" fill="none" opacity="0.6" />
      <line x1="50" y1="41" x2="50" y2="55" stroke={roof} strokeWidth="1" opacity="0.6" />
      <line x1="50" y1="48" x2="44" y2="53" stroke={roof} strokeWidth="1" opacity="0.6" />
      <line x1="50" y1="48" x2="56" y2="53" stroke={roof} strokeWidth="1" opacity="0.6" />
      {/* Bumper */}
      <rect x="8" y="65" width="124" height="4" rx="2" fill="#9E9E9E" />
      {/* Wheels */}
      <circle cx="38" cy="72" r="10" fill="#424242" />
      <circle cx="38" cy="72" r="5" fill="#757575" />
      <circle cx="102" cy="72" r="10" fill="#424242" />
      <circle cx="102" cy="72" r="5" fill="#757575" />
      {/* Headlights */}
      <circle cx="126" cy="38" r="4" fill="#FFF9C4" opacity="0.9" />
    </g>
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const VWBusParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const tempoFactor = useTempoFactor();

  const cycleIndex = Math.floor(frame / PARADE_CYCLE);
  const cycleFrame = frame % PARADE_CYCLE;
  const goingRight = cycleIndex % 2 === 0;

  // Only render during parade portion (not gap)
  if (cycleFrame >= PARADE_DURATION) return null;

  const progress = cycleFrame / PARADE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.94, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  const totalWidth = NUM_BUSES * BUS_SPACING;
  const yBase = height - BUS_HEIGHT - 15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {BUS_COLORS.map((colors, i) => {
        // Stagger each bus
        const busProgress = progress - (i * 0.025);

        // Position
        let x: number;
        if (goingRight) {
          x = interpolate(busProgress, [0, 1], [-totalWidth, width + BUS_SPACING], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) + i * BUS_SPACING;
        } else {
          x = interpolate(busProgress, [0, 1], [width + BUS_SPACING, -totalWidth], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) - i * BUS_SPACING + totalWidth;
        }

        // Gentle bob: slower and smaller than bears (3-5px), tempo-scaled
        const bobSpeed = (5 + energy * 3) * tempoFactor;
        const bobAmp = 3 + energy * 8;
        const bob = Math.sin((frame * bobSpeed * 0.008) + i * 1.4) * bobAmp;

        // Slight tilt on beats
        const tilt = Math.sin((frame * 0.05 * tempoFactor) + i * 0.8) * 3 * (1 + snap.beatDecay * 2);

        // Warm glow
        const glowRadius = 6 + energy * 12;
        const glow = `drop-shadow(0 0 ${glowRadius}px ${colors.body}88) drop-shadow(0 0 ${glowRadius * 1.5}px ${colors.body}44)`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              opacity,
              filter: glow,
              transform: `scaleX(${goingRight ? 1 : -1})`,
              willChange: "transform, opacity",
            }}
          >
            <VWBus
              width={BUS_WIDTH}
              height={BUS_HEIGHT}
              body={colors.body}
              roof={colors.roof}
              accent={colors.accent}
              bobOffset={0}
              tiltDeg={tilt}
            />
          </div>
        );
      })}
    </div>
  );
};
