/**
 * Transistor — Transistor circuit symbols with flowing current indicators.
 * Multiple NPN/PNP transistor symbols arranged in an amplifier circuit
 * layout. Current flow shown as animated dots along collector/emitter
 * paths. Base signal wiggles with audio energy. Gain indicators
 * (arrows) scale with energy. Blue/cyan schematic style.
 * Appears every 75s for 16s.
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

const CYCLE = 2250; // 75s at 30fps
const DURATION = 480; // 16s
const NUM_TRANSISTORS = 6;

interface TransistorData {
  x: number;
  y: number;
  type: "npn" | "pnp";
  scale: number;
  phase: number;
  bandKey: "sub" | "low" | "mid" | "high";
}

interface WireData {
  from: { x: number; y: number };
  to: { x: number; y: number };
  signalPhase: number;
}

const BAND_KEYS: Array<"sub" | "low" | "mid" | "high"> = ["sub", "low", "mid", "high"];

function generateCircuit(seed: number): {
  transistors: TransistorData[];
  wires: WireData[];
} {
  const rng = seeded(seed);

  const transistors: TransistorData[] = Array.from({ length: NUM_TRANSISTORS }, (_, i) => ({
    x: 0.15 + (i % 3) * 0.3 + (rng() - 0.5) * 0.05,
    y: 0.3 + Math.floor(i / 3) * 0.35 + (rng() - 0.5) * 0.05,
    type: rng() > 0.5 ? "npn" as const : "pnp" as const,
    scale: 0.8 + rng() * 0.4,
    phase: rng() * Math.PI * 2,
    bandKey: BAND_KEYS[Math.floor(rng() * BAND_KEYS.length)],
  }));

  // Connect transistors with wires (collector of one to base of next)
  const wires: WireData[] = [];
  for (let i = 0; i < NUM_TRANSISTORS - 1; i++) {
    const fromT = transistors[i];
    const toT = transistors[i + 1];
    wires.push({
      from: { x: fromT.x + 0.02, y: fromT.y - 0.06 },
      to: { x: toT.x - 0.06, y: toT.y },
      signalPhase: rng() * Math.PI * 2,
    });
  }
  // Add power rails
  for (let i = 0; i < NUM_TRANSISTORS; i++) {
    const t = transistors[i];
    wires.push({
      from: { x: t.x + 0.02, y: t.y - 0.12 },
      to: { x: t.x + 0.02, y: t.y - 0.06 },
      signalPhase: rng() * Math.PI * 2,
    });
    wires.push({
      from: { x: t.x + 0.02, y: t.y + 0.06 },
      to: { x: t.x + 0.02, y: t.y + 0.12 },
      signalPhase: rng() * Math.PI * 2,
    });
  }

  return { transistors, wires };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Transistor: React.FC<Props> = ({ frames }) => {
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
  const bandValues: Record<string, number> = {
    sub: currentFrame?.sub ?? 0,
    low: currentFrame?.low ?? 0,
    mid: currentFrame?.mid ?? 0,
    high: currentFrame?.high ?? 0,
  };

  const circuit = React.useMemo(() => generateCircuit(12321), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.45);

  const { transistors, wires } = circuit;
  const SCHEMATIC = "#44aaff";
  const SCHEMATIC_DIM = "rgba(68, 170, 255, 0.25)";
  const CURRENT_COLOR = "#00ffaa";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="transistor-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Power rails */}
        <line
          x1={width * 0.08}
          y1={height * 0.18}
          x2={width * 0.92}
          y2={height * 0.18}
          stroke={SCHEMATIC_DIM}
          strokeWidth={1.5}
        />
        <text x={width * 0.05} y={height * 0.18 + 3} fill={SCHEMATIC_DIM} fontSize={8} fontFamily="monospace">Vcc</text>
        <line
          x1={width * 0.08}
          y1={height * 0.82}
          x2={width * 0.92}
          y2={height * 0.82}
          stroke={SCHEMATIC_DIM}
          strokeWidth={1.5}
        />
        <text x={width * 0.05} y={height * 0.82 + 3} fill={SCHEMATIC_DIM} fontSize={8} fontFamily="monospace">GND</text>

        {/* Wires */}
        {wires.map((wire, wi) => {
          const x1 = wire.from.x * width;
          const y1 = wire.from.y * height;
          const x2 = wire.to.x * width;
          const y2 = wire.to.y * height;

          // Animated current dot
          const dotT = ((cycleFrame * 0.04 * (0.5 + energy * 2) + wire.signalPhase) % 1 + 1) % 1;
          const dx = x1 + (x2 - x1) * dotT;
          const dy = y1 + (y2 - y1) * dotT;

          return (
            <g key={`wire${wi}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={SCHEMATIC}
                strokeWidth={0.8}
                opacity={0.4}
              />
              {energy > 0.08 && (
                <circle
                  cx={dx}
                  cy={dy}
                  r={2 + energy * 1.5}
                  fill={CURRENT_COLOR}
                  opacity={0.7}
                  filter="url(#transistor-glow)"
                />
              )}
            </g>
          );
        })}

        {/* Transistor symbols */}
        {transistors.map((tr, ti) => {
          const tx = tr.x * width;
          const ty = tr.y * height;
          const s = 30 * tr.scale;
          const bandVal = bandValues[tr.bandKey];

          // Base signal wiggle
          const baseWiggle = Math.sin(frame * 0.1 + tr.phase) * energy * 6;

          // Current flow indicator brightness
          const currentBright = 0.2 + bandVal * 0.8;

          return (
            <g key={`tr${ti}`}>
              {/* Circle (transistor body) */}
              <circle
                cx={tx}
                cy={ty}
                r={s * 0.6}
                fill="none"
                stroke={SCHEMATIC}
                strokeWidth={1}
                opacity={0.5}
              />

              {/* Base lead (left) */}
              <line
                x1={tx - s}
                y1={ty + baseWiggle}
                x2={tx - s * 0.4}
                y2={ty}
                stroke={SCHEMATIC}
                strokeWidth={1.2}
                opacity={0.7}
              />

              {/* Base bar (vertical inside circle) */}
              <line
                x1={tx - s * 0.3}
                y1={ty - s * 0.35}
                x2={tx - s * 0.3}
                y2={ty + s * 0.35}
                stroke={SCHEMATIC}
                strokeWidth={2}
                opacity={0.7}
              />

              {/* Collector lead (top-right) */}
              <line
                x1={tx - s * 0.3}
                y1={ty - s * 0.2}
                x2={tx + s * 0.3}
                y2={ty - s * 0.5}
                stroke={SCHEMATIC}
                strokeWidth={1.2}
                opacity={0.7}
              />
              <line
                x1={tx + s * 0.3}
                y1={ty - s * 0.5}
                x2={tx + s * 0.3}
                y2={ty - s}
                stroke={SCHEMATIC}
                strokeWidth={1.2}
                opacity={0.7}
              />

              {/* Emitter lead (bottom-right) with arrow */}
              <line
                x1={tx - s * 0.3}
                y1={ty + s * 0.2}
                x2={tx + s * 0.3}
                y2={ty + s * 0.5}
                stroke={SCHEMATIC}
                strokeWidth={1.2}
                opacity={0.7}
              />
              <line
                x1={tx + s * 0.3}
                y1={ty + s * 0.5}
                x2={tx + s * 0.3}
                y2={ty + s}
                stroke={SCHEMATIC}
                strokeWidth={1.2}
                opacity={0.7}
              />

              {/* Arrow on emitter (NPN points out, PNP points in) */}
              {tr.type === "npn" ? (
                <polygon
                  points={`${tx + s * 0.3},${ty + s * 0.5} ${tx + s * 0.1},${ty + s * 0.35} ${tx + s * 0.15},${ty + s * 0.55}`}
                  fill={SCHEMATIC}
                  opacity={0.7}
                />
              ) : (
                <polygon
                  points={`${tx - s * 0.15},${ty + s * 0.25} ${tx + s * 0.05},${ty + s * 0.15} ${tx + s * 0.0},${ty + s * 0.38}`}
                  fill={SCHEMATIC}
                  opacity={0.7}
                />
              )}

              {/* Current flow glow along collector-emitter */}
              {energy > 0.08 && (
                <line
                  x1={tx + s * 0.3}
                  y1={ty - s * 0.5}
                  x2={tx + s * 0.3}
                  y2={ty + s * 0.5}
                  stroke={CURRENT_COLOR}
                  strokeWidth={2 + currentBright * 2}
                  opacity={currentBright * 0.5}
                  filter="url(#transistor-glow)"
                  strokeLinecap="round"
                />
              )}

              {/* Type label */}
              <text
                x={tx + s * 0.6}
                y={ty + 3}
                fill={SCHEMATIC_DIM}
                fontSize={7}
                fontFamily="monospace"
              >
                {tr.type.toUpperCase()}
              </text>

              {/* Band indicator */}
              <text
                x={tx - s}
                y={ty - s * 0.6}
                fill={CURRENT_COLOR}
                fontSize={6}
                fontFamily="monospace"
                opacity={0.4}
              >
                {tr.bandKey}
              </text>
            </g>
          );
        })}

        {/* Input signal label */}
        <text
          x={width * 0.08}
          y={height * 0.5}
          fill={SCHEMATIC_DIM}
          fontSize={9}
          fontFamily="monospace"
        >
          IN
        </text>
        {/* Output signal label */}
        <text
          x={width * 0.9}
          y={height * 0.5}
          fill={SCHEMATIC_DIM}
          fontSize={9}
          fontFamily="monospace"
        >
          OUT
        </text>
      </svg>
    </div>
  );
};
