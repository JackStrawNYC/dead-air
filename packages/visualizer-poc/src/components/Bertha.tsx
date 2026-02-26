/**
 * Bertha -- The iconic Bertha skull with roses.
 * Large skull SVG (rounded, friendlier style than BreathingStealie).
 * Surrounded by 5-6 rose SVGs (5-petal spiral shape + leaves).
 * Roses bloom sequentially. Skull has crown of roses.
 * Neon colors with glow. Energy drives rose bloom and skull eye glow.
 * Appears every 85s for 12s. Centered.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2550; // 85 seconds at 30fps
const DURATION = 360; // 12 seconds
const ROSE_COUNT = 6;

/** A single rose with petals and leaves */
const Rose: React.FC<{
  cx: number;
  cy: number;
  size: number;
  bloom: number; // 0-1
  color: string;
  leafColor: string;
  rotation: number;
}> = ({ cx, cy, size, bloom, color, leafColor, rotation }) => {
  const petalCount = 5;
  const petals: React.ReactNode[] = [];

  for (let p = 0; p < petalCount; p++) {
    const angle = (p / petalCount) * Math.PI * 2 + rotation;
    const petalScale = bloom * size;
    const px = Math.cos(angle) * petalScale * 0.4;
    const py = Math.sin(angle) * petalScale * 0.4;
    const innerAngle = ((p + 0.5) / petalCount) * Math.PI * 2 + rotation;
    const innerPx = Math.cos(innerAngle) * petalScale * 0.2;
    const innerPy = Math.sin(innerAngle) * petalScale * 0.2;

    petals.push(
      <ellipse
        key={`petal-${p}`}
        cx={cx + px}
        cy={cy + py}
        rx={petalScale * 0.35}
        ry={petalScale * 0.22}
        fill={color}
        opacity={0.7 + bloom * 0.3}
        transform={`rotate(${(angle * 180) / Math.PI}, ${cx + px}, ${cy + py})`}
      />
    );
    // Inner petal layer (spiral effect)
    petals.push(
      <ellipse
        key={`inner-${p}`}
        cx={cx + innerPx}
        cy={cy + innerPy}
        rx={petalScale * 0.2}
        ry={petalScale * 0.13}
        fill={color}
        opacity={0.9}
        transform={`rotate(${(innerAngle * 180) / Math.PI + 20}, ${cx + innerPx}, ${cy + innerPy})`}
      />
    );
  }

  // Center spiral
  petals.push(
    <circle key="center" cx={cx} cy={cy} r={size * bloom * 0.1} fill={color} opacity={0.95} />
  );

  return <>{petals}</>;
};

/** Leaf shape */
const Leaf: React.FC<{ x: number; y: number; size: number; angle: number; color: string }> = ({
  x, y, size, angle, color,
}) => (
  <g transform={`rotate(${angle}, ${x}, ${y})`}>
    <ellipse cx={x + size * 0.5} cy={y} rx={size * 0.6} ry={size * 0.2} fill={color} opacity={0.7} />
    <line
      x1={x}
      y1={y}
      x2={x + size}
      y2={y}
      stroke={color}
      strokeWidth="1"
      opacity={0.5}
    />
  </g>
);

