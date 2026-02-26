/**
 * ConveyorBelt — Moving conveyor belt with objects bouncing along.
 * Belt is a horizontal track with rollers at each end. Items (crates, barrels,
 * gears) ride the belt and bounce slightly. Belt speed follows tempo/energy.
 * Industrial dark grey belt with orange accent rollers.
 * Positioned bottom-center. Cycle: 40s on, 40s off (80s = 2400f).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400; // 80s at 30fps
const DURATION = 1200; // 40s visible
const NUM_ITEMS = 8;
const BELT_TREADS = 20;

type ItemShape = "crate" | "barrel" | "gear";

interface BeltItem {
  shape: ItemShape;
  size: number;
  color: string;
  phaseOffset: number; // 0-1, staggered position along belt
  bounceFreq: number;
  bounceAmp: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ConveyorBelt: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate items
  const items = React.useMemo(() => {
    const rng = seeded(55443);
    const shapes: ItemShape[] = ["crate", "barrel", "gear"];
    const colors = ["#8D6E63", "#795548", "#A1887F", "#6D4C41", "#5D4037"];
    const result: BeltItem[] = [];
    for (let i = 0; i < NUM_ITEMS; i++) {
      result.push({
        shape: shapes[Math.floor(rng() * shapes.length)],
        size: 18 + rng() * 16,
        color: colors[Math.floor(rng() * colors.length)],
        phaseOffset: i / NUM_ITEMS + rng() * 0.05,
        bounceFreq: 0.08 + rng() * 0.12,
        bounceAmp: 3 + rng() * 6,
      });
    }
    return result;
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Belt geometry
  const beltLeft = width * 0.15;
  const beltRight = width * 0.85;
  const beltW = beltRight - beltLeft;
  const beltY = height * 0.85;
  const beltH = 16;
  const rollerR = 20;

  // Belt speed
  const beltSpeed = 0.5 + energy * 3;

  // Roller rotation
  const rollerAngle = frame * beltSpeed * 3;

  // Tread marks moving along belt surface
  const treadOffset = (frame * beltSpeed * 2) % (beltW / BELT_TREADS);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="conveyor-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="belt-clip">
            <rect x={beltLeft} y={beltY - 2} width={beltW} height={beltH + 4} />
          </clipPath>
        </defs>

        {/* Support legs */}
        <line x1={beltLeft + 30} y1={beltY + beltH} x2={beltLeft + 20} y2={beltY + 60} stroke="#455A64" strokeWidth={4} opacity={0.4} />
        <line x1={beltRight - 30} y1={beltY + beltH} x2={beltRight - 20} y2={beltY + 60} stroke="#455A64" strokeWidth={4} opacity={0.4} />

        {/* Belt surface */}
        <rect
          x={beltLeft}
          y={beltY}
          width={beltW}
          height={beltH}
          rx={3}
          fill="#37474F"
          opacity={0.7}
        />

        {/* Belt tread marks */}
        <g clipPath="url(#belt-clip)">
          {Array.from({ length: BELT_TREADS + 2 }, (_, ti) => {
            const tx = beltLeft + (ti * beltW) / BELT_TREADS - treadOffset;
            return (
              <line
                key={`tread-${ti}`}
                x1={tx}
                y1={beltY + 2}
                x2={tx}
                y2={beltY + beltH - 2}
                stroke="#546E7A"
                strokeWidth={2}
                opacity={0.3}
              />
            );
          })}
        </g>

        {/* Belt edge highlights */}
        <line x1={beltLeft} y1={beltY} x2={beltRight} y2={beltY} stroke="#FF6D00" strokeWidth={1.5} opacity={0.3} />
        <line x1={beltLeft} y1={beltY + beltH} x2={beltRight} y2={beltY + beltH} stroke="#FF6D00" strokeWidth={1} opacity={0.2} />

        {/* Left roller */}
        <g transform={`rotate(${rollerAngle}, ${beltLeft}, ${beltY + beltH / 2})`}>
          <circle cx={beltLeft} cy={beltY + beltH / 2} r={rollerR} fill="none" stroke="#FF6D00" strokeWidth={3} opacity={0.5} />
          {[0, 1, 2, 3].map((si) => {
            const sa = (si / 4) * Math.PI * 2;
            return (
              <line
                key={`ls-${si}`}
                x1={beltLeft + Math.cos(sa) * 4}
                y1={beltY + beltH / 2 + Math.sin(sa) * 4}
                x2={beltLeft + Math.cos(sa) * (rollerR - 3)}
                y2={beltY + beltH / 2 + Math.sin(sa) * (rollerR - 3)}
                stroke="#FF6D00"
                strokeWidth={1.5}
                opacity={0.4}
              />
            );
          })}
          <circle cx={beltLeft} cy={beltY + beltH / 2} r={5} fill="#FF6D00" opacity={0.4} />
        </g>

        {/* Right roller */}
        <g transform={`rotate(${-rollerAngle}, ${beltRight}, ${beltY + beltH / 2})`}>
          <circle cx={beltRight} cy={beltY + beltH / 2} r={rollerR} fill="none" stroke="#FF6D00" strokeWidth={3} opacity={0.5} />
          {[0, 1, 2, 3].map((si) => {
            const sa = (si / 4) * Math.PI * 2;
            return (
              <line
                key={`rs-${si}`}
                x1={beltRight + Math.cos(sa) * 4}
                y1={beltY + beltH / 2 + Math.sin(sa) * 4}
                x2={beltRight + Math.cos(sa) * (rollerR - 3)}
                y2={beltY + beltH / 2 + Math.sin(sa) * (rollerR - 3)}
                stroke="#FF6D00"
                strokeWidth={1.5}
                opacity={0.4}
              />
            );
          })}
          <circle cx={beltRight} cy={beltY + beltH / 2} r={5} fill="#FF6D00" opacity={0.4} />
        </g>

        {/* Items riding belt */}
        {items.map((item, ii) => {
          // Item position wraps around belt
          const rawPos = (item.phaseOffset + frame * beltSpeed * 0.001) % 1;
          const itemX = beltLeft + 30 + rawPos * (beltW - 60);
          const bounce = Math.abs(Math.sin(frame * item.bounceFreq)) * item.bounceAmp * energy;
          const itemY = beltY - item.size - bounce;

          if (item.shape === "crate") {
            return (
              <g key={`item-${ii}`}>
                <rect
                  x={itemX - item.size / 2}
                  y={itemY}
                  width={item.size}
                  height={item.size}
                  rx={2}
                  fill={item.color}
                  stroke="#5D4037"
                  strokeWidth={1.5}
                  opacity={0.7}
                />
                {/* Cross bracing */}
                <line x1={itemX - item.size / 2} y1={itemY} x2={itemX + item.size / 2} y2={itemY + item.size} stroke="#4E342E" strokeWidth={1} opacity={0.4} />
                <line x1={itemX + item.size / 2} y1={itemY} x2={itemX - item.size / 2} y2={itemY + item.size} stroke="#4E342E" strokeWidth={1} opacity={0.4} />
              </g>
            );
          }

          if (item.shape === "barrel") {
            return (
              <g key={`item-${ii}`}>
                <ellipse
                  cx={itemX}
                  cy={itemY + item.size * 0.5}
                  rx={item.size * 0.45}
                  ry={item.size * 0.5}
                  fill={item.color}
                  stroke="#4E342E"
                  strokeWidth={1.5}
                  opacity={0.7}
                />
                {/* Barrel bands */}
                <ellipse cx={itemX} cy={itemY + item.size * 0.25} rx={item.size * 0.43} ry={2} fill="none" stroke="#3E2723" strokeWidth={1.5} opacity={0.5} />
                <ellipse cx={itemX} cy={itemY + item.size * 0.75} rx={item.size * 0.43} ry={2} fill="none" stroke="#3E2723" strokeWidth={1.5} opacity={0.5} />
              </g>
            );
          }

          // gear shape
          const gr = item.size * 0.45;
          const gearRotation = frame * 2 + ii * 45;
          return (
            <g key={`item-${ii}`} transform={`rotate(${gearRotation}, ${itemX}, ${itemY + item.size * 0.5})`}>
              <circle cx={itemX} cy={itemY + item.size * 0.5} r={gr} fill="none" stroke={item.color} strokeWidth={2} opacity={0.7} />
              <circle cx={itemX} cy={itemY + item.size * 0.5} r={gr * 0.35} fill={item.color} opacity={0.5} />
              {[0, 1, 2, 3, 4, 5].map((ti) => {
                const ta = (ti / 6) * Math.PI * 2;
                return (
                  <rect
                    key={`gt-${ti}`}
                    x={itemX + Math.cos(ta) * gr - 3}
                    y={itemY + item.size * 0.5 + Math.sin(ta) * gr - 4}
                    width={6}
                    height={8}
                    transform={`rotate(${(ta * 180) / Math.PI}, ${itemX + Math.cos(ta) * gr}, ${itemY + item.size * 0.5 + Math.sin(ta) * gr})`}
                    fill={item.color}
                    opacity={0.6}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
