/**
 * CosmicCharlie — an astronaut skeleton floating in space.
 * SVG skeleton in a spacesuit (round helmet with visor, puffy suit body, boots).
 * Floats from one side to the other in a gentle arc trajectory, slowly tumbling/rotating.
 * Stars twinkle around him (6 small star shapes near the character).
 * Appears every 80 seconds, takes 20 seconds to float across.
 * Color cycling on the suit. Tether line trails behind.
 * Energy makes the tumble speed faster.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const FLOAT_DURATION = 600; // 20 seconds at 30fps
const FLOAT_GAP = 1800;     // 60 second gap (80s total cycle)
const FLOAT_CYCLE = FLOAT_DURATION + FLOAT_GAP;

/** Small twinkling star SVG */
const Star: React.FC<{ cx: number; cy: number; size: number; color: string; twinkle: number }> = ({
  cx,
  cy,
  size,
  color,
  twinkle,
}) => {
  const s = size * (0.5 + twinkle * 0.5);
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <polygon
        points={`0,${-s} ${s * 0.3},${-s * 0.3} ${s},0 ${s * 0.3},${s * 0.3} 0,${s} ${-s * 0.3},${s * 0.3} ${-s},0 ${-s * 0.3},${-s * 0.3}`}
        fill={color}
        opacity={0.5 + twinkle * 0.5}
      />
    </g>
  );
};

/** Astronaut skeleton SVG */
const AstronautSkeleton: React.FC<{ size: number; suitColor: string; visorColor: string }> = ({
  size,
  suitColor,
  visorColor,
}) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 100 130" fill="none">
    {/* Helmet — round glass bubble */}
    <circle cx="50" cy="24" r="22" stroke={suitColor} strokeWidth="3" opacity="0.9" />
    <circle cx="50" cy="24" r="22" fill={suitColor} opacity="0.15" />

    {/* Visor (reflective arc) */}
    <path
      d="M 34 18 Q 50 8 66 18 Q 66 32 50 36 Q 34 32 34 18 Z"
      fill={visorColor}
      opacity="0.6"
    />
    {/* Visor reflection highlight */}
    <path
      d="M 38 16 Q 46 12 54 16"
      stroke="white"
      strokeWidth="1.5"
      opacity="0.4"
      fill="none"
    />

    {/* Skull visible through visor */}
    <circle cx="43" cy="22" r="3" fill="black" opacity="0.4" />
    <circle cx="57" cy="22" r="3" fill="black" opacity="0.4" />
    <ellipse cx="50" cy="28" rx="2" ry="3" fill="black" opacity="0.3" />
    {/* Jaw/teeth */}
    <rect x="43" y="31" width="14" height="4" rx="1" fill={suitColor} opacity="0.3" />
    {[44, 47, 50, 53, 56].map((tx) => (
      <line
        key={tx}
        x1={tx}
        y1="31"
        x2={tx}
        y2="35"
        stroke="black"
        strokeWidth="0.7"
        opacity="0.2"
      />
    ))}

    {/* Neck ring */}
    <ellipse cx="50" cy="44" rx="14" ry="4" fill={suitColor} opacity="0.7" />

    {/* Suit body (puffy torso) */}
    <ellipse cx="50" cy="68" rx="24" ry="22" fill={suitColor} opacity="0.6" />
    {/* Suit body outline */}
    <ellipse cx="50" cy="68" rx="24" ry="22" stroke={suitColor} strokeWidth="2" opacity="0.8" />

    {/* Ribcage visible through suit */}
    {[56, 62, 68, 74].map((ry) => (
      <path
        key={ry}
        d={`M ${38} ${ry} Q 50 ${ry - 3} ${62} ${ry}`}
        stroke={suitColor}
        strokeWidth="1.5"
        opacity="0.3"
        fill="none"
      />
    ))}

    {/* Belt/waist ring */}
    <ellipse cx="50" cy="88" rx="18" ry="4" fill={suitColor} opacity="0.6" />

    {/* Left arm (puffy sleeve) */}
    <line x1="28" y1="56" x2="8" y2="68" stroke={suitColor} strokeWidth="8" strokeLinecap="round" opacity="0.7" />
    {/* Left glove */}
    <circle cx="6" cy="70" r="5" fill={suitColor} opacity="0.7" />
    {/* Skeleton hand bones in glove */}
    <line x1="3" y1="67" x2="1" y2="63" stroke={suitColor} strokeWidth="1" opacity="0.4" />
    <line x1="5" y1="66" x2="4" y2="62" stroke={suitColor} strokeWidth="1" opacity="0.4" />
    <line x1="7" y1="66" x2="8" y2="62" stroke={suitColor} strokeWidth="1" opacity="0.4" />

    {/* Right arm (puffy sleeve) */}
    <line x1="72" y1="56" x2="92" y2="64" stroke={suitColor} strokeWidth="8" strokeLinecap="round" opacity="0.7" />
    {/* Right glove */}
    <circle cx="94" cy="66" r="5" fill={suitColor} opacity="0.7" />

    {/* Left leg (puffy) */}
    <line x1="40" y1="88" x2="30" y2="115" stroke={suitColor} strokeWidth="9" strokeLinecap="round" opacity="0.7" />
    {/* Left boot */}
    <ellipse cx="28" cy="118" rx="9" ry="6" fill={suitColor} opacity="0.75" />

    {/* Right leg (puffy) */}
    <line x1="60" y1="88" x2="70" y2="115" stroke={suitColor} strokeWidth="9" strokeLinecap="round" opacity="0.7" />
    {/* Right boot */}
    <ellipse cx="72" cy="118" rx="9" ry="6" fill={suitColor} opacity="0.75" />

    {/* Backpack/life support */}
    <rect x="36" y="50" width="28" height="20" rx="5" fill={suitColor} opacity="0.35" />
    <rect x="40" y="53" width="8" height="6" rx="2" fill={suitColor} opacity="0.25" />
    <rect x="52" y="53" width="8" height="6" rx="2" fill={suitColor} opacity="0.25" />

    {/* Tether attachment point */}
    <circle cx="36" cy="60" r="3" fill={suitColor} opacity="0.8" />
  </svg>
);

