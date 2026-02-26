/**
 * SeaTurtles — 2-3 sea turtle silhouettes swimming gracefully across screen.
 * Each turtle has shell pattern (hexagonal tiles), flippers that paddle slowly.
 * Turtles follow gentle sine-wave paths. Green/teal with golden shell highlights.
 * Swim speed driven by energy. Cycle: 70s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2100;    // 70 seconds at 30fps
const DURATION = 540;  // 18 seconds
const NUM_TURTLES = 3;

interface TurtleData {
  baseY: number;
  size: number;
  speed: number;
  waveAmp: number;
  waveFreq: number;
  phase: number;
  direction: number;
  shellHue: number;
  bodyHue: number;
  paddleSpeed: number;
  hexCount: number;
}

function generateTurtles(seed: number): TurtleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TURTLES }, () => ({
    baseY: 0.25 + rng() * 0.5,
    size: 30 + rng() * 25,
    speed: 0.6 + rng() * 0.8,
    waveAmp: 20 + rng() * 40,
    waveFreq: 0.008 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
    direction: rng() > 0.5 ? 1 : -1,
    shellHue: 35 + rng() * 15,    // golden 35-50
    bodyHue: 150 + rng() * 30,    // green/teal 150-180
    paddleSpeed: 0.04 + rng() * 0.03,
    hexCount: 5 + Math.floor(rng() * 3),
  }));
}

function buildHexagonPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let a = 0; a < 6; a++) {
    const angle = (Math.PI / 3) * a - Math.PI / 6;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SeaTurtles: React.FC<Props> = ({ frames }) => {
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

  const turtles = React.useMemo(() => generateTurtles(7070), []);

  // Timing gate
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
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.6;
  const swimMult = 0.6 + energy * 1.8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="turtle-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {turtles.map((t, ti) => {
          // Position along screen
          const travelProgress = (cycleFrame * t.speed * swimMult * 0.001 + ti * 0.3) % 1;
          const tx = t.direction > 0
            ? -60 + travelProgress * (width + 120)
            : width + 60 - travelProgress * (width + 120);
          const ty =
            t.baseY * height +
            Math.sin(frame * t.waveFreq + t.phase) * t.waveAmp;

          // Flipper paddle angle
          const paddleAngle = Math.sin(frame * t.paddleSpeed + t.phase) * 30;
          const scaleX = t.direction;

          const shellColor = `hsl(${t.shellHue}, 55%, 40%)`;
          const shellHighlight = `hsl(${t.shellHue}, 70%, 60%)`;
          const bodyColor = `hsl(${t.bodyHue}, 50%, 35%)`;
          const s = t.size;

          // Shell hexagon layout
          const hexR = s * 0.18;
          const hexPositions: Array<[number, number]> = [];
          // Center hex
          hexPositions.push([0, 0]);
          // Ring of hexagons around center
          for (let h = 0; h < Math.min(t.hexCount, 6); h++) {
            const angle = (Math.PI / 3) * h;
            hexPositions.push([
              Math.cos(angle) * hexR * 1.8,
              Math.sin(angle) * hexR * 1.8,
            ]);
          }

          return (
            <g
              key={`turtle-${ti}`}
              transform={`translate(${tx},${ty}) scale(${scaleX},1)`}
              filter="url(#turtle-glow)"
            >
              {/* Body (oval) */}
              <ellipse
                cx={0}
                cy={0}
                rx={s * 1.1}
                ry={s * 0.75}
                fill={bodyColor}
                opacity={0.6}
              />

              {/* Shell (slightly smaller oval) */}
              <ellipse
                cx={0}
                cy={0}
                rx={s * 0.85}
                ry={s * 0.6}
                fill={shellColor}
                opacity={0.8}
              />

              {/* Hexagonal shell pattern */}
              {hexPositions.map(([hx, hy], hi) => (
                <polygon
                  key={`hex-${hi}`}
                  points={buildHexagonPoints(hx, hy, hexR)}
                  fill="none"
                  stroke={shellHighlight}
                  strokeWidth={1}
                  opacity={0.5}
                />
              ))}

              {/* Head */}
              <ellipse
                cx={s * 1.2}
                cy={0}
                rx={s * 0.3}
                ry={s * 0.22}
                fill={bodyColor}
                opacity={0.7}
              />
              {/* Eye */}
              <circle
                cx={s * 1.35}
                cy={-s * 0.06}
                r={s * 0.06}
                fill="#AADDCC"
                opacity={0.6}
              />

              {/* Front flippers */}
              <g transform={`translate(${s * 0.5},${-s * 0.5}) rotate(${-20 + paddleAngle})`}>
                <ellipse
                  cx={s * 0.35}
                  cy={0}
                  rx={s * 0.45}
                  ry={s * 0.12}
                  fill={bodyColor}
                  opacity={0.6}
                />
              </g>
              <g transform={`translate(${s * 0.5},${s * 0.5}) rotate(${20 - paddleAngle})`}>
                <ellipse
                  cx={s * 0.35}
                  cy={0}
                  rx={s * 0.45}
                  ry={s * 0.12}
                  fill={bodyColor}
                  opacity={0.6}
                />
              </g>

              {/* Rear flippers */}
              <g transform={`translate(${-s * 0.7},${-s * 0.35}) rotate(${-30 + paddleAngle * 0.5})`}>
                <ellipse
                  cx={-s * 0.15}
                  cy={0}
                  rx={s * 0.25}
                  ry={s * 0.08}
                  fill={bodyColor}
                  opacity={0.5}
                />
              </g>
              <g transform={`translate(${-s * 0.7},${s * 0.35}) rotate(${30 - paddleAngle * 0.5})`}>
                <ellipse
                  cx={-s * 0.15}
                  cy={0}
                  rx={s * 0.25}
                  ry={s * 0.08}
                  fill={bodyColor}
                  opacity={0.5}
                />
              </g>

              {/* Tail */}
              <polygon
                points={`${-s * 0.9},0 ${-s * 1.2},${-s * 0.1} ${-s * 1.2},${s * 0.1}`}
                fill={bodyColor}
                opacity={0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
