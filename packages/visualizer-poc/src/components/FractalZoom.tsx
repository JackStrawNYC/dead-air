/**
 * FractalZoom — Infinite spiraling fractal tunnel effect.
 * Concentric hexagons that scale up from center and fade out at edges,
 * creating a zoom-through illusion. 12-15 rings at different scale phases.
 * Rotation and scale speed driven by energy. Neon color cycling.
 * Appears periodically (every 50 seconds, visible for 15 seconds).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500;     // 50 seconds between appearances
const DURATION = 450;   // 15 seconds visible
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

// Stagger timing: offset from other components at frame 120 (4s)
const STAGGER_OFFSET = 120;

interface Props {
  frames: EnhancedFrameData[];
}

export const FractalZoom: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const rings = React.useMemo(() => generateRings(19650813), []);

  // Periodic visibility: every CYCLE frames, visible for DURATION frames
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out with Easing
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
  const visibility = Math.min(fadeIn, fadeOut);

  // Energy-driven opacity
  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.55;

  // Speed: rotation and scale expansion rate driven by energy
  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Global rotation
  const globalRotation = cycleFrame * 0.4 * speedMult;

  // Base cycling hue
  const baseHue = (cycleFrame * 1.2) % 360;

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
            const scaleProgress = ((cycleFrame * 0.015 * speedMult + ring.phaseOffset) % 1);

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
            const light = 55 + energy * 15;
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
