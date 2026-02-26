/**
 * AlchemySymbols — Alchemical symbols (circles, triangles, crescents, crosses)
 * that materialize and dissolve. 4-6 symbols positioned around screen. Each
 * draws itself stroke-by-stroke (SVG stroke-dasharray animation via interpolate).
 * Gold/copper color on translucent dark. Symbols relate to elements:
 * fire (triangle up), water (triangle down), air (triangle up + line),
 * earth (triangle down + line). Cycle: 55s, 14s visible.
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
const DURATION = 420; // 14s visible
const NUM_SYMBOLS = 6;

/**
 * Each alchemical symbol definition: multiple SVG path segments
 * with approximate total path length for dash animation.
 */
interface AlchemySymbolDef {
  name: string;
  paths: string[];
  totalLength: number;
}

const ALCHEMY_SYMBOLS: AlchemySymbolDef[] = [
  {
    // Fire: upward triangle
    name: "fire",
    paths: [
      "M 0 -20 L 17.3 10 L -17.3 10 Z",
    ],
    totalLength: 80,
  },
  {
    // Water: downward triangle
    name: "water",
    paths: [
      "M 0 20 L 17.3 -10 L -17.3 -10 Z",
    ],
    totalLength: 80,
  },
  {
    // Air: upward triangle with horizontal line through middle
    name: "air",
    paths: [
      "M 0 -20 L 17.3 10 L -17.3 10 Z",
      "M -12 0 L 12 0",
    ],
    totalLength: 104,
  },
  {
    // Earth: downward triangle with horizontal line
    name: "earth",
    paths: [
      "M 0 20 L 17.3 -10 L -17.3 -10 Z",
      "M -12 0 L 12 0",
    ],
    totalLength: 104,
  },
  {
    // Sun: circle with dot
    name: "sun",
    paths: [
      "M 18 0 A 18 18 0 1 0 -18 0 A 18 18 0 1 0 18 0",
      "M 3 0 A 3 3 0 1 0 -3 0 A 3 3 0 1 0 3 0",
    ],
    totalLength: 132,
  },
  {
    // Moon: crescent
    name: "moon",
    paths: [
      "M 8 -18 A 18 18 0 1 0 8 18 A 12 18 0 1 1 8 -18",
    ],
    totalLength: 100,
  },
  {
    // Mercury: circle + cross below + crescent above
    name: "mercury",
    paths: [
      "M 12 0 A 12 12 0 1 0 -12 0 A 12 12 0 1 0 12 0",
      "M 0 12 L 0 26",
      "M -7 19 L 7 19",
      "M -8 -14 A 10 8 0 0 1 8 -14",
    ],
    totalLength: 120,
  },
  {
    // Sulfur: triangle + cross below
    name: "sulfur",
    paths: [
      "M 0 -16 L 14 6 L -14 6 Z",
      "M 0 6 L 0 22",
      "M -7 14 L 7 14",
    ],
    totalLength: 110,
  },
  {
    // Salt: circle with horizontal line
    name: "salt",
    paths: [
      "M 16 0 A 16 16 0 1 0 -16 0 A 16 16 0 1 0 16 0",
      "M -16 0 L 16 0",
    ],
    totalLength: 133,
  },
  {
    // Quintessence/Aether: large circle with smaller circle
    name: "aether",
    paths: [
      "M 20 0 A 20 20 0 1 0 -20 0 A 20 20 0 1 0 20 0",
      "M 0 -20 L 0 -28 M 0 20 L 0 28 M -20 0 L -28 0 M 20 0 L 28 0",
    ],
    totalLength: 158,
  },
];

interface SymbolInstance {
  symbolIdx: number;
  x: number;
  y: number;
  scale: number;
  drawDelay: number; // 0-1 stagger for draw-in timing
  rotation: number;
  pulsePhase: number;
}

function generateInstances(seed: number): SymbolInstance[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SYMBOLS }, (_, i) => ({
    symbolIdx: Math.floor(rng() * ALCHEMY_SYMBOLS.length),
    x: 0.1 + rng() * 0.8,
    y: 0.12 + rng() * 0.7,
    scale: 1.5 + rng() * 1.2,
    drawDelay: i * 0.1,
    rotation: (rng() - 0.5) * 20,
    pulsePhase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const AlchemySymbols: React.FC<Props> = ({ frames }) => {
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

  const cycleIdx = Math.floor(frame / CYCLE);
  const instances = React.useMemo(() => generateInstances(cycleIdx * 43 + 31415), [cycleIdx]);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  // Gold/copper tones
  const baseHue = 35;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px hsla(${baseHue}, 80%, 50%, 0.4)) drop-shadow(0 0 14px hsla(${baseHue}, 70%, 40%, 0.25))`,
        }}
      >
        <defs>
          <filter id="alchemy-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {instances.map((inst, ii) => {
          const sym = ALCHEMY_SYMBOLS[inst.symbolIdx];

          // Staggered draw-in: each symbol starts drawing at a different time
          const drawStart = inst.drawDelay;
          const drawEnd = Math.min(1, drawStart + 0.5);
          const drawProgress = interpolate(progress, [drawStart, drawEnd], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          if (drawProgress < 0.01) return null;

          // Dissolve out near end
          const dissolve = interpolate(progress, [0.75, 0.9], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const symbolOpacity = Math.min(drawProgress, dissolve);
          if (symbolOpacity < 0.01) return null;

          const px = inst.x * width;
          const py = inst.y * height;

          // Energy pulse
          const pulse = (Math.sin(frame * 0.04 + inst.pulsePhase) + 1) * 0.5;
          const glowBrightness = 50 + pulse * 20 + energy * 15;
          const strokeColor = `hsl(${baseHue}, ${75 + energy * 15}%, ${glowBrightness}%)`;

          // Drawn portion of total path
          const drawnLength = sym.totalLength * drawProgress;
          const dashArray = `${drawnLength} ${sym.totalLength}`;

          // Slow rotation
          const rot = inst.rotation + Math.sin(frame * 0.005 + ii * 1.5) * 5;

          return (
            <g
              key={ii}
              transform={`translate(${px}, ${py}) rotate(${rot}) scale(${inst.scale})`}
              opacity={symbolOpacity}
            >
              {/* Background glow circle */}
              <circle
                cx={0}
                cy={0}
                r={30 * inst.scale}
                fill={`hsla(${baseHue}, 60%, 30%, ${0.06 + energy * 0.04})`}
                style={{ filter: "blur(8px)" }}
              />

              {/* Symbol paths with stroke-dasharray animation */}
              {sym.paths.map((pathD, pi) => (
                <path
                  key={pi}
                  d={pathD}
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={dashArray}
                  filter="url(#alchemy-glow)"
                  opacity={0.7 + pulse * 0.3}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
