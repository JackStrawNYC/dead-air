/**
 * MarchingTerrapins — a parade of 5 psychedelic turtles slowly marching across the bottom.
 * Much slower than the bear parade — chill and groovy.
 * Each turtle has a domed shell with hexagonal pattern, four stubby walking legs, and a small head.
 * Different neon colors per turtle. Slow waddle, gentle bob, neon drop-shadow glow.
 * Crosses every 70 seconds, takes 25 seconds to cross.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const TURTLE_COLORS = [
  "#00FF7F", // spring green
  "#FF1493", // deep pink
  "#00FFFF", // cyan
  "#FFD700", // gold
  "#DA70D6", // orchid
];

const NUM_TURTLES = 5;
const PARADE_DURATION = 750; // 25 seconds at 30fps
const PARADE_GAP = 1350;     // 45 second gap (70s total cycle - 25s crossing)
const PARADE_CYCLE = PARADE_DURATION + PARADE_GAP;
const TURTLE_SPACING = 140;
const TURTLE_SIZE = 100;

/** Single terrapin SVG with hexagonal shell pattern, stubby legs, and head */
const Turtle: React.FC<{
  size: number;
  color: string;
  legPhase: number; // 0..2PI — drives leg waddle
}> = ({ size, color, legPhase }) => {
  // Leg positions alternate: front-left/back-right vs front-right/back-left
  const legLift = Math.sin(legPhase) * 4;
  const legLift2 = Math.sin(legPhase + Math.PI) * 4;

  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 120 84" fill="none">
      {/* Back left leg */}
      <ellipse
        cx="30"
        cy={68 + legLift}
        rx="10"
        ry="6"
        fill={color}
        opacity="0.7"
        transform={`rotate(${-10 + legLift * 1.5} 30 ${68 + legLift})`}
      />
      {/* Back right leg */}
      <ellipse
        cx="90"
        cy={68 + legLift2}
        rx="10"
        ry="6"
        fill={color}
        opacity="0.7"
        transform={`rotate(${10 - legLift2 * 1.5} 90 ${68 + legLift2})`}
      />
      {/* Front left leg */}
      <ellipse
        cx="38"
        cy={66 + legLift2}
        rx="9"
        ry="5.5"
        fill={color}
        opacity="0.7"
        transform={`rotate(${-8 + legLift2 * 1.2} 38 ${66 + legLift2})`}
      />
      {/* Front right leg */}
      <ellipse
        cx="82"
        cy={66 + legLift}
        rx="9"
        ry="5.5"
        fill={color}
        opacity="0.7"
        transform={`rotate(${8 - legLift * 1.2} 82 ${66 + legLift})`}
      />

      {/* Tail */}
      <line
        x1="12"
        y1="48"
        x2="2"
        y2="52"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Shell body (dome) */}
      <ellipse cx="60" cy="42" rx="38" ry="26" fill={color} opacity="0.85" />

      {/* Shell dome highlight (lighter area) */}
      <ellipse cx="60" cy="36" rx="30" ry="18" fill={color} opacity="0.5" />

      {/* Hexagonal shell pattern */}
      {/* Center hexagon */}
      <polygon
        points="60,26 70,32 70,42 60,48 50,42 50,32"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        opacity="0.6"
      />
      {/* Top hex */}
      <polygon
        points="60,16 67,20 67,28 60,32 53,28 53,20"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.45"
      />
      {/* Left hex */}
      <polygon
        points="44,30 51,34 51,42 44,46 37,42 37,34"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.45"
      />
      {/* Right hex */}
      <polygon
        points="76,30 83,34 83,42 76,46 69,42 69,34"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.45"
      />
      {/* Bottom-left hex */}
      <polygon
        points="50,42 57,46 57,54 50,58 43,54 43,46"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.4"
      />
      {/* Bottom-right hex */}
      <polygon
        points="70,42 77,46 77,54 70,58 63,54 63,46"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.4"
      />

      {/* Shell rim */}
      <ellipse cx="60" cy="48" rx="36" ry="10" stroke={color} strokeWidth="1.5" fill="none" opacity="0.4" />

      {/* Head */}
      <ellipse cx="104" cy="44" rx="11" ry="9" fill={color} opacity="0.8" />

      {/* Eye */}
      <circle cx="110" cy="41" r="2.5" fill="black" opacity="0.5" />

      {/* Mouth line */}
      <path
        d="M 108 47 Q 113 49 115 46"
        stroke="black"
        strokeWidth="1"
        fill="none"
        opacity="0.35"
      />

      {/* Neck connecting head to shell */}
      <rect x="94" y="38" width="12" height="10" rx="5" fill={color} opacity="0.7" />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const MarchingTerrapins: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const rng = React.useMemo(() => seeded(841977), []);
  const _rng = rng; // keep reference alive
  void _rng;

  // Rolling energy (window of 151 frames centered on current)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / PARADE_CYCLE);
  const cycleFrame = frame % PARADE_CYCLE;
  const goingRight = cycleIndex % 2 === 0;

  // Only render during parade portion (not gap)
  if (cycleFrame >= PARADE_DURATION) return null;

  const progress = cycleFrame / PARADE_DURATION;

  // Fade in/out with easing
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.15], [0.5, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const totalWidth = NUM_TURTLES * TURTLE_SPACING;
  const yBase = height - TURTLE_SIZE * 0.7 - 15; // bottom of screen

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {TURTLE_COLORS.map((color, i) => {
        // Stagger each turtle slightly
        const turtleProgress = progress - i * 0.02;

        // Position across screen
        let x: number;
        if (goingRight) {
          x =
            interpolate(turtleProgress, [0, 1], [-totalWidth, width + TURTLE_SPACING], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }) +
            i * TURTLE_SPACING;
        } else {
          x =
            interpolate(turtleProgress, [0, 1], [width + TURTLE_SPACING, -totalWidth], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }) -
            i * TURTLE_SPACING +
            totalWidth;
        }

        // Slow gentle bob (much slower than bears)
        const bobSpeed = 2 + energy * 1.5;
        const bobAmp = 3 + energy * 5;
        const bob = Math.sin(frame * bobSpeed * 0.01 + i * 1.8) * bobAmp;

        // Very slight tilt for groovy feel
        const tilt = Math.sin(frame * 0.02 + i * 1.1) * 3;

        // Slow waddle leg phase
        const legPhase = frame * 0.06 + i * 0.9;

        // Per-turtle staggered fade for variety
        const turtleFadeOffset = i * 0.03;
        const individualFade = interpolate(
          progress,
          [turtleFadeOffset, turtleFadeOffset + 0.08, 0.88 - turtleFadeOffset, 0.96 - turtleFadeOffset],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        // Neon glow
        const glow = `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 20px ${color}) drop-shadow(0 0 35px ${color})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity: opacity * individualFade,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Turtle size={TURTLE_SIZE} color={color} legPhase={legPhase} />
          </div>
        );
      })}
    </div>
  );
};
