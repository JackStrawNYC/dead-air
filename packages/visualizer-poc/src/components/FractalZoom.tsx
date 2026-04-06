/**
 * FractalZoom — Infinite spiraling fractal tunnel effect.
 * Concentric hexagons that scale up from center and fade out at edges,
 * creating a zoom-through illusion. 12-15 rings at different scale phases.
 * Rotation speed driven by energy + tempo. Chroma-hue-based coloring.
 * Beat-synced brightness pulses. Renders continuously (rotation engine controls visibility).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const NUM_RINGS = 14;
const SIDES = 6;        // hexagons

/** Build a regular polygon path string centered at origin */
function hexPath(r: number, sides: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push(`${Math.cos(angle) * r},${Math.sin(angle) * r}`);
  }
  return `M ${points.join(" L ")} Z`;
}

interface RingData {
  /** Phase offset for scale animation (0-1) */
  phaseOffset: number;
  /** Rotation offset (degrees) */
  rotOffset: number;
  /** Stroke width */
  strokeWidth: number;
  /** Hue offset from base cycling hue */
  hueOffset: number;
}

function generateRings(seed: number): RingData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RINGS }, (_, i) => ({
    phaseOffset: i / NUM_RINGS,
    rotOffset: rng() * 30 - 15,
    strokeWidth: 1.5 + rng() * 2,
    hueOffset: i * 25,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const FractalZoom: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, onsetEnvelope } = snap;

  const rings = React.useMemo(() => generateRings(19650813), []);

  // Energy-driven opacity — the rotation engine controls visibility
  const masterOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.55;

  // Speed: rotation and scale expansion rate driven by energy and tempo
  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * tempoFactor;

  // Global rotation
  const globalRotation = frame * 0.4 * speedMult;

  // Base hue from chroma analysis
  const baseHue = chromaHue;

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
        <g transform={`translate(${cx}, ${cy})`}>
          {rings.map((ring, ri) => {
            // Each ring scales from 0 to maxRadius in a looping cycle
            // Phase offset creates the tunnel layering
            const scaleProgress = ((frame * 0.015 * speedMult + ring.phaseOffset) % 1);

            // Exponential scaling for zoom feel (closer rings move faster)
            const scale = scaleProgress * scaleProgress;
            const r = scale * maxRadius;

            if (r < 5) return null;

            // Fade: dim at center, bright in middle, fade at edges
            const distNorm = r / maxRadius;
            const ringAlpha = interpolate(distNorm, [0, 0.15, 0.5, 0.85, 1], [0, 0.5, 1, 0.6, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            if (ringAlpha < 0.02) return null;

            // Per-ring rotation: global + individual offset + slight additional per-ring spin
            const rotation = globalRotation + ring.rotOffset + scaleProgress * 30;

            const hue = (baseHue + ring.hueOffset) % 360;
            const sat = 90 + energy * 10;
            const light = 55 + beatDecay * 20;
            const color = `hsla(${hue}, ${sat}%, ${light}%, ${ringAlpha})`;
            const glowColor = `hsla(${hue}, 100%, 70%, ${ringAlpha * 0.5})`;

            return (
              <g
                key={ri}
                transform={`rotate(${rotation})`}
                style={{
                  filter: `drop-shadow(0 0 ${4 + energy * 10}px ${glowColor})`,
                }}
              >
                <path
                  d={hexPath(r, SIDES)}
                  stroke={color}
                  strokeWidth={ring.strokeWidth * (0.6 + energy * 0.6)}
                  fill="none"
                  strokeLinejoin="round"
                />
                {/* Inner echo at half-step for depth */}
                {distNorm > 0.2 && distNorm < 0.8 && (
                  <path
                    d={hexPath(r * 0.92, SIDES)}
                    stroke={color}
                    strokeWidth={ring.strokeWidth * 0.4}
                    fill="none"
                    strokeLinejoin="round"
                    opacity={0.3}
                  />
                )}
              </g>
            );
          })}

          {/* Center glow dot */}
          <circle
            cx={0}
            cy={0}
            r={6 + energy * 12}
            fill={`hsla(${baseHue}, 100%, 80%, ${0.3 + energy * 0.4})`}
            style={{
              filter: `blur(${3 + energy * 5}px) drop-shadow(0 0 15px hsla(${baseHue}, 100%, 70%, 0.5))`,
            }}
          />
        </g>
      </svg>
    </div>
  );
};
