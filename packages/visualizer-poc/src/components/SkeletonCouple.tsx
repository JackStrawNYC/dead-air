/**
 * SkeletonCouple — two skeletons waltzing together.
 * One slightly taller, both in dance pose (arms extended holding each other).
 * They slowly rotate around a center point (waltz spin).
 * Appear in the center-right area of screen.
 * Spin speed tied to energy — slow waltz during quiet, faster during loud.
 * Appear every 65 seconds for 18 seconds.
 * Complementary neon colors. Rose between clasped hands. Neon glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const WALTZ_DURATION = 540; // 18 seconds at 30fps
const WALTZ_GAP = 1410;     // 47 second gap (65s total cycle)
const WALTZ_CYCLE = WALTZ_DURATION + WALTZ_GAP;

const COLOR_PAIRS = [
  { lead: "#FF1493", follow: "#00FFFF", rose: "#FF4500" },
  { lead: "#DA70D6", follow: "#76FF03", rose: "#FF1744" },
  { lead: "#FFD700", follow: "#FF00FF", rose: "#FF6347" },
  { lead: "#00FF7F", follow: "#FF69B4", rose: "#FF1493" },
];

/** Waltzing skeleton pair SVG — lead (taller) and follow dancing together */
const WaltzingPair: React.FC<{
  size: number;
  leadColor: string;
  followColor: string;
  roseColor: string;
  sway: number; // -1 to 1 — slight body sway
}> = ({ size, leadColor, followColor, roseColor, sway }) => {
  const swayOffset = sway * 3;

  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 180 140" fill="none">
      {/* ─── LEAD SKELETON (taller, left side) ─── */}
      <g transform={`translate(${55 + swayOffset}, 0)`}>
        {/* Head */}
        <circle cx="0" cy="18" r="14" fill={leadColor} opacity="0.85" />
        {/* Eyes */}
        <circle cx="-5" cy="15" r="3" fill="black" opacity="0.5" />
        <circle cx="5" cy="15" r="3" fill="black" opacity="0.5" />
        {/* Jaw with teeth */}
        <rect x="-8" y="23" width="16" height="5" rx="1" fill={leadColor} opacity="0.6" />
        {[-6, -3, 0, 3, 6].map((tx) => (
          <line
            key={tx}
            x1={tx}
            y1="23"
            x2={tx}
            y2="28"
            stroke="black"
            strokeWidth="0.8"
            opacity="0.3"
          />
        ))}

        {/* Spine */}
        <line x1="0" y1="32" x2={0 + swayOffset * 0.5} y2="72" stroke={leadColor} strokeWidth="3.5" />

        {/* Ribs */}
        {[38, 44, 50, 56].map((ry) => (
          <path
            key={ry}
            d={`M ${-10 + swayOffset * 0.3} ${ry} Q ${swayOffset * 0.4} ${ry - 2.5} ${10 + swayOffset * 0.3} ${ry}`}
            stroke={leadColor}
            strokeWidth="2"
            opacity="0.5"
            fill="none"
          />
        ))}

        {/* Pelvis */}
        <ellipse cx={swayOffset * 0.5} cy="74" rx="10" ry="4" fill={leadColor} opacity="0.55" />

        {/* Left arm — raised to side (leading arm) */}
        <line x1="-8" y1="38" x2="-30" y2="45" stroke={leadColor} strokeWidth="3.5" strokeLinecap="round" />
        <line x1="-30" y1="45" x2="-40" y2="38" stroke={leadColor} strokeWidth="3" strokeLinecap="round" />

        {/* Right arm — extended forward to hold partner's hand */}
        <line x1="8" y1="38" x2="35" y2="42" stroke={leadColor} strokeWidth="3.5" strokeLinecap="round" />
        <line x1="35" y1="42" x2="50" y2="35" stroke={leadColor} strokeWidth="3" strokeLinecap="round" />

        {/* Legs */}
        <line x1={-5 + swayOffset * 0.3} y1="76" x2={-12 + sway * 4} y2="115" stroke={leadColor} strokeWidth="3.5" strokeLinecap="round" />
        <line x1={5 + swayOffset * 0.3} y1="76" x2={12 - sway * 3} y2="115" stroke={leadColor} strokeWidth="3.5" strokeLinecap="round" />
        {/* Feet */}
        <ellipse cx={-12 + sway * 4} cy="118" rx="7" ry="3" fill={leadColor} opacity="0.6" />
        <ellipse cx={12 - sway * 3} cy="118" rx="7" ry="3" fill={leadColor} opacity="0.6" />
      </g>

      {/* ─── FOLLOW SKELETON (slightly shorter, right side) ─── */}
      <g transform={`translate(${115 - swayOffset}, 6)`}>
        {/* Head (slightly smaller) */}
        <circle cx="0" cy="16" r="12" fill={followColor} opacity="0.85" />
        {/* Eyes */}
        <circle cx="-4" cy="13" r="2.5" fill="black" opacity="0.5" />
        <circle cx="4" cy="13" r="2.5" fill="black" opacity="0.5" />
        {/* Jaw */}
        <rect x="-7" y="20" width="14" height="4.5" rx="1" fill={followColor} opacity="0.6" />
        {[-5, -2, 1, 4].map((tx) => (
          <line
            key={tx}
            x1={tx}
            y1="20"
            x2={tx}
            y2="24.5"
            stroke="black"
            strokeWidth="0.7"
            opacity="0.3"
          />
        ))}

        {/* Spine */}
        <line x1="0" y1="28" x2={-swayOffset * 0.5} y2="66" stroke={followColor} strokeWidth="3" />

        {/* Ribs */}
        {[34, 40, 46, 52].map((ry) => (
          <path
            key={ry}
            d={`M ${-9 - swayOffset * 0.3} ${ry} Q ${-swayOffset * 0.4} ${ry - 2} ${9 - swayOffset * 0.3} ${ry}`}
            stroke={followColor}
            strokeWidth="1.8"
            opacity="0.5"
            fill="none"
          />
        ))}

        {/* Pelvis */}
        <ellipse cx={-swayOffset * 0.5} cy="68" rx="9" ry="3.5" fill={followColor} opacity="0.55" />

        {/* Left arm — extended to hold partner's hand */}
        <line x1="-7" y1="34" x2="-35" y2="32" stroke={followColor} strokeWidth="3" strokeLinecap="round" />
        <line x1="-35" y1="32" x2="-48" y2="28" stroke={followColor} strokeWidth="2.5" strokeLinecap="round" />

        {/* Right arm — on partner's shoulder */}
        <line x1="7" y1="34" x2="20" y2="40" stroke={followColor} strokeWidth="3" strokeLinecap="round" />
        <line x1="20" y1="40" x2="28" y2="35" stroke={followColor} strokeWidth="2.5" strokeLinecap="round" />

        {/* Legs */}
        <line x1={-4 - swayOffset * 0.3} y1="70" x2={-10 - sway * 3} y2="108" stroke={followColor} strokeWidth="3" strokeLinecap="round" />
        <line x1={4 - swayOffset * 0.3} y1="70" x2={10 + sway * 2.5} y2="108" stroke={followColor} strokeWidth="3" strokeLinecap="round" />
        {/* Feet */}
        <ellipse cx={-10 - sway * 3} cy="111" rx="6" ry="2.5" fill={followColor} opacity="0.6" />
        <ellipse cx={10 + sway * 2.5} cy="111" rx="6" ry="2.5" fill={followColor} opacity="0.6" />
      </g>

      {/* ─── ROSE between clasped hands ─── */}
      <g transform={`translate(${88}, ${36})`}>
        {/* Petals */}
        <circle cx="0" cy="-2" r="4" fill={roseColor} opacity="0.85" />
        <circle cx="-3" cy="1" r="3.5" fill={roseColor} opacity="0.75" />
        <circle cx="3" cy="1" r="3.5" fill={roseColor} opacity="0.75" />
        <circle cx="-1.5" cy="3" r="3" fill={roseColor} opacity="0.65" />
        <circle cx="1.5" cy="3" r="3" fill={roseColor} opacity="0.65" />
        {/* Rose center */}
        <circle cx="0" cy="0" r="1.5" fill={roseColor} />
        {/* Stem (short, held between hands) */}
        <line x1="0" y1="5" x2="0" y2="14" stroke="#00FF7F" strokeWidth="1.5" strokeLinecap="round" />
        {/* Leaf */}
        <ellipse cx="4" cy="10" rx="3" ry="1.5" fill="#00FF7F" opacity="0.7" transform="rotate(-30 4 10)" />
      </g>
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const SkeletonCouple: React.FC<Props> = ({ frames }) => {
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

  const cycleIndex = Math.floor(frame / WALTZ_CYCLE);
  const cycleFrame = frame % WALTZ_CYCLE;

  // Only render during waltz portion
  if (cycleFrame >= WALTZ_DURATION) return null;

  const progress = cycleFrame / WALTZ_DURATION;

  // Deterministic color pair selection
  const rng = seeded(cycleIndex * 43 + 5081);
  const colorPair = COLOR_PAIRS[Math.floor(rng() * COLOR_PAIRS.length)];

  // Fade in/out with staggered timing
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.2], [0.5, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Waltz spin — energy drives rotation speed
  // Slow waltz: ~1 full rotation over the 18 seconds when quiet
  // Fast waltz: ~3 rotations when loud
  const baseSpinRate = 0.4; // rotations per cycle when quiet
  const energySpinRate = interpolate(energy, [0.03, 0.25], [baseSpinRate, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spinAngle = cycleFrame * (energySpinRate * 360 / WALTZ_DURATION);

  // Position: center-right area of screen, with gentle drift
  const centerX = width * 0.62 + Math.sin(progress * Math.PI * 2) * width * 0.04;
  const centerY = height * 0.45 + Math.cos(progress * Math.PI) * height * 0.03;

  // Body sway for waltz motion (1-2-3, 1-2-3 waltz time)
  const waltzBeat = Math.sin(frame * 0.15) * 0.6 + Math.sin(frame * 0.1) * 0.4;

  // Scale with energy (slightly larger when loud)
  const scale = interpolate(energy, [0.03, 0.2], [0.85, 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon glow — brighter during loud passages
  const glowIntensity = interpolate(energy, [0.05, 0.2], [8, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowColor = colorPair.lead;
  const glowColor2 = colorPair.follow;

  const charSize = 180;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY,
          transform: `translate(-50%, -50%) rotate(${spinAngle}deg) scale(${scale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${glowColor}) drop-shadow(0 0 ${glowIntensity * 1.5}px ${glowColor2})`,
          willChange: "transform, opacity",
        }}
      >
        <WaltzingPair
          size={charSize}
          leadColor={colorPair.lead}
          followColor={colorPair.follow}
          roseColor={colorPair.rose}
          sway={waltzBeat}
        />
      </div>
    </div>
  );
};
