/**
 * WaterClock — Ancient clepsydra (water clock) with dripping water.
 * Upper vessel drains into lower vessel through a narrow spout.
 * Water drip particles fall between vessels; drip rate matches tempo/energy.
 * Ripples form in lower vessel on impact. Hour markings on the lower
 * vessel's side. Patinated bronze/green aesthetic.
 * Cycle: 75s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2250; // 75s at 30fps
const DURATION = 600; // 20s visible

interface Droplet {
  offsetX: number;
  speed: number;
  size: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WaterClock: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate water droplets
  const droplets = React.useMemo(() => {
    const rng = seeded(99887766);
    const pts: Droplet[] = [];
    for (let i = 0; i < 15; i++) {
      pts.push({
        offsetX: (rng() - 0.5) * 8,
        speed: 0.6 + rng() * 0.8,
        size: 2 + rng() * 2.5,
        phase: rng() * 80,
      });
    }
    return pts;
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
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Position: center-left
  const cx = width * 0.3;
  const cy = height * 0.45;
  const unitSize = Math.min(width, height) * 0.035;

  // Vessel dimensions
  const upperW = unitSize * 3;
  const upperH = unitSize * 3.5;
  const lowerW = unitSize * 3.5;
  const lowerH = unitSize * 4;
  const gapH = unitSize * 3; // vertical gap between vessels
  const spoutW = unitSize * 0.3;

  // Colors: patinated bronze
  const bronzeColor = "#8B7355";
  const bronzeDark = "#5C4A32";
  const bronzeLight = "#A89070";
  const patinaColor = "#4A7A5A";
  const waterColor = "#5090C0";
  const waterLight = "#70B0E0";
  const waterDark = "#3A6890";

  // Positions
  const upperTop = -upperH - gapH / 2;
  const upperBottom = -gapH / 2;
  const lowerTop = gapH / 2;
  const lowerBottom = gapH / 2 + lowerH;

  // Water levels drain/fill over visible duration
  const drainProgress = interpolate(cycleFrame, [0, DURATION], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const upperWaterLevel = 1 - drainProgress;
  const lowerWaterLevel = drainProgress;

  // Drip rate modulated by energy
  const dripRate = interpolate(energy, [0.03, 0.35], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Active droplets count
  const activeDrops = Math.floor(interpolate(energy, [0.03, 0.3], [3, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Ripple effect (periodic)
  const ripplePhase = (cycleFrame * dripRate * 0.15) % 1;
  const rippleRadius = ripplePhase * lowerW * 0.6;
  const rippleOpacity = (1 - ripplePhase) * 0.3;

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hour markings on lower vessel
  const hourMarks = ["I", "II", "III", "IV", "V", "VI"];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(80, 144, 192, 0.3))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Upper vessel (wider at top, narrower at bottom — like a bowl) */}
          <path
            d={`M ${-upperW} ${upperTop}
                L ${-upperW * 0.85} ${upperBottom}
                L ${upperW * 0.85} ${upperBottom}
                L ${upperW} ${upperTop}
                Z`}
            fill={bronzeColor}
            opacity={0.3}
            stroke={bronzeDark}
            strokeWidth={2}
          />

          {/* Upper vessel patina decoration */}
          <line x1={-upperW * 0.9} y1={upperTop + upperH * 0.3} x2={upperW * 0.9} y2={upperTop + upperH * 0.3} stroke={patinaColor} strokeWidth={1} opacity={0.2} />
          <line x1={-upperW * 0.88} y1={upperTop + upperH * 0.6} x2={upperW * 0.88} y2={upperTop + upperH * 0.6} stroke={patinaColor} strokeWidth={0.8} opacity={0.15} />

          {/* Water in upper vessel */}
          {upperWaterLevel > 0.03 && (
            <path
              d={`M ${-upperW * (0.85 + upperWaterLevel * 0.15) * (1 - (1 - upperWaterLevel) * 0.15)} ${upperBottom - upperH * upperWaterLevel * 0.85}
                  L ${-upperW * 0.85} ${upperBottom}
                  L ${upperW * 0.85} ${upperBottom}
                  L ${upperW * (0.85 + upperWaterLevel * 0.15) * (1 - (1 - upperWaterLevel) * 0.15)} ${upperBottom - upperH * upperWaterLevel * 0.85}
                  Z`}
              fill={waterColor}
              opacity={0.25}
            />
          )}

          {/* Spout (narrow tube from upper to lower) */}
          <rect x={-spoutW} y={upperBottom} width={spoutW * 2} height={gapH} fill={bronzeDark} opacity={0.35} stroke={bronzeDark} strokeWidth={1} />

          {/* Lower vessel (rectangular with slight taper) */}
          <path
            d={`M ${-lowerW} ${lowerTop}
                L ${-lowerW * 0.95} ${lowerBottom}
                L ${lowerW * 0.95} ${lowerBottom}
                L ${lowerW} ${lowerTop}
                Z`}
            fill={bronzeColor}
            opacity={0.3}
            stroke={bronzeDark}
            strokeWidth={2}
          />

          {/* Hour markings on lower vessel side */}
          {hourMarks.map((mark, mi) => {
            const markY = lowerBottom - (mi + 1) * (lowerH / 7);
            return (
              <g key={`mark-${mi}`}>
                <line x1={-lowerW * 0.98} y1={markY} x2={-lowerW * 0.85} y2={markY} stroke={bronzeLight} strokeWidth={1.2} opacity={0.4} />
                <text
                  x={-lowerW * 1.15}
                  y={markY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={bronzeLight}
                  fontSize={7}
                  fontFamily="serif"
                  opacity={0.35}
                >
                  {mark}
                </text>
              </g>
            );
          })}

          {/* Water in lower vessel */}
          {lowerWaterLevel > 0.03 && (
            <rect
              x={-lowerW * 0.95 + 2}
              y={lowerBottom - lowerH * lowerWaterLevel * 0.85}
              width={(lowerW * 0.95 - 2) * 2}
              height={lowerH * lowerWaterLevel * 0.85}
              fill={waterDark}
              opacity={0.2}
            />
          )}

          {/* Water surface shimmer */}
          {lowerWaterLevel > 0.05 && (
            <line
              x1={-lowerW * 0.85}
              y1={lowerBottom - lowerH * lowerWaterLevel * 0.85}
              x2={lowerW * 0.85}
              y2={lowerBottom - lowerH * lowerWaterLevel * 0.85}
              stroke={waterLight}
              strokeWidth={1.5}
              opacity={0.2 + energy * 0.15}
            />
          )}

          {/* Ripples on water surface */}
          {lowerWaterLevel > 0.1 && (
            <ellipse
              cx={0}
              cy={lowerBottom - lowerH * lowerWaterLevel * 0.85}
              rx={rippleRadius}
              ry={rippleRadius * 0.3}
              fill="none"
              stroke={waterLight}
              strokeWidth={1}
              opacity={rippleOpacity}
            />
          )}

          {/* Falling water droplets */}
          {upperWaterLevel > 0.02 && droplets.slice(0, activeDrops).map((d, di) => {
            const t = ((cycleFrame * d.speed * dripRate + d.phase * 20) % 40) / 40;
            if (t > 0.95) return null;
            const dy = upperBottom + gapH + t * (lowerBottom - lowerH * lowerWaterLevel * 0.85 - upperBottom - gapH) * 0.4;
            const dx = d.offsetX * (1 - t * 0.5); // converge toward center as they fall
            return (
              <circle
                key={`drop-${di}`}
                cx={dx}
                cy={dy}
                r={d.size * (1 - t * 0.3)}
                fill={waterColor}
                opacity={0.35 * (1 - t * 0.5)}
              />
            );
          })}

          {/* Decorative feet on lower vessel */}
          {[-1, 1].map((side) => (
            <g key={`foot-${side}`}>
              <path
                d={`M ${side * lowerW * 0.7} ${lowerBottom}
                    Q ${side * lowerW * 0.8} ${lowerBottom + 8} ${side * lowerW * 0.9} ${lowerBottom + 12}
                    L ${side * lowerW * 0.6} ${lowerBottom + 12}
                    Q ${side * lowerW * 0.65} ${lowerBottom + 6} ${side * lowerW * 0.7} ${lowerBottom}
                    Z`}
                fill={bronzeDark}
                opacity={0.3}
              />
            </g>
          ))}

          {/* Upper vessel rim decoration */}
          <line x1={-upperW - 3} y1={upperTop} x2={upperW + 3} y2={upperTop} stroke={bronzeLight} strokeWidth={2.5} opacity={0.35} />
          <line x1={-upperW - 2} y1={upperTop + 3} x2={upperW + 2} y2={upperTop + 3} stroke={patinaColor} strokeWidth={1} opacity={0.2} />

          {/* Lower vessel rim */}
          <line x1={-lowerW - 2} y1={lowerTop} x2={lowerW + 2} y2={lowerTop} stroke={bronzeLight} strokeWidth={2} opacity={0.3} />
        </g>
      </svg>
    </div>
  );
};
