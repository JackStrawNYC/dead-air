/**
 * SkullKaleidoscope — rotating mirrored Steal Your Face pattern.
 * 6-fold symmetry kaleidoscope of stealies. Pulses and rotates with energy.
 * Appears periodically during mid-high energy passages.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const SEGMENTS = 8;
const CYCLE = 1200;    // 40 seconds between appearances
const DURATION = 420;  // 14 seconds visible

/** Mini stealie for kaleidoscope tile */
const MiniStealie: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 50 50" fill="none">
    <circle cx="25" cy="25" r="22" stroke={color} strokeWidth="2" />
    <line x1="3" y1="25" x2="47" y2="25" stroke={color} strokeWidth="1.5" />
    <polygon points="25,5 21,22 29,22 19,45 31,27 23,27 29,5" fill={color} opacity="0.8" />
    <circle cx="18" cy="20" r="4" stroke={color} strokeWidth="1.5" />
    <circle cx="32" cy="20" r="4" stroke={color} strokeWidth="1.5" />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const SkullKaleidoscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 60); i <= Math.min(frames.length - 1, idx + 60); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION || energy < 0.1) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.1, 0.3], [0.25, 0.65], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Rotation: slow base + energy boost
  const rotation = frame * (0.8 + energy * 2);
  const innerRotation = -frame * (0.5 + energy * 1.5);

  // Scale breathes
  const scale = interpolate(energy, [0.05, 0.3], [0.7, 1.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Color cycling
  const hue = (frame * 1.2) % 360;
  const color1 = `hsl(${hue}, 100%, 65%)`;
  const color2 = `hsl(${(hue + 180) % 360}, 100%, 65%)`;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.3;
  const stealieSize = 45 + energy * 25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
          opacity,
          filter: `drop-shadow(0 0 15px ${color1}) drop-shadow(0 0 30px ${color2})`,
          willChange: "transform, opacity",
        }}
      >
        {/* Outer ring of stealies */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const angle = (i / SEGMENTS) * 360;
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const isEven = i % 2 === 0;
          return (
            <div
              key={`outer-${i}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: `translate(-50%, -50%) rotate(${angle + innerRotation}deg) scaleX(${isEven ? 1 : -1})`,
              }}
            >
              <MiniStealie size={stealieSize} color={isEven ? color1 : color2} />
            </div>
          );
        })}

        {/* Inner ring (smaller, opposite rotation) */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const angle = (i / SEGMENTS) * 360 + 22.5; // offset
          const rad = (angle * Math.PI) / 180;
          const innerRadius = radius * 0.5;
          const x = Math.cos(rad) * innerRadius;
          const y = Math.sin(rad) * innerRadius;
          return (
            <div
              key={`inner-${i}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: `translate(-50%, -50%) rotate(${-angle + rotation * 0.5}deg) scaleY(${i % 2 === 0 ? 1 : -1})`,
              }}
            >
              <MiniStealie size={stealieSize * 0.65} color={i % 2 === 0 ? color2 : color1} />
            </div>
          );
        })}

        {/* Center stealie */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(-50%, -50%) rotate(${-rotation * 0.3}deg)`,
          }}
        >
          <MiniStealie size={stealieSize * 1.3} color={color1} />
        </div>
      </div>
    </div>
  );
};
