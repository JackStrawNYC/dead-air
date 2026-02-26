/**
 * Thunderhead — Dark storm cloud mass with chain lightning during peaks.
 * Cloud = large dark gray ellipse cluster at top of screen (3-4 overlapping ellipses).
 * When energy > 0.25, chain lightning fires (branching zigzag SVG polyline).
 * Lightning flashes bright white for 3-5 frames then gone.
 * New bolt every 15-20 frames during high energy.
 * Cloud always present at 15% opacity during energy > 0.1.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

interface LightningBolt {
  startFrame: number;
  duration: number; // 3-5 frames
  points: string;   // SVG polyline points
  branchPoints: string | null;
}

/** Generate a zigzag bolt path from (startX, startY) downward */
function generateBoltPath(
  rng: () => number,
  startX: number,
  startY: number,
  endY: number,
  segments: number
): string {
  const pts: [number, number][] = [[startX, startY]];
  const stepY = (endY - startY) / segments;
  let x = startX;
  for (let s = 1; s <= segments; s++) {
    x += (rng() - 0.5) * 120;
    const y = startY + stepY * s;
    pts.push([x, y]);
  }
  return pts.map(([px, py]) => `${px},${py}`).join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Thunderhead: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute lightning bolt events
  const bolts = React.useMemo(() => {
    const events: LightningBolt[] = [];
    let lastEnd = -20;

    for (let f = 0; f < frames.length; f++) {
      // Rolling energy at frame f
      let rSum = 0;
      let rCount = 0;
      for (let j = Math.max(0, f - 75); j <= Math.min(frames.length - 1, f + 75); j++) {
        rSum += frames[j].rms;
        rCount++;
      }
      const re = rCount > 0 ? rSum / rCount : 0;

      if (re > 0.25 && f - lastEnd >= 15) {
        const rng = seeded(f * 23 + 8088);
        const dur = 3 + Math.floor(rng() * 3); // 3-5 frames
        const startX = width * 0.2 + rng() * width * 0.6;
        const segments = 6 + Math.floor(rng() * 5);
        const endY = height * 0.4 + rng() * height * 0.5;

        const points = generateBoltPath(rng, startX, height * 0.08, endY, segments);

        // Optional branch
        let branchPoints: string | null = null;
        if (rng() > 0.4) {
          const branchStart = Math.floor(segments * (0.3 + rng() * 0.3));
          const mainPts = points.split(" ").map((p) => p.split(",").map(Number));
          if (branchStart < mainPts.length) {
            const [bx, by] = mainPts[branchStart];
            branchPoints = generateBoltPath(rng, bx, by, by + height * 0.2, 3);
          }
        }

        events.push({ startFrame: f, duration: dur, points, branchPoints });
        lastEnd = f + dur;
      }
    }
    return events;
  }, [frames, width, height]);

  // Cloud visibility: present at 15% opacity when energy > 0.1
  const cloudOpacity = interpolate(energy, [0.08, 0.12], [0, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (cloudOpacity < 0.01) return null;

  // Find active bolt(s)
  const activeBolts = bolts.filter(
    (b) => frame >= b.startFrame && frame < b.startFrame + b.duration
  );

  // Lightning flash: brighten the whole cloud
  const flashIntensity = activeBolts.length > 0 ? 0.6 : 0;

  // Cloud ellipses positions
  const cloudCX = width * 0.5;
  const cloudY = height * 0.06;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        {/* Cloud mass — 4 overlapping ellipses */}
        <defs>
          <filter id="cloud-blur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="bolt-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g opacity={cloudOpacity + flashIntensity} filter="url(#cloud-blur)">
          <ellipse
            cx={cloudCX - width * 0.15}
            cy={cloudY}
            rx={width * 0.22}
            ry={height * 0.06}
            fill="rgb(45, 42, 50)"
          />
          <ellipse
            cx={cloudCX + width * 0.05}
            cy={cloudY - height * 0.01}
            rx={width * 0.25}
            ry={height * 0.07}
            fill="rgb(35, 32, 42)"
          />
          <ellipse
            cx={cloudCX + width * 0.2}
            cy={cloudY + height * 0.01}
            rx={width * 0.18}
            ry={height * 0.055}
            fill="rgb(50, 45, 55)"
          />
          <ellipse
            cx={cloudCX}
            cy={cloudY + height * 0.025}
            rx={width * 0.3}
            ry={height * 0.05}
            fill="rgb(40, 38, 48)"
          />
        </g>

        {/* Lightning bolts */}
        {activeBolts.map((bolt, i) => {
          const boltAge = frame - bolt.startFrame;
          const boltOpacity = interpolate(boltAge, [0, 1, bolt.duration - 1, bolt.duration], [0.5, 1, 0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={`bolt-${bolt.startFrame}-${i}`} opacity={boltOpacity} filter="url(#bolt-glow)">
              {/* Main bolt */}
              <polyline
                points={bolt.points}
                fill="none"
                stroke="rgba(220, 220, 255, 0.95)"
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {/* Inner bright core */}
              <polyline
                points={bolt.points}
                fill="none"
                stroke="white"
                strokeWidth={1}
                strokeLinejoin="round"
              />
              {/* Branch if present */}
              {bolt.branchPoints && (
                <>
                  <polyline
                    points={bolt.branchPoints}
                    fill="none"
                    stroke="rgba(200, 200, 255, 0.7)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={bolt.branchPoints}
                    fill="none"
                    stroke="white"
                    strokeWidth={0.5}
                    strokeLinejoin="round"
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Flash overlay when lightning fires */}
        {flashIntensity > 0 && (
          <rect
            x={0}
            y={0}
            width={width}
            height={height * 0.3}
            fill={`rgba(200, 200, 255, ${flashIntensity * 0.08})`}
          />
        )}
      </svg>
    </div>
  );
};
