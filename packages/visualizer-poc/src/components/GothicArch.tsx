/**
 * GothicArch — Ornate gothic arch frame with tracery patterns surrounding the
 * screen. Pointed arch at top center, with radiating tracery (trefoil and
 * cusped patterns). Side mullions (vertical dividers). Energy-reactive glow
 * on tracery elements. Stone-grey with warm amber highlights.
 * Cycle: 85s on / off, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2550; // 85s at 30fps
const DURATION = 660; // 22s visible
const TRACERY_COUNT = 16;
const SIDE_MULLION_COUNT = 6;

const STONE_GREY = "#7A7568";
const STONE_LIGHT = "#9E978A";
const STONE_DARK = "#4A463C";
const AMBER_GLOW = "#FFB74D";
const AMBER_WARM = "#FFE0B2";
const DEEP_SHADOW = "#2A2620";

interface Props {
  frames: EnhancedFrameData[];
}

export const GothicArch: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate tracery trefoil positions
  const trefoils = React.useMemo(() => {
    const rng = seeded(91_337_204);
    return Array.from({ length: TRACERY_COUNT }, () => ({
      angleOffset: rng() * Math.PI * 2,
      radiusFrac: 0.3 + rng() * 0.5,
      size: 8 + rng() * 14,
      lobeCount: rng() > 0.5 ? 3 : 4, // trefoil or quatrefoil
      glowPhase: rng() * Math.PI * 2,
    }));
  }, []);

  // Pre-generate side mullion decorations
  const mullionDeco = React.useMemo(() => {
    const rng = seeded(42_881_117);
    return Array.from({ length: SIDE_MULLION_COUNT * 2 }, () => ({
      yFrac: 0.15 + rng() * 0.65,
      size: 5 + rng() * 8,
      isLeft: false, // will be set in render
    }));
  }, []);

  // Rolling energy (151-frame window)
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.18, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const archApexY = height * 0.05;
  const archSpringY = height * 0.45; // where the arch starts to curve
  const archBaseW = width * 0.48; // half-width at spring line
  const frameThickness = 18;

  // Tracery glow pulsing with energy
  const glowIntensity = interpolate(energy, [0.02, 0.3], [0.15, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build the pointed arch path (outer and inner)
  const outerArchD = `M ${cx - archBaseW} ${archSpringY} Q ${cx - archBaseW * 0.3} ${archApexY - height * 0.05} ${cx} ${archApexY} Q ${cx + archBaseW * 0.3} ${archApexY - height * 0.05} ${cx + archBaseW} ${archSpringY}`;
  const innerOffset = frameThickness;
  const innerArchD = `M ${cx - archBaseW + innerOffset} ${archSpringY} Q ${cx - (archBaseW - innerOffset) * 0.3} ${archApexY + innerOffset * 0.8} ${cx} ${archApexY + innerOffset} Q ${cx + (archBaseW - innerOffset) * 0.3} ${archApexY + innerOffset * 0.8} ${cx + archBaseW - innerOffset} ${archSpringY}`;

  // Chroma for coloring tracery highlights
  const chroma = frames[idx].chroma;

  // Render trefoil/quatrefoil at position
  const renderFoil = (tcx: number, tcy: number, size: number, lobes: number, glow: number, key: string) => {
    const paths: React.ReactNode[] = [];
    for (let l = 0; l < lobes; l++) {
      const angle = (l / lobes) * Math.PI * 2;
      const lx = tcx + Math.cos(angle) * size * 0.5;
      const ly = tcy + Math.sin(angle) * size * 0.5;
      paths.push(
        <circle
          key={`${key}-lobe-${l}`}
          cx={lx}
          cy={ly}
          r={size * 0.35}
          fill="none"
          stroke={AMBER_GLOW}
          strokeWidth={1.5}
          opacity={glow}
        />,
      );
    }
    // Center point
    paths.push(
      <circle
        key={`${key}-center`}
        cx={tcx}
        cy={tcy}
        r={2}
        fill={AMBER_WARM}
        opacity={glow * 0.8}
      />,
    );
    return paths;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <radialGradient id="gothic-apex-glow">
            <stop offset="0%" stopColor={AMBER_WARM} stopOpacity={0.4} />
            <stop offset="60%" stopColor={AMBER_GLOW} stopOpacity={0.08} />
            <stop offset="100%" stopColor={AMBER_GLOW} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Arch frame (outer) */}
        <path
          d={outerArchD}
          fill="none"
          stroke={STONE_GREY}
          strokeWidth={frameThickness}
          opacity={0.5}
          strokeLinecap="round"
        />

        {/* Arch frame (inner edge highlight) */}
        <path
          d={innerArchD}
          fill="none"
          stroke={STONE_LIGHT}
          strokeWidth={2}
          opacity={0.3}
        />

        {/* Side columns extending down from arch spring points */}
        {/* Left column */}
        <rect
          x={cx - archBaseW - frameThickness / 2}
          y={archSpringY}
          width={frameThickness}
          height={height - archSpringY}
          fill={STONE_GREY}
          opacity={0.45}
        />
        {/* Right column */}
        <rect
          x={cx + archBaseW - frameThickness / 2}
          y={archSpringY}
          width={frameThickness}
          height={height - archSpringY}
          fill={STONE_GREY}
          opacity={0.45}
        />

        {/* Side mullions (thinner vertical bars) */}
        {Array.from({ length: SIDE_MULLION_COUNT }).map((_, mi) => {
          const xLeft = cx - archBaseW + frameThickness + 15 + mi * 12;
          const xRight = cx + archBaseW - frameThickness - 15 - mi * 12;
          const mullionH = (height - archSpringY) * (0.4 + mi * 0.08);
          return (
            <g key={`mullion-${mi}`}>
              <rect
                x={xLeft - 1.5}
                y={archSpringY}
                width={3}
                height={mullionH}
                fill={STONE_LIGHT}
                opacity={0.25}
                rx={1}
              />
              <rect
                x={xRight - 1.5}
                y={archSpringY}
                width={3}
                height={mullionH}
                fill={STONE_LIGHT}
                opacity={0.25}
                rx={1}
              />
            </g>
          );
        })}

        {/* Tracery trefoils/quatrefoils in the arch */}
        {trefoils.map((tf, ti) => {
          const angle = tf.angleOffset + (ti / TRACERY_COUNT) * Math.PI;
          const r = Math.min(width, height) * 0.15 * tf.radiusFrac;
          const tcx = cx + Math.cos(angle) * r * 1.5;
          const tcy = archApexY + (archSpringY - archApexY) * 0.4 + Math.sin(angle) * r * 0.6;

          // Clamp to arch region
          if (tcy > archSpringY - 10 || tcy < archApexY + 10) return null;

          const chromaIdx = ti % 12;
          const pulse = Math.sin(frame * 0.05 + tf.glowPhase) * 0.15;
          const glow = glowIntensity * (0.5 + chroma[chromaIdx] * 0.5) + pulse;

          return (
            <g key={`trefoil-${ti}`}>
              {renderFoil(tcx, tcy, tf.size, tf.lobeCount, glow, `tf-${ti}`)}
            </g>
          );
        })}

        {/* Mullion decorations (small rosettes on side columns) */}
        {mullionDeco.map((md, mi) => {
          const isLeft = mi < SIDE_MULLION_COUNT;
          const mx = isLeft
            ? cx - archBaseW - frameThickness / 2 + frameThickness / 2
            : cx + archBaseW - frameThickness / 2 + frameThickness / 2;
          const my = archSpringY + (height - archSpringY) * md.yFrac;
          const glow = glowIntensity * 0.5;

          return (
            <circle
              key={`mdeco-${mi}`}
              cx={mx}
              cy={my}
              r={md.size * 0.4}
              fill="none"
              stroke={AMBER_GLOW}
              strokeWidth={1}
              opacity={glow}
            />
          );
        })}

        {/* Apex glow */}
        <circle
          cx={cx}
          cy={archApexY + 20}
          r={35 + energy * 25}
          fill="url(#gothic-apex-glow)"
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${AMBER_GLOW})` }}
        />

        {/* Horizontal transom bar across spring line */}
        <line
          x1={cx - archBaseW}
          y1={archSpringY}
          x2={cx + archBaseW}
          y2={archSpringY}
          stroke={STONE_GREY}
          strokeWidth={6}
          opacity={0.4}
        />

        {/* Drip molding (decorative line above arch) */}
        <path
          d={`M ${cx - archBaseW - 10} ${archSpringY + 5} Q ${cx - archBaseW * 0.3 - 5} ${archApexY - height * 0.06} ${cx} ${archApexY - 8} Q ${cx + archBaseW * 0.3 + 5} ${archApexY - height * 0.06} ${cx + archBaseW + 10} ${archSpringY + 5}`}
          fill="none"
          stroke={STONE_DARK}
          strokeWidth={3}
          opacity={0.3}
        />
      </svg>
    </div>
  );
};