interface StarData {
  offsetX: number;
  offsetY: number;
  size: number;
  speed: number;
  phase: number;
}

function generateStars(seed: number): StarData[] {
  const rng = seeded(seed);
  return Array.from({ length: 7 }, () => ({
    offsetX: (rng() - 0.5) * 200,
    offsetY: (rng() - 0.5) * 200,
    size: 4 + rng() * 8,
    speed: 2 + rng() * 5,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicCharlie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / FLOAT_CYCLE);
  const cycleFrame = frame % FLOAT_CYCLE;

  // Stars must be memoized before any early return (React hooks rule)
  const stars = React.useMemo(() => generateStars(cycleIndex * 31 + 1969), [cycleIndex]);

  // Only render during float portion
  if (cycleFrame >= FLOAT_DURATION) return null;

  const progress = cycleFrame / FLOAT_DURATION;
  const goingRight = cycleIndex % 2 === 0;

  // Gentle arc trajectory
  const xStart = goingRight ? -0.15 * width : width * 1.15;
  const xEnd = goingRight ? width * 1.15 : -0.15 * width;
  const x = interpolate(progress, [0, 1], [xStart, xEnd], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arc: rise in first half, descend in second half
  const arcHeight = height * 0.3;
  const yCenter = height * 0.35;
  const arc = Math.sin(progress * Math.PI) * arcHeight;
  const y = yCenter - arc;

  // Tumble rotation — energy drives speed
  const tumbleSpeed = 0.8 + energy * 2.5;
  const rotation = cycleFrame * tumbleSpeed * (goingRight ? 1 : -1);

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
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  // Color cycling on the suit
  const hue = (frame * 0.8 + cycleIndex * 60) % 360;
  const suitColor = `hsl(${hue}, 85%, 65%)`;
  const visorColor = `hsl(${(hue + 180) % 360}, 90%, 50%)`;
  const glowColor = `hsl(${hue}, 90%, 60%)`;

  // Scale with gentle breathing
  const breathe = 1 + Math.sin(frame * 0.04) * 0.03;
  const charSize = 120;

  // Tether: trail behind the character
  const tetherLength = 120;
  const tetherAngle = goingRight ? Math.PI + 0.3 : -0.3;
  const tetherEndX = Math.cos(tetherAngle + rotation * 0.002) * tetherLength;
  const tetherEndY = Math.sin(tetherAngle + rotation * 0.002) * tetherLength;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Tether line */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: opacity * 0.6 }}
      >
        <line
          x1={x}
          y1={y + charSize * 0.4}
          x2={x + tetherEndX}
          y2={y + charSize * 0.4 + tetherEndY}
          stroke={glowColor}
          strokeWidth="2"
          strokeDasharray="6 4"
          opacity="0.5"
        />
        {/* Tether glow */}
        <line
          x1={x}
          y1={y + charSize * 0.4}
          x2={x + tetherEndX}
          y2={y + charSize * 0.4 + tetherEndY}
          stroke={glowColor}
          strokeWidth="5"
          opacity="0.15"
          filter="url(#tetherBlur)"
        />
        <defs>
          <filter id="tetherBlur">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
      </svg>

      {/* Twinkling stars near character */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: opacity * 0.8 }}
      >
        {stars.map((star, i) => {
          const twinkle =
            Math.sin(frame * star.speed * 0.03 + star.phase) * 0.5 + 0.5;
          const starHue = (hue + i * 50) % 360;
          const starColor = `hsl(${starHue}, 90%, 75%)`;
          return (
            <Star
              key={i}
              cx={x + star.offsetX}
              cy={y + charSize * 0.5 + star.offsetY}
              size={star.size}
              color={starColor}
              twinkle={twinkle}
            />
          );
        })}
      </svg>

      {/* Astronaut skeleton */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 10px ${glowColor}) drop-shadow(0 0 25px ${glowColor}) drop-shadow(0 0 40px ${glowColor})`,
          willChange: "transform, opacity",
        }}
      >
        <AstronautSkeleton size={charSize} suitColor={suitColor} visorColor={visorColor} />
      </div>
    </div>
  );
};
