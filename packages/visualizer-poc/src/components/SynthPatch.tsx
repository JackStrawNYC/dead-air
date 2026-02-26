/**
 * SynthPatch — Modular synth patch cables connecting module nodes.
 * Nodes represent oscillators, filters, envelopes, and outputs.
 * Patch cables (catenary curves) connect nodes with colored cables.
 * Signal flows as animated dots along cables, speed following energy.
 * Module indicator LEDs pulse with different frequency bands.
 * Appears every 65s for 18s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1950; // 65s at 30fps
const DURATION = 540; // 18s
const NUM_MODULES = 8;
const NUM_CABLES = 10;

type ModuleType = "OSC" | "FLT" | "ENV" | "LFO" | "AMP" | "MIX" | "OUT" | "SEQ";
const MODULE_TYPES: ModuleType[] = ["OSC", "FLT", "ENV", "LFO", "AMP", "MIX", "OUT", "SEQ"];

interface ModuleData {
  x: number;
  y: number;
  type: ModuleType;
  ledPhase: number;
  bandKey: "sub" | "low" | "mid" | "high";
}

interface CableData {
  from: number;
  to: number;
  color: string;
  sag: number; // how much the cable droops
  signalSpeed: number;
  signalPhase: number;
}

const CABLE_COLORS = [
  "#ff4444", "#44ff44", "#4488ff", "#ffaa00",
  "#ff44ff", "#44ffff", "#ffff44", "#ff8844",
  "#88ff44", "#4444ff",
];

const BAND_KEYS: Array<"sub" | "low" | "mid" | "high"> = ["sub", "low", "mid", "high"];

function generatePatch(seed: number): {
  modules: ModuleData[];
  cables: CableData[];
} {
  const rng = seeded(seed);

  const modules: ModuleData[] = Array.from({ length: NUM_MODULES }, (_, i) => ({
    x: 0.1 + (i % 4) * 0.25 + (rng() - 0.5) * 0.08,
    y: 0.25 + Math.floor(i / 4) * 0.35 + (rng() - 0.5) * 0.08,
    type: MODULE_TYPES[i % MODULE_TYPES.length],
    ledPhase: rng() * Math.PI * 2,
    bandKey: BAND_KEYS[Math.floor(rng() * BAND_KEYS.length)],
  }));

  const cables: CableData[] = [];
  const usedPairs = new Set<string>();
  for (let c = 0; c < NUM_CABLES; c++) {
    let from = Math.floor(rng() * NUM_MODULES);
    let to = Math.floor(rng() * NUM_MODULES);
    if (from === to) to = (to + 1) % NUM_MODULES;
    const key = `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);

    cables.push({
      from,
      to,
      color: CABLE_COLORS[c % CABLE_COLORS.length],
      sag: 30 + rng() * 60,
      signalSpeed: 0.03 + rng() * 0.04,
      signalPhase: rng() * Math.PI * 2,
    });
  }

  return { modules, cables };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SynthPatch: React.FC<Props> = ({ frames }) => {
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

  const patch = React.useMemo(() => generatePatch(98765), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.5);

  const { modules, cables } = patch;
  const moduleSize = 50;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="synth-led-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="synth-signal-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Patch cables (behind modules) */}
        {cables.map((cable, ci) => {
          const mFrom = modules[cable.from];
          const mTo = modules[cable.to];
          const x1 = mFrom.x * width;
          const y1 = mFrom.y * height;
          const x2 = mTo.x * width;
          const y2 = mTo.y * height;

          // Catenary-like droop
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 + cable.sag;
          const pathD = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;

          // Signal dot position along cable
          const signalT =
            ((cycleFrame * cable.signalSpeed * (0.5 + energy * 2) + cable.signalPhase) % 1 + 1) % 1;
          // Quadratic bezier point at t
          const st = signalT;
          const sx = (1 - st) * (1 - st) * x1 + 2 * (1 - st) * st * midX + st * st * x2;
          const sy = (1 - st) * (1 - st) * y1 + 2 * (1 - st) * st * midY + st * st * y2;

          return (
            <g key={`cable${ci}`}>
              {/* Cable shadow */}
              <path
                d={pathD}
                stroke="rgba(0, 0, 0, 0.2)"
                strokeWidth={3.5}
                fill="none"
                strokeLinecap="round"
              />
              {/* Cable body */}
              <path
                d={pathD}
                stroke={cable.color}
                strokeWidth={2.5}
                fill="none"
                opacity={0.7}
                strokeLinecap="round"
              />
              {/* Signal dot */}
              <circle
                cx={sx}
                cy={sy}
                r={3 + energy * 2}
                fill="#ffffff"
                opacity={0.8}
                filter="url(#synth-signal-glow)"
              />
            </g>
          );
        })}

        {/* Module panels */}
        {modules.map((mod, mi) => {
          const mx = mod.x * width;
          const my = mod.y * height;
          const half = moduleSize / 2;

          // LED brightness from frequency band
          const bandVal = bandValues[mod.bandKey];
          const ledBrightness =
            0.2 + bandVal * 0.8 +
            Math.sin(frame * 0.08 + mod.ledPhase) * 0.1;

          const ledColor =
            mod.type === "OSC" ? "#00ff44" :
            mod.type === "FLT" ? "#ff8800" :
            mod.type === "ENV" ? "#4488ff" :
            mod.type === "LFO" ? "#ff44ff" :
            mod.type === "AMP" ? "#ff4444" :
            mod.type === "MIX" ? "#44ffff" :
            mod.type === "OUT" ? "#ffffff" :
            "#ffff44";

          return (
            <g key={`mod${mi}`}>
              {/* Module panel */}
              <rect
                x={mx - half}
                y={my - half}
                width={moduleSize}
                height={moduleSize}
                rx={4}
                fill="rgba(30, 30, 35, 0.7)"
                stroke="rgba(80, 80, 90, 0.4)"
                strokeWidth={1}
              />

              {/* Module label */}
              <text
                x={mx}
                y={my - half + 14}
                fill="rgba(200, 200, 210, 0.6)"
                fontSize={8}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {mod.type}
              </text>

              {/* Jack sockets (top and bottom) */}
              <circle cx={mx - 12} cy={my + half - 10} r={4} fill="rgba(20, 20, 20, 0.8)" stroke="rgba(100, 100, 110, 0.4)" strokeWidth={0.8} />
              <circle cx={mx + 12} cy={my + half - 10} r={4} fill="rgba(20, 20, 20, 0.8)" stroke="rgba(100, 100, 110, 0.4)" strokeWidth={0.8} />

              {/* Knob */}
              <circle cx={mx} cy={my + 2} r={7} fill="rgba(50, 50, 55, 0.8)" stroke="rgba(90, 90, 100, 0.4)" strokeWidth={1} />
              <line
                x1={mx}
                y1={my + 2}
                x2={mx + Math.cos(frame * 0.02 + mi) * 5}
                y2={my + 2 + Math.sin(frame * 0.02 + mi) * 5}
                stroke="rgba(200, 200, 210, 0.5)"
                strokeWidth={1}
                strokeLinecap="round"
              />

              {/* LED indicator */}
              <circle
                cx={mx + half - 10}
                cy={my - half + 10}
                r={3}
                fill={ledColor}
                opacity={Math.min(ledBrightness, 0.95)}
                filter="url(#synth-led-glow)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
