/**
 * TouchOfGrey -- Skeleton and human figure silhouettes morphing.
 * Two overlapping silhouettes: one is a skeleton outline, one is a human
 * outline (same pose -- standing with one arm raised). Cross-fade between
 * them driven by a slow sine wave. When skeleton is dominant = bone white color.
 * When human dominant = warm skin tone. Energy drives morph speed.
 * Appears every 90s for 12s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2700; // 90 seconds at 30fps
const DURATION = 360; // 12 seconds

/** Skeleton figure SVG -- standing, one arm raised */
const SkeletonFigure: React.FC<{ color: string; opacity: number; height: number }> = ({
  color,
  opacity: figOpacity,
  height: figH,
}) => {
  const scale = figH / 320;
  return (
    <g opacity={figOpacity} transform={`scale(${scale})`}>
      {/* Skull */}
      <circle cx="100" cy="30" r="24" stroke={color} strokeWidth="3" fill="none" />
      {/* Eye sockets */}
      <circle cx="90" cy="26" r="6" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="110" cy="26" r="6" stroke={color} strokeWidth="2" fill="none" />
      {/* Nose */}
      <path d="M 98 33 L 100 38 L 102 33" stroke={color} strokeWidth="1.5" fill="none" />
      {/* Jaw / teeth */}
      <path d="M 82 38 Q 100 55 118 38" stroke={color} strokeWidth="2" fill="none" />
      <line x1="88" y1="42" x2="88" y2="48" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="96" y1="44" x2="96" y2="50" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="104" y1="44" x2="104" y2="50" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="112" y1="42" x2="112" y2="48" stroke={color} strokeWidth="1" opacity="0.6" />
      {/* Spine */}
      <line x1="100" y1="54" x2="100" y2="180" stroke={color} strokeWidth="3" />
      {/* Ribs */}
      {[70, 85, 100, 115, 130].map((ry) => (
        <React.Fragment key={ry}>
          <path d={`M 100 ${ry} Q 80 ${ry - 5} 70 ${ry + 5}`} stroke={color} strokeWidth="2" fill="none" opacity="0.7" />
          <path d={`M 100 ${ry} Q 120 ${ry - 5} 130 ${ry + 5}`} stroke={color} strokeWidth="2" fill="none" opacity="0.7" />
        </React.Fragment>
      ))}
      {/* Left arm (raised) */}
      <line x1="100" y1="70" x2="65" y2="55" stroke={color} strokeWidth="3" />
      <line x1="65" y1="55" x2="50" y2="20" stroke={color} strokeWidth="2.5" />
      {/* Skeletal hand (raised) */}
      <line x1="50" y1="20" x2="45" y2="10" stroke={color} strokeWidth="1.5" />
      <line x1="50" y1="20" x2="48" y2="8" stroke={color} strokeWidth="1.5" />
      <line x1="50" y1="20" x2="52" y2="8" stroke={color} strokeWidth="1.5" />
      <line x1="50" y1="20" x2="55" y2="12" stroke={color} strokeWidth="1.5" />
      {/* Right arm (down) */}
      <line x1="100" y1="70" x2="140" y2="110" stroke={color} strokeWidth="3" />
      <line x1="140" y1="110" x2="148" y2="160" stroke={color} strokeWidth="2.5" />
      {/* Pelvis */}
      <path d="M 80 180 Q 100 195 120 180" stroke={color} strokeWidth="3" fill="none" />
      {/* Left leg */}
      <line x1="85" y1="185" x2="78" y2="250" stroke={color} strokeWidth="3" />
      <line x1="78" y1="250" x2="75" y2="310" stroke={color} strokeWidth="2.5" />
      {/* Right leg */}
      <line x1="115" y1="185" x2="122" y2="250" stroke={color} strokeWidth="3" />
      <line x1="122" y1="250" x2="125" y2="310" stroke={color} strokeWidth="2.5" />
      {/* Feet bones */}
      <line x1="75" y1="310" x2="62" y2="315" stroke={color} strokeWidth="2" />
      <line x1="125" y1="310" x2="138" y2="315" stroke={color} strokeWidth="2" />
    </g>
  );
};

/** Human figure SVG -- same pose, one arm raised */
const HumanFigure: React.FC<{ color: string; opacity: number; height: number }> = ({
  color,
  opacity: figOpacity,
  height: figH,
}) => {
  const scale = figH / 320;
  return (
    <g opacity={figOpacity} transform={`scale(${scale})`}>
      {/* Head */}
      <circle cx="100" cy="28" r="22" fill={color} opacity="0.3" stroke={color} strokeWidth="2.5" />
      {/* Neck */}
      <rect x="93" y="50" width="14" height="14" fill={color} opacity="0.2" rx="3" />
      {/* Torso */}
      <path
        d="M 75 64 L 70 170 Q 100 185 130 170 L 125 64 Q 100 58 75 64 Z"
        fill={color}
        opacity="0.15"
        stroke={color}
        strokeWidth="2.5"
      />
      {/* Left arm (raised) */}
      <path d="M 78 68 Q 60 50 52 22" stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Hand (raised, open) */}
      <circle cx="50" cy="18" r="6" fill={color} opacity="0.2" stroke={color} strokeWidth="2" />
      {/* Right arm (down) */}
      <path d="M 122 68 Q 140 110 146 158" stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Right hand */}
      <circle cx="148" cy="162" r="5" fill={color} opacity="0.2" stroke={color} strokeWidth="2" />
      {/* Left leg */}
      <path d="M 85 170 Q 80 240 76 310" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M 115 170 Q 120 240 124 310" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Feet */}
      <ellipse cx="72" cy="314" rx="12" ry="5" fill={color} opacity="0.3" stroke={color} strokeWidth="1.5" />
      <ellipse cx="128" cy="314" rx="12" ry="5" fill={color} opacity="0.3" stroke={color} strokeWidth="1.5" />
    </g>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const TouchOfGrey: React.FC<Props> = ({ frames }) => {
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

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Morph: slow sine wave, speed driven by energy
  const morphSpeed = 0.03 + energy * 0.06;
  const morphSine = (Math.sin(frame * morphSpeed) + 1) / 2; // 0 = skeleton, 1 = human
  const skeletonOpacity = 1 - morphSine;
  const humanOpacity = morphSine;

  // Colors
  const boneColor = `hsl(45, 15%, ${75 + skeletonOpacity * 15}%)`;
  const skinColor = `hsl(25, 55%, ${55 + humanOpacity * 15}%)`;

  // Glow based on dominant form
  const glowColor = morphSine > 0.5
    ? `hsla(25, 60%, 60%, 0.4)`
    : `hsla(45, 20%, 80%, 0.4)`;

  const figureHeight = height * 0.55;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 10px ${glowColor}) drop-shadow(0 0 22px ${glowColor})`,
        }}
      >
        <g transform={`translate(${width / 2 - figureHeight * 0.32}, ${height * 0.18})`}>
          <SkeletonFigure color={boneColor} opacity={skeletonOpacity} height={figureHeight} />
          <HumanFigure color={skinColor} opacity={humanOpacity} height={figureHeight} />
        </g>
      </svg>
    </div>
  );
};
