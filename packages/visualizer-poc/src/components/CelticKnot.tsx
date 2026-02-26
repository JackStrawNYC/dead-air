/**
 * CelticKnot — Intricate Celtic knot pattern with interlocking loops
 * and over/under crossings. Central symmetrical design drawn as SVG
 * paths with varying stroke widths at crossings. Green/gold colors
 * (Irish aesthetic). The knot pulses (scale breathe) with energy.
 * Glow on crossover points. Cycle: 70s (2100 frames), 18s visible (540 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100;    // 70 seconds at 30fps
const DURATION = 540;  // 18 seconds visible
const STAGGER_OFFSET = 360; // 12s offset

/**
 * Generate the paths for a quaternary Celtic knot (4-fold symmetry).
 * The knot is a series of interlocking loops arranged around a center.
 * Each loop path is mirrored/rotated for symmetry.
 */
interface KnotLoop {
  path: string;
  crossings: Array<{ x: number; y: number; isOver: boolean }>;
}

function generateKnotPaths(r: number): KnotLoop[] {
  const loops: KnotLoop[] = [];
  const numLobes = 4;

  // Main outer loops — large trefoil-like petals
  for (let lobe = 0; lobe < numLobes; lobe++) {
    const angle = (lobe / numLobes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nextAngle = ((lobe + 1) / numLobes) * Math.PI * 2;
    const ncos = Math.cos(nextAngle);
    const nsin = Math.sin(nextAngle);

    // Petal center
    const pcx = cos * r * 0.6;
    const pcy = sin * r * 0.6;

    // Control points for a smooth lobe
    const cp1x = cos * r * 1.1 - sin * r * 0.3;
    const cp1y = sin * r * 1.1 + cos * r * 0.3;
    const cp2x = cos * r * 1.1 + sin * r * 0.3;
    const cp2y = sin * r * 1.1 - cos * r * 0.3;

    // Crossing points (where this loop crosses adjacent loops)
    const cx1 = (cos + ncos) * r * 0.35;
    const cy1 = (sin + nsin) * r * 0.35;

    const prevAngle = ((lobe - 1 + numLobes) / numLobes) * Math.PI * 2;
    const pcos = Math.cos(prevAngle);
    const psin = Math.sin(prevAngle);
    const cx2 = (cos + pcos) * r * 0.35;
    const cy2 = (sin + psin) * r * 0.35;

    const path = [
      `M ${cx2} ${cy2}`,
      `C ${cos * r * 0.2 - sin * r * 0.4} ${sin * r * 0.2 + cos * r * 0.4}`,
      `  ${cp1x} ${cp1y}`,
      `  ${pcx + cos * r * 0.4} ${pcy + sin * r * 0.4}`,
      `S ${cp2x} ${cp2y}`,
      `  ${cx1} ${cy1}`,
    ].join(" ");

    loops.push({
      path,
      crossings: [
        { x: cx1, y: cy1, isOver: lobe % 2 === 0 },
        { x: cx2, y: cy2, isOver: lobe % 2 === 1 },
      ],
    });
  }

  // Inner ring — smaller interlocking loops
  for (let lobe = 0; lobe < numLobes; lobe++) {
    const angle = ((lobe + 0.5) / numLobes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const innerR = r * 0.3;
    const pcx = cos * innerR;
    const pcy = sin * innerR;

    const cp1x = cos * innerR * 1.8 - sin * innerR * 0.5;
    const cp1y = sin * innerR * 1.8 + cos * innerR * 0.5;
    const cp2x = cos * innerR * 1.8 + sin * innerR * 0.5;
    const cp2y = sin * innerR * 1.8 - cos * innerR * 0.5;

    const path = [
      `M ${pcx - sin * innerR * 0.4} ${pcy + cos * innerR * 0.4}`,
      `C ${cp1x} ${cp1y}`,
      `  ${cp2x} ${cp2y}`,
      `  ${pcx + sin * innerR * 0.4} ${pcy - cos * innerR * 0.4}`,
    ].join(" ");

    loops.push({
      path,
      crossings: [
        { x: pcx, y: pcy, isOver: lobe % 2 === 1 },
      ],
    });
  }

  // Central ring
  const centerPath = [
    `M ${r * 0.12} 0`,
    `A ${r * 0.12} ${r * 0.12} 0 1 1 ${r * -0.12} 0`,
    `A ${r * 0.12} ${r * 0.12} 0 1 1 ${r * 0.12} 0`,
  ].join(" ");

  loops.push({ path: centerPath, crossings: [] });

  return loops;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CelticKnot: React.FC<Props> = ({ frames }) => {
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

  const baseR = Math.min(width, height) * 0.28;
  const loops = React.useMemo(() => generateKnotPaths(baseR), [baseR]);

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

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
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Breathe scale with energy
  const breathe = 1 + (energy - 0.1) * 0.25;

  // Slow rotation
  const rotation = cycleFrame * 0.06;

  // Green/gold palette
  const greenHue = 130 + Math.sin(cycleFrame * 0.008) * 15;
  const goldHue = 45 + Math.sin(cycleFrame * 0.005) * 10;
  const greenColor = `hsl(${greenHue}, 75%, 45%)`;
  const goldColor = `hsl(${goldHue}, 90%, 55%)`;
  const greenGlow = `hsla(${greenHue}, 100%, 50%, 0.6)`;
  const goldGlow = `hsla(${goldHue}, 100%, 60%, 0.5)`;

  const glowSize = interpolate(energy, [0.03, 0.3], [4, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stroke width animation (draw-in effect)
  const strokeDraw = interpolate(progress, [0, 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation}) scale(${breathe})`}>
          {/* Background glow behind knot */}
          <circle
            cx={0}
            cy={0}
            r={baseR * 1.2}
            fill="none"
            stroke={greenGlow}
            strokeWidth={1}
            opacity={0.1}
            style={{
              filter: `blur(${10 + energy * 10}px)`,
            }}
          />

          {/* Knot loops — double-stroke for over/under effect */}
          {loops.map((loop, li) => {
            const isOuter = li < 4;
            const baseStroke = isOuter ? 6 : 4;
            const sw = baseStroke * strokeDraw * (0.8 + energy * 0.4);

            return (
              <g key={`loop-${li}`}>
                {/* Dark border (creates the "cord" look) */}
                <path
                  d={loop.path}
                  fill="none"
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={sw + 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Main knot strand */}
                <path
                  d={loop.path}
                  fill="none"
                  stroke={isOuter ? greenColor : goldColor}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: `drop-shadow(0 0 ${glowSize}px ${isOuter ? greenGlow : goldGlow})`,
                  }}
                />

                {/* Highlight center line (sheen) */}
                <path
                  d={loop.path}
                  fill="none"
                  stroke="white"
                  strokeWidth={sw * 0.2}
                  opacity={0.2 + energy * 0.15}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Crossing point glows */}
          {loops.flatMap((loop) => loop.crossings).map((crossing, ci) => {
            const hue = crossing.isOver ? goldHue : greenHue;
            const color = `hsl(${hue}, 100%, 70%)`;
            return (
              <circle
                key={`cx-${ci}`}
                cx={crossing.x}
                cy={crossing.y}
                r={3 + energy * 4}
                fill={color}
                opacity={0.4 + energy * 0.3}
                style={{
                  filter: `drop-shadow(0 0 ${6 + energy * 8}px ${color})`,
                }}
              />
            );
          })}

          {/* Center ornament */}
          <circle
            cx={0}
            cy={0}
            r={5 + energy * 6}
            fill={goldColor}
            opacity={0.6}
            style={{
              filter: `drop-shadow(0 0 ${8 + energy * 10}px ${goldGlow})`,
            }}
          />
        </g>
      </svg>
    </div>
  );
};
