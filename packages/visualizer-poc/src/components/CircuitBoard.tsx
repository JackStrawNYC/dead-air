/**
 * CircuitBoard — PCB trace lines connecting nodes with current pulses.
 * Green/gold PCB traces on a dark substrate. Nodes at intersections glow
 * when energy pulses pass through. Current pulses flow along traces in
 * sync with beat events. Trace thickness and glow follow energy.
 * Appears every 55s for 18s.
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
const DURATION = 540; // 18s
const NUM_NODES = 22;
const NUM_TRACES = 30;

interface NodeData {
  x: number;
  y: number;
  radius: number;
  type: "pad" | "via" | "chip";
}

interface TraceData {
  from: number;
  to: number;
  waypoints: { x: number; y: number }[];
}

interface PulseEvent {
  startFrame: number;
  traceIdx: number;
}

function generateBoard(seed: number): {
  nodes: NodeData[];
  traces: TraceData[];
  pulses: PulseEvent[];
} {
  const rng = seeded(seed);

  const nodes: NodeData[] = Array.from({ length: NUM_NODES }, () => {
    const typeRoll = rng();
    const type: NodeData["type"] =
      typeRoll < 0.3 ? "chip" : typeRoll < 0.7 ? "pad" : "via";
    return {
      x: 0.05 + rng() * 0.9,
      y: 0.05 + rng() * 0.9,
      radius: type === "chip" ? 8 : type === "pad" ? 5 : 3,
      type,
    };
  });

  const traces: TraceData[] = [];
  for (let t = 0; t < NUM_TRACES; t++) {
    const from = Math.floor(rng() * NUM_NODES);
    let to = Math.floor(rng() * NUM_NODES);
    if (to === from) to = (to + 1) % NUM_NODES;

    // PCB traces use right-angle routing
    const nf = nodes[from];
    const nt = nodes[to];
    const midX = rng() > 0.5 ? nt.x : nf.x;
    const midY = rng() > 0.5 ? nf.y : nt.y;

    traces.push({
      from,
      to,
      waypoints: [{ x: midX, y: midY }],
    });
  }

  // Pre-schedule pulse events
  const pulses: PulseEvent[] = [];
  for (let f = 0; f < DURATION; f += 6) {
    if (rng() < 0.25) {
      pulses.push({
        startFrame: f,
        traceIdx: Math.floor(rng() * NUM_TRACES),
      });
    }
  }

  return { nodes, traces, pulses };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CircuitBoard: React.FC<Props> = ({ frames }) => {
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

  const board = React.useMemo(() => generateBoard(27182), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.5);

  const { nodes, traces, pulses } = board;
  const PULSE_TRAVEL = 24;

  // Track which nodes are being hit by pulses
  const nodeGlow: number[] = new Array(NUM_NODES).fill(0);

  const activePulses: { traceIdx: number; t: number }[] = [];
  for (const p of pulses) {
    const elapsed = cycleFrame - p.startFrame;
    if (elapsed < 0 || elapsed > PULSE_TRAVEL + 10) continue;
    if (energy < 0.08) continue;

    const t = elapsed / PULSE_TRAVEL;
    if (t >= 0 && t <= 1) {
      activePulses.push({ traceIdx: p.traceIdx, t });
    }

    const trace = traces[p.traceIdx];
    if (t > 0.85) {
      const gv = interpolate(t, [0.85, 0.95, 1.0], [0, 1, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      nodeGlow[trace.to] = Math.max(nodeGlow[trace.to], gv);
    }
    if (t < 0.15) {
      const gv = interpolate(t, [0, 0.05, 0.15], [0.5, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      nodeGlow[trace.from] = Math.max(nodeGlow[trace.from], gv);
    }
  }

  const PCB_GREEN = "#00c853";
  const PCB_GOLD = "#ffd54f";
  const SUBSTRATE = "rgba(0, 30, 10, 0.4)";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="pcb-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Substrate background tint */}
        <rect x={0} y={0} width={width} height={height} fill={SUBSTRATE} opacity={0.15} />

        {/* Traces */}
        {traces.map((trace, i) => {
          const nf = nodes[trace.from];
          const nt = nodes[trace.to];
          const wp = trace.waypoints[0];
          const path = `M ${nf.x * width} ${nf.y * height} L ${wp.x * width} ${wp.y * height} L ${nt.x * width} ${nt.y * height}`;
          return (
            <path
              key={`tr${i}`}
              d={path}
              stroke={PCB_GREEN}
              strokeWidth={1.2 + energy * 0.8}
              fill="none"
              opacity={0.35}
              strokeLinejoin="round"
            />
          );
        })}

        {/* Active pulse dots */}
        {activePulses.map((ap, i) => {
          const trace = traces[ap.traceIdx];
          const nf = nodes[trace.from];
          const nt = nodes[trace.to];
          const wp = trace.waypoints[0];

          // Interpolate position along the 2-segment path
          let px: number, py: number;
          if (ap.t < 0.5) {
            const seg = ap.t * 2;
            px = nf.x * width + (wp.x * width - nf.x * width) * seg;
            py = nf.y * height + (wp.y * height - nf.y * height) * seg;
          } else {
            const seg = (ap.t - 0.5) * 2;
            px = wp.x * width + (nt.x * width - wp.x * width) * seg;
            py = wp.y * height + (nt.y * height - wp.y * height) * seg;
          }

          return (
            <g key={`pulse${i}`}>
              <circle cx={px} cy={py} r={4 + energy * 3} fill={PCB_GOLD} opacity={0.9} filter="url(#pcb-glow)" />
              <circle cx={px} cy={py} r={2} fill="#ffffff" opacity={0.8} />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const nx = node.x * width;
          const ny = node.y * height;
          const glow = nodeGlow[i];
          const isGlowing = glow > 0.1;
          const baseColor = node.type === "chip" ? PCB_GOLD : PCB_GREEN;

          return (
            <g key={`nd${i}`}>
              {isGlowing && (
                <circle cx={nx} cy={ny} r={node.radius * 2.5} fill={PCB_GOLD} opacity={glow * 0.4} filter="url(#pcb-glow)" />
              )}
              {node.type === "chip" ? (
                <rect
                  x={nx - node.radius}
                  y={ny - node.radius * 0.6}
                  width={node.radius * 2}
                  height={node.radius * 1.2}
                  rx={1}
                  fill={isGlowing ? PCB_GOLD : "rgba(40, 40, 40, 0.8)"}
                  stroke={baseColor}
                  strokeWidth={0.8}
                  opacity={0.7 + glow * 0.3}
                />
              ) : (
                <circle
                  cx={nx}
                  cy={ny}
                  r={node.radius}
                  fill={isGlowing ? PCB_GOLD : baseColor}
                  opacity={0.5 + glow * 0.5}
                  stroke={node.type === "via" ? baseColor : "none"}
                  strokeWidth={node.type === "via" ? 1 : 0}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
