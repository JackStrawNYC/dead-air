/**
 * CometTail — 2-3 comets streaking across screen with glowing tails.
 * Each comet is a bright nucleus (small circle) with a long fading tail
 * pointing away from travel direction. Tail made of gradient particles.
 * Colors: ice blue nucleus with white/blue tail.
 * Speed and tail length driven by energy. Cycle: 45s, 12s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1350;    // 45 seconds at 30fps
const DURATION = 360;  // 12 seconds
const NUM_COMETS = 3;
const TAIL_PARTICLES = 18;

interface CometData {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  nucleusSize: number;
  tailLength: number;
  speed: number;
  hue: number;
  wobbleAmp: number;
  wobbleFreq: number;
  phase: number;
  delayFraction: number;
}

interface TailParticleData {
  offsetX: number;
  offsetY: number;
  size: number;
  distanceFraction: number;
  opacity: number;
}

function generateComets(seed: number): CometData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_COMETS }, () => {
    // Random entry/exit from edges
    const enterSide = Math.floor(rng() * 4);
    let startX: number, startY: number, endX: number, endY: number;
    switch (enterSide) {
      case 0: // left to right
        startX = -0.1; startY = 0.1 + rng() * 0.6;
        endX = 1.1; endY = 0.2 + rng() * 0.6;
        break;
      case 1: // top to bottom-right
        startX = 0.1 + rng() * 0.5; startY = -0.1;
        endX = 0.5 + rng() * 0.5; endY = 1.1;
        break;
      case 2: // right to left
        startX = 1.1; startY = 0.1 + rng() * 0.6;
        endX = -0.1; endY = 0.3 + rng() * 0.5;
        break;
      default: // top-right to bottom-left
        startX = 0.6 + rng() * 0.4; startY = -0.1;
        endX = rng() * 0.4; endY = 1.1;
        break;
    }
    return {
      startX,
      startY,
      endX,
      endY,
      nucleusSize: 3 + rng() * 4,
      tailLength: 80 + rng() * 120,
      speed: 0.8 + rng() * 0.6,
      hue: 195 + rng() * 20, // ice blue range 195-215
      wobbleAmp: 2 + rng() * 5,
      wobbleFreq: 0.06 + rng() * 0.04,
      phase: rng() * Math.PI * 2,
      delayFraction: rng() * 0.3,
    };
  });
}

function generateTailParticles(seed: number): TailParticleData[] {
  const rng = seeded(seed);
  return Array.from({ length: TAIL_PARTICLES }, () => ({
    offsetX: (rng() - 0.5) * 10,
    offsetY: (rng() - 0.5) * 10,
    size: 1 + rng() * 3,
    distanceFraction: rng(),
    opacity: 0.2 + rng() * 0.5,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CometTail: React.FC<Props> = ({ frames }) => {
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

  const comets = React.useMemo(() => generateComets(4545), []);
  const tailParticles = React.useMemo(() => generateTailParticles(4546), []);

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
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  const speedMult = 0.6 + energy * 1.5;
  const tailMult = 0.7 + energy * 0.8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="comet-nucleus-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="comet-tail-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {comets.map((comet, ci) => {
          // Per-comet staggered progress
          const cometStart = comet.delayFraction;
          const cometEnd = cometStart + (1 - cometStart);
          const cometProgress = interpolate(
            progress,
            [cometStart, cometEnd],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (cometProgress <= 0) return null;

          const travelProgress = cometProgress * speedMult;
          const clampedTravel = Math.min(travelProgress, 1);

          // Current nucleus position
          const nx = (comet.startX + (comet.endX - comet.startX) * clampedTravel) * width;
          const ny = (comet.startY + (comet.endY - comet.startY) * clampedTravel) * height +
            Math.sin(frame * comet.wobbleFreq + comet.phase) * comet.wobbleAmp;

          // Travel direction (for tail orientation)
          const dx = comet.endX - comet.startX;
          const dy = comet.endY - comet.startY;
          const angle = Math.atan2(dy, dx);
          const tailDir = angle + Math.PI; // tail points opposite to travel

          const currentTailLength = comet.tailLength * tailMult;

          // Build tail as a tapered shape
          const tailEndX = nx + Math.cos(tailDir) * currentTailLength;
          const tailEndY = ny + Math.sin(tailDir) * currentTailLength;
          const perpAngle = angle + Math.PI / 2;
          const headWidth = comet.nucleusSize * 2.5;

          const tailPathD = [
            `M ${nx + Math.cos(perpAngle) * headWidth} ${ny + Math.sin(perpAngle) * headWidth}`,
            `Q ${nx + Math.cos(tailDir) * currentTailLength * 0.4 + Math.cos(perpAngle) * headWidth * 0.5} ${ny + Math.sin(tailDir) * currentTailLength * 0.4 + Math.sin(perpAngle) * headWidth * 0.5},`,
            `${tailEndX} ${tailEndY}`,
            `Q ${nx + Math.cos(tailDir) * currentTailLength * 0.4 - Math.cos(perpAngle) * headWidth * 0.5} ${ny + Math.sin(tailDir) * currentTailLength * 0.4 - Math.sin(perpAngle) * headWidth * 0.5},`,
            `${nx - Math.cos(perpAngle) * headWidth} ${ny - Math.sin(perpAngle) * headWidth}`,
            "Z",
          ].join(" ");

          const coreColor = `hsl(${comet.hue}, 80%, 90%)`;
          const tailColor = `hsla(${comet.hue}, 70%, 75%, 0.3)`;
          const glowColor = `hsla(${comet.hue}, 90%, 95%, 0.8)`;

          return (
            <g key={`comet-${ci}`}>
              {/* Tail shape */}
              <path
                d={tailPathD}
                fill={tailColor}
                filter="url(#comet-tail-glow)"
              />

              {/* Tail particles */}
              {tailParticles.map((tp, tpi) => {
                const pDist = tp.distanceFraction * currentTailLength;
                const px = nx + Math.cos(tailDir) * pDist + tp.offsetX;
                const py = ny + Math.sin(tailDir) * pDist + tp.offsetY;
                const pOp = tp.opacity * (1 - tp.distanceFraction) * (0.5 + energy * 0.5);
                return (
                  <circle
                    key={`tp-${tpi}`}
                    cx={px}
                    cy={py}
                    r={tp.size * (1 - tp.distanceFraction * 0.5)}
                    fill={`hsla(${comet.hue + 10}, 60%, 85%, ${pOp})`}
                  />
                );
              })}

              {/* Nucleus outer glow */}
              <circle
                cx={nx}
                cy={ny}
                r={comet.nucleusSize * 3}
                fill={`hsla(${comet.hue}, 60%, 80%, 0.15)`}
                filter="url(#comet-nucleus-glow)"
              />

              {/* Nucleus */}
              <circle
                cx={nx}
                cy={ny}
                r={comet.nucleusSize}
                fill={glowColor}
                filter="url(#comet-nucleus-glow)"
              />

              {/* Nucleus bright center */}
              <circle
                cx={nx}
                cy={ny}
                r={comet.nucleusSize * 0.4}
                fill={coreColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
