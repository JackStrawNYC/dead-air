/**
 * AmericanBeauty -- Rose field growing across bottom third.
 * 8-12 rose stems growing upward from bottom edge. Each rose is a spiral
 * of overlapping petals (5-7 petals). Stems have thorns (small triangles)
 * and leaves. Roses bloom in sequence left to right. Red/pink/crimson
 * colors with green stems. Energy drives bloom speed.
 * Appears every 55s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 420; // 14 seconds
const STEM_COUNT = 10;

interface StemData {
  x: number;        // normalized 0-1
  height: number;   // stem height in px
  petalCount: number;
  roseSize: number;
  swayPhase: number;
  bloomDelay: number;
  thornCount: number;
  leafSide: number; // -1 or 1
  roseHue: number;  // 340-360 or 0-10 (reds/pinks)
}

/** Rose bloom SVG — spiral of petals */
const RoseBloom: React.FC<{
  cx: number;
  cy: number;
  size: number;
  bloom: number;
  petalCount: number;
  color: string;
  innerColor: string;
}> = ({ cx, cy, size, bloom, petalCount, color, innerColor }) => {
  const petals: React.ReactNode[] = [];
  const effectiveSize = size * bloom;

  if (effectiveSize < 1) return null;

  // Outer petals
  for (let p = 0; p < petalCount; p++) {
    const angle = (p / petalCount) * Math.PI * 2;
    const px = Math.cos(angle) * effectiveSize * 0.35;
    const py = Math.sin(angle) * effectiveSize * 0.35;
    petals.push(
      <ellipse
        key={`outer-${p}`}
        cx={cx + px}
        cy={cy + py}
        rx={effectiveSize * 0.3}
        ry={effectiveSize * 0.18}
        fill={color}
        opacity={0.75}
        transform={`rotate(${(angle * 180) / Math.PI}, ${cx + px}, ${cy + py})`}
      />
    );
  }

  // Inner petals (tighter spiral, offset angle)
  for (let p = 0; p < petalCount - 1; p++) {
    const angle = ((p + 0.5) / petalCount) * Math.PI * 2;
    const px = Math.cos(angle) * effectiveSize * 0.18;
    const py = Math.sin(angle) * effectiveSize * 0.18;
    petals.push(
      <ellipse
        key={`inner-${p}`}
        cx={cx + px}
        cy={cy + py}
        rx={effectiveSize * 0.2}
        ry={effectiveSize * 0.12}
        fill={innerColor}
        opacity={0.85}
        transform={`rotate(${(angle * 180) / Math.PI + 25}, ${cx + px}, ${cy + py})`}
      />
    );
  }

  // Center bud
  petals.push(
    <circle key="bud" cx={cx} cy={cy} r={effectiveSize * 0.08} fill={innerColor} opacity={0.95} />
  );

  return <>{petals}</>;
};

interface Props {
  frames: EnhancedFrameData[];
}

export const AmericanBeauty: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate stem data
  const stems = React.useMemo(() => {
    const rng = seeded(19_700_101);
    const result: StemData[] = [];
    for (let s = 0; s < STEM_COUNT; s++) {
      result.push({
        x: 0.08 + (s / (STEM_COUNT - 1)) * 0.84, // spread across width
        height: 150 + rng() * 120,
        petalCount: 5 + Math.floor(rng() * 3), // 5-7
        roseSize: 20 + rng() * 14,
        swayPhase: rng() * Math.PI * 2,
        bloomDelay: s * 0.06, // left to right sequence
        thornCount: 2 + Math.floor(rng() * 3),
        leafSide: rng() > 0.5 ? 1 : -1,
        roseHue: 340 + rng() * 30, // reds/pinks (wraps around 360)
      });
    }
    return result;
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Bloom speed multiplier from energy
  const bloomSpeed = 0.8 + energy * 2.0;

  const stemColor = "hsl(130, 55%, 35%)";
  const leafColor = "hsl(125, 50%, 40%)";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: "drop-shadow(0 0 6px rgba(220,20,60,0.4)) drop-shadow(0 0 14px rgba(220,20,60,0.2))",
        }}
      >
        {stems.map((stem, si) => {
          const baseX = stem.x * width;
          const bottomY = height;

          // Stem growth: grows upward over time
          const growProgress = interpolate(
            progress,
            [stem.bloomDelay, Math.min(stem.bloomDelay + 0.25 / bloomSpeed, 0.85)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const currentHeight = stem.height * growProgress;
          const topY = bottomY - currentHeight;

          // Gentle sway
          const sway = Math.sin(frame * 0.03 + stem.swayPhase) * 8 * growProgress;

          // Rose bloom (starts after stem is 60% grown)
          const bloomProgress = interpolate(
            growProgress,
            [0.6, 1],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const roseHue = stem.roseHue % 360;
          const roseColor = `hsl(${roseHue}, 85%, 45%)`;
          const roseInner = `hsl(${(roseHue + 10) % 360}, 90%, 55%)`;

          return (
            <g key={si}>
              {/* Stem */}
              {currentHeight > 0 && (
                <path
                  d={`M ${baseX} ${bottomY} Q ${baseX + sway * 0.5} ${bottomY - currentHeight * 0.5} ${baseX + sway} ${topY}`}
                  stroke={stemColor}
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              )}

              {/* Thorns */}
              {Array.from({ length: stem.thornCount }).map((_, ti) => {
                const thornY = bottomY - currentHeight * ((ti + 1) / (stem.thornCount + 1));
                if (thornY > bottomY || currentHeight < 20) return null;
                const thornSide = (ti % 2 === 0 ? 1 : -1) * stem.leafSide;
                const thornX = baseX + sway * ((bottomY - thornY) / currentHeight);
                return (
                  <polygon
                    key={`thorn-${ti}`}
                    points={`${thornX},${thornY} ${thornX + thornSide * 6},${thornY - 3} ${thornX},${thornY - 6}`}
                    fill={stemColor}
                    opacity={0.7}
                  />
                );
              })}

              {/* Leaf (one per stem, midway) */}
              {currentHeight > 60 && (
                <g>
                  <ellipse
                    cx={baseX + sway * 0.4 + stem.leafSide * 18}
                    cy={bottomY - currentHeight * 0.45}
                    rx={16}
                    ry={7}
                    fill={leafColor}
                    opacity={0.7}
                    transform={`rotate(${stem.leafSide * 30}, ${baseX + sway * 0.4 + stem.leafSide * 18}, ${bottomY - currentHeight * 0.45})`}
                  />
                  <line
                    x1={baseX + sway * 0.4}
                    y1={bottomY - currentHeight * 0.45}
                    x2={baseX + sway * 0.4 + stem.leafSide * 30}
                    y2={bottomY - currentHeight * 0.45 - 2}
                    stroke={leafColor}
                    strokeWidth="1"
                    opacity={0.5}
                  />
                </g>
              )}

              {/* Rose bloom at top */}
              {bloomProgress > 0 && (
                <RoseBloom
                  cx={baseX + sway}
                  cy={topY}
                  size={stem.roseSize}
                  bloom={bloomProgress}
                  petalCount={stem.petalCount}
                  color={roseColor}
                  innerColor={roseInner}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