interface RoseData {
  angle: number;
  distance: number;
  size: number;
  bloomDelay: number; // 0-0.5 staggered start
  leafAngle: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Bertha: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate rose positions
  const roseData = React.useMemo(() => {
    const rng = seeded(19_680_101);
    const roses: RoseData[] = [];
    for (let r = 0; r < ROSE_COUNT; r++) {
      roses.push({
        angle: (r / ROSE_COUNT) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.3,
        distance: 0.6 + rng() * 0.35,
        size: 18 + rng() * 12,
        bloomDelay: r * 0.08,
        leafAngle: (rng() - 0.5) * 60,
      });
    }
    return roses;
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const skullSize = Math.min(width, height) * 0.22;

  // Skull eye glow intensity
  const eyeGlow = interpolate(energy, [0.05, 0.3], [0.15, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon colors
  const hueBase = (frame * 0.4) % 360;
  const skullColor = `hsl(${hueBase}, 80%, 75%)`;
  const roseColor = `hsl(${(hueBase + 330) % 360}, 95%, 55%)`;
  const roseColor2 = `hsl(${(hueBase + 345) % 360}, 90%, 65%)`;
  const leafColor = `hsl(${(hueBase + 120) % 360}, 70%, 45%)`;
  const glowColor = `hsla(${hueBase}, 100%, 70%, 0.5)`;

  // Bloom speed driven by energy
  const bloomSpeed = 0.7 + energy * 1.5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 0 25px ${glowColor})`,
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Bertha skull - rounded, friendlier */}
          <g>
            {/* Skull dome (rounder than stealie) */}
            <ellipse cx={0} cy={-skullSize * 0.1} rx={skullSize * 0.65} ry={skullSize * 0.7} fill="none" stroke={skullColor} strokeWidth="3" />
            {/* Forehead roundness */}
            <path
              d={`M ${-skullSize * 0.55} ${skullSize * 0.05} Q ${-skullSize * 0.6} ${-skullSize * 0.5} 0 ${-skullSize * 0.75} Q ${skullSize * 0.6} ${-skullSize * 0.5} ${skullSize * 0.55} ${skullSize * 0.05}`}
              fill={skullColor}
              opacity={0.08}
            />
            {/* Eye sockets (round, friendly) */}
            <circle cx={-skullSize * 0.22} cy={-skullSize * 0.15} r={skullSize * 0.15} stroke={skullColor} strokeWidth="2.5" fill="none" />
            <circle cx={skullSize * 0.22} cy={-skullSize * 0.15} r={skullSize * 0.15} stroke={skullColor} strokeWidth="2.5" fill="none" />
            {/* Eye glow */}
            <circle cx={-skullSize * 0.22} cy={-skullSize * 0.15} r={skullSize * 0.08} fill={roseColor} opacity={eyeGlow} />
            <circle cx={skullSize * 0.22} cy={-skullSize * 0.15} r={skullSize * 0.08} fill={roseColor} opacity={eyeGlow} />
            {/* Nose */}
            <path
              d={`M ${-skullSize * 0.06} ${skullSize * 0.05} L 0 ${skullSize * 0.15} L ${skullSize * 0.06} ${skullSize * 0.05}`}
              stroke={skullColor}
              strokeWidth="2"
              fill="none"
            />
            {/* Jaw / teeth */}
            <path
              d={`M ${-skullSize * 0.4} ${skullSize * 0.2} Q ${-skullSize * 0.3} ${skullSize * 0.55} 0 ${skullSize * 0.6} Q ${skullSize * 0.3} ${skullSize * 0.55} ${skullSize * 0.4} ${skullSize * 0.2}`}
              stroke={skullColor}
              strokeWidth="2"
              fill="none"
            />
            {/* Teeth line */}
            <line x1={-skullSize * 0.3} y1={skullSize * 0.3} x2={skullSize * 0.3} y2={skullSize * 0.3} stroke={skullColor} strokeWidth="1.5" opacity={0.5} />
            {[- 3, -1, 1, 3].map((t) => (
              <line
                key={t}
                x1={t * skullSize * 0.06}
                y1={skullSize * 0.24}
                x2={t * skullSize * 0.06}
                y2={skullSize * 0.36}
                stroke={skullColor}
                strokeWidth="1"
                opacity={0.4}
              />
            ))}
          </g>

          {/* Crown of roses + surrounding roses */}
          {roseData.map((rose, ri) => {
            const rx = Math.cos(rose.angle) * skullSize * rose.distance;
            const ry = Math.sin(rose.angle) * skullSize * rose.distance;

            // Sequential bloom: staggered by delay, driven by progress and energy
            const bloomProgress = interpolate(
              progress,
              [rose.bloomDelay, Math.min(rose.bloomDelay + 0.3 / bloomSpeed, 0.95)],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            const rColor = ri % 2 === 0 ? roseColor : roseColor2;

            return (
              <g key={ri}>
                <Rose
                  cx={rx}
                  cy={ry}
                  size={rose.size}
                  bloom={bloomProgress}
                  color={rColor}
                  leafColor={leafColor}
                  rotation={(frame * 0.01 + ri) * 0.5}
                />
                {bloomProgress > 0.3 && (
                  <Leaf
                    x={rx + rose.size * 0.4}
                    y={ry + rose.size * 0.3}
                    size={rose.size * 0.7}
                    angle={rose.leafAngle}
                    color={leafColor}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
