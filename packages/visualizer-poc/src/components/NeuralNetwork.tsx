/**
 * NeuralNetwork — Firing neurons with synaptic connections.
 * 15-20 neuron nodes (circles) positioned randomly but consistently (seeded).
 * Connected by thin lines (synapses). When energy spikes, random neurons "fire"
 * — they flash bright and send a pulse along connections (animated dot traveling
 * along the line to the next neuron). Cascade effect. Neon purple/cyan.
 * Appears every 45s for 16s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1350; // 45s at 30fps
const DURATION = 480; // 16s
const NUM_NEURONS = 18;
const PULSE_TRAVEL_FRAMES = 20; // frames for a pulse to travel along a synapse

interface NeuronData {
  x: number; // 0-1
  y: number; // 0-1
  radius: number;
  pulsePhase: number; // for idle pulsing
}

interface SynapseData {
  from: number;
  to: number;
}

interface FiringEvent {
  /** Frame offset within the cycle when this firing starts */
  startFrame: number;
  /** Which neuron fires first */
  sourceNeuron: number;
}

function generateNetwork(seed: number): {
  neurons: NeuronData[];
  synapses: SynapseData[];
  firings: FiringEvent[];
} {
  const rng = seeded(seed);

  // Generate neuron positions
  const neurons: NeuronData[] = Array.from({ length: NUM_NEURONS }, () => ({
    x: 0.1 + rng() * 0.8,
    y: 0.1 + rng() * 0.8,
    radius: 4 + rng() * 4,
    pulsePhase: rng() * Math.PI * 2,
  }));

  // Generate synapses: connect each neuron to 2-3 nearest neighbors
  const synapses: SynapseData[] = [];
  const connected = new Set<string>();

  for (let i = 0; i < NUM_NEURONS; i++) {
    // Find distances to all other neurons
    const dists: { idx: number; dist: number }[] = [];
    for (let j = 0; j < NUM_NEURONS; j++) {
      if (i === j) continue;
      const dx = neurons[i].x - neurons[j].x;
      const dy = neurons[i].y - neurons[j].y;
      dists.push({ idx: j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    dists.sort((a, b) => a.dist - b.dist);

    // Connect to 2-3 nearest
    const numConnections = 2 + (rng() > 0.5 ? 1 : 0);
    for (let c = 0; c < Math.min(numConnections, dists.length); c++) {
      const j = dists[c].idx;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (!connected.has(key)) {
        connected.add(key);
        synapses.push({ from: i, to: j });
      }
    }
  }

  // Pre-compute firing events (deterministic schedule)
  const firings: FiringEvent[] = [];
  for (let f = 0; f < DURATION; f += 8) {
    if (rng() < 0.3) {
      firings.push({
        startFrame: f,
        sourceNeuron: Math.floor(rng() * NUM_NEURONS),
      });
    }
  }

  return { neurons, synapses, firings };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const NeuralNetwork: React.FC<Props> = ({ frames }) => {
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

  const network = React.useMemo(() => generateNetwork(31415), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.4);

  const { neurons, synapses, firings } = network;

  // Determine which neurons are currently "fired" (bright flash)
  // A neuron is fired if a firing event targets it within the last ~10 frames
  // OR if energy is high enough for the event to be active
  const neuronBrightness: number[] = new Array(NUM_NEURONS).fill(0);

  // Active pulses on synapses: [synapseIndex, progress 0-1]
  const activePulses: { synapseIdx: number; pulseProgress: number }[] = [];

  for (const firing of firings) {
    const elapsed = cycleFrame - firing.startFrame;
    if (elapsed < 0 || elapsed > 60) continue;
    // Only fire if energy is above threshold
    if (energy < 0.1) continue;

    // Source neuron fires immediately
    if (elapsed < 12) {
      const brightness = interpolate(elapsed, [0, 3, 12], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      neuronBrightness[firing.sourceNeuron] = Math.max(
        neuronBrightness[firing.sourceNeuron],
        brightness,
      );
    }

    // Find synapses from this source and create pulses
    for (let si = 0; si < synapses.length; si++) {
      const syn = synapses[si];
      if (syn.from === firing.sourceNeuron || syn.to === firing.sourceNeuron) {
        const pulseElapsed = elapsed - 5; // pulse starts 5 frames after fire
        if (pulseElapsed >= 0 && pulseElapsed <= PULSE_TRAVEL_FRAMES) {
          const pp = pulseElapsed / PULSE_TRAVEL_FRAMES;
          activePulses.push({ synapseIdx: si, pulseProgress: pp });

          // Target neuron lights up when pulse arrives
          const target =
            syn.from === firing.sourceNeuron ? syn.to : syn.from;
          if (pp > 0.8) {
            const arrivalBrightness = interpolate(pp, [0.8, 0.9, 1], [0, 1, 0.5], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            neuronBrightness[target] = Math.max(
              neuronBrightness[target],
              arrivalBrightness,
            );
          }
        }
      }
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="neuron-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="pulse-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Synapses (connection lines) */}
        {synapses.map((syn, i) => {
          const nFrom = neurons[syn.from];
          const nTo = neurons[syn.to];
          return (
            <line
              key={`syn${i}`}
              x1={nFrom.x * width}
              y1={nFrom.y * height}
              x2={nTo.x * width}
              y2={nTo.y * height}
              stroke="rgba(120, 80, 255, 0.2)"
              strokeWidth={1}
            />
          );
        })}

        {/* Active pulse dots traveling along synapses */}
        {activePulses.map((pulse, i) => {
          const syn = synapses[pulse.synapseIdx];
          const nFrom = neurons[syn.from];
          const nTo = neurons[syn.to];
          const px = nFrom.x * width + (nTo.x * width - nFrom.x * width) * pulse.pulseProgress;
          const py = nFrom.y * height + (nTo.y * height - nFrom.y * height) * pulse.pulseProgress;
          return (
            <circle
              key={`pulse${i}`}
              cx={px}
              cy={py}
              r={3 + energy * 2}
              fill="#00FFFF"
              opacity={0.8}
              filter="url(#pulse-glow)"
            />
          );
        })}

        {/* Neuron nodes */}
        {neurons.map((neuron, i) => {
          const nx = neuron.x * width;
          const ny = neuron.y * height;
          const idlePulse =
            (Math.sin(frame * 0.04 + neuron.pulsePhase) + 1) * 0.5;
          const brightness = neuronBrightness[i];
          const isFired = brightness > 0.1;

          const baseAlpha = 0.3 + idlePulse * 0.2;
          const fireAlpha = brightness * 0.9;
          const alpha = Math.max(baseAlpha, fireAlpha);

          const r = neuron.radius * (1 + (isFired ? brightness * 0.8 : 0));

          return (
            <g key={`n${i}`}>
              {/* Outer glow when fired */}
              {isFired && (
                <circle
                  cx={nx}
                  cy={ny}
                  r={r * 3}
                  fill={`rgba(0, 255, 255, ${brightness * 0.3})`}
                  style={{ filter: "blur(8px)" }}
                />
              )}
              {/* Neuron body */}
              <circle
                cx={nx}
                cy={ny}
                r={r}
                fill={
                  isFired
                    ? `rgba(0, 255, 255, ${alpha})`
                    : `rgba(160, 100, 255, ${alpha})`
                }
                filter={isFired ? "url(#neuron-glow)" : undefined}
              />
              {/* Core dot */}
              <circle
                cx={nx}
                cy={ny}
                r={r * 0.4}
                fill={isFired ? "#FFFFFF" : "rgba(200, 180, 255, 0.6)"}
                opacity={alpha}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
