/**
 * Paisley — Flowing paisley teardrop/comma patterns that drift across screen.
 * 8-12 paisley shapes of varying sizes. Each has the classic curved teardrop
 * with internal decorative lines/dots. Rich jewel tones: emerald, ruby,
 * sapphire, gold. Shapes rotate slowly and drift. Energy drives drift speed
 * and internal pattern animation. Cycle: 55s, 18s visible.
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

const CYCLE = 1650; // 55s at 30fps
const DURATION = 540; // 18s visible
const PAISLEY_COUNT = 10;

const JEWEL_TONES = [
  "#0B6623", // emerald
  "#9B111E", // ruby
  "#0F52BA", // sapphire
  "#CFB53B", // old gold
  "#7B3F00", // chocolate
  "#4B0082", // indigo
  "#C41E3A", // cardinal
  "#006B3C", // cadmium green
  "#E0B31A", // saffron gold
  "#1C39BB", // persian blue
];

interface PaisleyData {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  colorIdx: number;
  driftAngle: number;
  driftSpeed: number;
  rotSpeed: number;
  innerDots: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Paisley: React.FC<Props> = ({ frames }) => {
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

  const paisleys = React.useMemo(() => {
    const rng = seeded(55_018_007);
    return Array.from({ length: PAISLEY_COUNT }, (): PaisleyData => ({
      x: rng() * 1920,
      y: rng() * 1080,
      scale: 0.5 + rng() * 1.0,
      rotation: rng() * 360,
      colorIdx: Math.floor(rng() * JEWEL_TONES.length),
      driftAngle: rng() * Math.PI * 2,
      driftSpeed: 0.3 + rng() * 0.8,
      rotSpeed: 0.1 + rng() * 0.3,
      innerDots: 3 + Math.floor(rng() * 5),
    }));
  }, []);

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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const driftMult = 0.4 + energy * 2.0;

  // Paisley SVG path: classic teardrop with curl
  // The shape is roughly: a big teardrop with the narrow end curling inward
  const makePaisleyPath = (s: number): string => {
    // Scale factor applied to base shape (about 80px tall at scale=1)
    const h = 80 * s;
    const w = 45 * s;
    // Teardrop body with curled tip
    return [
      `M 0 ${-h * 0.5}`,
      `C ${w * 0.9} ${-h * 0.35} ${w * 0.7} ${h * 0.15} ${w * 0.1} ${h * 0.35}`,
      `C ${-w * 0.1} ${h * 0.45} ${-w * 0.3} ${h * 0.3} ${-w * 0.15} ${h * 0.1}`,
      `C ${-w * 0.05} ${-h * 0.05} ${w * 0.05} ${-h * 0.15} ${w * 0.15} ${-h * 0.05}`,
      `C ${w * 0.25} ${h * 0.05} ${w * 0.1} ${h * 0.15} ${-w * 0.05} ${h * 0.08}`,
      `M 0 ${-h * 0.5}`,
      `C ${-w * 0.9} ${-h * 0.35} ${-w * 0.7} ${h * 0.15} ${-w * 0.1} ${h * 0.35}`,
      `C ${w * 0.1} ${h * 0.45} ${w * 0.3} ${h * 0.3} ${w * 0.15} ${h * 0.1}`,
    ].join(" ");
  };

  // Inner decorative lines for paisley
  const makeInnerLines = (s: number, dotCount: number): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    const h = 80 * s;

    // Inner curved line
    elements.push(
      <path
        key="inner-curve"
        d={`M 0 ${-h * 0.35} C ${15 * s} ${-h * 0.1} ${10 * s} ${h * 0.1} 0 ${h * 0.2}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        opacity={0.6}
      />
    );

    // Dots along inner curve
    for (let d = 0; d < dotCount; d++) {
      const t = (d + 1) / (dotCount + 1);
      const dotY = -h * 0.35 + t * h * 0.55;
      const dotX = Math.sin(t * Math.PI) * 8 * s;
      elements.push(
        <circle
          key={`dot-${d}`}
          cx={dotX}
          cy={dotY}
          r={1.5 * s}
          fill="currentColor"
          opacity={0.5}
        />
      );
    }

    return elements;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 10px rgba(207, 181, 59, 0.3)) drop-shadow(0 0 20px rgba(79, 0, 130, 0.2))`,
        }}
      >
        {paisleys.map((p, pi) => {
          // Drift position
          const dx = Math.cos(p.driftAngle) * frame * p.driftSpeed * driftMult;
          const dy = Math.sin(p.driftAngle) * frame * p.driftSpeed * driftMult * 0.6;
          const px = ((p.x + dx) % (width + 200)) - 100;
          const py = ((p.y + dy) % (height + 200)) - 100;

          // Rotation
          const rot = p.rotation + frame * p.rotSpeed * (0.5 + energy * 0.5);

          const color = JEWEL_TONES[p.colorIdx];
          const accentColor = JEWEL_TONES[(p.colorIdx + 3) % JEWEL_TONES.length];

          // Inner pattern pulse with energy
          const innerScale = 1 + energy * 0.15 * Math.sin(frame * 0.05 + pi);

          return (
            <g
              key={pi}
              transform={`translate(${px}, ${py}) rotate(${rot}) scale(${innerScale})`}
              style={{ color: accentColor }}
            >
              {/* Paisley body */}
              <path
                d={makePaisleyPath(p.scale)}
                fill={color}
                opacity={0.5}
                stroke={accentColor}
                strokeWidth={1.5}
              />
              {/* Inner decorative elements */}
              {makeInnerLines(p.scale, p.innerDots)}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
