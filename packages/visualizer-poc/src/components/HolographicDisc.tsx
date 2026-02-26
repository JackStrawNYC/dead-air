/**
 * HolographicDisc — Spinning holographic disc with rainbow diffraction.
 * A circular disc rotates at a speed proportional to tempo/energy.
 * Concentric rings create a rainbow diffraction pattern that shifts
 * with rotation angle. The disc wobbles slightly on its axis.
 * Iridescent rainbow + silver color scheme.
 * Appears every 50s for 17s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500; // 50s at 30fps
const DURATION = 510; // 17s
const NUM_RINGS = 14;
const NUM_SPARKLES = 20;

interface SparkleData {
  angle: number;
  radius: number; // fraction of disc radius
  phase: number;
  size: number;
}

function generateSparkles(seed: number): SparkleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SPARKLES }, () => ({
    angle: rng() * Math.PI * 2,
    radius: 0.15 + rng() * 0.8,
    phase: rng() * Math.PI * 2,
    size: 1 + rng() * 2.5,
  }));
}

function hueToRgb(h: number): string {
  const s = 0.9;
  const l = 0.6;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)})`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HolographicDisc: React.FC<Props> = ({ frames }) => {
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

  const currentFrame = frames[idx];
  const centroid = currentFrame?.centroid ?? 0.5;

  const sparkles = React.useMemo(() => generateSparkles(42424), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.45 + energy * 0.45);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const discRadius = Math.min(width, height) * 0.22;

  // Rotation speed proportional to energy
  const rotationSpeed = 0.02 + energy * 0.06;
  const rotation = frame * rotationSpeed;

  // Wobble: slight tilt oscillation
  const wobbleX = Math.sin(frame * 0.015) * 0.08;
  const wobbleY = Math.cos(frame * 0.012) * 0.05;

  // Disc appears as ellipse due to perspective tilt
  const scaleY = 0.35 + wobbleY * 0.5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="holo-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="disc-clip">
            <ellipse cx={cx} cy={cy} rx={discRadius} ry={discRadius * scaleY} />
          </clipPath>
        </defs>

        {/* Shadow underneath */}
        <ellipse
          cx={cx}
          cy={cy + discRadius * scaleY + 15}
          rx={discRadius * 0.7}
          ry={8}
          fill="rgba(100, 80, 200, 0.1)"
          filter="url(#holo-glow)"
        />

        {/* Disc base (silver) */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={discRadius}
          ry={discRadius * scaleY}
          fill="rgba(200, 210, 220, 0.15)"
          stroke="rgba(180, 190, 200, 0.2)"
          strokeWidth={1}
        />

        {/* Concentric rainbow diffraction rings */}
        <g clipPath="url(#disc-clip)">
          {Array.from({ length: NUM_RINGS }, (_, ri) => {
            const ringFrac = (ri + 1) / (NUM_RINGS + 1);
            const ringR = discRadius * ringFrac;
            const ringRY = discRadius * scaleY * ringFrac;

            // Hue shifts with ring position + rotation + centroid
            const hue = ((ringFrac * 360 + rotation * 50 + centroid * 120 + wobbleX * 200) % 360 + 360) % 360;
            const color = hueToRgb(hue);
            const ringOpacity = 0.2 + energy * 0.4 + Math.sin(frame * 0.05 + ri * 0.8) * 0.1;

            return (
              <ellipse
                key={`ring${ri}`}
                cx={cx}
                cy={cy}
                rx={ringR}
                ry={ringRY}
                fill="none"
                stroke={color}
                strokeWidth={2.5 + energy * 1.5}
                opacity={Math.max(0.05, ringOpacity)}
              />
            );
          })}
        </g>

        {/* Center hole */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={discRadius * 0.08}
          ry={discRadius * scaleY * 0.08}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(180, 190, 200, 0.3)"
          strokeWidth={0.8}
        />

        {/* Center hub ring */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={discRadius * 0.15}
          ry={discRadius * scaleY * 0.15}
          fill="none"
          stroke="rgba(200, 210, 230, 0.25)"
          strokeWidth={1}
        />

        {/* Sparkles — rotating with the disc */}
        {sparkles.map((sp, si) => {
          const sparkleAngle = sp.angle + rotation;
          const sr = sp.radius * discRadius;
          const sx = cx + Math.cos(sparkleAngle) * sr;
          const sy = cy + Math.sin(sparkleAngle) * sr * scaleY;

          const sparkleAlpha =
            (0.3 + Math.sin(frame * 0.1 + sp.phase) * 0.5) *
            energy *
            2;

          if (sparkleAlpha < 0.05) return null;

          const sparkleHue = ((sp.radius * 360 + rotation * 80) % 360 + 360) % 360;

          return (
            <circle
              key={`sparkle${si}`}
              cx={sx}
              cy={sy}
              r={sp.size}
              fill={hueToRgb(sparkleHue)}
              opacity={Math.min(sparkleAlpha, 0.8)}
              filter="url(#holo-glow)"
            />
          );
        })}

        {/* Edge highlight */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={discRadius}
          ry={discRadius * scaleY}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};
