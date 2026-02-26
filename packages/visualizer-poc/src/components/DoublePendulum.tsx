/**
 * DoublePendulum — Chaotic double pendulum simulation leaving color trails.
 * Two connected arms with bobs. Physics simulation: angular acceleration from
 * gravity + coupling. Trail of previous 200 positions rendered as fading polyline.
 * Trail color cycles through rainbow. Energy drives initial angular velocity / perturbation.
 * Appears every 50s for 16s. Positioned center.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500; // 50 seconds at 30fps
const DURATION = 480; // 16 seconds visible
const TRAIL_LENGTH = 200;
const STEPS_PER_FRAME = 8; // sub-steps for numerical stability

interface Props {
  frames: EnhancedFrameData[];
}

export const DoublePendulum: React.FC<Props> = ({ frames }) => {
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

  // Simulate the double pendulum state for the current cycle window.
  // We must compute this before return null to avoid useMemo ordering issues.
  const simulation = React.useMemo(() => {
    // Determine which cycle occurrence we are in
    const cycleStart = Math.floor(frame / CYCLE) * CYCLE;
    const cycleFrame = frame - cycleStart;
    if (cycleFrame >= DURATION) return null;

    const rng = seeded(cycleStart + 777);

    // Parameters
    const g = 9.81;
    const m1 = 1.0;
    const m2 = 1.0;
    const l1 = 1.0;
    const l2 = 0.8;
    const dt = 0.02;

    // Initial conditions: perturbed by energy at cycle start
    // Use energy from cycle start frame
    const startIdx = Math.min(Math.max(0, cycleStart), frames.length - 1);
    const startEnergy = frames[startIdx].rms;
    let theta1 = Math.PI * 0.7 + rng() * 0.5 + startEnergy * 0.3;
    let theta2 = Math.PI * 0.5 + rng() * 0.5 + startEnergy * 0.2;
    let omega1 = (rng() - 0.5) * 2 + startEnergy * 3;
    let omega2 = (rng() - 0.5) * 2 + startEnergy * 2;

    // Simulate up to current frame within cycle, storing trail
    const allPositions: Array<{ x: number; y: number }> = [];
    const totalSteps = (cycleFrame + 1) * STEPS_PER_FRAME;

    for (let step = 0; step < totalSteps; step++) {
      // At each "frame boundary", perturb slightly with audio energy
      if (step > 0 && step % STEPS_PER_FRAME === 0) {
        const fIdx = Math.min(cycleStart + Math.floor(step / STEPS_PER_FRAME), frames.length - 1);
        const fEnergy = frames[Math.max(0, fIdx)].rms;
        omega1 += (fEnergy - 0.1) * 0.3;
        omega2 += (fEnergy - 0.1) * 0.2;
      }

      // Double pendulum equations of motion (RK4 would be better, but Euler is fine for visuals)
      const dTheta = theta1 - theta2;
      const sinD = Math.sin(dTheta);
      const cosD = Math.cos(dTheta);
      const den = 2 * m1 + m2 - m2 * Math.cos(2 * dTheta);

      const alpha1 = (
        -g * (2 * m1 + m2) * Math.sin(theta1)
        - m2 * g * Math.sin(theta1 - 2 * theta2)
        - 2 * sinD * m2 * (omega2 * omega2 * l2 + omega1 * omega1 * l1 * cosD)
      ) / (l1 * den);

      const alpha2 = (
        2 * sinD * (
          omega1 * omega1 * l1 * (m1 + m2)
          + g * (m1 + m2) * Math.cos(theta1)
          + omega2 * omega2 * l2 * m2 * cosD
        )
      ) / (l2 * den);

      omega1 += alpha1 * dt;
      omega2 += alpha2 * dt;
      theta1 += omega1 * dt;
      theta2 += omega2 * dt;

      // Light damping to prevent explosion
      omega1 *= 0.9999;
      omega2 *= 0.9999;

      // Record position of second bob at frame boundaries
      if (step % STEPS_PER_FRAME === 0) {
        const x1 = l1 * Math.sin(theta1);
        const y1 = l1 * Math.cos(theta1);
        const x2 = x1 + l2 * Math.sin(theta2);
        const y2 = y1 + l2 * Math.cos(theta2);
        allPositions.push({ x: x2, y: y2 });
      }
    }

    // Current arm positions
    const x1 = l1 * Math.sin(theta1);
    const y1 = l1 * Math.cos(theta1);
    const x2 = x1 + l2 * Math.sin(theta2);
    const y2 = y1 + l2 * Math.cos(theta2);

    // Trail: last TRAIL_LENGTH positions
    const trail = allPositions.slice(-TRAIL_LENGTH);

    return { x1, y1, x2, y2, trail };
  }, [frame, frames]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION || !simulation) return null;

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.35;
  const scale = Math.min(width, height) * 0.18;

  const { x1, y1, x2, y2, trail } = simulation;

  const glowSize = interpolate(energy, [0.03, 0.3], [4, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build trail path with rainbow coloring
  const trailSegments: Array<{ d: string; color: string; alpha: number }> = [];
  const segSize = Math.max(1, Math.floor(trail.length / 20));
  for (let s = 0; s < trail.length - 1; s += segSize) {
    const end = Math.min(s + segSize + 1, trail.length);
    let pathD = `M ${trail[s].x * scale} ${trail[s].y * scale}`;
    for (let p = s + 1; p < end; p++) {
      pathD += ` L ${trail[p].x * scale} ${trail[p].y * scale}`;
    }
    const hue = ((s / trail.length) * 360 + frame * 2) % 360;
    const alpha = interpolate(s, [0, trail.length], [0.1, 0.8], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    trailSegments.push({ d: pathD, color: `hsl(${hue}, 100%, 65%)`, alpha });
  }

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
        <defs>
          <filter id="dp-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${cx}, ${cy})`}>
          {/* Trail */}
          {trailSegments.map((seg, si) => (
            <path
              key={si}
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth={2}
              opacity={seg.alpha}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Arm 1 */}
          <line
            x1={0}
            y1={0}
            x2={x1 * scale}
            y2={y1 * scale}
            stroke="#FFFFFF"
            strokeWidth={2}
            opacity={0.6}
          />

          {/* Arm 2 */}
          <line
            x1={x1 * scale}
            y1={y1 * scale}
            x2={x2 * scale}
            y2={y2 * scale}
            stroke="#FFFFFF"
            strokeWidth={2}
            opacity={0.6}
          />

          {/* Pivot */}
          <circle cx={0} cy={0} r={4} fill="#00FFFF" opacity={0.7} />

          {/* Bob 1 */}
          <circle
            cx={x1 * scale}
            cy={y1 * scale}
            r={8 + energy * 4}
            fill="#FF00FF"
            opacity={0.8}
            filter="url(#dp-glow)"
          />

          {/* Bob 2 */}
          <circle
            cx={x2 * scale}
            cy={y2 * scale}
            r={10 + energy * 5}
            fill="#00FFFF"
            opacity={0.9}
            filter="url(#dp-glow)"
          />
        </g>
      </svg>
    </div>
  );
};
